import { readFile } from "node:fs/promises";

import type { EnglandTeamProposalReport } from "./importers/england-ice-hockey/propose-teams.js";

import { ENGLAND_U14_CONFIG } from "./importers/england-ice-hockey/configs/u14.js";

import { getEnglandTeamProposalsFile } from "./importers/england-ice-hockey/paths.js";

import { importEnglandTeams } from "./importers/england-ice-hockey/import-teams.js";

const SNAPSHOT_DATE = "2026-08-18";

async function main(): Promise<void> {
	const proposalsFile = getEnglandTeamProposalsFile(SNAPSHOT_DATE, ENGLAND_U14_CONFIG.ageGroup);

	const proposalReport = JSON.parse(
		await readFile(proposalsFile, "utf8"),
	) as EnglandTeamProposalReport;

	const result = await importEnglandTeams({
		proposalReport,
	});

	console.log("");
	console.log(`Created: ${result.created}`);
	console.log(`Skipped: ${result.skipped}`);
	console.log(`Total proposals: ${result.total}`);
}

await main();
