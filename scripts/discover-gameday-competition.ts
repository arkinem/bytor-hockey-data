import { mkdir, writeFile } from "node:fs/promises";

import { join } from "node:path";

import { fetchGameDayCompetitionPage } from "./importers/england-ice-hockey/gameday.js";

import { parseGameDayLadder } from "./importers/england-ice-hockey/parse-gameday-ladder.js";

const SNAPSHOT_DATE = "2026-08-18";

const COMPETITION_ID = "652464";

const OUTPUT_DIR = join(
	"imports",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday",
	"competitions",
	COMPETITION_ID,
);

const HTML_FILE = join(OUTPUT_DIR, "ladder.html");

const JSON_FILE = join(OUTPUT_DIR, "ladder.json");

async function main(): Promise<void> {
	const html = await fetchGameDayCompetitionPage(COMPETITION_ID, "LADDER");

	await mkdir(OUTPUT_DIR, {
		recursive: true,
	});

	await writeFile(HTML_FILE, html, "utf8");

	const ladder = parseGameDayLadder(html, COMPETITION_ID);

	await writeFile(JSON_FILE, JSON.stringify(ladder, null, 2), "utf8");

	console.log(`Competition: ${ladder.competitionName}`);

	console.log(`Season: ${ladder.seasonLabel ?? "unknown"} (${ladder.seasonId ?? "unknown"})`);

	console.log(`Teams: ${ladder.standings.length}`);

	console.log("");

	for (const team of ladder.standings) {
		console.log(`${team.position}. ${team.teamName} [${team.teamId}] ${team.points} pts`);
	}

	console.log("");

	console.log(`Written: ${HTML_FILE}`);

	console.log(`Written: ${JSON_FILE}`);
}

await main();
