import { readFile, readdir, writeFile } from "node:fs/promises";

import { extname, join } from "node:path";

import { parse, stringify } from "yaml";

import { TeamSchema, type Team } from "../schema/index.js";

const SNAPSHOT_DATE = "2026-08-18";

const RECONCILIATION_FILE = join(
	"generated",
	"resolution",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday-u10-team-reconciliation.json",
);

const TEAMS_DIR = join("data", "teams");

type ReconciliationResult = {
	gameDayTeamId: string;

	sourceNames: string[];

	proposedId: string;

	proposedName: string;

	status: "existing_exact" | "existing_gameday" | "new" | "conflict";

	existingTeamId?: string;

	reason?: string;
};

type ReconciliationReport = {
	total: number;

	existingExact: number;

	existingGameDay: number;

	new: number;

	conflicts: number;

	results: ReconciliationResult[];
};

async function loadExistingTeams(): Promise<Map<string, Team>> {
	const files = await readdir(TEAMS_DIR);

	const teams = new Map<string, Team>();

	for (const file of files) {
		if (![".yaml", ".yml"].includes(extname(file))) {
			continue;
		}

		const team = TeamSchema.parse(parse(await readFile(join(TEAMS_DIR, file), "utf8")));

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

async function main(): Promise<void> {
	const reconciliation = JSON.parse(
		await readFile(RECONCILIATION_FILE, "utf8"),
	) as ReconciliationReport;

	if (reconciliation.conflicts !== 0) {
		throw new Error(
			`Cannot import U10 teams: reconciliation contains ${reconciliation.conflicts} conflict(s).`,
		);
	}

	const existingTeams = await loadExistingTeams();

	const gameDayOwners = buildGameDayOwners(existingTeams);

	let created = 0;
	let updated = 0;
	let unchanged = 0;

	for (const result of reconciliation.results) {
		if (result.status === "conflict") {
			throw new Error(`Unexpected conflict during import: GameDay ${result.gameDayTeamId}.`);
		}

		/*
		 * Existing canonical team already linked to
		 * this GameDay identity.
		 */
		if (result.status === "existing_gameday") {
			console.log(
				`- unchanged ${result.existingTeamId ?? result.proposedId} [gameday:${result.gameDayTeamId}]`,
			);

			unchanged += 1;

			continue;
		}

		/*
		 * Existing canonical ID, but GameDay identity
		 * still needs to be attached.
		 */
		if (result.status === "existing_exact") {
			const teamId = result.existingTeamId ?? result.proposedId;

			const existing = existingTeams.get(teamId);

			if (!existing) {
				throw new Error(`Expected existing Team ${teamId}.`);
			}

			const existingGameDayOwner = gameDayOwners.get(result.gameDayTeamId);

			if (existingGameDayOwner && existingGameDayOwner !== teamId) {
				throw new Error(
					`GameDay ${result.gameDayTeamId} already belongs to ${existingGameDayOwner}.`,
				);
			}

			const hasGameDayId = existing.externalIds.some(
				(externalId) =>
					externalId.system === "gameday" && externalId.value === result.gameDayTeamId,
			);

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

				sourceIds: [...new Set([...existing.sourceIds, "england-ice-hockey"])],
			};

			const validated = TeamSchema.parse(updatedTeam);

			await writeFile(
				join(TEAMS_DIR, `${validated.id}.yaml`),
				stringify(validated, {
					lineWidth: 100,
				}),
				"utf8",
			);

			existingTeams.set(validated.id, validated);

			gameDayOwners.set(result.gameDayTeamId, validated.id);

			console.log(`~ ${validated.id} <- gameday:${result.gameDayTeamId}`);

			updated += 1;

			continue;
		}

		/*
		 * Brand-new canonical U10 team.
		 */
		const existingById = existingTeams.get(result.proposedId);

		if (existingById) {
			throw new Error(
				`Canonical ID ${result.proposedId} appeared after reconciliation and already exists.`,
			);
		}

		const existingGameDayOwner = gameDayOwners.get(result.gameDayTeamId);

		if (existingGameDayOwner) {
			throw new Error(
				`GameDay ${result.gameDayTeamId} appeared after reconciliation and already belongs to ${existingGameDayOwner}.`,
			);
		}

		const aliases = [...new Set(result.sourceNames.filter((name) => name !== result.proposedName))];

		const team: Team = {
			id: result.proposedId,

			name: result.proposedName,

			aliases,

			historicalNames: [],

			country: "GB",

			categories: {
				gender: "open",

				age: "junior",

				ageBand: {
					max: 10,

					label: "U10",
				},
			},

			status: "active",

			role: "age_group",

			rinkIds: [],

			externalIds: [
				{
					system: "gameday",

					value: result.gameDayTeamId,
				},
			],

			sourceIds: ["england-ice-hockey"],

			sourceUrls: [],
		};

		const validated = TeamSchema.parse(team);

		await writeFile(
			join(TEAMS_DIR, `${validated.id}.yaml`),
			stringify(validated, {
				lineWidth: 100,
			}),
			"utf8",
		);

		existingTeams.set(validated.id, validated);

		gameDayOwners.set(result.gameDayTeamId, validated.id);

		console.log(`+ ${validated.id} <- gameday:${result.gameDayTeamId}`);

		created += 1;
	}

	console.log("");
	console.log("GameDay U10 team import");
	console.log("-----------------------");

	console.log(`Reconciled: ${reconciliation.total}`);

	console.log(`Created: ${created}`);

	console.log(`Updated: ${updated}`);

	console.log(`Unchanged: ${unchanged}`);

	const handled = created + updated + unchanged;

	console.log(`Handled: ${handled}`);

	if (handled !== reconciliation.total) {
		throw new Error(`U10 team import incomplete: handled ${handled}/${reconciliation.total}.`);
	}
}

await main();
