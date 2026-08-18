import { readFile, writeFile } from "node:fs/promises";

import { join } from "node:path";

import type { GameDayCompetition } from "../providers/england-ice-hockey/gameday/client.js";

import type { RawGameDayLadder } from "../providers/england-ice-hockey/gameday/parse-ladder.js";

import type { RawGameDayJuniorSnapshot } from "../providers/england-ice-hockey/gameday/types.js";

const SNAPSHOT_DATE = "2026-08-18";

const ROOT_DIR = join("imports", "england-ice-hockey", SNAPSHOT_DATE, "gameday");

const COMPETITIONS_FILE = join(ROOT_DIR, "competitions.json");

const COVERAGE_FILE = join(ROOT_DIR, "coverage.json");

const OUTPUT_FILE = join(ROOT_DIR, "raw-juniors.json");

type Coverage = {
	results: Array<{
		competitionId: string;

		status: "ok" | "no_ladder" | "error";
	}>;
};

async function main(): Promise<void> {
	const competitions = JSON.parse(
		await readFile(COMPETITIONS_FILE, "utf8"),
	) as GameDayCompetition[];

	const coverage = JSON.parse(await readFile(COVERAGE_FILE, "utf8")) as Coverage;

	const statusByCompetition = new Map(
		coverage.results.map((result) => [result.competitionId, result.status]),
	);

	const ladders: RawGameDayLadder[] = [];

	for (const competition of competitions) {
		if (statusByCompetition.get(competition.id) !== "ok") {
			continue;
		}

		const ladderFile = join(ROOT_DIR, "competitions", competition.id, "ladder.json");

		const ladder = JSON.parse(await readFile(ladderFile, "utf8")) as RawGameDayLadder;

		ladders.push(ladder);
	}

	const competitionById = new Map(competitions.map((competition) => [competition.id, competition]));

	const teamAccumulator = new Map<
		string,
		{
			names: Set<string>;

			ageGroups: Set<string>;

			competitionIds: Set<string>;
		}
	>();

	const participations: RawGameDayJuniorSnapshot["participations"] = [];

	const standings: RawGameDayJuniorSnapshot["standings"] = [];

	for (const ladder of ladders) {
		const competition = competitionById.get(ladder.competitionId);

		if (!competition) {
			throw new Error(`Missing competition metadata for ${ladder.competitionId}`);
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

	const snapshot: RawGameDayJuniorSnapshot = {
		source: "gameday",

		snapshotDate: SNAPSHOT_DATE,

		seasonId: "6041164",

		seasonLabel: "2025/26",

		competitions: competitions.map((competition) => ({
			id: competition.id,

			name: competition.name,

			ageGroup: competition.ageGroup,

			kind: competition.kind,

			hasLadder: statusByCompetition.get(competition.id) === "ok",
		})),

		teams,

		participations,

		standings,
	};

	await writeFile(OUTPUT_FILE, JSON.stringify(snapshot, null, 2), "utf8");

	console.log("GameDay junior raw dataset");

	console.log("");

	console.log(`Competitions: ${snapshot.competitions.length}`);

	console.log(`Teams: ${snapshot.teams.length}`);

	console.log(`Participations: ${snapshot.participations.length}`);

	console.log(`Standings: ${snapshot.standings.length}`);

	const multiCompetitionTeams = snapshot.teams.filter((team) => team.competitionIds.length > 1);

	console.log(`Teams in multiple competitions: ${multiCompetitionTeams.length}`);

	for (const team of multiCompetitionTeams) {
		console.log(`- ${team.id}: ${team.names.join(" / ")} -> ${team.competitionIds.join(", ")}`);
	}

	console.log("");

	console.log(`Written: ${OUTPUT_FILE}`);
}

await main();
