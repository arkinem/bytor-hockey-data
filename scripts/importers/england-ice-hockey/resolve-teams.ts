import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

import { parse } from "yaml";

import { TeamSchema, type Team } from "../../../schema/index.js";

import { normalizeEntityName } from "../../lib/normalize-name.js";

export type MatchReason = "canonical_name" | "alias" | "historical_name" | "age_group_context";

export type TeamCandidate = {
	teamId: string;
	canonicalName: string;
	matchedValue: string;
	reason: MatchReason;
};

export type ResolutionStatus = "resolved" | "ambiguous" | "unresolved";

export type ResolutionResult = {
	sourceName: string;
	status: ResolutionStatus;
	candidates: TeamCandidate[];
};

export type TeamResolutionReport = {
	source: string;
	snapshotDate: string;
	ageGroup: string;

	totalSourceNames: number;

	resolved: number;
	ambiguous: number;
	unresolved: number;

	results: ResolutionResult[];
};

type ResolveTeamsOptions = {
	source: string;
	snapshotDate: string;
	ageGroup: string;
	sourceNames: string[];
};

const TEAMS_DIR = join("data", "teams");

async function loadCanonicalTeams(): Promise<Team[]> {
	const files = await readdir(TEAMS_DIR);

	const yamlFiles = files.filter((file) => [".yaml", ".yml"].includes(extname(file)));

	return Promise.all(
		yamlFiles.map(async (file) => {
			const raw = parse(await readFile(join(TEAMS_DIR, file), "utf8"));

			return TeamSchema.parse(raw);
		}),
	);
}

function isAgeGroupTeam(team: Team, ageGroup: string): boolean {
	return (
		team.categories.age === "junior" &&
		team.categories.ageBand?.label?.toUpperCase() === ageGroup.toUpperCase()
	);
}

function removeAgeGroupSuffix(value: string, ageGroup: string): string {
	const escaped = ageGroup.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	return value.replace(new RegExp(`\\s+${escaped}$`, "i"), "").trim();
}

function buildCandidates(sourceName: string, teams: Team[], ageGroup: string): TeamCandidate[] {
	const sourceKey = normalizeEntityName(sourceName);

	const candidates = new Map<string, TeamCandidate>();

	function addCandidate(team: Team, matchedValue: string, reason: MatchReason): void {
		if (candidates.has(team.id)) {
			return;
		}

		candidates.set(team.id, {
			teamId: team.id,
			canonicalName: team.name,
			matchedValue,
			reason,
		});
	}

	/*
	 * Pass 1:
	 * exact canonical identity fields.
	 */
	for (const team of teams) {
		if (normalizeEntityName(team.name) === sourceKey) {
			addCandidate(team, team.name, "canonical_name");

			continue;
		}

		const alias = team.aliases.find((value) => normalizeEntityName(value) === sourceKey);

		if (alias) {
			addCandidate(team, alias, "alias");

			continue;
		}

		const historicalName = team.historicalNames.find(
			(value) => normalizeEntityName(value.name) === sourceKey,
		);

		if (historicalName) {
			addCandidate(team, historicalName.name, "historical_name");
		}
	}

	/*
	 * Pass 2:
	 * age-group-aware matching.
	 *
	 * Example:
	 *
	 * source:
	 *   Milton Keynes Storm
	 *
	 * canonical alias:
	 *   Milton Keynes Storm U14
	 *
	 * This rule only applies to teams already
	 * explicitly classified in the requested
	 * age group.
	 */
	for (const team of teams.filter((team) => isAgeGroupTeam(team, ageGroup))) {
		const values = [team.name, ...team.aliases, ...team.historicalNames.map((value) => value.name)];

		const contextualMatch = values.find((value) => {
			const withoutAge = removeAgeGroupSuffix(value, ageGroup);

			return normalizeEntityName(withoutAge) === sourceKey;
		});

		if (contextualMatch) {
			addCandidate(team, contextualMatch, "age_group_context");
		}
	}

	return [...candidates.values()];
}

function resolveName(sourceName: string, teams: Team[], ageGroup: string): ResolutionResult {
	const candidates = buildCandidates(sourceName, teams, ageGroup);

	if (candidates.length === 0) {
		return {
			sourceName,
			status: "unresolved",
			candidates: [],
		};
	}

	if (candidates.length === 1) {
		return {
			sourceName,
			status: "resolved",
			candidates,
		};
	}

	return {
		sourceName,
		status: "ambiguous",
		candidates,
	};
}

export async function resolveEnglandTeams(
	options: ResolveTeamsOptions,
): Promise<TeamResolutionReport> {
	const teams = await loadCanonicalTeams();

	const sourceNames = [...new Set(options.sourceNames)].sort();

	const results = sourceNames.map((sourceName) => resolveName(sourceName, teams, options.ageGroup));

	const resolved = results.filter((result) => result.status === "resolved").length;

	const ambiguous = results.filter((result) => result.status === "ambiguous").length;

	const unresolved = results.filter((result) => result.status === "unresolved").length;

	return {
		source: options.source,

		snapshotDate: options.snapshotDate,

		ageGroup: options.ageGroup,

		totalSourceNames: sourceNames.length,

		resolved,

		ambiguous,

		unresolved,

		results,
	};
}
