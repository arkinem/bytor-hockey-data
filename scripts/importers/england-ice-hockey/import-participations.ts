import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { parse, stringify } from "yaml";

import {
	CompetitionGroupSchema,
	CompetitionSeasonSchema,
	TeamParticipationSchema,
	TeamSchema,
	type TeamParticipation,
} from "../../../schema/index.js";

import type { RawEnglandJuniorParticipation } from "./types.js";

import type { EnglandJuniorCompetitionConfig } from "./config.js";

import type { TeamResolutionReport } from "./resolve-teams.js";

const PARTICIPATIONS_DIR = join("data", "team-participations");

const TEAMS_DIR = join("data", "teams");

const SEASONS_DIR = join("data", "competition-seasons");

const GROUPS_DIR = join("data", "competition-groups");

type ImportEnglandParticipationsOptions = {
	rawParticipations: RawEnglandJuniorParticipation[];

	resolutionReport: TeamResolutionReport;

	config: EnglandJuniorCompetitionConfig;
};

export type ImportEnglandParticipationsResult = {
	sourceParticipations: number;
	created: number;
	skipped: number;
	handled: number;
};

async function loadYamlDirectory(directory: string): Promise<unknown[]> {
	const files = await readdir(directory);

	const yamlFiles = files.filter((file) => [".yaml", ".yml"].includes(extname(file)));

	return Promise.all(
		yamlFiles.map(async (file) => parse(await readFile(join(directory, file), "utf8"))),
	);
}

function buildResolutionMap(report: TeamResolutionReport): Map<string, string> {
	if (report.unresolved !== 0 || report.ambiguous !== 0) {
		throw new Error(
			"Team resolution is incomplete. " +
				`Unresolved: ${report.unresolved}, ` +
				`ambiguous: ${report.ambiguous}.`,
		);
	}

	const map = new Map<string, string>();

	for (const result of report.results) {
		if (result.status !== "resolved" || result.candidates.length !== 1) {
			throw new Error(`Invalid resolved result for "${result.sourceName}".`);
		}

		const candidate = result.candidates[0];

		if (!candidate) {
			throw new Error(`Missing candidate for "${result.sourceName}".`);
		}

		map.set(result.sourceName, candidate.teamId);
	}

	return map;
}

function createParticipationId(teamId: string, competitionSeasonId: string): string {
	return `${teamId}-${competitionSeasonId}`;
}

export async function importEnglandParticipations(
	options: ImportEnglandParticipationsOptions,
): Promise<ImportEnglandParticipationsResult> {
	const { rawParticipations, resolutionReport, config } = options;

	const resolutionMap = buildResolutionMap(resolutionReport);

	const teams = (await loadYamlDirectory(TEAMS_DIR)).map((data) => TeamSchema.parse(data));

	const competitionSeasons = (await loadYamlDirectory(SEASONS_DIR)).map((data) =>
		CompetitionSeasonSchema.parse(data),
	);

	const competitionGroups = (await loadYamlDirectory(GROUPS_DIR)).map((data) =>
		CompetitionGroupSchema.parse(data),
	);

	const existingParticipations = (await loadYamlDirectory(PARTICIPATIONS_DIR)).map((data) =>
		TeamParticipationSchema.parse(data),
	);

	const teamIds = new Set(teams.map((team) => team.id));

	const competitionSeasonIds = new Set(competitionSeasons.map((season) => season.id));

	const competitionGroupIds = new Set(competitionGroups.map((group) => group.id));

	const existingByRelationship = new Map<string, TeamParticipation>();

	for (const participation of existingParticipations) {
		const key = [participation.teamId, participation.competitionSeasonId].join("|");

		if (existingByRelationship.has(key)) {
			throw new Error(`Duplicate existing TeamParticipation relationship: ${key}`);
		}

		existingByRelationship.set(key, participation);
	}

	await mkdir(PARTICIPATIONS_DIR, {
		recursive: true,
	});

	let created = 0;
	let skipped = 0;

	for (const rawParticipation of rawParticipations) {
		const teamId = resolutionMap.get(rawParticipation.teamName);

		if (!teamId) {
			throw new Error(`No canonical team resolution for "${rawParticipation.teamName}".`);
		}

		if (!teamIds.has(teamId)) {
			throw new Error(`Resolved team "${teamId}" does not exist in canonical data.`);
		}

		const destination = config.competitions[rawParticipation.competitionName];

		if (!destination) {
			throw new Error(`No competition mapping for "${rawParticipation.competitionName}".`);
		}

		if (!competitionSeasonIds.has(destination.competitionSeasonId)) {
			throw new Error(`Competition season "${destination.competitionSeasonId}" does not exist.`);
		}

		const competitionGroupId = destination.competitionGroupId;

		if (competitionGroupId && !competitionGroupIds.has(competitionGroupId)) {
			throw new Error(`Competition group "${competitionGroupId}" does not exist.`);
		}

		const relationshipKey = [teamId, destination.competitionSeasonId].join("|");

		const existing = existingByRelationship.get(relationshipKey);

		if (existing) {
			if (existing.competitionGroupId !== competitionGroupId) {
				throw new Error(
					`Existing participation "${existing.id}" has a different competition group.`,
				);
			}

			console.log(`- skip ${rawParticipation.teamName} -> ${existing.id}`);

			skipped += 1;

			continue;
		}

		const participationId = createParticipationId(teamId, destination.competitionSeasonId);

		const participation: TeamParticipation = {
			id: participationId,

			teamId,

			competitionSeasonId: destination.competitionSeasonId,

			...(competitionGroupId
				? {
						competitionGroupId,
					}
				: {}),

			status: "active",

			displayName: rawParticipation.teamName,

			sourceIds: [config.sourceId],
		};

		const validated = TeamParticipationSchema.parse(participation);

		const outputFile = join(PARTICIPATIONS_DIR, `${validated.id}.yaml`);

		await writeFile(
			outputFile,
			stringify(validated, {
				lineWidth: 100,
			}),
			"utf8",
		);

		existingByRelationship.set(relationshipKey, validated);

		console.log(`+ ${rawParticipation.teamName} -> ${validated.id}`);

		created += 1;
	}

	const handled = created + skipped;

	if (handled !== rawParticipations.length) {
		throw new Error("Not all source participations were handled.");
	}

	return {
		sourceParticipations: rawParticipations.length,

		created,

		skipped,

		handled,
	};
}
