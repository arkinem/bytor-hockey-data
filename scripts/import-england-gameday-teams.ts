import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";

import { extname, join } from "node:path";

import { parse, stringify } from "yaml";

import { TeamSchema, type Team } from "../schema/index.js";

const SNAPSHOT_DATE = "2026-08-18";

const RESOLUTION_FILE = join(
	"generated",
	"resolution",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday-team-resolution.json",
);

const PROPOSALS_FILE = join(
	"generated",
	"proposals",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday-teams.json",
);

const TEAMS_DIR = join("data", "teams");

type ResolutionCandidate = {
	teamId: string;

	canonicalName: string;

	reason:
		| "gameday_external_id"
		| "canonical_name"
		| "alias"
		| "historical_name"
		| "age_group_context";

	matchedValue: string;
};

type ResolutionResult = {
	gameDayTeamId: string;

	sourceNames: string[];

	ageGroups: string[];

	competitionIds: string[];

	status: "resolved" | "ambiguous" | "unresolved";

	candidates: ResolutionCandidate[];
};

type ResolutionReport = {
	total: number;

	resolved: number;

	ambiguous: number;

	unresolved: number;

	results: ResolutionResult[];
};

type Proposal = {
	gameDayTeamId: string;

	sourceNames: string[];

	ageGroups: string[];

	competitionIds: string[];

	status: "new_team" | "source_anomaly";

	proposedId?: string;

	proposedName?: string;

	reason?: string;
};

type ProposalReport = {
	unresolvedInput: number;

	newTeams: number;

	anomalies: number;

	idCollisions: number;

	proposals: Proposal[];
};

async function loadExistingTeams(): Promise<Map<string, Team>> {
	const files = await readdir(TEAMS_DIR);

	const teams = new Map<string, Team>();

	for (const file of files) {
		if (![".yaml", ".yml"].includes(extname(file))) {
			continue;
		}

		const raw = parse(await readFile(join(TEAMS_DIR, file), "utf8"));

		const team = TeamSchema.parse(raw);

		teams.set(team.id, team);
	}

	return teams;
}

function buildGameDayOwners(teams: Map<string, Team>): Map<string, string> {
	const owners = new Map<string, string>();

	for (const team of teams.values()) {
		for (const externalId of team.externalIds) {
			if (externalId.system !== "gameday") {
				continue;
			}

			const existing = owners.get(externalId.value);

			if (existing && existing !== team.id) {
				throw new Error(
					`GameDay ID ${externalId.value} belongs to both ${existing} and ${team.id}.`,
				);
			}

			owners.set(externalId.value, team.id);
		}
	}

	return owners;
}

function ageMaxFromGroup(ageGroup: string): number {
	const match = ageGroup.match(/^U(\d+)$/);

	if (!match?.[1]) {
		throw new Error(`Invalid junior age group: ${ageGroup}`);
	}

	return Number.parseInt(match[1], 10);
}

async function writeTeam(team: Team): Promise<void> {
	const validated = TeamSchema.parse(team);

	await writeFile(
		join(TEAMS_DIR, `${validated.id}.yaml`),
		stringify(validated, {
			lineWidth: 100,
		}),
		"utf8",
	);
}

