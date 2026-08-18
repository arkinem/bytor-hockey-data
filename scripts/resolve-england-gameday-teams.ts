import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";

import { extname, join } from "node:path";

import { parse } from "yaml";

import { TeamSchema, type Team } from "../schema/index.js";

import { normalizeEntityName } from "../lib/normalize-name.js";

import type {
	RawGameDayJuniorSnapshot,
	RawGameDayJuniorTeam,
} from "../providers/england-ice-hockey/gameday/types.js";

const SNAPSHOT_DATE = "2026-08-18";

const INPUT_FILE = join(
	"imports",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday",
	"raw-juniors.json",
);

const OUTPUT_DIR = join("generated", "resolution", "england-ice-hockey", SNAPSHOT_DATE);

const OUTPUT_FILE = join(OUTPUT_DIR, "gameday-team-resolution.json");

const TEAMS_DIR = join("data", "teams");

type MatchReason =
	| "gameday_external_id"
	| "canonical_name"
	| "alias"
	| "historical_name"
	| "age_group_context";

type Candidate = {
	teamId: string;

	canonicalName: string;

	reason: MatchReason;

	matchedValue: string;
};

type ResolutionStatus = "resolved" | "ambiguous" | "unresolved";

type ResolutionResult = {
	gameDayTeamId: string;

	sourceNames: string[];

	ageGroups: string[];

	competitionIds: string[];

	status: ResolutionStatus;

	candidates: Candidate[];
};

async function loadCanonicalTeams(): Promise<Team[]> {
	const files = await readdir(TEAMS_DIR);

	const teams: Team[] = [];

	for (const file of files) {
		if (![".yaml", ".yml"].includes(extname(file))) {
			continue;
		}

		const raw = parse(await readFile(join(TEAMS_DIR, file), "utf8"));

		teams.push(TeamSchema.parse(raw));
	}

	return teams;
}

function candidatePriority(reason: MatchReason): number {
	switch (reason) {
		case "gameday_external_id":
			return 0;

		case "canonical_name":
			return 1;

		case "alias":
			return 2;

		case "historical_name":
			return 3;

		case "age_group_context":
			return 4;
	}
}

/**
 * Prevents an U12 source record from matching an
 * existing U14/U16/etc canonical Team.
 *
 * Teams without an explicit ageBand are not rejected
 * here, because some older/manual canonical data may
 * still be incomplete.
 */
function isAgeCompatible(team: Team, rawAgeGroups: string[]): boolean {
	const canonicalAge = team.categories.ageBand?.label;

	if (!canonicalAge) {
		return true;
	}

	return rawAgeGroups.some((ageGroup) => ageGroup.toUpperCase() === canonicalAge.toUpperCase());
}

/**
 * Normalises harmless ways of writing an age group.
 *
 * Examples:
 *
 * Bradford Bulldogs u14's
 * Bradford Bulldogs U14s
 * Bradford Bulldogs U14
 *
 * all become equivalent.
 *
 * Kingston Sharks Under 14's
 * Kingston Sharks U14
 *
 * also become equivalent.
 *
 * Importantly this does NOT remove:
 *
 * D1 / D2
 * A / B
 * N1 / N2
 * S1 / S2
 * colours
 * squad names
 *
 * because those may identify genuinely different squads.
 */
function normalizeJuniorTeamName(value: string, ageGroup: string): string {
	const ageNumber = ageGroup.replace(/^U/i, "");

	return normalizeEntityName(
		value
			.replace(new RegExp(`\\bunder\\s*${ageNumber}(?:['’]s|s)?\\b`, "gi"), ageGroup)
			.replace(new RegExp(`\\bu${ageNumber}(?:['’]s|s)\\b`, "gi"), ageGroup)
			.replace(/\s*-\s*/g, " "),
	);
}

/**
 * Used for contextual matching where GameDay omits
 * the age suffix entirely.
 *
 * Example:
 *
 * source:    Bristol Snowdogs
 * canonical: Bristol Snowdogs U14
 *
 * This can only match when the canonical team's
 * ageBand is compatible with the raw source age.
 */
