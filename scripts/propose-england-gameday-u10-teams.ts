import { mkdir, readFile, writeFile } from "node:fs/promises";

import { join } from "node:path";

const SNAPSHOT_DATE = "2026-08-18";

const INPUT_FILE = join("imports", "england-ice-hockey", SNAPSHOT_DATE, "gameday", "u10.json");

const OUTPUT_DIR = join("generated", "proposals", "england-ice-hockey", SNAPSHOT_DATE);

const OUTPUT_FILE = join(OUTPUT_DIR, "gameday-u10-teams.json");

type RawU10Team = {
	id: string;

	names: string[];

	competitionIds: string[];
};

type RawU10Snapshot = {
	source: "gameday";

	snapshotDate: string;

	ageGroup: "U10";

	teams: RawU10Team[];
};

type TeamProposal = {
	gameDayTeamId: string;

	sourceNames: string[];

	competitionIds: string[];

	proposedId: string;

	proposedName: string;
};

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function normalizeU10Notation(value: string): string {
	return value
		.replace(/\bunder\s*10(?:['’]s|s)?\b/gi, "U10")
		.replace(/\bu10(?:['’]s|s)\b/gi, "U10")
		.replace(/\s+/g, " ")
		.trim();
}

async function main(): Promise<void> {
	const snapshot = JSON.parse(await readFile(INPUT_FILE, "utf8")) as RawU10Snapshot;

	if (snapshot.ageGroup !== "U10") {
		throw new Error(`Expected U10 snapshot, got ${snapshot.ageGroup}.`);
	}

	const proposals: TeamProposal[] = [];

	for (const team of snapshot.teams) {
		if (team.names.length === 0) {
			throw new Error(`GameDay team ${team.id} has no source names.`);
		}

		const primaryName = team.names[0];

		if (!primaryName) {
			throw new Error(`GameDay team ${team.id} has no primary name.`);
		}

		const proposedName = normalizeU10Notation(primaryName);

		const proposedId = slugify(proposedName);

		proposals.push({
			gameDayTeamId: team.id,

			sourceNames: team.names,

			competitionIds: team.competitionIds,

			proposedId,

			proposedName,
		});
	}

	const idOwners = new Map<string, string[]>();

	for (const proposal of proposals) {
		const owners = idOwners.get(proposal.proposedId) ?? [];

		owners.push(proposal.gameDayTeamId);

		idOwners.set(proposal.proposedId, owners);
	}

	const collisions = [...idOwners.entries()]
		.filter(([, owners]) => owners.length > 1)
		.map(([proposedId, gameDayTeamIds]) => ({
			proposedId,
			gameDayTeamIds,
		}));

	const report = {
		source: "gameday",

		snapshotDate: SNAPSHOT_DATE,

		ageGroup: "U10",

		proposals: proposals.length,

		idCollisions: collisions.length,

		collisions,

		teams: proposals,
	};

	await mkdir(OUTPUT_DIR, {
		recursive: true,
	});

	await writeFile(OUTPUT_FILE, JSON.stringify(report, null, 2), "utf8");

	console.log("GameDay U10 team proposals");

	console.log("");

	console.log(`Source teams: ${snapshot.teams.length}`);

	console.log(`Proposals: ${proposals.length}`);

	console.log(`ID collisions: ${collisions.length}`);

	console.log("");

	for (const proposal of proposals) {
		console.log(
			`+ ${proposal.gameDayTeamId} ${proposal.sourceNames.join(" / ")} -> ${proposal.proposedId}`,
		);
	}

	if (collisions.length) {
		console.log("");
		console.log("Collisions");

		for (const collision of collisions) {
			console.log(`! ${collision.proposedId} <- ${collision.gameDayTeamIds.join(", ")}`);
		}
	}

	console.log("");

	console.log(`Written: ${OUTPUT_FILE}`);
}

await main();
