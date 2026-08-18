import { readFile } from "node:fs/promises";

import type { RawEnglandJuniorParticipation } from "./importers/england-ice-hockey/types.js";

import { ENGLAND_U14_CONFIG } from "./importers/england-ice-hockey/configs/u14.js";

import { getEnglandJuniorParticipationsFile } from "./importers/england-ice-hockey/paths.js";

import { checkEnglandJuniorConfig } from "./importers/england-ice-hockey/check-config.js";

const SNAPSHOT_DATE = "2026-08-18";

async function main(): Promise<void> {
	const inputFile = getEnglandJuniorParticipationsFile(SNAPSHOT_DATE, ENGLAND_U14_CONFIG.ageGroup);

	const participations = JSON.parse(
		await readFile(inputFile, "utf8"),
	) as RawEnglandJuniorParticipation[];

	const result = checkEnglandJuniorConfig(participations, ENGLAND_U14_CONFIG);

	console.log(`England Ice Hockey ${ENGLAND_U14_CONFIG.ageGroup} config check`);

	console.log("");

	console.log(`Source competitions: ${result.sourceCompetitions.length}`);

	console.log(`Configured competitions: ${result.configuredCompetitions.length}`);

	console.log(`Missing config: ${result.missingConfig.length}`);

	console.log(`Unused config: ${result.unusedConfig.length}`);

	if (result.missingConfig.length) {
		console.log("");
		console.error("Missing competition mappings:");

		for (const name of result.missingConfig) {
			console.error(`- ${name}`);
		}

		process.exitCode = 1;
	}

	if (result.unusedConfig.length) {
		console.log("");
		console.warn("Configured but absent from source:");

		for (const name of result.unusedConfig) {
			console.warn(`- ${name}`);
		}
	}

	console.log("");

	for (const name of result.sourceCompetitions) {
		const destination =
			ENGLAND_U14_CONFIG.competitions[name as keyof typeof ENGLAND_U14_CONFIG.competitions];

		if (!destination) {
			continue;
		}

		const group = "competitionGroupId" in destination ? ` / ${destination.competitionGroupId}` : "";

		console.log(`✓ ${name} -> ${destination.competitionSeasonId}${group}`);
	}
}

await main();