function normalizeJuniorBaseName(value: string, ageGroup: string): string {
	const normalized = normalizeJuniorTeamName(value, ageGroup);

	const normalizedAge = normalizeEntityName(ageGroup);

	const suffix = new RegExp(`\\s+${normalizedAge}$`, "i");

	return normalized.replace(suffix, "").trim();
}

function valuesForTeam(team: Team): Array<{
	value: string;

	reason: "canonical_name" | "alias" | "historical_name";
}> {
	return [
		{
			value: team.name,

			reason: "canonical_name",
		},

		...team.aliases.map((value) => ({
			value,

			reason: "alias" as const,
		})),

		...team.historicalNames.map((historicalName) => ({
			value: historicalName.name,

			reason: "historical_name" as const,
		})),
	];
}

function resolveGameDayTeam(
	rawTeam: RawGameDayJuniorTeam,
	canonicalTeams: Team[],
): ResolutionResult {
	const candidates = new Map<string, Candidate>();

	function addCandidate(team: Team, reason: MatchReason, matchedValue: string): void {
		const existing = candidates.get(team.id);

		const candidate: Candidate = {
			teamId: team.id,

			canonicalName: team.name,

			reason,

			matchedValue,
		};

		if (!existing) {
			candidates.set(team.id, candidate);

			return;
		}

		/*
		 * One canonical Team may match through several
		 * mechanisms. Keep only its strongest reason.
		 */
		if (candidatePriority(reason) < candidatePriority(existing.reason)) {
			candidates.set(team.id, candidate);
		}
	}

	/*
	 * ------------------------------------------------
	 * PASS 1
	 * Existing GameDay provider identity.
	 * ------------------------------------------------
	 *
	 * Once a GameDay ID has been attached to a
	 * canonical Team this is the strongest identity.
	 */
	for (const team of canonicalTeams) {
		const externalId = team.externalIds.find(
			(externalId) => externalId.system === "gameday" && externalId.value === rawTeam.id,
		);

		if (externalId) {
			addCandidate(team, "gameday_external_id", externalId.value);
		}
	}

	const externalMatches = [...candidates.values()].filter(
		(candidate) => candidate.reason === "gameday_external_id",
	);

	if (externalMatches.length === 1) {
		return {
			gameDayTeamId: rawTeam.id,

			sourceNames: rawTeam.names,

			ageGroups: rawTeam.ageGroups,

			competitionIds: rawTeam.competitionIds,

			status: "resolved",

			candidates: externalMatches,
		};
	}

	if (externalMatches.length > 1) {
		return {
			gameDayTeamId: rawTeam.id,

			sourceNames: rawTeam.names,

			ageGroups: rawTeam.ageGroups,

			competitionIds: rawTeam.competitionIds,

			status: "ambiguous",

			candidates: externalMatches,
		};
	}

	/*
	 * ------------------------------------------------
	 * PASS 2
	 * Exact junior-aware identity-field matching.
	 * ------------------------------------------------
	 *
	 * This recognises safe notation differences:
	 *
	 * U14
	 * U14s
	 * u14's
	 * Under 14's
	 *
	 * but preserves squad markers such as D1/D2/A/B.
	 */
	for (const sourceName of rawTeam.names) {
		for (const team of canonicalTeams) {
			if (!isAgeCompatible(team, rawTeam.ageGroups)) {
				continue;
			}

			for (const ageGroup of rawTeam.ageGroups) {
				const sourceKey = normalizeJuniorTeamName(sourceName, ageGroup);

				for (const teamValue of valuesForTeam(team)) {
					const canonicalKey = normalizeJuniorTeamName(teamValue.value, ageGroup);

					if (canonicalKey !== sourceKey) {
						continue;
					}

					addCandidate(team, teamValue.reason, teamValue.value);

					break;
				}
			}
		}
	}

	/*
	 * ------------------------------------------------
	 * PASS 3
	 * Age-group contextual matching.
	 * ------------------------------------------------
	 *
	 * Handles the safe case where one source includes
	 * the age and the other omits it.
	 *
	 * The age MUST match first.
	 */
	for (const ageGroup of rawTeam.ageGroups) {
		for (const sourceName of rawTeam.names) {
			const sourceBase = normalizeJuniorBaseName(sourceName, ageGroup);

			for (const team of canonicalTeams) {
				if (!isAgeCompatible(team, rawTeam.ageGroups)) {
					continue;
				}

				if (
					team.categories.age !== "junior" ||
					team.categories.ageBand?.label?.toUpperCase() !== ageGroup.toUpperCase()
				) {
					continue;
				}

				const matched = valuesForTeam(team).find(
					(teamValue) => normalizeJuniorBaseName(teamValue.value, ageGroup) === sourceBase,
				);

				if (!matched) {
					continue;
				}

				addCandidate(team, "age_group_context", matched.value);
			}
		}
	}

	const resolvedCandidates = [...candidates.values()].sort(
		(a, b) => candidatePriority(a.reason) - candidatePriority(b.reason),
	);

	if (resolvedCandidates.length === 0) {
		return {
			gameDayTeamId: rawTeam.id,

			sourceNames: rawTeam.names,

			ageGroups: rawTeam.ageGroups,

			competitionIds: rawTeam.competitionIds,

			status: "unresolved",

			candidates: [],
		};
	}

	if (resolvedCandidates.length === 1) {
		return {
			gameDayTeamId: rawTeam.id,

			sourceNames: rawTeam.names,

			ageGroups: rawTeam.ageGroups,

			competitionIds: rawTeam.competitionIds,

			status: "resolved",

			candidates: resolvedCandidates,
		};
	}

	return {
		gameDayTeamId: rawTeam.id,

		sourceNames: rawTeam.names,

		ageGroups: rawTeam.ageGroups,

		competitionIds: rawTeam.competitionIds,

		status: "ambiguous",

		candidates: resolvedCandidates,
	};
}

