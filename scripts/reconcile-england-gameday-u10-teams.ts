import { readFile, readdir, writeFile } from "node:fs/promises";

import { extname, join } from "node:path";

import { parse } from "yaml";

import { TeamSchema, type Team } from "../schema/index.js";

const SNAPSHOT_DATE = "2026-08-18";

const PROPOSALS_FILE = join(
	"generated",
	"proposals",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday-u10-teams.json",
);

const TEAMS_DIR = join("data", "teams");

const OUTPUT_FILE = join(
	"generated",
	"resolution",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday-u10-team-reconciliation.json",
);

type Proposal = {
	gameDayTeamId: string;

	sourceNames: string[];

	competitionIds: string[];

	proposedId: string;

	proposedName: string;
};

type ProposalReport = {
	teams: Proposal[];
};

type ReconciliationStatus = "existing_exact" | "existing_gameday" | "new" | "conflict";

type ReconciliationResult = {
	gameDayTeamId: string;

	sourceNames: string[];

	proposedId: string;

	proposedName: string;

	status: ReconciliationStatus;

	existingTeamId?: string;

	reason?: string;
};

async function loadCanonicalTeams(): Promise<Map<string, Team>> {
	const files = await readdir(TEAMS_DIR);

	const teams = new Map<string, Team>();

	for (const file of files) {
		if (![".yaml", ".yml"].includes(extname(file))) {
			continue;
		}

		const raw = parse(await readFile(join(TEAMS_DIR, file), "utf8"));

		const team = TeamSchema.parse(raw);

		teams.set(team.id, team);
	}

	return teams;
}

function buildGameDayOwners(teams: Map<string, Team>): Map<string, string> {
	const owners = new Map<string, string>();

	for (const team of teams.values()) {
		for (const externalId of team.externalIds) {
			if (externalId.system !== "gameday") {
				continue;
			}

			const existing = owners.get(externalId.value);

			if (existing && existing !== team.id) {
				throw new Error(
					`GameDay ID ${externalId.value} belongs to both ${existing} and ${team.id}.`,
				);
			}

			owners.set(externalId.value, team.id);
		}
	}

	return owners;
}

async function main(): Promise<void> {
	const proposalReport = JSON.parse(await readFile(PROPOSALS_FILE, "utf8")) as ProposalReport;

	const canonicalTeams = await loadCanonicalTeams();

	const gameDayOwners = buildGameDayOwners(canonicalTeams);

	const results: ReconciliationResult[] = [];

	for (const proposal of proposalReport.teams) {
		const existingByGameDay = gameDayOwners.get(proposal.gameDayTeamId);

		const existingById = canonicalTeams.get(proposal.proposedId);

		/*
		 * Strongest identity:
		 * provider GameDay ID already exists.
		 */
		if (existingByGameDay) {
			if (existingById && existingById.id !== existingByGameDay) {
				results.push({
					gameDayTeamId: proposal.gameDayTeamId,

					sourceNames: proposal.sourceNames,

					proposedId: proposal.proposedId,

					proposedName: proposal.proposedName,

					status: "conflict",

					existingTeamId: existingByGameDay,

					reason: `GameDay ID belongs to ${existingByGameDay}, while proposed canonical ID ${proposal.proposedId} also exists as another Team.`,
				});

				continue;
			}

			results.push({
				gameDayTeamId: proposal.gameDayTeamId,

				sourceNames: proposal.sourceNames,

				proposedId: proposal.proposedId,

				proposedName: proposal.proposedName,

				status: "existing_gameday",

				existingTeamId: existingByGameDay,
			});

			continue;
		}

		/*
		 * Canonical ID already exists but has not yet
		 * been linked to this GameDay identity.
		 */
		if (existingById) {
			const ageBand = existingById.categories.ageBand?.label;

			const isCompatibleU10 =
				existingById.categories.age === "junior" && ageBand?.toUpperCase() === "U10";

			if (!isCompatibleU10) {
				results.push({
					gameDayTeamId: proposal.gameDayTeamId,

					sourceNames: proposal.sourceNames,

					proposedId: proposal.proposedId,

					proposedName: proposal.proposedName,

					status: "conflict",

					existingTeamId: existingById.id,

					reason: `Canonical ID already exists but is not a compatible U10 junior Team.`,
				});

				continue;
			}

			results.push({
				gameDayTeamId: proposal.gameDayTeamId,

				sourceNames: proposal.sourceNames,

				proposedId: proposal.proposedId,

				proposedName: proposal.proposedName,

				status: "existing_exact",

				existingTeamId: existingById.id,
			});

			continue;
		}

		results.push({
			gameDayTeamId: proposal.gameDayTeamId,

			sourceNames: proposal.sourceNames,

			proposedId: proposal.proposedId,

			proposedName: proposal.proposedName,

			status: "new",
		});
	}

	const existingExact = results.filter((result) => result.status === "existing_exact").length;

	const existingGameDay = results.filter((result) => result.status === "existing_gameday").length;

	const newTeams = results.filter((result) => result.status === "new").length;

	const conflicts = results.filter((result) => result.status === "conflict").length;

	const report = {
		total: results.length,

		existingExact,

		existingGameDay,

		new: newTeams,

		conflicts,

		results,
	};

	await writeFile(OUTPUT_FILE, JSON.stringify(report, null, 2), "utf8");

	console.log("GameDay U10 team reconciliation");

	console.log("");

	console.log(`Total: ${report.total}`);

	console.log(`Existing exact: ${existingExact}`);

	console.log(`Existing GameDay: ${existingGameDay}`);

	console.log(`New: ${newTeams}`);

	console.log(`Conflicts: ${conflicts}`);

	console.log("");

	for (const result of results) {
		const marker = result.status === "new" ? "+" : result.status === "conflict" ? "!" : "✓";

		console.log(
			`${marker} ${result.gameDayTeamId} ${result.sourceNames.join(" / ")} -> ${result.proposedId} [${result.status}]`,
		);

		if (result.reason) {
			console.log(`    ${result.reason}`);
		}
	}

	console.log("");

	console.log(`Written: ${OUTPUT_FILE}`);
}

await main();
