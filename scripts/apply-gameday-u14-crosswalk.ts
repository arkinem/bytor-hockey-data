import { readFile, readdir, writeFile } from "node:fs/promises";

import { extname, join } from "node:path";

import { parse, stringify } from "yaml";

import { TeamSchema, type Team } from "../schema/index.js";

const MAPPING_FILE = join("data", "mappings", "england-ice-hockey", "gameday-u14-2025-26.yaml");

const TEAMS_DIR = join("data", "teams");

type MappingFile = {
	source: string;

	season: string;

	ageGroup: string;

	mappings: Record<string, string>;

	unresolved: Record<
		string,
		{
			sourceName: string;
			reason: string;
		}
	>;
};

async function loadTeams(): Promise<Map<string, Team>> {
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

async function main(): Promise<void> {
	const mapping = parse(await readFile(MAPPING_FILE, "utf8")) as MappingFile;

	const teams = await loadTeams();

	const gameDayOwners = new Map<string, string>();

	for (const team of teams.values()) {
		for (const externalId of team.externalIds) {
			if (externalId.system !== "gameday") {
				continue;
			}

			const existing = gameDayOwners.get(externalId.value);

			if (existing && existing !== team.id) {
				throw new Error(
					`GameDay ID ${externalId.value} already belongs to both ${existing} and ${team.id}.`,
				);
			}

			gameDayOwners.set(externalId.value, team.id);
		}
	}

	let updated = 0;
	let unchanged = 0;

	for (const [gameDayTeamId, teamId] of Object.entries(mapping.mappings)) {
		const team = teams.get(teamId);

		if (!team) {
			throw new Error(`Mapped canonical Team does not exist: ${teamId}`);
		}

		const existingOwner = gameDayOwners.get(gameDayTeamId);

		if (existingOwner && existingOwner !== teamId) {
			throw new Error(
				`GameDay ID ${gameDayTeamId} already belongs to ${existingOwner}, cannot assign it to ${teamId}.`,
			);
		}

		const alreadyHasId = team.externalIds.some(
			(externalId) => externalId.system === "gameday" && externalId.value === gameDayTeamId,
		);

		const alreadyHasSource = team.sourceIds.includes("england-ice-hockey");

		if (alreadyHasId && alreadyHasSource) {
			console.log(`- unchanged ${teamId} [gameday:${gameDayTeamId}]`);

			unchanged += 1;

			continue;
		}

		const updatedTeam: Team = {
			...team,

			externalIds: alreadyHasId
				? team.externalIds
				: [
						...team.externalIds,
						{
							system: "gameday",

							value: gameDayTeamId,
						},
					],

			sourceIds: [...new Set([...team.sourceIds, "england-ice-hockey"])],
		};

		const validated = TeamSchema.parse(updatedTeam);

		await writeFile(
			join(TEAMS_DIR, `${validated.id}.yaml`),
			stringify(validated, {
				lineWidth: 100,
			}),
			"utf8",
		);

		gameDayOwners.set(gameDayTeamId, teamId);

		console.log(`~ ${teamId} <- gameday:${gameDayTeamId}`);

		updated += 1;
	}

	console.log("");
	console.log(`Mapped: ${Object.keys(mapping.mappings).length}`);

	console.log(`Updated: ${updated}`);

	console.log(`Unchanged: ${unchanged}`);

	console.log(`Unresolved: ${Object.keys(mapping.unresolved).length}`);
}

await main();
