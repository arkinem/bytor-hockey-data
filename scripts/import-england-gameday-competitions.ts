import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";

import { extname, join } from "node:path";

import { parse, stringify } from "yaml";

import {
	CompetitionSchema,
	CompetitionSeasonSchema,
	type Competition,
	type CompetitionSeason,
} from "../schema/index.js";

type Proposal = {
	gameDayCompetitionId: string;

	sourceName: string;

	ageGroup: string;

	kind: "competition" | "competition_group" | "deferred_event";

	proposedCompetitionId?: string;

	proposedParentCompetitionId?: string;

	proposedGroupName?: string;

	notes?: string;
};

type ProposalReport = {
	snapshotDate: string;

	seasonId: string;

	seasonLabel: string;

	proposals: Proposal[];
};

const SNAPSHOT_DATE = "2026-08-18";

const PROPOSALS_FILE = join(
	"generated",
	"proposals",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday-competitions.json",
);

const COMPETITIONS_DIR = join("data", "competitions");

const SEASONS_DIR = join("data", "competition-seasons");

const SOURCE_ID = "england-ice-hockey";

const GAMEDAY_SYSTEM = "gameday";

function getAgeMax(ageGroup: string): number {
	const match = ageGroup.match(/^U(\d+)$/);

	if (!match?.[1]) {
		throw new Error(`Cannot determine age max from "${ageGroup}".`);
	}

	return Number.parseInt(match[1], 10);
}

function createSeasonId(competitionId: string): string {
	return `${competitionId}-2025-26`;
}

async function loadYamlDirectory(directory: string): Promise<unknown[]> {
	const files = await readdir(directory);

	const yamlFiles = files.filter((file) => [".yaml", ".yml"].includes(extname(file)));

	return Promise.all(
		yamlFiles.map(async (file) => parse(await readFile(join(directory, file), "utf8"))),
	);
}

function hasExternalId(
	externalIds: Array<{
		system: string;
		value: string;
	}>,
	system: string,
	value: string,
): boolean {
	return externalIds.some(
		(externalId) => externalId.system === system && externalId.value === value,
	);
}

function mergeSourceId(sourceIds: string[], sourceId: string): string[] {
	return [...new Set([...sourceIds, sourceId])];
}

async function writeCompetition(competition: Competition): Promise<void> {
	const validated = CompetitionSchema.parse(competition);

	await writeFile(
		join(COMPETITIONS_DIR, `${validated.id}.yaml`),
		stringify(validated, {
			lineWidth: 100,
		}),
		"utf8",
	);
}

async function writeCompetitionSeason(season: CompetitionSeason): Promise<void> {
	const validated = CompetitionSeasonSchema.parse(season);

	await writeFile(
		join(SEASONS_DIR, `${validated.id}.yaml`),
		stringify(validated, {
			lineWidth: 100,
		}),
		"utf8",
	);
}

