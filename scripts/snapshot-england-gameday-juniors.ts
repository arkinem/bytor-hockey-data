import { mkdir, readFile, writeFile } from "node:fs/promises";

import { join } from "node:path";

import type { GameDayCompetition } from "./importers/england-ice-hockey/gameday.js";

import { fetchGameDayCompetitionPage } from "./importers/england-ice-hockey/gameday.js";

import {
	parseGameDayLadder,
	type RawGameDayLadder,
} from "./importers/england-ice-hockey/parse-gameday-ladder.js";

const SNAPSHOT_DATE = "2026-08-18";

const ROOT_DIR = join("imports", "england-ice-hockey", SNAPSHOT_DATE, "gameday");

const COMPETITIONS_FILE = join(ROOT_DIR, "competitions.json");

const COMPETITIONS_DIR = join(ROOT_DIR, "competitions");

const COVERAGE_FILE = join(ROOT_DIR, "coverage.json");

const REQUEST_DELAY_MS = 250;

type CompetitionSnapshotStatus = "ok" | "no_ladder" | "error";

type CompetitionCoverage = {
	competitionId: string;
	competitionName: string;
	ageGroup: string;
	kind: string;

	status: CompetitionSnapshotStatus;

	teams: number;

	error?: string;
};

type CoverageReport = {
	snapshotDate: string;

	competitions: number;

	successful: number;

	noLadder: number;

	errors: number;

	totalStandingRows: number;

	uniqueGameDayTeamIds: number;

	duplicateGameDayTeamIdsAcrossCompetitions: number;

	duplicates: Array<{
		teamId: string;
		competitions: string[];
	}>;

	results: CompetitionCoverage[];
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

async function snapshotCompetition(competition: GameDayCompetition): Promise<{
	coverage: CompetitionCoverage;

	ladder?: RawGameDayLadder;
}> {
	const outputDir = join(COMPETITIONS_DIR, competition.id);

	const htmlFile = join(outputDir, "ladder.html");

	const jsonFile = join(outputDir, "ladder.json");

	try {
		const html = await fetchGameDayCompetitionPage(competition.id, "LADDER");

		await mkdir(outputDir, {
			recursive: true,
		});

		await writeFile(htmlFile, html, "utf8");

		try {
			const ladder = parseGameDayLadder(html, competition.id);

			await writeFile(jsonFile, JSON.stringify(ladder, null, 2), "utf8");

			return {
				coverage: {
					competitionId: competition.id,

					competitionName: competition.name,

					ageGroup: competition.ageGroup,

					kind: competition.kind,

					status: "ok",

					teams: ladder.standings.length,
				},

				ladder,
			};
		} catch (error) {
			if (isNoLadderError(error)) {
				return {
					coverage: {
						competitionId: competition.id,

						competitionName: competition.name,

						ageGroup: competition.ageGroup,

						kind: competition.kind,

						status: "no_ladder",

						teams: 0,
					},
				};
			}

			throw error;
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return {
			coverage: {
				competitionId: competition.id,

				competitionName: competition.name,

				ageGroup: competition.ageGroup,

				kind: competition.kind,

				status: "error",

				teams: 0,

				error: message,
			},
		};
	}
}

async function main(): Promise<void> {
	const competitions = JSON.parse(
		await readFile(COMPETITIONS_FILE, "utf8"),
	) as GameDayCompetition[];

	console.log("England Ice Hockey GameDay junior snapshot");

	console.log("");
	console.log(`Competitions: ${competitions.length}`);
	console.log("");

	const results: CompetitionCoverage[] = [];

	const ladders: RawGameDayLadder[] = [];

	for (let index = 0; index < competitions.length; index += 1) {
		const competition = competitions[index];

		if (!competition) {
			continue;
		}

		console.log(`[${index + 1}/${competitions.length}] ${competition.id} ${competition.name}`);

		const snapshot = await snapshotCompetition(competition);

		results.push(snapshot.coverage);

		if (snapshot.ladder) {
			ladders.push(snapshot.ladder);
		}

		if (snapshot.coverage.status === "ok") {
			console.log(`  ✓ ${snapshot.coverage.teams} teams`);
		} else if (snapshot.coverage.status === "no_ladder") {
			console.log("  ~ no ladder");
		} else {
			console.log(`  ✗ ${snapshot.coverage.error}`);
		}

		if (index < competitions.length - 1) {
			await sleep(REQUEST_DELAY_MS);
		}
	}

	const teamOccurrences = new Map<string, Set<string>>();

	let totalStandingRows = 0;

	for (const ladder of ladders) {
		totalStandingRows += ladder.standings.length;

		for (const standing of ladder.standings) {
			const competitionsForTeam = teamOccurrences.get(standing.teamId) ?? new Set<string>();

			competitionsForTeam.add(ladder.competitionId);

			teamOccurrences.set(standing.teamId, competitionsForTeam);
		}
	}

	const duplicates = [...teamOccurrences.entries()]
		.filter(([, competitionIds]) => competitionIds.size > 1)
		.map(([teamId, competitionIds]) => ({
			teamId,

			competitions: [...competitionIds].sort(),
		}))
		.sort((a, b) => a.teamId.localeCompare(b.teamId));

	const report: CoverageReport = {
		snapshotDate: SNAPSHOT_DATE,

		competitions: competitions.length,

		successful: results.filter((result) => result.status === "ok").length,

		noLadder: results.filter((result) => result.status === "no_ladder").length,

		errors: results.filter((result) => result.status === "error").length,

		totalStandingRows,

		uniqueGameDayTeamIds: teamOccurrences.size,

		duplicateGameDayTeamIdsAcrossCompetitions: duplicates.length,

		duplicates,

		results,
	};

	await writeFile(COVERAGE_FILE, JSON.stringify(report, null, 2), "utf8");

	console.log("");
	console.log("Coverage summary");
	console.log("----------------");

	console.log(`Successful: ${report.successful}`);

	console.log(`No ladder: ${report.noLadder}`);

	console.log(`Errors: ${report.errors}`);

	console.log(`Standing rows: ${report.totalStandingRows}`);

	console.log(`Unique GameDay team IDs: ${report.uniqueGameDayTeamIds}`);

	console.log(
		`Team IDs in multiple competitions: ${report.duplicateGameDayTeamIdsAcrossCompetitions}`,
	);

	console.log("");
	console.log(`Written: ${COVERAGE_FILE}`);

	if (report.errors) {
		process.exitCode = 1;
	}
}

await main();
