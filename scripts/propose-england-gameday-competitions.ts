import { readFile, writeFile } from "node:fs/promises";

import { join } from "node:path";

import { proposeGameDayCompetitions } from "../providers/england-ice-hockey/gameday/competition-proposals.js";

import type { NormalizedGameDayJuniorSnapshot } from "../providers/england-ice-hockey/gameday/types.js";

const SNAPSHOT_DATE = "2026-08-18";

const INPUT_FILE = join(
	"imports",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday",
	"normalized",
	"snapshot.json",
);

const OUTPUT_FILE = join(
	"generated",
	"proposals",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday-competitions.json",
);

async function main(): Promise<void> {
	const snapshot = JSON.parse(
		await readFile(INPUT_FILE, "utf8"),
	) as NormalizedGameDayJuniorSnapshot;

	const proposals = proposeGameDayCompetitions(snapshot);

	await writeFile(OUTPUT_FILE, JSON.stringify(proposals, null, 2), "utf8");

	console.log("GameDay junior competition proposals");

	console.log("");

	console.log(`Total: ${proposals.total}`);

	console.log(`Competitions: ${proposals.competitions}`);

	console.log(`Competition groups: ${proposals.groups}`);

	console.log(`Deferred events: ${proposals.deferred}`);

	console.log("");

	for (const proposal of proposals.proposals) {
		const marker =
			proposal.kind === "competition" ? "+" : proposal.kind === "competition_group" ? "~" : "?";

		if (proposal.kind === "competition") {
			console.log(`${marker} ${proposal.sourceName} -> ${proposal.proposedCompetitionId}`);

			continue;
		}

		if (proposal.kind === "competition_group") {
			console.log(
				`${marker} ${proposal.sourceName} -> ${proposal.proposedCompetitionId} / ${proposal.proposedGroupName}`,
			);

			continue;
		}

		console.log(`${marker} ${proposal.sourceName} -> deferred event`);
	}

	console.log("");

	console.log(`Written: ${OUTPUT_FILE}`);
}

await main();
