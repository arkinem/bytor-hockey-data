import { readFile, readdir } from "node:fs/promises";

import { extname, join } from "node:path";

import { parse } from "yaml";

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

import type { RawGameDayJuniorSnapshot } from "../providers/england-ice-hockey/gameday/types.js";

const SNAPSHOT_DATE = "2026-08-18";

const RAW_JUNIORS_FILE = join(
	"imports",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday",
	"raw-juniors.json",
);

const RAW_U10_FILE = join("imports", "england-ice-hockey", SNAPSHOT_DATE, "gameday", "u10.json");

const TEAMS_DIR = join("data", "teams");

const SEASONS_DIR = join("data", "competition-seasons");

const GROUPS_DIR = join("data", "competition-groups");

const PARTICIPATIONS_DIR = join("data", "team-participations");

const U14_MAPPING_FILE = join("data", "mappings", "england-ice-hockey", "gameday-u14-2025-26.yaml");

type U14MappingFile = {
	anomalies?: Record<string, unknown>;
};

type RawU10Team = {
	id: string;

	names: string[];

	competitionIds: string[];
};

type RawU10Participation = {
	teamId: string;

	teamName: string;

	competitionId: string;

	competitionName: string;
};

type RawU10Competition = {
	id: string;

	name: string;

	fixtureRecords: number;

	realGames: number;

	byes: number;

	teamIds: string[];
};

type RawU10Snapshot = {
	source: "gameday";

	snapshotDate: string;

	ageGroup: "U10";

	competitions: RawU10Competition[];

	teams: RawU10Team[];

	participations: RawU10Participation[];
};

type Destination = {
	competitionSeasonId: string;

	competitionGroupId?: string;
};

async function loadYamlDirectory(directory: string): Promise<unknown[]> {
	const files = await readdir(directory);

	return Promise.all(
		files
			.filter((file) => [".yaml", ".yml"].includes(extname(file)))
			.map(async (file) => parse(await readFile(join(directory, file), "utf8"))),
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
					`Duplicate GameDay team ID ${externalId.value}: ${existing.id}, ${team.id}`,
				);
			}

			index.set(externalId.value, team);
		}
	}

	return index;
}

function buildCompetitionDestinationIndex(
	seasons: CompetitionSeason[],
	groups: CompetitionGroup[],
): Map<string, Destination> {
	const index = new Map<string, Destination>();

	function add(gameDayId: string, destination: Destination): void {
		const existing = index.get(gameDayId);

		if (existing) {
			throw new Error(`Duplicate GameDay competition destination ${gameDayId}.`);
		}

		index.set(gameDayId, destination);
	}

	for (const season of seasons) {
		for (const externalId of season.externalIds) {
			if (externalId.system !== "gameday") {
				continue;
			}

			add(externalId.value, {
				competitionSeasonId: season.id,
			});
		}
	}

	for (const group of groups) {
		for (const externalId of group.externalIds) {
			if (externalId.system !== "gameday") {
				continue;
			}

			add(externalId.value, {
				competitionSeasonId: group.competitionSeasonId,

				competitionGroupId: group.id,
			});
		}
	}

	return index;
}

function participationKey(
	teamId: string,
	competitionSeasonId: string,
	competitionGroupId?: string,
): string {
	return [teamId, competitionSeasonId, competitionGroupId ?? ""].join("|");
}

