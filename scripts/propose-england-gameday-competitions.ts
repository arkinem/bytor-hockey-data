import { mkdir, readFile, writeFile } from "node:fs/promises";

import { join } from "node:path";

import type { RawGameDayJuniorSnapshot } from "./importers/england-ice-hockey/gameday-types.js";

import { proposeGameDayCompetitions } from "./importers/england-ice-hockey/gameday-competition-proposals.js";

const SNAPSHOT_DATE = "2026-08-18";

const ROOT_DIR = join("imports", "england-ice-hockey", SNAPSHOT_DATE, "gameday");

const INPUT_FILE = join(ROOT_DIR, "raw-juniors.json");

const OUTPUT_DIR = join("generated", "proposals", "england-ice-hockey", SNAPSHOT_DATE);

const OUTPUT_FILE = join(OUTPUT_DIR, "gameday-competitions.json");

async function main(): Promise<void> {
	const snapshot = JSON.parse(await readFile(INPUT_FILE, "utf8")) as RawGameDayJuniorSnapshot;

	const report = proposeGameDayCompetitions(snapshot);

	await mkdir(OUTPUT_DIR, {
		recursive: true,
	});

	await writeFile(OUTPUT_FILE, JSON.stringify(report, null, 2), "utf8");

	console.log("GameDay junior competition proposals");

	console.log("");

	console.log(`Total: ${report.total}`);

	console.log(`Competitions: ${report.competitions}`);

	console.log(`Competition groups: ${report.groups}`);

	console.log(`Deferred events: ${report.deferred}`);

	console.log("");

	for (const proposal of report.proposals) {
		if (proposal.kind === "competition") {
			console.log(`+ ${proposal.sourceName} -> ${proposal.proposedCompetitionId}`);

			continue;
		}

		if (proposal.kind === "competition_group") {
			console.log(
				`~ ${proposal.sourceName} -> ${proposal.proposedParentCompetitionId} / ${proposal.proposedGroupName}`,
			);

			continue;
		}

		console.log(`? ${proposal.sourceName} -> deferred event`);
	}

	console.log("");

	console.log(`Written: ${OUTPUT_FILE}`);
}

await main();
