import { readFile, writeFile } from "node:fs/promises";

import { join } from "node:path";

import { parseGameDayFixtures } from "./importers/england-ice-hockey/parse-gameday-fixture-payload.js";

const SNAPSHOT_DATE = "2026-08-18";

const COMPETITION_ID = "652467";

const INPUT_FILE = join(
	"imports",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday",
	"competitions",
	COMPETITION_ID,
	"fixture.html",
);

const OUTPUT_FILE = join(
	"imports",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday",
	"competitions",
	COMPETITION_ID,
	"fixture.json",
);

async function main(): Promise<void> {
	const html = await readFile(INPUT_FILE, "utf8");

	const parsed = parseGameDayFixtures(html, COMPETITION_ID);

	await writeFile(OUTPUT_FILE, JSON.stringify(parsed, null, 2), "utf8");

	const realFixtures = parsed.fixtures.filter((fixture) => !fixture.isBye);

	const byes = parsed.fixtures.filter((fixture) => fixture.isBye);

	const teams = new Map<string, string>();

	for (const fixture of parsed.fixtures) {
		teams.set(fixture.homeTeam.id, fixture.homeTeam.name);

		if (fixture.awayTeam) {
			teams.set(fixture.awayTeam.id, fixture.awayTeam.name);
		}
	}

	console.log(`Fixture records: ${parsed.fixtures.length}`);

	console.log(`Real games: ${realFixtures.length}`);

	console.log(`Byes: ${byes.length}`);

	console.log(`Unique teams: ${teams.size}`);

	console.log("");

	for (const [id, name] of teams) {
		console.log(`${id} | ${name}`);
	}

	console.log("");

	console.log(`Written: ${OUTPUT_FILE}`);
}

await main();
