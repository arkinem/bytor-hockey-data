import { readFile, readdir } from "node:fs/promises";

import { extname, join } from "node:path";

import { parse } from "yaml";

import { CompetitionSchema } from "../schema/index.js";

import { normalizeEntityName } from "../lib/normalize-name.js";

type Proposal = {
	gameDayCompetitionId: string;
	sourceName: string;
	ageGroup: string;

	kind: "competition" | "competition_group" | "deferred_event";

	proposedCompetitionId?: string;
	proposedParentCompetitionId?: string;
	proposedGroupName?: string;
	notes?: string;
};

type ProposalReport = {
	proposals: Proposal[];
};

type ReconciliationStatus =
	| "existing_exact"
	| "existing_equivalent"
	| "new"
	| "group_mapping"
	| "deferred"
	| "conflict";

type ReconciliationResult = {
	gameDayCompetitionId: string;
	sourceName: string;
	status: ReconciliationStatus;

	proposedCompetitionId?: string;

	existingCompetitionId?: string;

	proposedParentCompetitionId?: string;

	proposedGroupName?: string;

	notes?: string;
};

const SNAPSHOT_DATE = "2026-08-18";

const PROPOSALS_FILE = join(
	"generated",
	"proposals",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday-competitions.json",
);

const COMPETITIONS_DIR = join("data", "competitions");

async function loadCompetitions() {
	const files = await readdir(COMPETITIONS_DIR);

	const competitions = [];

	for (const file of files) {
		if (![".yaml", ".yml"].includes(extname(file))) {
			continue;
		}

		const raw = parse(await readFile(join(COMPETITIONS_DIR, file), "utf8"));

		competitions.push(CompetitionSchema.parse(raw));
	}

	return competitions;
}

async function main(): Promise<void> {
	const proposalReport = JSON.parse(await readFile(PROPOSALS_FILE, "utf8")) as ProposalReport;

	const competitions = await loadCompetitions();

	const byId = new Map(competitions.map((competition) => [competition.id, competition]));

	const results: ReconciliationResult[] = [];

	for (const proposal of proposalReport.proposals) {
		/*
		 * Deferred event-like source records.
		 */
		if (proposal.kind === "deferred_event") {
			results.push({
				gameDayCompetitionId: proposal.gameDayCompetitionId,

				sourceName: proposal.sourceName,

				status: "deferred",

				...(proposal.notes
					? {
							notes: proposal.notes,
						}
					: {}),
			});

			continue;
		}

		/*
		 * GameDay competition representing a
		 * canonical CompetitionGroup.
		 */
		if (proposal.kind === "competition_group") {
			if (!proposal.proposedParentCompetitionId || !proposal.proposedGroupName) {
				throw new Error(`Incomplete competition group proposal for "${proposal.sourceName}".`);
			}

			results.push({
				gameDayCompetitionId: proposal.gameDayCompetitionId,

				sourceName: proposal.sourceName,

				status: "group_mapping",

				proposedParentCompetitionId: proposal.proposedParentCompetitionId,

				proposedGroupName: proposal.proposedGroupName,
			});

			continue;
		}

		/*
		 * Normal canonical Competition proposal.
		 */
		if (!proposal.proposedCompetitionId) {
			throw new Error(`Missing proposedCompetitionId for "${proposal.sourceName}".`);
		}

		const exact = byId.get(proposal.proposedCompetitionId);

		if (exact) {
			results.push({
				gameDayCompetitionId: proposal.gameDayCompetitionId,

				sourceName: proposal.sourceName,

				status: "existing_exact",

				proposedCompetitionId: proposal.proposedCompetitionId,

				existingCompetitionId: exact.id,
			});

			continue;
		}

		const sourceKey = normalizeEntityName(proposal.sourceName);

		const equivalent = competitions.filter((competition) => {
			const values = [
				competition.name,
				...competition.aliases,
				...competition.historicalNames.map((value) => value.name),
			];

			return values.some((value) => normalizeEntityName(value) === sourceKey);
		});

		if (equivalent.length === 1) {
			const equivalentCompetition = equivalent[0];

			if (!equivalentCompetition) {
				throw new Error(`Expected equivalent competition for "${proposal.sourceName}".`);
			}

			results.push({
				gameDayCompetitionId: proposal.gameDayCompetitionId,

				sourceName: proposal.sourceName,

				status: "existing_equivalent",

				proposedCompetitionId: proposal.proposedCompetitionId,

				existingCompetitionId: equivalentCompetition.id,
			});

			continue;
		}

		if (equivalent.length > 1) {
			results.push({
				gameDayCompetitionId: proposal.gameDayCompetitionId,

				sourceName: proposal.sourceName,

				status: "conflict",

				proposedCompetitionId: proposal.proposedCompetitionId,

				notes: `Multiple equivalent competitions: ${equivalent
					.map((competition) => competition.id)
					.join(", ")}`,
			});

			continue;
		}

		results.push({
			gameDayCompetitionId: proposal.gameDayCompetitionId,

			sourceName: proposal.sourceName,

			status: "new",

			proposedCompetitionId: proposal.proposedCompetitionId,
		});
	}

	const summary = {
		total: results.length,

		existingExact: results.filter((result) => result.status === "existing_exact").length,

		existingEquivalent: results.filter((result) => result.status === "existing_equivalent").length,

		new: results.filter((result) => result.status === "new").length,

		groupMappings: results.filter((result) => result.status === "group_mapping").length,

		deferred: results.filter((result) => result.status === "deferred").length,

		conflicts: results.filter((result) => result.status === "conflict").length,

		results,
	};

	console.log("GameDay competition reconciliation");

	console.log("");

	console.log(`Total: ${summary.total}`);

	console.log(`Existing exact: ${summary.existingExact}`);

	console.log(`Existing equivalent: ${summary.existingEquivalent}`);

	console.log(`New: ${summary.new}`);

	console.log(`Group mappings: ${summary.groupMappings}`);

	console.log(`Deferred: ${summary.deferred}`);

	console.log(`Conflicts: ${summary.conflicts}`);

	console.log("");

	for (const result of results) {
		console.log(`${result.status.padEnd(20)} ${result.sourceName}`);
	}

	if (summary.conflicts) {
		process.exitCode = 1;
	}
}

await main();
