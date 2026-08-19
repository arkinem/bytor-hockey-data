import { mkdir, readFile, writeFile } from "node:fs/promises";

import { join } from "node:path";

import {
	fetchGameDayCompetitions,
	fetchGameDayCompetitionPage,
	type GameDayCompetition,
} from "./client.js";

import { parseGameDayFixtures, type RawGameDayFixture } from "./parse-fixtures.js";

import { parseGameDayLadder, type RawGameDayLadder } from "./parse-ladder.js";

import { normalizeGameDayJuniorSnapshot, type RawGameDayU10Snapshot } from "./normalize.js";

import type { NormalizedGameDayJuniorSnapshot, RawGameDayJuniorSnapshot } from "./types.js";

const DEFAULT_COMPETITION_DISCOVERY_SEED = "652464";

export type GameDaySnapshotOptions = {
	snapshotDate: string;

	seasonId: string;

	seasonLabel: string;

	importsRoot?: string;

	requestDelayMs?: number;
};

type CompetitionCoverageStatus = "ladder" | "fixture" | "no_ladder" | "deferred";

type CompetitionCoverage = {
	competitionId: string;

	competitionName: string;

	ageGroup: string;

	kind: string;

	status: CompetitionCoverageStatus;

	records: number;
};

type GameDayCoverageReport = {
	provider: "gameday";

	snapshotDate: string;

	seasonId: string;

	seasonLabel: string;

	competitions: number;

	ladderCompetitions: number;

	fixtureCompetitions: number;

	noLadderCompetitions: number;

	deferredCompetitions: number;

	results: CompetitionCoverage[];
};

type TeamAccumulatorValue = {
	names: Set<string>;

	ageGroups: Set<string>;

	competitionIds: Set<string>;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNoLadderError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	return (
		error.message.includes("Could not find ladder table") ||
		error.message.includes("No ladder standings found")
	);
}

function participationKey(teamId: string, competitionId: string): string {
	return `${teamId}|${competitionId}`;
}

function fixtureKey(fixture: RawGameDayFixture): string {
	return fixture.fixtureId;
}

function buildLadderSnapshot(
	competitions: GameDayCompetition[],
	ladders: RawGameDayLadder[],
	snapshotDate: string,
	seasonId: string,
	seasonLabel: string,
): RawGameDayJuniorSnapshot {
	const competitionById = new Map(competitions.map((competition) => [competition.id, competition]));

	const ladderCompetitionIds = new Set(ladders.map((ladder) => ladder.competitionId));

	const teamAccumulator = new Map<string, TeamAccumulatorValue>();

	const participations: RawGameDayJuniorSnapshot["participations"] = [];

	const standings: RawGameDayJuniorSnapshot["standings"] = [];

	for (const ladder of ladders) {
		const competition = competitionById.get(ladder.competitionId);

		if (!competition) {
			throw new Error(`Missing competition metadata for GameDay ${ladder.competitionId}.`);
		}

		for (const standing of ladder.standings) {
			const existing = teamAccumulator.get(standing.teamId) ?? {
				names: new Set<string>(),

				ageGroups: new Set<string>(),

				competitionIds: new Set<string>(),
			};

			existing.names.add(standing.teamName);

			existing.ageGroups.add(competition.ageGroup);

			existing.competitionIds.add(competition.id);

			teamAccumulator.set(standing.teamId, existing);

			participations.push({
				teamId: standing.teamId,

				teamName: standing.teamName,

				competitionId: competition.id,

				competitionName: competition.name,

				ageGroup: competition.ageGroup,
			});

			standings.push({
				teamId: standing.teamId,

				competitionId: competition.id,

				position: standing.position,

				played: standing.played,

				wins: standing.wins,

				losses: standing.losses,

				draws: standing.draws,

				points: standing.points,

				goalsFor: standing.goalsFor,

				goalsAgainst: standing.goalsAgainst,

				goalDifference: standing.goalDifference,

				lastFive: standing.lastFive,
			});
		}
	}

	const teams = [...teamAccumulator.entries()]
		.map(([id, value]) => ({
			id,

			names: [...value.names].sort(),

			ageGroups: [...value.ageGroups].sort(),

			competitionIds: [...value.competitionIds].sort(),
		}))
		.sort((a, b) => a.id.localeCompare(b.id));

	return {
		source: "gameday",

		snapshotDate,

		seasonId,

		seasonLabel,

		competitions: competitions.map((competition) => ({
			id: competition.id,

			name: competition.name,

			ageGroup: competition.ageGroup,

			kind: competition.kind,

			hasLadder: ladderCompetitionIds.has(competition.id),
		})),

		teams,

		participations,

		standings,
	};
}