async function main(): Promise<void> {
	const juniors = JSON.parse(await readFile(RAW_JUNIORS_FILE, "utf8")) as RawGameDayJuniorSnapshot;

	const u10 = JSON.parse(await readFile(RAW_U10_FILE, "utf8")) as RawU10Snapshot;

	const teams = (await loadYamlDirectory(TEAMS_DIR)).map((data) => TeamSchema.parse(data));

	const seasons = (await loadYamlDirectory(SEASONS_DIR)).map((data) =>
		CompetitionSeasonSchema.parse(data),
	);

	const groups = (await loadYamlDirectory(GROUPS_DIR)).map((data) =>
		CompetitionGroupSchema.parse(data),
	);

	const participations = (await loadYamlDirectory(PARTICIPATIONS_DIR)).map((data) =>
		TeamParticipationSchema.parse(data),
	);

	const mapping = parse(await readFile(U14_MAPPING_FILE, "utf8")) as U14MappingFile;

	const anomalyIds = new Set(Object.keys(mapping.anomalies ?? {}));

	const teamByGameDayId = buildGameDayTeamIndex(teams);

	const destinationByGameDayId = buildCompetitionDestinationIndex(seasons, groups);

	const canonicalParticipationKeys = new Set(
		participations.map((participation) =>
			participationKey(
				participation.teamId,

				participation.competitionSeasonId,

				participation.competitionGroupId,
			),
		),
	);

	/*
	 * --------------------------------
	 * U10 teams
	 * --------------------------------
	 */

	let u10ResolvedTeams = 0;
	let u10MissingTeams = 0;

	for (const rawTeam of u10.teams) {
		const canonical = teamByGameDayId.get(rawTeam.id);

		if (!canonical) {
			console.error(
				`Missing U10 canonical Team for GameDay ${rawTeam.id}: ${rawTeam.names.join(" / ")}`,
			);

			u10MissingTeams += 1;

			continue;
		}

		if (canonical.categories.ageBand?.label?.toUpperCase() !== "U10") {
			console.error(
				`U10 GameDay team ${rawTeam.id} resolves to non-U10 canonical Team ${canonical.id}.`,
			);

			u10MissingTeams += 1;

			continue;
		}

		u10ResolvedTeams += 1;
	}

	/*
	 * --------------------------------
	 * U10 competitions
	 * --------------------------------
	 */

	let u10MappedCompetitions = 0;
	let u10UnmappedCompetitions = 0;

	for (const competition of u10.competitions) {
		if (destinationByGameDayId.has(competition.id)) {
			u10MappedCompetitions += 1;
		} else {
			console.error(
				`Missing canonical U10 competition destination for GameDay ${competition.id}: ${competition.name}`,
			);

			u10UnmappedCompetitions += 1;
		}
	}

	/*
	 * --------------------------------
	 * U10 participations
	 * --------------------------------
	 */

	let u10ResolvedParticipations = 0;
	let u10MissingParticipations = 0;

	for (const rawParticipation of u10.participations) {
		const team = teamByGameDayId.get(rawParticipation.teamId);

		const destination = destinationByGameDayId.get(rawParticipation.competitionId);

		if (!team || !destination) {
			console.error(
				`Cannot resolve U10 provider participation: ${rawParticipation.teamId} / ${rawParticipation.competitionId}`,
			);

			u10MissingParticipations += 1;

			continue;
		}

		const key = participationKey(
			team.id,

			destination.competitionSeasonId,

			destination.competitionGroupId,
		);

		if (canonicalParticipationKeys.has(key)) {
			u10ResolvedParticipations += 1;
		} else {
			console.error(`Missing canonical U10 TeamParticipation: ${key}`);

			u10MissingParticipations += 1;
		}
	}

	/*
	 * --------------------------------
	 * U12-U19 teams
	 * --------------------------------
	 */

	let juniorResolvedTeams = 0;
	let juniorExcludedTeams = 0;
	let juniorMissingTeams = 0;

	for (const rawTeam of juniors.teams) {
		if (anomalyIds.has(rawTeam.id)) {
			juniorExcludedTeams += 1;

			continue;
		}

		if (teamByGameDayId.has(rawTeam.id)) {
			juniorResolvedTeams += 1;
		} else {
			console.error(
				`Missing canonical Team for GameDay ${rawTeam.id}: ${rawTeam.names.join(" / ")}`,
			);

			juniorMissingTeams += 1;
		}
	}

	/*
	 * --------------------------------
	 * U12-U19 ladder competitions
	 * --------------------------------
	 */

	const ladderCompetitions = juniors.competitions.filter((competition) => competition.hasLadder);

	let juniorMappedCompetitions = 0;
	let juniorUnmappedCompetitions = 0;

	for (const competition of ladderCompetitions) {
		if (destinationByGameDayId.has(competition.id)) {
			juniorMappedCompetitions += 1;
		} else {
			console.error(
				`Missing canonical competition destination for GameDay ${competition.id}: ${competition.name}`,
			);

			juniorUnmappedCompetitions += 1;
		}
	}

	/*
	 * --------------------------------
	 * U12-U19 participations
	 * --------------------------------
	 */

	let juniorResolvedParticipations = 0;
	let juniorExcludedParticipations = 0;
	let juniorMissingParticipations = 0;

	for (const rawParticipation of juniors.participations) {
		if (anomalyIds.has(rawParticipation.teamId)) {
			juniorExcludedParticipations += 1;

			continue;
		}

		const team = teamByGameDayId.get(rawParticipation.teamId);

		const destination = destinationByGameDayId.get(rawParticipation.competitionId);

		if (!team || !destination) {
			console.error(
				`Cannot resolve provider participation: ${rawParticipation.teamId} / ${rawParticipation.competitionId}`,
			);

			juniorMissingParticipations += 1;

			continue;
		}

		const key = participationKey(
			team.id,

			destination.competitionSeasonId,

			destination.competitionGroupId,
		);

		if (canonicalParticipationKeys.has(key)) {
			juniorResolvedParticipations += 1;
		} else {
			console.error(`Missing canonical TeamParticipation: ${key}`);

			juniorMissingParticipations += 1;
		}
	}

	/*
	 * --------------------------------
	 * Combined totals
	 * --------------------------------
	 */

	const providerTeams = u10.teams.length + juniors.teams.length;

	const resolvedTeams = u10ResolvedTeams + juniorResolvedTeams;

	const excludedTeams = juniorExcludedTeams;

	const missingTeams = u10MissingTeams + juniorMissingTeams;

	const providerCompetitions = u10.competitions.length + ladderCompetitions.length;

	const mappedCompetitions = u10MappedCompetitions + juniorMappedCompetitions;

	const unmappedCompetitions = u10UnmappedCompetitions + juniorUnmappedCompetitions;

	const providerParticipations = u10.participations.length + juniors.participations.length;

	const resolvedParticipations = u10ResolvedParticipations + juniorResolvedParticipations;

	const excludedParticipations = juniorExcludedParticipations;

	const missingParticipations = u10MissingParticipations + juniorMissingParticipations;

	console.log("");
	console.log("GameDay Junior Provider Integrity Audit");
	console.log("=======================================");

	console.log("");
	console.log("U10");
	console.log("---");

	console.log(`Teams: ${u10.teams.length}`);

	console.log(`Resolved teams: ${u10ResolvedTeams}`);

	console.log(`Missing teams: ${u10MissingTeams}`);

	console.log("");

	console.log(`Competitions: ${u10.competitions.length}`);

	console.log(`Mapped competitions: ${u10MappedCompetitions}`);

	console.log(`Unmapped competitions: ${u10UnmappedCompetitions}`);

	console.log("");

	console.log(`Participations: ${u10.participations.length}`);

	console.log(`Resolved participations: ${u10ResolvedParticipations}`);

	console.log(`Missing participations: ${u10MissingParticipations}`);

	console.log("");
	console.log("U12-U19");
	console.log("-------");

	console.log(`Teams: ${juniors.teams.length}`);

	console.log(`Resolved teams: ${juniorResolvedTeams}`);

	console.log(`Excluded anomalies: ${juniorExcludedTeams}`);

	console.log(`Missing teams: ${juniorMissingTeams}`);

	console.log("");

	console.log(`Ladder competitions: ${ladderCompetitions.length}`);

	console.log(`Mapped competitions: ${juniorMappedCompetitions}`);

	console.log(`Unmapped competitions: ${juniorUnmappedCompetitions}`);

	console.log("");

	console.log(`Participations: ${juniors.participations.length}`);

	console.log(`Resolved participations: ${juniorResolvedParticipations}`);

	console.log(`Excluded participations: ${juniorExcludedParticipations}`);

	console.log(`Missing participations: ${juniorMissingParticipations}`);

	console.log("");
	console.log("Combined provider coverage");
	console.log("--------------------------");

	console.log(`Provider teams: ${providerTeams}`);

	console.log(`Resolved teams: ${resolvedTeams}`);

	console.log(`Excluded anomalies: ${excludedTeams}`);

	console.log(`Missing teams: ${missingTeams}`);

	console.log("");

	console.log(`Provider competitions: ${providerCompetitions}`);

	console.log(`Mapped competitions: ${mappedCompetitions}`);

	console.log(`Unmapped competitions: ${unmappedCompetitions}`);

	console.log("");

	console.log(`Provider participations: ${providerParticipations}`);

	console.log(`Resolved participations: ${resolvedParticipations}`);

	console.log(`Excluded participations: ${excludedParticipations}`);

	console.log(`Missing participations: ${missingParticipations}`);

	const failures = missingTeams + unmappedCompetitions + missingParticipations;

	console.log("");
	console.log(`Failures: ${failures}`);

	if (failures > 0) {
		process.exitCode = 1;
	}
}

await main();