async function main(): Promise<void> {
	const snapshot = JSON.parse(await readFile(INPUT_FILE, "utf8")) as RawGameDayJuniorSnapshot;

	const canonicalTeams = await loadCanonicalTeams();

	const results = snapshot.teams.map((rawTeam) => resolveGameDayTeam(rawTeam, canonicalTeams));

	const resolved = results.filter((result) => result.status === "resolved").length;

	const ambiguous = results.filter((result) => result.status === "ambiguous").length;

	const unresolved = results.filter((result) => result.status === "unresolved").length;

	const report = {
		source: "gameday",

		snapshotDate: SNAPSHOT_DATE,

		total: results.length,

		resolved,

		ambiguous,

		unresolved,

		results,
	};

	await mkdir(OUTPUT_DIR, {
		recursive: true,
	});

	await writeFile(OUTPUT_FILE, JSON.stringify(report, null, 2), "utf8");

	console.log("GameDay junior team resolution");

	console.log("");

	console.log(`Teams: ${report.total}`);

	console.log(`Resolved: ${resolved}`);

	console.log(`Ambiguous: ${ambiguous}`);

	console.log(`Unresolved: ${unresolved}`);

	console.log("");

	for (const result of results) {
		if (result.status === "resolved") {
			const candidate = result.candidates[0];

			if (!candidate) {
				continue;
			}

			console.log(
				`✓ ${result.gameDayTeamId} ${result.sourceNames.join(" / ")} -> ${candidate.teamId} (${candidate.reason})`,
			);

			continue;
		}

		if (result.status === "ambiguous") {
			console.log(`? ${result.gameDayTeamId} ${result.sourceNames.join(" / ")}`);

			for (const candidate of result.candidates) {
				console.log(`    -> ${candidate.teamId} (${candidate.reason})`);
			}

			continue;
		}

		console.log(`- ${result.gameDayTeamId} ${result.sourceNames.join(" / ")}`);
	}

	console.log("");

	console.log(`Written: ${OUTPUT_FILE}`);
}

await main();
