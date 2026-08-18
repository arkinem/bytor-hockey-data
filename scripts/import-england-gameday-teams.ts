import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";

import { extname, join } from "node:path";

import { parse, stringify } from "yaml";

import { TeamSchema, type Team } from "../schema/index.js";

const SNAPSHOT_DATE = "2026-08-18";

const PROPOSALS_FILE = join(
	"generated",
	"proposals",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday-teams.json",
);

const TEAMS_DIR = join("data", "teams");

type Proposal = {
	gameDayTeamId: string;

	sourceNames: string[];

	ageGroups: string[];

	competitionIds: string[];

	status: "new_team" | "source_anomaly";

	proposedId?: string;

	proposedName?: string;

	reason?: string;
};

type ProposalReport = {
	newTeams: number;

	anomalies: number;

	idCollisions: number;

	proposals: Proposal[];
};

async function loadExistingTeams(): Promise<Map<string, Team>> {
	const files = await readdir(TEAMS_DIR);

	const teams = new Map<string, Team>();

	for (const file of files) {
		if (![".yaml", ".yml"].includes(extname(file))) {
			continue;
		}

		const team = TeamSchema.parse(parse(await readFile(join(TEAMS_DIR, file), "utf8")));

		teams.set(team.id, team);
	}

	return teams;
}

function ageMaxFromGroup(ageGroup: string): number {
	const match = ageGroup.match(/^U(\d+)$/);

	if (!match?.[1]) {
		throw new Error(`Invalid junior age group: ${ageGroup}`);
	}

	return Number.parseInt(match[1], 10);
}

async function main(): Promise<void> {
	const report = JSON.parse(await readFile(PROPOSALS_FILE, "utf8")) as ProposalReport;

	if (report.idCollisions !== 0) {
		throw new Error(`Proposal file contains ${report.idCollisions} ID collision(s).`);
	}

	const proposals = report.proposals.filter((proposal) => proposal.status === "new_team");

	if (proposals.length !== report.newTeams) {
		throw new Error(
			`Proposal count mismatch: expected ${report.newTeams}, found ${proposals.length}.`,
		);
	}

	await mkdir(TEAMS_DIR, {
		recursive: true,
	});

	const existingTeams = await loadExistingTeams();

	const existingGameDayIds = new Map<string, string>();

	for (const team of existingTeams.values()) {
		for (const externalId of team.externalIds) {
			if (externalId.system !== "gameday") {
				continue;
			}

			const owner = existingGameDayIds.get(externalId.value);

			if (owner && owner !== team.id) {
				throw new Error(
					`GameDay ID ${externalId.value} belongs to multiple canonical teams: ${owner}, ${team.id}`,
				);
			}

			existingGameDayIds.set(externalId.value, team.id);
		}
	}

	let created = 0;
	let skipped = 0;

	for (const proposal of proposals) {
		if (!proposal.proposedId || !proposal.proposedName) {
			throw new Error(`Incomplete team proposal for GameDay ${proposal.gameDayTeamId}.`);
		}

		if (proposal.ageGroups.length !== 1) {
			throw new Error(`Expected exactly one age group for GameDay ${proposal.gameDayTeamId}.`);
		}

		const ageGroup = proposal.ageGroups[0];

		if (!ageGroup) {
			throw new Error(`Missing age group for GameDay ${proposal.gameDayTeamId}.`);
		}

		const existingById = existingTeams.get(proposal.proposedId);

		const existingByGameDay = existingGameDayIds.get(proposal.gameDayTeamId);

		if (existingByGameDay && existingByGameDay !== proposal.proposedId) {
			throw new Error(
				`GameDay ${proposal.gameDayTeamId} already belongs to ${existingByGameDay}, proposal wants ${proposal.proposedId}.`,
			);
		}

		if (existingById) {
			const ownsGameDay = existingById.externalIds.some(
				(externalId) =>
					externalId.system === "gameday" && externalId.value === proposal.gameDayTeamId,
			);

			if (!ownsGameDay) {
				throw new Error(
					`Canonical team ID collision: ${proposal.proposedId} already exists but does not own GameDay ${proposal.gameDayTeamId}.`,
				);
			}

			console.log(`- unchanged ${proposal.proposedId} [gameday:${proposal.gameDayTeamId}]`);

			skipped += 1;

			continue;
		}

		const aliases = [
			...new Set(proposal.sourceNames.filter((name) => name !== proposal.proposedName)),
		];

		const team: Team = {
			id: proposal.proposedId,

			name: proposal.proposedName,

			aliases,

			historicalNames: [],

			country: "GB",

			categories: {
				gender: "open",

				age: "junior",

				ageBand: {
					max: ageMaxFromGroup(ageGroup),

					label: ageGroup,
				},
			},

			status: "active",

			role: "age_group",

			rinkIds: [],

			externalIds: [
				{
					system: "gameday",

					value: proposal.gameDayTeamId,
				},
			],

			sourceIds: ["england-ice-hockey"],

			sourceUrls: [],
		};

		const validated = TeamSchema.parse(team);

		await writeFile(
			join(TEAMS_DIR, `${validated.id}.yaml`),
			stringify(validated, {
				lineWidth: 100,
			}),
			"utf8",
		);

		existingTeams.set(validated.id, validated);

		existingGameDayIds.set(proposal.gameDayTeamId, validated.id);

		console.log(`+ ${validated.id} <- gameday:${proposal.gameDayTeamId}`);

		created += 1;
	}

	console.log("");
	console.log(`Proposals: ${proposals.length}`);

	console.log(`Created: ${created}`);

	console.log(`Unchanged: ${skipped}`);

	console.log(`Anomalies excluded: ${report.anomalies}`);
}

await main();
