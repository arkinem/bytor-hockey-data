import { readFile, readdir, writeFile } from "node:fs/promises";

import { extname, join } from "node:path";

import { parse } from "yaml";

import {
	TeamParticipationSchema,
	TeamSchema,
	type Team,
	type TeamParticipation,
} from "../schema/index.js";

import type { RawGameDayJuniorSnapshot } from "./importers/england-ice-hockey/gameday-types.js";

import { normalizeEntityName } from "./lib/normalize-name.js";

const SNAPSHOT_DATE = "2026-08-18";

const RAW_FILE = join(
	"imports",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday",
	"raw-juniors.json",
);

const RESOLUTION_FILE = join(
	"generated",
	"resolution",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday-team-resolution.json",
);

const OUTPUT_FILE = join(
	"generated",
	"resolution",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday-u14-crosswalk.json",
);

const TEAMS_DIR = join("data", "teams");

const PARTICIPATIONS_DIR = join("data", "team-participations");

const GAMEDAY_DESTINATIONS = {
	"652459": {
		competitionSeasonId: "junior-u14-north-1-2025-26",
	},

	"652468": {
		competitionSeasonId: "junior-u14-north-2-2025-26",

		competitionGroupId: "junior-u14-north-2-2025-26-east",
	},

	"653271": {
		competitionSeasonId: "junior-u14-north-2-2025-26",

		competitionGroupId: "junior-u14-north-2-2025-26-west",
	},

	"652478": {
		competitionSeasonId: "junior-u14-south-1-2025-26",
	},

	"652458": {
		competitionSeasonId: "junior-u14-south-2-2025-26",
	},
} as const;

type ResolutionReport = {
	results: Array<{
		gameDayTeamId: string;

		status: "resolved" | "ambiguous" | "unresolved";

		candidates: Array<{
			teamId: string;
		}>;
	}>;
};

type CrosswalkCandidate = {
	teamId: string;

	canonicalName: string;

	displayName?: string;

	score: number;

	commonTokens: string[];
};

function normalizeTokens(value: string): Set<string> {
	const ignored = new Set([
		"u14",
		"under",
		"14",
		"s",
		"d1",
		"d2",
		"n1",
		"n2",
		"s1",
		"s2",
		"a",
		"b",
		"division",
		"academy",
		"junior",
		"juniors",
	]);

	const normalized = normalizeEntityName(value);

	return new Set(
		normalized
			.split(/\s+/)
			.filter(Boolean)
			.filter((token) => !ignored.has(token)),
	);
}

function compareNames(
	left: string,
	right: string,
): {
	score: number;
	commonTokens: string[];
} {
	const leftTokens = normalizeTokens(left);

	const rightTokens = normalizeTokens(right);

	const commonTokens = [...leftTokens].filter((token) => rightTokens.has(token));

	const union = new Set([...leftTokens, ...rightTokens]);

	const score = union.size === 0 ? 0 : commonTokens.length / union.size;

	return {
		score,
		commonTokens,
	};
}

async function loadYamlDirectory(directory: string): Promise<unknown[]> {
	const files = await readdir(directory);

	const yamlFiles = files.filter((file) => [".yaml", ".yml"].includes(extname(file)));

	return Promise.all(
		yamlFiles.map(async (file) => parse(await readFile(join(directory, file), "utf8"))),
	);
}

function belongsToDestination(
	participation: TeamParticipation,
	destination: {
		competitionSeasonId: string;

		competitionGroupId?: string;
	},
): boolean {
	if (participation.competitionSeasonId !== destination.competitionSeasonId) {
		return false;
	}

	if (destination.competitionGroupId) {
		return participation.competitionGroupId === destination.competitionGroupId;
	}

	return true;
}

