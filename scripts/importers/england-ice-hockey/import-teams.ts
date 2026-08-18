import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { extname, join } from "node:path";

import { parse, stringify } from "yaml";

import { TeamSchema, type Team } from "../../../schema/index.js";

import type { EnglandTeamProposalReport } from "./propose-teams.js";

const TEAMS_DIR = join("data", "teams");

type ImportEnglandTeamsOptions = {
	proposalReport: EnglandTeamProposalReport;
};

export type ImportEnglandTeamsResult = {
	created: number;
	skipped: number;
	total: number;
};

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path, constants.F_OK);

		return true;
	} catch {
		return false;
	}
}

async function loadExistingTeamIds(): Promise<Set<string>> {
	const files = await readdir(TEAMS_DIR);

	const ids = new Set<string>();

	for (const file of files) {
		if (![".yaml", ".yml"].includes(extname(file))) {
			continue;
		}

		const raw = parse(await readFile(join(TEAMS_DIR, file), "utf8"));

		const team = TeamSchema.parse(raw);

		ids.add(team.id);
	}

	return ids;
}

export async function importEnglandTeams(
	options: ImportEnglandTeamsOptions,
): Promise<ImportEnglandTeamsResult> {
	const report = options.proposalReport;

	if (report.idCollisions !== 0) {
		throw new Error(`Proposal report contains ${report.idCollisions} ID collision(s).`);
	}

	if (report.totalProposals !== report.proposals.length) {
		throw new Error("Proposal count does not match report contents.");
	}

	await mkdir(TEAMS_DIR, {
		recursive: true,
	});

	const existingTeamIds = await loadExistingTeamIds();

	let created = 0;
	let skipped = 0;

	for (const proposal of report.proposals) {
		/*
		 * Generic importer is idempotent.
		 *
		 * If the canonical ID already exists,
		 * we do not overwrite it.
		 */
		if (existingTeamIds.has(proposal.proposedId)) {
			console.log(`- skip ${proposal.proposedId}: already exists`);

			skipped += 1;

			continue;
		}

		const aliases = proposal.sourceName !== proposal.proposedName ? [proposal.sourceName] : [];

		const team: Team = {
			id: proposal.proposedId,

			name: proposal.proposedName,

			aliases,

			historicalNames: [],

			country: "GB",

			categories: proposal.categories,

			status: "unknown",

			role: proposal.role,

			rinkIds: [],

			externalIds: [],

			sourceIds: [proposal.sourceId],

			sourceUrls: proposal.sourceUrls,
		};

		const validated = TeamSchema.parse(team);

		const outputFile = join(TEAMS_DIR, `${validated.id}.yaml`);

		if (await fileExists(outputFile)) {
			throw new Error(`Unexpected existing file for new team: ${outputFile}`);
		}

		await writeFile(
			outputFile,
			stringify(validated, {
				lineWidth: 100,
			}),
			"utf8",
		);

		existingTeamIds.add(validated.id);

		console.log(`+ ${validated.id} <- ${proposal.sourceName}`);

		created += 1;
	}

	return {
		created,
		skipped,
		total: report.proposals.length,
	};
}
