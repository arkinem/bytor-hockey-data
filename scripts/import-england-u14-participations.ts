import { readFile } from "node:fs/promises";

import type { RawEnglandJuniorParticipation } from "./importers/england-ice-hockey/types.js";

import type { TeamResolutionReport } from "./importers/england-ice-hockey/resolve-teams.js";

import { ENGLAND_U14_CONFIG } from "./importers/england-ice-hockey/configs/u14.js";

import {
	getEnglandJuniorParticipationsFile,
	getEnglandTeamResolutionFile,
} from "./importers/england-ice-hockey/paths.js";

import { importEnglandParticipations } from "./importers/england-ice-hockey/import-participations.js";

const SNAPSHOT_DATE = "2026-08-18";

async function main(): Promise<void> {
	const participationsFile = getEnglandJuniorParticipationsFile(
		SNAPSHOT_DATE,
		ENGLAND_U14_CONFIG.ageGroup,
	);

	const resolutionFile = getEnglandTeamResolutionFile(SNAPSHOT_DATE, ENGLAND_U14_CONFIG.ageGroup);

	const rawParticipations = JSON.parse(
		await readFile(participationsFile, "utf8"),
	) as RawEnglandJuniorParticipation[];

	const resolutionReport = JSON.parse(
		await readFile(resolutionFile, "utf8"),
	) as TeamResolutionReport;

	const result = await importEnglandParticipations({
		rawParticipations,

		resolutionReport,

		config: ENGLAND_U14_CONFIG,
	});

	console.log("");

	console.log(`Source participations: ${result.sourceParticipations}`);

	console.log(`Created: ${result.created}`);

	console.log(`Skipped existing: ${result.skipped}`);

	console.log(`Handled: ${result.handled}`);
}

await main();