function buildU10Snapshot(
	competitions: GameDayCompetition[],
	fixturePages: Array<{
		competition: GameDayCompetition;

		fixtures: RawGameDayFixture[];
	}>,
	snapshotDate: string,
): RawGameDayU10Snapshot {
	const teamAccumulator = new Map<
		string,
		{
			names: Set<string>;

			competitionIds: Set<string>;
		}
	>();

	const participationKeys = new Set<string>();

	const participations: RawGameDayU10Snapshot["participations"] = [];

	const fixtures: RawGameDayU10Snapshot["fixtures"] = [];

	const competitionSnapshots: RawGameDayU10Snapshot["competitions"] = [];

	for (const fixturePage of fixturePages) {
		const competition = fixturePage.competition;

		const competitionTeams = new Map<string, string>();

		function observeTeam(teamId: string, teamName: string): void {
			competitionTeams.set(teamId, teamName);

			const existing = teamAccumulator.get(teamId) ?? {
				names: new Set<string>(),

				competitionIds: new Set<string>(),
			};

			existing.names.add(teamName);

			existing.competitionIds.add(competition.id);

			teamAccumulator.set(teamId, existing);

			const key = participationKey(teamId, competition.id);

			if (participationKeys.has(key)) {
				return;
			}

			participationKeys.add(key);

			participations.push({
				teamId,

				teamName,

				competitionId: competition.id,

				competitionName: competition.name,
			});
		}

		for (const fixture of fixturePage.fixtures) {
			observeTeam(fixture.homeTeam.id, fixture.homeTeam.name);

			if (fixture.awayTeam) {
				observeTeam(fixture.awayTeam.id, fixture.awayTeam.name);
			}

			fixtures.push(fixture);
		}

		const realGames = fixturePage.fixtures.filter((fixture) => !fixture.isBye);

		const byes = fixturePage.fixtures.filter((fixture) => fixture.isBye);

		competitionSnapshots.push({
			id: competition.id,

			name: competition.name,

			fixtureRecords: fixturePage.fixtures.length,

			realGames: realGames.length,

			byes: byes.length,

			teamIds: [...competitionTeams.keys()].sort(),
		});
	}

	const expectedCompetitionIds = new Set(competitions.map((competition) => competition.id));

	for (const competition of competitionSnapshots) {
		if (!expectedCompetitionIds.has(competition.id)) {
			throw new Error(`Unexpected U10 competition ${competition.id}.`);
		}
	}

	const teams = [...teamAccumulator.entries()]
		.map(([id, value]) => ({
			id,

			names: [...value.names].sort(),

			competitionIds: [...value.competitionIds].sort(),
		}))
		.sort((a, b) => a.id.localeCompare(b.id));

	return {
		source: "gameday",

		snapshotDate,

		ageGroup: "U10",

		competitions: competitionSnapshots,

		teams,

		participations,

		fixtures,
	};
}

function assertUniqueFixtures(snapshot: NormalizedGameDayJuniorSnapshot): void {
	const ids = new Set<string>();

	for (const fixture of snapshot.fixtures) {
		const key = fixtureKey(fixture);

		if (ids.has(key)) {
			throw new Error(`Duplicate GameDay fixture ID ${key}.`);
		}

		ids.add(key);
	}
}

function assertNormalizedSnapshot(snapshot: NormalizedGameDayJuniorSnapshot): void {
	const competitionIds = new Set(snapshot.competitions.map((competition) => competition.id));

	const teamIds = new Set(snapshot.teams.map((team) => team.id));

	for (const participation of snapshot.participations) {
		if (!competitionIds.has(participation.competitionId)) {
			throw new Error(
				`Participation references missing competition ${participation.competitionId}.`,
			);
		}

		if (!teamIds.has(participation.teamId)) {
			throw new Error(`Participation references missing team ${participation.teamId}.`);
		}
	}

	for (const standing of snapshot.standings) {
		if (!competitionIds.has(standing.competitionId)) {
			throw new Error(`Standing references missing competition ${standing.competitionId}.`);
		}

		if (!teamIds.has(standing.teamId)) {
			throw new Error(`Standing references missing team ${standing.teamId}.`);
		}
	}

	assertUniqueFixtures(snapshot);
}

