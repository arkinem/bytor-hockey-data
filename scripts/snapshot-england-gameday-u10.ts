import { mkdir, readFile, writeFile } from "node:fs/promises";

import { join } from "node:path";

import {
	fetchGameDayCompetitionPage,
	type GameDayCompetition,
} from "./importers/england-ice-hockey/gameday.js";

import {
	parseGameDayFixtures,
	type RawGameDayFixture,
} from "./importers/england-ice-hockey/parse-gameday-fixture-payload.js";

const SNAPSHOT_DATE = "2026-08-18";

const ROOT_DIR = join("imports", "england-ice-hockey", SNAPSHOT_DATE, "gameday");

const COMPETITIONS_FILE = join(ROOT_DIR, "competitions.json");

const OUTPUT_FILE = join(ROOT_DIR, "u10.json");

const REQUEST_DELAY_MS = 250;

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

type U10CompetitionSnapshot = {
	id: string;

	name: string;

	fixtureRecords: number;

	realGames: number;

	byes: number;

	teamIds: string[];
};

type U10Snapshot = {
	source: "gameday";

	snapshotDate: string;

	ageGroup: "U10";

	competitions: U10CompetitionSnapshot[];

	teams: RawU10Team[];

	participations: RawU10Participation[];

	fixtures: Array<
		RawGameDayFixture & {
			sourceCompetitionId: string;
		}
	>;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
	const competitions = JSON.parse(
		await readFile(COMPETITIONS_FILE, "utf8"),
	) as GameDayCompetition[];

	const u10Competitions = competitions.filter((competition) => competition.ageGroup === "U10");

	if (u10Competitions.length !== 8) {
		throw new Error(`Expected 8 U10 competitions, found ${u10Competitions.length}.`);
	}

	const teamAccumulator = new Map<
		string,
		{
			names: Set<string>;

			competitionIds: Set<string>;
		}
	>();

	const participationKeys = new Set<string>();

	const participations: RawU10Participation[] = [];

	const fixtures: U10Snapshot["fixtures"] = [];

	const competitionSnapshots: U10CompetitionSnapshot[] = [];

	console.log("England Ice Hockey GameDay U10 snapshot");

	console.log("");

	for (let index = 0; index < u10Competitions.length; index += 1) {
		const competition = u10Competitions[index];

		if (!competition) {
			continue;
		}

		const competitionId = competition.id;

		const competitionName = competition.name;

		console.log(`[${index + 1}/${u10Competitions.length}] ${competitionId} ${competitionName}`);

		const html = await fetchGameDayCompetitionPage(competitionId, "FIXTURE");

		const outputDir = join(ROOT_DIR, "competitions", competitionId);

		await mkdir(outputDir, {
			recursive: true,
		});

		await writeFile(join(outputDir, "fixture.html"), html, "utf8");

		const parsed = parseGameDayFixtures(html, competitionId);

		await writeFile(join(outputDir, "fixture.json"), JSON.stringify(parsed, null, 2), "utf8");

		const realGames = parsed.fixtures.filter((fixture) => !fixture.isBye);

		const byes = parsed.fixtures.filter((fixture) => fixture.isBye);

		const competitionTeams = new Map<string, string>();

		function observeTeam(teamId: string, teamName: string): void {
			competitionTeams.set(teamId, teamName);

			const existing = teamAccumulator.get(teamId) ?? {
				names: new Set<string>(),

				competitionIds: new Set<string>(),
			};

			existing.names.add(teamName);

			existing.competitionIds.add(competitionId);

			teamAccumulator.set(teamId, existing);

			const participationKey = `${teamId}|${competitionId}`;

			if (participationKeys.has(participationKey)) {
				return;
			}

			participationKeys.add(participationKey);

			participations.push({
				teamId,

				teamName,

				competitionId: competitionId,

				competitionName: competitionName,
			});
		}

		for (const fixture of parsed.fixtures) {
			observeTeam(fixture.homeTeam.id, fixture.homeTeam.name);

			if (fixture.awayTeam) {
				observeTeam(fixture.awayTeam.id, fixture.awayTeam.name);
			}

			fixtures.push({
				...fixture,

				sourceCompetitionId: competitionId,
			});
		}

		const teamIds = [...competitionTeams.keys()].sort();

		competitionSnapshots.push({
			id: competitionId,

			name: competitionName,

			fixtureRecords: parsed.fixtures.length,

			realGames: realGames.length,

			byes: byes.length,

			teamIds,
		});

		console.log(`  fixture records: ${parsed.fixtures.length}`);

		console.log(`  real games: ${realGames.length}`);

		console.log(`  byes: ${byes.length}`);

		console.log(`  teams: ${teamIds.length}`);

		if (index < u10Competitions.length - 1) {
			await sleep(REQUEST_DELAY_MS);
		}
	}

	const teams: RawU10Team[] = [...teamAccumulator.entries()]
		.map(([id, value]) => ({
			id,

			names: [...value.names].sort(),

			competitionIds: [...value.competitionIds].sort(),
		}))
		.sort((a, b) => a.id.localeCompare(b.id));

	const duplicateMembershipTeams = teams.filter((team) => team.competitionIds.length > 1);

	const snapshot: U10Snapshot = {
		source: "gameday",

		snapshotDate: SNAPSHOT_DATE,

		ageGroup: "U10",

		competitions: competitionSnapshots,

		teams,

		participations,

		fixtures,
	};

	await writeFile(OUTPUT_FILE, JSON.stringify(snapshot, null, 2), "utf8");

	console.log("");
	console.log("U10 snapshot summary");
	console.log("--------------------");

	console.log(`Competitions: ${snapshot.competitions.length}`);

	console.log(`Unique teams: ${snapshot.teams.length}`);

	console.log(`Participations: ${snapshot.participations.length}`);

	console.log(`Fixture records: ${snapshot.fixtures.length}`);

	console.log(`Real games: ${snapshot.fixtures.filter((fixture) => !fixture.isBye).length}`);

	console.log(`Byes: ${snapshot.fixtures.filter((fixture) => fixture.isBye).length}`);

	console.log(`Teams in multiple U10 competitions: ${duplicateMembershipTeams.length}`);

	for (const team of duplicateMembershipTeams) {
		console.log(`- ${team.id} ${team.names.join(" / ")} -> ${team.competitionIds.join(", ")}`);
	}

	console.log("");

	console.log(`Written: ${OUTPUT_FILE}`);
}

await main();
