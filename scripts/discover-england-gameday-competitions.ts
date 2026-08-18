import { mkdir, writeFile } from "node:fs/promises";

import { join } from "node:path";

import { fetchGameDayCompetitions } from "./importers/england-ice-hockey/gameday.js";

const SNAPSHOT_DATE = "2026-08-18";

const SEED_COMPETITION_ID = "652464";

const OUTPUT_DIR = join("imports", "england-ice-hockey", SNAPSHOT_DATE, "gameday");

const OUTPUT_FILE = join(OUTPUT_DIR, "competitions.json");

async function main(): Promise<void> {
	const competitions = await fetchGameDayCompetitions(SEED_COMPETITION_ID);

	await mkdir(OUTPUT_DIR, {
		recursive: true,
	});

	await writeFile(OUTPUT_FILE, JSON.stringify(competitions, null, 2), "utf8");

	console.log("England Ice Hockey GameDay competition discovery");

	console.log("");

	console.log(`Competitions: ${competitions.length}`);

	console.log("");

	for (const competition of competitions) {
		console.log(
			[competition.id, competition.ageGroup, competition.kind, competition.name].join(" | "),
		);
	}

	const unknown = competitions.filter(
		(competition) => competition.ageGroup === "unknown" || competition.kind === "unknown",
	);

	console.log("");

	console.log(`Unclassified: ${unknown.length}`);

	for (const competition of unknown) {
		console.log(`? ${competition.id} ${competition.name}`);
	}

	console.log("");

	console.log(`Written: ${OUTPUT_FILE}`);
}

await main();