async function main(): Promise<void> {
	const resolution = JSON.parse(await readFile(RESOLUTION_FILE, "utf8")) as ResolutionReport;

	const proposalReport = JSON.parse(await readFile(PROPOSALS_FILE, "utf8")) as ProposalReport;

	if (resolution.ambiguous !== 0) {
		throw new Error(
			`Cannot import GameDay teams: resolution contains ${resolution.ambiguous} ambiguous team(s).`,
		);
	}

	if (proposalReport.idCollisions !== 0) {
		throw new Error(
			`Cannot import GameDay teams: proposal file contains ${proposalReport.idCollisions} ID collision(s).`,
		);
	}

	const unresolvedResults = resolution.results.filter((result) => result.status === "unresolved");

	if (unresolvedResults.length !== proposalReport.unresolvedInput) {
		throw new Error(
			`Resolution/proposal mismatch: ${unresolvedResults.length} unresolved teams but proposal report expects ${proposalReport.unresolvedInput}.`,
		);
	}

	const proposalByGameDayId = new Map(
		proposalReport.proposals.map((proposal) => [proposal.gameDayTeamId, proposal]),
	);

	for (const unresolved of unresolvedResults) {
		if (!proposalByGameDayId.has(unresolved.gameDayTeamId)) {
			throw new Error(
				`Unresolved GameDay team ${unresolved.gameDayTeamId} has no proposal/anomaly decision.`,
			);
		}
	}

	await mkdir(TEAMS_DIR, {
		recursive: true,
	});

	const existingTeams = await loadExistingTeams();

	const gameDayOwners = buildGameDayOwners(existingTeams);

	let created = 0;
	let updated = 0;
	let unchanged = 0;
	let anomaliesExcluded = 0;

	console.log("GameDay junior team import");

	console.log("");

	for (const result of resolution.results) {
		if (result.status === "ambiguous") {
			throw new Error(`Unexpected ambiguous GameDay team ${result.gameDayTeamId}.`);
		}

		/*
		 * --------------------------------
		 * Existing canonical identity
		 * --------------------------------
		 */
		if (result.status === "resolved") {
			if (result.candidates.length !== 1) {
				throw new Error(
					`Resolved GameDay team ${result.gameDayTeamId} does not have exactly one candidate.`,
				);
			}

			const candidate = result.candidates[0];

			if (!candidate) {
				throw new Error(`Resolved GameDay team ${result.gameDayTeamId} has no candidate.`);
			}

			const existing = existingTeams.get(candidate.teamId);

			if (!existing) {
				throw new Error(`Resolved canonical Team ${candidate.teamId} does not exist.`);
			}

			const existingOwner = gameDayOwners.get(result.gameDayTeamId);

			if (existingOwner && existingOwner !== existing.id) {
				throw new Error(
					`GameDay ID ${result.gameDayTeamId} belongs to ${existingOwner}, but resolution selected ${existing.id}.`,
				);
			}

			const hasGameDayId = existing.externalIds.some(
				(externalId) =>
					externalId.system === "gameday" && externalId.value === result.gameDayTeamId,
			);

			const hasSource = existing.sourceIds.includes("england-ice-hockey");

			if (hasGameDayId && hasSource) {
				console.log(`- unchanged ${existing.id} [gameday:${result.gameDayTeamId}]`);

				unchanged += 1;

				continue;
			}

			const updatedTeam: Team = {
				...existing,

				externalIds: hasGameDayId
					? existing.externalIds
					: [
							...existing.externalIds,
							{
								system: "gameday",

								value: result.gameDayTeamId,
							},
						],

				sourceIds: hasSource ? existing.sourceIds : [...existing.sourceIds, "england-ice-hockey"],
			};

			await writeTeam(updatedTeam);

			const validated = TeamSchema.parse(updatedTeam);

			existingTeams.set(validated.id, validated);

			gameDayOwners.set(result.gameDayTeamId, validated.id);

			console.log(`~ ${validated.id} <- gameday:${result.gameDayTeamId} (${candidate.reason})`);

			updated += 1;

			continue;
		}

		/*
		 * --------------------------------
		 * Unresolved provider identity
		 * --------------------------------
		 */
		const proposal = proposalByGameDayId.get(result.gameDayTeamId);

		if (!proposal) {
			throw new Error(`Missing proposal for unresolved GameDay team ${result.gameDayTeamId}.`);
		}

		if (proposal.status === "source_anomaly") {
			console.log(
				`! excluded ${proposal.gameDayTeamId} ${proposal.sourceNames.join(" / ")}: ${proposal.reason ?? "source anomaly"}`,
			);

			anomaliesExcluded += 1;

			continue;
		}

		if (!proposal.proposedId || !proposal.proposedName) {
			throw new Error(`Incomplete new-team proposal for GameDay ${proposal.gameDayTeamId}.`);
		}

		if (proposal.ageGroups.length !== 1) {
			throw new Error(
				`Expected exactly one age group for new GameDay team ${proposal.gameDayTeamId}.`,
			);
		}

		const ageGroup = proposal.ageGroups[0];

		if (!ageGroup) {
			throw new Error(`Missing age group for GameDay ${proposal.gameDayTeamId}.`);
		}

		const existingById = existingTeams.get(proposal.proposedId);

		const existingByGameDay = gameDayOwners.get(proposal.gameDayTeamId);

		/*
		 * Resolution said this identity was unresolved.
		 * If canonical data changed between resolve and
		 * import, stop and require a fresh resolution
		 * rather than guessing.
		 */
		if (existingById || existingByGameDay) {
			throw new Error(
				`Canonical data changed after resolution for GameDay ${proposal.gameDayTeamId}. Run team resolution again before importing.`,
			);
		}

		const aliases = [
			...new Set(proposal.sourceNames.filter((name) => name !== proposal.proposedName)),
		];

		const team: Team = {
			id: proposal.proposedId,

			name: proposal.proposedName,

			aliases,

			historicalNames: [],

			country: "GB",

			categories: {
				gender: "open",

				age: "junior",

				ageBand: {
					max: ageMaxFromGroup(ageGroup),

					label: ageGroup,
				},
			},

			status: "active",

			role: "age_group",

			rinkIds: [],

			externalIds: [
				{
					system: "gameday",

					value: proposal.gameDayTeamId,
				},
			],

			sourceIds: ["england-ice-hockey"],

			sourceUrls: [],
		};

		const validated = TeamSchema.parse(team);

		await writeTeam(validated);

		existingTeams.set(validated.id, validated);

		gameDayOwners.set(proposal.gameDayTeamId, validated.id);

		console.log(`+ ${validated.id} <- gameday:${proposal.gameDayTeamId}`);

		created += 1;
	}

	const handled = created + updated + unchanged + anomaliesExcluded;

	console.log("");
	console.log("Import summary");
	console.log("--------------");

	console.log(`Provider teams: ${resolution.total}`);

	console.log(`Created: ${created}`);

	console.log(`Updated: ${updated}`);

	console.log(`Unchanged: ${unchanged}`);

	console.log(`Anomalies excluded: ${anomaliesExcluded}`);

	console.log(`Handled: ${handled}`);

	if (handled !== resolution.total) {
		throw new Error(`GameDay team import incomplete: handled ${handled}/${resolution.total}.`);
	}

	if (anomaliesExcluded !== proposalReport.anomalies) {
		throw new Error(
			`Anomaly count mismatch: excluded ${anomaliesExcluded}, proposal report contains ${proposalReport.anomalies}.`,
		);
	}
}

await main();