async function main(): Promise<void> {
	const snapshot = JSON.parse(await readFile(RAW_FILE, "utf8")) as RawGameDayJuniorSnapshot;

	const resolution = JSON.parse(await readFile(RESOLUTION_FILE, "utf8")) as ResolutionReport;

	const teams = (await loadYamlDirectory(TEAMS_DIR)).map((data) => TeamSchema.parse(data));

	const participations = (await loadYamlDirectory(PARTICIPATIONS_DIR)).map((data) =>
		TeamParticipationSchema.parse(data),
	);

	const teamById = new Map<string, Team>(teams.map((team) => [team.id, team]));

	const resolutionByGameDayId = new Map(
		resolution.results.map((result) => [result.gameDayTeamId, result]),
	);

	const results = [];

	for (const rawTeam of snapshot.teams) {
		if (!rawTeam.ageGroups.includes("U14")) {
			continue;
		}

		const resolutionResult = resolutionByGameDayId.get(rawTeam.id);

		if (resolutionResult?.status === "resolved") {
			results.push({
				gameDayTeamId: rawTeam.id,

				sourceNames: rawTeam.names,

				status: "already_resolved",

				teamId: resolutionResult.candidates[0]?.teamId,
			});

			continue;
		}

		const competitionId = rawTeam.competitionIds.find((id) => id in GAMEDAY_DESTINATIONS);

		if (!competitionId) {
			results.push({
				gameDayTeamId: rawTeam.id,

				sourceNames: rawTeam.names,

				status: "no_destination",
			});

			continue;
		}

		const destination = GAMEDAY_DESTINATIONS[competitionId as keyof typeof GAMEDAY_DESTINATIONS];

		const candidateParticipations = participations.filter((participation) =>
			belongsToDestination(participation, destination),
		);

		const candidates: CrosswalkCandidate[] = [];

		for (const participation of candidateParticipations) {
			const team = teamById.get(participation.teamId);

			if (!team) {
				continue;
			}

			let bestScore = 0;
			let bestCommon: string[] = [];

			const canonicalValues = [
				team.name,
				...team.aliases,

				...(participation.displayName ? [participation.displayName] : []),
			];

			for (const sourceName of rawTeam.names) {
				for (const canonicalValue of canonicalValues) {
					const comparison = compareNames(sourceName, canonicalValue);

					if (comparison.score > bestScore) {
						bestScore = comparison.score;

						bestCommon = comparison.commonTokens;
					}
				}
			}

			candidates.push({
				teamId: team.id,

				canonicalName: team.name,

				...(participation.displayName
					? {
							displayName: participation.displayName,
						}
					: {}),

				score: Number(bestScore.toFixed(3)),

				commonTokens: bestCommon,
			});
		}

		candidates.sort((a, b) => b.score - a.score);

		results.push({
			gameDayTeamId: rawTeam.id,

			sourceNames: rawTeam.names,

			competitionId,

			status: "review",

			candidates: candidates.slice(0, 3),
		});
	}

	const alreadyResolved = results.filter((result) => result.status === "already_resolved").length;

	const review = results.filter((result) => result.status === "review").length;

	const output = {
		ageGroup: "U14",

		total: results.length,

		alreadyResolved,

		review,

		results,
	};

	await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");

	console.log("GameDay U14 crosswalk");

	console.log("");

	console.log(`U14 GameDay teams: ${output.total}`);

	console.log(`Already resolved: ${alreadyResolved}`);

	console.log(`Need review: ${review}`);

	console.log("");

	for (const result of results) {
		if (result.status === "already_resolved") {
			console.log(`✓ ${result.sourceNames?.join(" / ")} -> ${result.teamId}`);

			continue;
		}

		console.log(`? ${result.sourceNames?.join(" / ")}`);

		if ("candidates" in result && result.candidates) {
			for (const candidate of result.candidates) {
				console.log(
					`    ${candidate.score.toFixed(3)} -> ${candidate.teamId} (${candidate.displayName ?? candidate.canonicalName})`,
				);
			}
		}
	}

	console.log("");

	console.log(`Written: ${OUTPUT_FILE}`);
}

await main();
