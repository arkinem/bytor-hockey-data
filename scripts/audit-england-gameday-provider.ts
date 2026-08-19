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

import type { NormalizedGameDayJuniorSnapshot } from "../providers/england-ice-hockey/gameday/types.js";

const SNAPSHOT_DATE = "2026-08-18";

const SNAPSHOT_FILE = join(
	"imports",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday",
	"normalized",
	"snapshot.json",
);

const TEAMS_DIR = join("data", "teams");

const SEASONS_DIR = join("data", "competition-seasons");

const GROUPS_DIR = join("data", "competition-groups");

const PARTICIPATIONS_DIR = join("data", "team-participations");

const U14_MAPPING_FILE = join("data", "mappings", "england-ice-hockey", "gameday-u14-2025-26.yaml");

type U14MappingFile = {
	anomalies?: Record<string, unknown>;
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
	const snapshot = JSON.parse(
		await readFile(SNAPSHOT_FILE, "utf8"),
	) as NormalizedGameDayJuniorSnapshot;

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
	 * Teams
	 * --------------------------------
	 */

	let resolvedTeams = 0;
	let excludedTeams = 0;
	let missingTeams = 0;

	for (const rawTeam of snapshot.teams) {
		if (anomalyIds.has(rawTeam.id)) {
			excludedTeams += 1;

			continue;
		}

		const canonical = teamByGameDayId.get(rawTeam.id);

		if (!canonical) {
			console.error(
				`Missing canonical Team for GameDay ${rawTeam.id}: ${rawTeam.names.join(" / ")}`,
			);

			missingTeams += 1;

			continue;
		}

		/*
		 * Extra semantic safety:
		 * if provider has exactly one age context,
		 * canonical ageBand should agree when present.
		 */
		if (rawTeam.ageGroups.length === 1) {
			const rawAge = rawTeam.ageGroups[0];

			const canonicalAge = canonical.categories.ageBand?.label;

			if (rawAge && canonicalAge && rawAge.toUpperCase() !== canonicalAge.toUpperCase()) {
				console.error(
					`Age mismatch for GameDay ${rawTeam.id}: provider=${rawAge}, canonical=${canonicalAge} (${canonical.id})`,
				);

				missingTeams += 1;

				continue;
			}
		}

		resolvedTeams += 1;
	}

	/*
	 * --------------------------------
	 * Competitions
	 * --------------------------------
	 *
	 * Only provider competitions represented as
	 * canonical league structures are expected to
	 * have destinations.
	 *
	 * Deferred tournament/challenge entries are
	 * deliberately excluded from this requirement.
	 */

	const deferredCompetitionIds = new Set(
		snapshot.competitions
			.filter(
				(competition) =>
					competition.kind === "challenge" ||
					(competition.kind === "national" && /Junior Nationals?$/i.test(competition.name)),
			)
			.map((competition) => competition.id),
	);

	const mappedProviderCompetitions = snapshot.competitions.filter(
		(competition) => !deferredCompetitionIds.has(competition.id),
	);

	let mappedCompetitions = 0;
	let unmappedCompetitions = 0;

	for (const competition of mappedProviderCompetitions) {
		if (destinationByGameDayId.has(competition.id)) {
			mappedCompetitions += 1;
		} else {
			console.error(
				`Missing canonical competition destination for GameDay ${competition.id}: ${competition.name}`,
			);

			unmappedCompetitions += 1;
		}
	}

	/*
	 * --------------------------------
	 * Participations
	 * --------------------------------
	 */

	let resolvedParticipations = 0;
	let excludedParticipations = 0;
	let missingParticipations = 0;

	for (const rawParticipation of snapshot.participations) {
		if (anomalyIds.has(rawParticipation.teamId)) {
			excludedParticipations += 1;

			continue;
		}

		const team = teamByGameDayId.get(rawParticipation.teamId);

		const destination = destinationByGameDayId.get(rawParticipation.competitionId);

		if (!team || !destination) {
			console.error(
				`Cannot resolve provider participation: ${rawParticipation.teamId} / ${rawParticipation.competitionId}`,
			);

			missingParticipations += 1;

			continue;
		}

		const key = participationKey(
			team.id,
			destination.competitionSeasonId,
			destination.competitionGroupId,
		);

		if (canonicalParticipationKeys.has(key)) {
			resolvedParticipations += 1;
		} else {
			console.error(`Missing canonical TeamParticipation: ${key}`);

			missingParticipations += 1;
		}
	}

	/*
	 * --------------------------------
	 * Age-group breakdown
	 * --------------------------------
	 */

	const ageGroups = ["U10", "U12", "U14", "U16", "U19"];

	const ageBreakdown = Object.fromEntries(
		ageGroups.map((ageGroup) => {
			const teamCount = snapshot.teams.filter((team) => team.ageGroups.includes(ageGroup)).length;

			const participationCount = snapshot.participations.filter(
				(participation) => participation.ageGroup === ageGroup,
			).length;

			const competitionCount = snapshot.competitions.filter(
				(competition) => competition.ageGroup === ageGroup,
			).length;

			return [
				ageGroup,
				{
					teams: teamCount,

					competitions: competitionCount,

					participations: participationCount,
				},
			];
		}),
	);

	const failures = missingTeams + unmappedCompetitions + missingParticipations;

	console.log("");
	console.log("GameDay Junior Provider Integrity Audit");
	console.log("=======================================");

	console.log("");

	console.log(`Snapshot: ${snapshot.snapshotDate}`);

	console.log(`Season: ${snapshot.seasonLabel} (${snapshot.seasonId})`);

	console.log("");

	console.log("Provider snapshot");

	console.log("-----------------");

	console.log(`Competitions: ${snapshot.competitions.length}`);

	console.log(`Teams: ${snapshot.teams.length}`);

	console.log(`Participations: ${snapshot.participations.length}`);

	console.log(`Standings: ${snapshot.standings.length}`);

	console.log(`Fixtures: ${snapshot.fixtures.length}`);

	console.log("");

	console.log("Age groups");

	console.log("----------");

	for (const ageGroup of ageGroups) {
		const counts = ageBreakdown[ageGroup];

		if (!counts) {
			continue;
		}

		console.log(
			`${ageGroup}: ${counts.teams} teams, ${counts.competitions} competitions, ${counts.participations} participations`,
		);
	}

	console.log("");

	console.log("Canonical coverage");

	console.log("------------------");

	console.log(`Provider teams: ${snapshot.teams.length}`);

	console.log(`Resolved teams: ${resolvedTeams}`);

	console.log(`Excluded anomalies: ${excludedTeams}`);

	console.log(`Missing teams: ${missingTeams}`);

	console.log("");

	console.log(`Provider competitions: ${snapshot.competitions.length}`);

	console.log(`Expected canonical competitions: ${mappedProviderCompetitions.length}`);

	console.log(`Deferred events: ${deferredCompetitionIds.size}`);

	console.log(`Mapped competitions: ${mappedCompetitions}`);

	console.log(`Unmapped competitions: ${unmappedCompetitions}`);

	console.log("");

	console.log(`Provider participations: ${snapshot.participations.length}`);

	console.log(`Resolved participations: ${resolvedParticipations}`);

	console.log(`Excluded participations: ${excludedParticipations}`);

	console.log(`Missing participations: ${missingParticipations}`);

	console.log("");

	console.log(`Failures: ${failures}`);

	if (failures > 0) {
		process.exitCode = 1;
	}
}

await main();
