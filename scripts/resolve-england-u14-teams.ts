import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { RawEnglandJuniorParticipation } from "./importers/england-ice-hockey/types.js";

import { ENGLAND_U14_CONFIG } from "./importers/england-ice-hockey/configs/u14.js";

import {
	getEnglandJuniorParticipationsFile,
	getEnglandResolutionDir,
	getEnglandTeamResolutionFile,
} from "./importers/england-ice-hockey/paths.js";

import { resolveEnglandTeams } from "./importers/england-ice-hockey/resolve-teams.js";

const SNAPSHOT_DATE = "2026-08-18";

async function main(): Promise<void> {
	const participationsFile = getEnglandJuniorParticipationsFile(
		SNAPSHOT_DATE,
		ENGLAND_U14_CONFIG.ageGroup,
	);

	const outputDir = getEnglandResolutionDir(SNAPSHOT_DATE);

	const outputFile = getEnglandTeamResolutionFile(SNAPSHOT_DATE, ENGLAND_U14_CONFIG.ageGroup);

	const participations = JSON.parse(
		await readFile(participationsFile, "utf8"),
	) as RawEnglandJuniorParticipation[];

	const report = await resolveEnglandTeams({
		source: ENGLAND_U14_CONFIG.sourceId,

		snapshotDate: SNAPSHOT_DATE,

		ageGroup: ENGLAND_U14_CONFIG.ageGroup,

		sourceNames: participations.map((participation) => participation.teamName),
	});

	await mkdir(outputDir, {
		recursive: true,
	});

	await writeFile(outputFile, JSON.stringify(report, null, 2), "utf8");

	console.log(`England Ice Hockey ${report.ageGroup} team resolution`);

	console.log("");

	console.log(`Source team names: ${report.totalSourceNames}`);

	console.log(`Resolved: ${report.resolved}`);

	console.log(`Ambiguous: ${report.ambiguous}`);

	console.log(`Unresolved: ${report.unresolved}`);

	console.log("");

	for (const result of report.results) {
		if (result.status === "resolved") {
			const candidate = result.candidates[0];

			if (!candidate) {
				continue;
			}

			console.log(`✓ ${result.sourceName} -> ${candidate.teamId} (${candidate.reason})`);

			continue;
		}

		if (result.status === "ambiguous") {
			console.log(`? ${result.sourceName}`);

			for (const candidate of result.candidates) {
				console.log(`    -> ${candidate.teamId} (${candidate.reason})`);
			}

			continue;
		}

		console.log(`- ${result.sourceName}`);
	}

	console.log("");

	console.log(`Written: ${outputFile}`);
}

await main();
