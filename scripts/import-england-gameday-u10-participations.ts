import { readFile, readdir, writeFile } from "node:fs/promises";

import { extname, join } from "node:path";

import { parse, stringify } from "yaml";

import {
	CompetitionSeasonSchema,
	TeamParticipationSchema,
	TeamSchema,
	type CompetitionSeason,
	type Team,
	type TeamParticipation,
} from "../schema/index.js";

const SNAPSHOT_DATE = "2026-08-18";

const SNAPSHOT_FILE = join("imports", "england-ice-hockey", SNAPSHOT_DATE, "gameday", "u10.json");

const TEAMS_DIR = join("data", "teams");

const SEASONS_DIR = join("data", "competition-seasons");

const PARTICIPATIONS_DIR = join("data", "team-participations");

type RawU10Participation = {
	teamId: string;

	teamName: string;

	competitionId: string;

	competitionName: string;
};

type RawU10Snapshot = {
	source: "gameday";

	snapshotDate: string;

	ageGroup: "U10";

	participations: RawU10Participation[];
};

async function loadYamlDirectory(directory: string): Promise<unknown[]> {
	const files = await readdir(directory);

	const yamlFiles = files.filter((file) => [".yaml", ".yml"].includes(extname(file)));

	return Promise.all(
		yamlFiles.map(async (file) => parse(await readFile(join(directory, file), "utf8"))),
	);
}

function buildGameDayTeamIndex(teams: Team[]): Map<string, Team> {
	const index = new Map<string, Team>();

	for (const team of teams) {
		for (const externalId of team.externalIds) {
			if (externalId.system !== "gameday") {
				continue;
			}

			const existing = index.get(externalId.value);

			if (existing && existing.id !== team.id) {
				throw new Error(
					`GameDay team ID ${externalId.value} belongs to both ${existing.id} and ${team.id}.`,
				);
			}

			index.set(externalId.value, team);
		}
	}

	return index;
}

function buildGameDaySeasonIndex(seasons: CompetitionSeason[]): Map<string, CompetitionSeason> {
	const index = new Map<string, CompetitionSeason>();

	for (const season of seasons) {
		for (const externalId of season.externalIds) {
			if (externalId.system !== "gameday") {
				continue;
			}

			const existing = index.get(externalId.value);

			if (existing && existing.id !== season.id) {
				throw new Error(
					`GameDay competition ID ${externalId.value} belongs to both ${existing.id} and ${season.id}.`,
				);
			}

			index.set(externalId.value, season);
		}
	}

	return index;
}

function relationshipKey(teamId: string, competitionSeasonId: string): string {
	return [teamId, competitionSeasonId].join("|");
}

function participationId(teamId: string, competitionSeasonId: string): string {
	return [teamId, competitionSeasonId].join("-");
}

async function main(): Promise<void> {
	const snapshot = JSON.parse(await readFile(SNAPSHOT_FILE, "utf8")) as RawU10Snapshot;

	if (snapshot.ageGroup !== "U10") {
		throw new Error(`Expected U10 snapshot, got ${snapshot.ageGroup}.`);
	}

	const teams = (await loadYamlDirectory(TEAMS_DIR)).map((data) => TeamSchema.parse(data));

	const seasons = (await loadYamlDirectory(SEASONS_DIR)).map((data) =>
		CompetitionSeasonSchema.parse(data),
	);

	const existingParticipations = (await loadYamlDirectory(PARTICIPATIONS_DIR)).map((data) =>
		TeamParticipationSchema.parse(data),
	);

	const teamByGameDayId = buildGameDayTeamIndex(teams);

	const seasonByGameDayId = buildGameDaySeasonIndex(seasons);

	const existingRelationships = new Map<string, TeamParticipation>();

	for (const participation of existingParticipations) {
		const key = relationshipKey(participation.teamId, participation.competitionSeasonId);

		/*
		 * A participation in a CompetitionGroup
		 * belongs to a more specific relationship,
		 * so it must not collide with these U10
		 * season-level participations.
		 */
		if (participation.competitionGroupId) {
			continue;
		}

		const existing = existingRelationships.get(key);

		if (existing) {
			throw new Error(`Duplicate season-level TeamParticipation relationship: ${key}`);
		}

		existingRelationships.set(key, participation);
	}

	const seenSourceRelationships = new Set<string>();

	let created = 0;
	let existing = 0;

	console.log("GameDay U10 participation import");

	console.log("");

	for (const rawParticipation of snapshot.participations) {
		const sourceKey = [rawParticipation.teamId, rawParticipation.competitionId].join("|");

		if (seenSourceRelationships.has(sourceKey)) {
			throw new Error(`Duplicate U10 source participation: ${sourceKey}`);
		}

		seenSourceRelationships.add(sourceKey);

		const team = teamByGameDayId.get(rawParticipation.teamId);

		if (!team) {
			throw new Error(
				`No canonical Team owns GameDay team ID ${rawParticipation.teamId} (${rawParticipation.teamName}).`,
			);
		}

		/*
		 * Extra safety: this importer should never
		 * attach a non-U10 Team.
		 */
		if (
			team.categories.age !== "junior" ||
			team.categories.ageBand?.label?.toUpperCase() !== "U10"
		) {
			throw new Error(
				`GameDay team ${rawParticipation.teamId} resolves to ${team.id}, which is not a canonical U10 junior Team.`,
			);
		}

		const season = seasonByGameDayId.get(rawParticipation.competitionId);

		if (!season) {
			throw new Error(
				`No canonical CompetitionSeason owns GameDay competition ID ${rawParticipation.competitionId} (${rawParticipation.competitionName}).`,
			);
		}

		const key = relationshipKey(team.id, season.id);

		const existingParticipation = existingRelationships.get(key);

		if (existingParticipation) {
			console.log(`- existing ${rawParticipation.teamName} -> ${existingParticipation.id}`);

			existing += 1;

			continue;
		}

		const id = participationId(team.id, season.id);

		const participation: TeamParticipation = {
			id,

			teamId: team.id,

			competitionSeasonId: season.id,

			status: "active",

			displayName: rawParticipation.teamName,

			sourceIds: ["england-ice-hockey"],
		};

		const validated = TeamParticipationSchema.parse(participation);

		await writeFile(
			join(PARTICIPATIONS_DIR, `${validated.id}.yaml`),
			stringify(validated, {
				lineWidth: 100,
			}),
			"utf8",
		);

		existingRelationships.set(key, validated);

		console.log(`+ ${rawParticipation.teamName} -> ${validated.id}`);

		created += 1;
	}

	const handled = created + existing;

	console.log("");
	console.log("Import summary");
	console.log("--------------");

	console.log(`Source participations: ${snapshot.participations.length}`);

	console.log(`Created: ${created}`);

	console.log(`Existing: ${existing}`);

	console.log(`Handled: ${handled}`);

	if (handled !== snapshot.participations.length) {
		throw new Error(
			`U10 participation import incomplete: handled ${handled}/${snapshot.participations.length}.`,
		);
	}

	if (seenSourceRelationships.size !== snapshot.participations.length) {
		throw new Error("U10 source participation uniqueness check failed.");
	}
}

await main();
