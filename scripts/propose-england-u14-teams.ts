import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { RawEnglandJuniorParticipation } from "./importers/england-ice-hockey/types.js";

import type { TeamResolutionReport } from "./importers/england-ice-hockey/resolve-teams.js";

import { ENGLAND_U14_CONFIG } from "./importers/england-ice-hockey/configs/u14.js";

import {
	getEnglandJuniorParticipationsFile,
	getEnglandProposalDir,
	getEnglandTeamProposalsFile,
	getEnglandTeamResolutionFile,
} from "./importers/england-ice-hockey/paths.js";

import { proposeEnglandTeams } from "./importers/england-ice-hockey/propose-teams.js";

const SNAPSHOT_DATE = "2026-08-18";

async function main(): Promise<void> {
	const participationsFile = getEnglandJuniorParticipationsFile(
		SNAPSHOT_DATE,
		ENGLAND_U14_CONFIG.ageGroup,
	);

	const resolutionFile = getEnglandTeamResolutionFile(SNAPSHOT_DATE, ENGLAND_U14_CONFIG.ageGroup);

	const outputDir = getEnglandProposalDir(SNAPSHOT_DATE);

	const outputFile = getEnglandTeamProposalsFile(SNAPSHOT_DATE, ENGLAND_U14_CONFIG.ageGroup);

	const participations = JSON.parse(
		await readFile(participationsFile, "utf8"),
	) as RawEnglandJuniorParticipation[];

	const resolutionReport = JSON.parse(
		await readFile(resolutionFile, "utf8"),
	) as TeamResolutionReport;

	const report = proposeEnglandTeams({
		source: ENGLAND_U14_CONFIG.sourceId,

		snapshotDate: SNAPSHOT_DATE,

		ageGroup: ENGLAND_U14_CONFIG.ageGroup,

		ageMax: ENGLAND_U14_CONFIG.ageMax,

		participations,

		resolutionReport,
	});

	await mkdir(outputDir, {
		recursive: true,
	});

	await writeFile(outputFile, JSON.stringify(report, null, 2), "utf8");

	console.log(`England Ice Hockey ${report.ageGroup} team proposals`);

	console.log("");

	console.log(`Proposals: ${report.totalProposals}`);

	console.log(`ID collisions: ${report.idCollisions}`);

	console.log("");

	for (const proposal of report.proposals) {
		console.log(`+ ${proposal.sourceName} -> ${proposal.proposedId}`);
	}

	if (report.collisions.length) {
		console.log("");
		console.log("ID collisions:");

		for (const collision of report.collisions) {
			console.log(`! ${collision.proposedId}: ${collision.sourceNames.join(", ")}`);
		}
	}

	console.log("");

	console.log(`Written: ${outputFile}`);
}

await main();