async function main(): Promise<void> {
	const proposalReport = JSON.parse(await readFile(PROPOSALS_FILE, "utf8")) as ProposalReport;

	await mkdir(COMPETITIONS_DIR, {
		recursive: true,
	});

	await mkdir(SEASONS_DIR, {
		recursive: true,
	});

	const competitions = (await loadYamlDirectory(COMPETITIONS_DIR)).map((data) =>
		CompetitionSchema.parse(data),
	);

	const seasons = (await loadYamlDirectory(SEASONS_DIR)).map((data) =>
		CompetitionSeasonSchema.parse(data),
	);

	const competitionById = new Map(competitions.map((competition) => [competition.id, competition]));

	const seasonByCompetitionId = new Map(seasons.map((season) => [season.competitionId, season]));

	let competitionsCreated = 0;
	let competitionsExisting = 0;

	let seasonsCreated = 0;
	let seasonsUpdated = 0;
	let seasonsUnchanged = 0;

	let groupsSkipped = 0;
	let deferred = 0;

	for (const proposal of proposalReport.proposals) {
		if (proposal.kind === "deferred_event") {
			console.log(`? deferred ${proposal.sourceName}`);

			deferred += 1;

			continue;
		}

		if (proposal.kind === "competition_group") {
			console.log(`~ group already handled ${proposal.sourceName}`);

			groupsSkipped += 1;

			continue;
		}

		if (!proposal.proposedCompetitionId) {
			throw new Error(`Missing proposed competition ID for "${proposal.sourceName}".`);
		}

		if (!proposal.proposedParentCompetitionId) {
			throw new Error(`Missing parent competition ID for "${proposal.sourceName}".`);
		}

		const competitionId = proposal.proposedCompetitionId;

		let competition = competitionById.get(competitionId);

		/*
		 * --------------------------------
		 * Competition
		 * --------------------------------
		 */

		if (!competition) {
			const ageMax = getAgeMax(proposal.ageGroup);

			const created: Competition = {
				id: competitionId,

				name: proposal.sourceName,

				aliases: [],

				historicalNames: [],

				type: "league",

				country: "GB",

				categories: {
					gender: "open",

					age: "junior",

					ageBand: {
						max: ageMax,

						label: proposal.ageGroup,
					},
				},

				status: "active",

				parentCompetitionId: proposal.proposedParentCompetitionId,

				organiserIds: ["england-ice-hockey"],

				externalIds: [],

				sourceIds: [SOURCE_ID],
			};

			await writeCompetition(created);

			competition = created;

			competitionById.set(competitionId, created);

			console.log(`+ competition ${competitionId}`);

			competitionsCreated += 1;
		} else {
			console.log(`- competition exists ${competitionId}`);

			competitionsExisting += 1;
		}

		/*
		 * --------------------------------
		 * CompetitionSeason
		 * --------------------------------
		 *
		 * GameDay competition ID belongs here,
		 * not to Competition.
		 */

		const existingSeason = seasonByCompetitionId.get(competitionId);

		if (!existingSeason) {
			const seasonId = createSeasonId(competitionId);

			const season: CompetitionSeason = {
				id: seasonId,

				competitionId,

				season: {
					startYear: 2025,

					endYear: 2026,

					label: "2025/26",
				},

				status: "active",

				externalIds: [
					{
						system: GAMEDAY_SYSTEM,

						value: proposal.gameDayCompetitionId,
					},
				],

				sourceIds: [SOURCE_ID],
			};

			await writeCompetitionSeason(season);

			seasonByCompetitionId.set(competitionId, season);

			console.log(`  + season ${season.id} [gameday:${proposal.gameDayCompetitionId}]`);

			seasonsCreated += 1;

			continue;
		}

		/*
		 * Existing season.
		 *
		 * This is the U14 prototype case and
		 * potentially U19 National.
		 */

		const existingGameDayIds = existingSeason.externalIds.filter(
			(externalId) => externalId.system === GAMEDAY_SYSTEM,
		);

		if (
			existingGameDayIds.some((externalId) => externalId.value !== proposal.gameDayCompetitionId)
		) {
			throw new Error(
				`CompetitionSeason "${existingSeason.id}" already has a different GameDay ID: ` +
					existingGameDayIds.map((externalId) => externalId.value).join(", "),
			);
		}

		const alreadyHasGameDayId = hasExternalId(
			existingSeason.externalIds,
			GAMEDAY_SYSTEM,
			proposal.gameDayCompetitionId,
		);

		const alreadyHasSource = existingSeason.sourceIds.includes(SOURCE_ID);

		if (alreadyHasGameDayId && alreadyHasSource) {
			console.log(`  - season unchanged ${existingSeason.id}`);

			seasonsUnchanged += 1;

			continue;
		}

		const updated: CompetitionSeason = {
			...existingSeason,

			externalIds: alreadyHasGameDayId
				? existingSeason.externalIds
				: [
						...existingSeason.externalIds,
						{
							system: GAMEDAY_SYSTEM,

							value: proposal.gameDayCompetitionId,
						},
					],

			sourceIds: mergeSourceId(existingSeason.sourceIds, SOURCE_ID),
		};

		await writeCompetitionSeason(updated);

		seasonByCompetitionId.set(competitionId, updated);

		console.log(`  ~ season updated ${updated.id} [gameday:${proposal.gameDayCompetitionId}]`);

		seasonsUpdated += 1;
	}

	console.log("");
	console.log("Import summary");
	console.log("--------------");

	console.log(`Competitions created: ${competitionsCreated}`);

	console.log(`Competitions existing: ${competitionsExisting}`);

	console.log(`Seasons created: ${seasonsCreated}`);

	console.log(`Seasons updated: ${seasonsUpdated}`);

	console.log(`Seasons unchanged: ${seasonsUnchanged}`);

	console.log(`Groups skipped: ${groupsSkipped}`);

	console.log(`Deferred events: ${deferred}`);
}

await main();