export async function snapshotGameDayJuniors(
	options: GameDaySnapshotOptions,
): Promise<NormalizedGameDayJuniorSnapshot> {
	const importsRoot = options.importsRoot ?? "imports";

	const requestDelayMs = options.requestDelayMs ?? 250;

	const rootDir = join(importsRoot, "england-ice-hockey", options.snapshotDate, "gameday");

	const rawDir = join(rootDir, "raw");

	const rawCompetitionsDir = join(rawDir, "competitions");

	const normalizedDir = join(rootDir, "normalized");

	await mkdir(rawCompetitionsDir, {
		recursive: true,
	});

	await mkdir(normalizedDir, {
		recursive: true,
	});

	console.log("England Ice Hockey GameDay snapshot");

	console.log("===================================");

	console.log("");

	console.log("Discovering competitions...");

	const competitions = await fetchGameDayCompetitions(DEFAULT_COMPETITION_DISCOVERY_SEED);

	await writeFile(join(rawDir, "competitions.json"), JSON.stringify(competitions, null, 2), "utf8");

	console.log(`Competitions: ${competitions.length}`);

	console.log("");

	const ladders: RawGameDayLadder[] = [];

	const fixturePages: Array<{
		competition: GameDayCompetition;

		fixtures: RawGameDayFixture[];
	}> = [];

	const coverage: CompetitionCoverage[] = [];

	for (let index = 0; index < competitions.length; index += 1) {
		const competition = competitions[index];

		if (!competition) {
			continue;
		}

		console.log(`[${index + 1}/${competitions.length}] ${competition.id} ${competition.name}`);

		const outputDir = join(rawCompetitionsDir, competition.id);

		await mkdir(outputDir, {
			recursive: true,
		});

		/*
		 * U10 has no useful ladder.
		 * Membership is derived from fixture
		 * observations instead.
		 */
		if (competition.ageGroup === "U10") {
			const html = await fetchGameDayCompetitionPage(competition.id, "FIXTURE");

			await writeFile(join(outputDir, "fixture.html"), html, "utf8");

			const parsed = parseGameDayFixtures(html, competition.id);

			fixturePages.push({
				competition,

				fixtures: parsed.fixtures,
			});

			coverage.push({
				competitionId: competition.id,

				competitionName: competition.name,

				ageGroup: competition.ageGroup,

				kind: competition.kind,

				status: "fixture",

				records: parsed.fixtures.length,
			});

			console.log(`  ✓ ${parsed.fixtures.length} fixture records`);
		} else {
			const html = await fetchGameDayCompetitionPage(competition.id, "LADDER");

			await writeFile(join(outputDir, "ladder.html"), html, "utf8");

			try {
				const ladder = parseGameDayLadder(html, competition.id);

				ladders.push(ladder);

				coverage.push({
					competitionId: competition.id,

					competitionName: competition.name,

					ageGroup: competition.ageGroup,

					kind: competition.kind,

					status: "ladder",

					records: ladder.standings.length,
				});

				console.log(`  ✓ ${ladder.standings.length} ladder rows`);
			} catch (error) {
				if (!isNoLadderError(error)) {
					throw error;
				}

				const deferred = competition.kind === "national" || competition.kind === "challenge";

				coverage.push({
					competitionId: competition.id,

					competitionName: competition.name,

					ageGroup: competition.ageGroup,

					kind: competition.kind,

					status: deferred ? "deferred" : "no_ladder",

					records: 0,
				});

				console.log(deferred ? "  ~ deferred/no ladder" : "  ~ no ladder");
			}
		}

		if (index < competitions.length - 1) {
			await sleep(requestDelayMs);
		}
	}

	const ladderSnapshot = buildLadderSnapshot(
		competitions,
		ladders,
		options.snapshotDate,
		options.seasonId,
		options.seasonLabel,
	);

	const u10Competitions = competitions.filter((competition) => competition.ageGroup === "U10");

	const u10Snapshot = buildU10Snapshot(u10Competitions, fixturePages, options.snapshotDate);

	const normalized = normalizeGameDayJuniorSnapshot(ladderSnapshot, u10Snapshot);

	assertNormalizedSnapshot(normalized);

	const coverageReport: GameDayCoverageReport = {
		provider: "gameday",

		snapshotDate: options.snapshotDate,

		seasonId: options.seasonId,

		seasonLabel: options.seasonLabel,

		competitions: competitions.length,

		ladderCompetitions: coverage.filter((result) => result.status === "ladder").length,

		fixtureCompetitions: coverage.filter((result) => result.status === "fixture").length,

		noLadderCompetitions: coverage.filter((result) => result.status === "no_ladder").length,

		deferredCompetitions: coverage.filter((result) => result.status === "deferred").length,

		results: coverage,
	};

	await writeFile(join(rawDir, "coverage.json"), JSON.stringify(coverageReport, null, 2), "utf8");

	await writeFile(
		join(normalizedDir, "snapshot.json"),
		JSON.stringify(normalized, null, 2),
		"utf8",
	);

	console.log("");
	console.log("Normalized snapshot");
	console.log("-------------------");

	console.log(`Season: ${normalized.seasonLabel} (${normalized.seasonId})`);

	console.log(`Competitions: ${normalized.competitions.length}`);

	console.log(`Teams: ${normalized.teams.length}`);

	console.log(`Participations: ${normalized.participations.length}`);

	console.log(`Standings: ${normalized.standings.length}`);

	console.log(`Fixtures: ${normalized.fixtures.length}`);

	console.log("");

	console.log(`Written: ${join(normalizedDir, "snapshot.json")}`);

	return normalized;
}
