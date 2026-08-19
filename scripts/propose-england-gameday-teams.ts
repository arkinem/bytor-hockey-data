import { mkdir, readFile, writeFile } from "node:fs/promises";

import { join } from "node:path";

import type { NormalizedGameDayJuniorSnapshot } from "../providers/england-ice-hockey/gameday/types.js";

const SNAPSHOT_DATE = "2026-08-18";

const SNAPSHOT_FILE = join(
	"imports",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday",
	"normalized",
	"snapshot.json",
);

const RESOLUTION_FILE = join(
	"generated",
	"resolution",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday-team-resolution.json",
);

const OUTPUT_DIR = join("generated", "proposals", "england-ice-hockey", SNAPSHOT_DATE);

const OUTPUT_FILE = join(OUTPUT_DIR, "gameday-teams.json");

type ResolutionReport = {
	results: Array<{
		gameDayTeamId: string;

		status: "resolved" | "ambiguous" | "unresolved";
	}>;
};

type ProposalStatus = "new_team" | "source_anomaly";

type Proposal = {
	gameDayTeamId: string;

	sourceNames: string[];

	ageGroups: string[];

	competitionIds: string[];

	status: ProposalStatus;

	proposedId?: string;

	proposedName?: string;

	reason?: string;
};

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function detectExplicitAgeGroups(value: string): string[] {
	const matches = [...value.matchAll(/\b(?:u|under\s*)(10|12|14|16|19)\b/gi)];

	return [...new Set(matches.map((match) => `U${match[1]}`))];
}

function hasAgeMismatch(
	sourceNames: string[],
	contextAgeGroups: string[],
): {
	mismatch: boolean;

	explicitAgeGroups: string[];
} {
	const explicitAgeGroups = [
		...new Set(sourceNames.flatMap((name) => detectExplicitAgeGroups(name))),
	];

	if (!explicitAgeGroups.length) {
		return {
			mismatch: false,
			explicitAgeGroups,
		};
	}

	const mismatch = explicitAgeGroups.some((explicitAge) => !contextAgeGroups.includes(explicitAge));

	return {
		mismatch,
		explicitAgeGroups,
	};
}

function cleanProposedName(sourceName: string, ageGroup: string): string {
	const ageNumber = ageGroup.replace(/^U/i, "");

	let value = sourceName
		.replace(new RegExp(`\\bunder\\s*${ageNumber}(?:['’]s|s)?\\b`, "gi"), ageGroup)
		.replace(new RegExp(`\\bu${ageNumber}(?:['’]s|s)?\\b`, "gi"), ageGroup)
		.replace(/\s+/g, " ")
		.trim();

	if (!new RegExp(`\\b${ageGroup}\\b`, "i").test(value)) {
		value = `${value} ${ageGroup}`;
	}

	return value;
}

async function main(): Promise<void> {
	const snapshot = JSON.parse(
		await readFile(SNAPSHOT_FILE, "utf8"),
	) as NormalizedGameDayJuniorSnapshot;

	const resolution = JSON.parse(await readFile(RESOLUTION_FILE, "utf8")) as ResolutionReport;

	const statusById = new Map(
		resolution.results.map((result) => [result.gameDayTeamId, result.status]),
	);

	const proposals: Proposal[] = [];

	for (const team of snapshot.teams) {
		if (statusById.get(team.id) !== "unresolved") {
			continue;
		}

		const ageCheck = hasAgeMismatch(team.names, team.ageGroups);

		if (ageCheck.mismatch) {
			proposals.push({
				gameDayTeamId: team.id,

				sourceNames: team.names,

				ageGroups: team.ageGroups,

				competitionIds: team.competitionIds,

				status: "source_anomaly",

				reason:
					`Explicit team age (${ageCheck.explicitAgeGroups.join(", ")}) ` +
					`does not match competition context (${team.ageGroups.join(", ")}).`,
			});

			continue;
		}

		if (team.ageGroups.length !== 1) {
			proposals.push({
				gameDayTeamId: team.id,

				sourceNames: team.names,

				ageGroups: team.ageGroups,

				competitionIds: team.competitionIds,

				status: "source_anomaly",

				reason: "Team occurs in multiple age-group contexts.",
			});

			continue;
		}

		const ageGroup = team.ageGroups[0];

		const sourceName = team.names[0];

		if (!ageGroup || !sourceName) {
			throw new Error(`Incomplete raw GameDay team ${team.id}.`);
		}

		const proposedName = cleanProposedName(sourceName, ageGroup);

		proposals.push({
			gameDayTeamId: team.id,

			sourceNames: team.names,

			ageGroups: team.ageGroups,

			competitionIds: team.competitionIds,

			status: "new_team",

			proposedName,

			proposedId: slugify(proposedName),
		});
	}

	const newTeams = proposals.filter((proposal) => proposal.status === "new_team");

	const anomalies = proposals.filter((proposal) => proposal.status === "source_anomaly");

	const byAgeGroup = Object.fromEntries(
		["U10", "U12", "U14", "U16", "U19"].map((ageGroup) => [
			ageGroup,

			newTeams.filter((proposal) => proposal.ageGroups.includes(ageGroup)).length,
		]),
	);

	const idOwners = new Map<string, string[]>();

	for (const proposal of newTeams) {
		if (!proposal.proposedId) {
			continue;
		}

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

		unresolvedInput: proposals.length,

		newTeams: newTeams.length,

		anomalies: anomalies.length,

		byAgeGroup,

		idCollisions: collisions.length,

		collisions,

		proposals,
	};

	await mkdir(OUTPUT_DIR, {
		recursive: true,
	});

	await writeFile(OUTPUT_FILE, JSON.stringify(report, null, 2), "utf8");

	console.log("GameDay junior team proposals");

	console.log("");

	console.log(`Unresolved input: ${report.unresolvedInput}`);

	console.log(`New team proposals: ${report.newTeams}`);

	console.log(`Source anomalies: ${report.anomalies}`);

	console.log(`ID collisions: ${report.idCollisions}`);

	console.log("");

	for (const [ageGroup, count] of Object.entries(report.byAgeGroup)) {
		console.log(`${ageGroup}: ${count}`);
	}

	console.log("");

	for (const anomaly of anomalies) {
		console.log(`! ${anomaly.gameDayTeamId} ${anomaly.sourceNames.join(" / ")}: ${anomaly.reason}`);
	}

	console.log("");

	console.log(`Written: ${OUTPUT_FILE}`);
}

await main();
