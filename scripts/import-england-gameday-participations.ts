import { readFile, readdir, writeFile } from "node:fs/promises";

import { extname, join } from "node:path";

import { parse, stringify } from "yaml";

import {
	CompetitionGroupSchema,
	CompetitionSeasonSchema,
	TeamParticipationSchema,
	TeamSchema,
	type CompetitionGroup,
	type CompetitionSeason,
	type Team,
	type TeamParticipation,
} from "../schema/index.js";

import type { RawGameDayJuniorSnapshot } from "./importers/england-ice-hockey/gameday-types.js";

const SNAPSHOT_DATE = "2026-08-18";

const RAW_FILE = join(
	"imports",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday",
	"raw-juniors.json",
);

const TEAMS_DIR = join("data", "teams");

const SEASONS_DIR = join("data", "competition-seasons");

const GROUPS_DIR = join("data", "competition-groups");

const PARTICIPATIONS_DIR = join("data", "team-participations");

const U14_MAPPING_FILE = join("data", "mappings", "england-ice-hockey", "gameday-u14-2025-26.yaml");

type U14MappingFile = {
	anomalies?: Record<
		string,
		{
			sourceName: string;
			observedCompetitionId?: string;
			observedCompetitionName?: string;
			issue?: string;
			action?: string;
			notes?: string;
		}
	>;
};

type Destination = {
	competitionSeasonId: string;

	competitionGroupId?: string;
};

async function loadYamlDirectory(directory: string): Promise<unknown[]> {
	const files = await readdir(directory);

	const yamlFiles = files.filter((file) => [".yaml", ".yml"].includes(extname(file)));

	return Promise.all(
		yamlFiles.map(async (file) => parse(await readFile(join(directory, file), "utf8"))),
	);
}

function createRelationshipKey(
	teamId: string,
	competitionSeasonId: string,
	competitionGroupId?: string,
): string {
	return [teamId, competitionSeasonId, competitionGroupId ?? ""].join("|");
}

function createParticipationId(
	teamId: string,
	competitionSeasonId: string,
	competitionGroupId?: string,
): string {
	return [
		teamId,
		competitionSeasonId,
		...(competitionGroupId ? [competitionGroupId.replace(`${competitionSeasonId}-`, "")] : []),
	].join("-");
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

function buildGameDayDestinationIndex(
	seasons: CompetitionSeason[],
	groups: CompetitionGroup[],
): Map<string, Destination> {
	const index = new Map<string, Destination>();

	function addDestination(gameDayId: string, destination: Destination): void {
		const existing = index.get(gameDayId);

		if (existing) {
			throw new Error(
				`GameDay competition ID ${gameDayId} maps to multiple canonical destinations.`,
			);
		}

		index.set(gameDayId, destination);
	}

	for (const season of seasons) {
		for (const externalId of season.externalIds) {
			if (externalId.system !== "gameday") {
				continue;
			}

			addDestination(externalId.value, {
				competitionSeasonId: season.id,
			});
		}
	}

	for (const group of groups) {
		for (const externalId of group.externalIds) {
			if (externalId.system !== "gameday") {
				continue;
			}

			addDestination(externalId.value, {
				competitionSeasonId: group.competitionSeasonId,

				competitionGroupId: group.id,
			});
		}
	}

	return index;
}

async function main(): Promise<void> {
	const snapshot = JSON.parse(await readFile(RAW_FILE, "utf8")) as RawGameDayJuniorSnapshot;

	const teams = (await loadYamlDirectory(TEAMS_DIR)).map((data) => TeamSchema.parse(data));

	const seasons = (await loadYamlDirectory(SEASONS_DIR)).map((data) =>
		CompetitionSeasonSchema.parse(data),
	);

	const groups = (await loadYamlDirectory(GROUPS_DIR)).map((data) =>
		CompetitionGroupSchema.parse(data),
	);

	const existingParticipations = (await loadYamlDirectory(PARTICIPATIONS_DIR)).map((data) =>
		TeamParticipationSchema.parse(data),
	);

	const u14Mapping = parse(await readFile(U14_MAPPING_FILE, "utf8")) as U14MappingFile;

	const anomalyTeamIds = new Set(Object.keys(u14Mapping.anomalies ?? {}));

	const teamByGameDayId = buildGameDayTeamIndex(teams);

	const destinationByGameDayId = buildGameDayDestinationIndex(seasons, groups);

	const existingRelationships = new Map<string, TeamParticipation>();

	for (const participation of existingParticipations) {
		const key = createRelationshipKey(
			participation.teamId,
			participation.competitionSeasonId,
			participation.competitionGroupId,
		);

		if (existingRelationships.has(key)) {
			throw new Error(`Duplicate existing TeamParticipation relationship: ${key}`);
		}

		existingRelationships.set(key, participation);
	}

	let created = 0;
	let existing = 0;
	let anomaliesExcluded = 0;

	for (const rawParticipation of snapshot.participations) {
		/*
		 * Known provider anomaly.
		 *
		 * Example:
		 * Manchester Storm Academy U16 B
		 * incorrectly listed in U14 North 2 West.
		 */
		if (anomalyTeamIds.has(rawParticipation.teamId)) {
			console.log(`! exclude anomaly ${rawParticipation.teamId} ${rawParticipation.teamName}`);

			anomaliesExcluded += 1;

			continue;
		}

		const team = teamByGameDayId.get(rawParticipation.teamId);

		if (!team) {
			throw new Error(
				`No canonical Team owns GameDay team ID ${rawParticipation.teamId} (${rawParticipation.teamName}).`,
			);
		}

		const destination = destinationByGameDayId.get(rawParticipation.competitionId);

		if (!destination) {
			throw new Error(
				`No canonical destination owns GameDay competition ID ${rawParticipation.competitionId} (${rawParticipation.competitionName}).`,
			);
		}

		const relationshipKey = createRelationshipKey(
			team.id,
			destination.competitionSeasonId,
			destination.competitionGroupId,
		);

		const existingParticipation = existingRelationships.get(relationshipKey);

		if (existingParticipation) {
			console.log(`- existing ${rawParticipation.teamName} -> ${existingParticipation.id}`);

			existing += 1;

			continue;
		}

		const participationId = createParticipationId(
			team.id,
			destination.competitionSeasonId,
			destination.competitionGroupId,
		);

		const participation: TeamParticipation = {
			id: participationId,

			teamId: team.id,

			competitionSeasonId: destination.competitionSeasonId,

			...(destination.competitionGroupId
				? {
						competitionGroupId: destination.competitionGroupId,
					}
				: {}),

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

		existingRelationships.set(relationshipKey, validated);

		console.log(`+ ${rawParticipation.teamName} -> ${validated.id}`);

		created += 1;
	}

	const handled = created + existing + anomaliesExcluded;

	console.log("");
	console.log("GameDay participation import");
	console.log("----------------------------");

	console.log(`Source participations: ${snapshot.participations.length}`);

	console.log(`Created: ${created}`);

	console.log(`Existing: ${existing}`);

	console.log(`Anomalies excluded: ${anomaliesExcluded}`);

	console.log(`Handled: ${handled}`);

	if (handled !== snapshot.participations.length) {
		throw new Error(
			`Participation import incomplete: handled ${handled}/${snapshot.participations.length}.`,
		);
	}
}

await main();
