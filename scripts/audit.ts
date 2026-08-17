import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { parse } from "yaml";

import { OrganisationSchema, RinkSchema, TeamSchema } from "../schema/index.js";
import { EntityNameIndex } from "./lib/entity-name-index.js";

async function loadYamlDirectory(directory: string): Promise<unknown[]> {
	const files = await readdir(join("data", directory));

	const yamlFiles = files.filter((file) => [".yaml", ".yml"].includes(extname(file)));

	return Promise.all(
		yamlFiles.map(async (file) => parse(await readFile(join("data", directory, file), "utf8"))),
	);
}

async function main() {
	const teams = (await loadYamlDirectory("teams")).map((data) => TeamSchema.parse(data));

	const rinks = (await loadYamlDirectory("rinks")).map((data) => RinkSchema.parse(data));

	const organisations = (await loadYamlDirectory("organisations")).map((data) =>
		OrganisationSchema.parse(data),
	);

	const teamsWithoutRink = teams.filter((team) => team.rinkIds.length === 0);

	const teamsWithoutLogo = teams.filter((team) => !team.logo);

	const teamsWithoutWebsite = teams.filter((team) => !team.website);

	const teamsWithoutContact = teams.filter((team) => !team.contact);

	const teamsWithoutTraining = teams.filter((team) => !team.training);

	const teamsWithOrganisation = teams.filter((team) => team.organisationId);

	const teamsWithoutOrganisation = teams.filter((team) => !team.organisationId);

	const organisationIdsUsedByTeams = new Set(
		teams.map((team) => team.organisationId).filter((id): id is string => Boolean(id)),
	);

	const organisationsWithoutTeams = organisations.filter(
		(organisation) => !organisationIdsUsedByTeams.has(organisation.id),
	);

	const teamsByRole = new Map<string, number>();

	for (const team of teams) {
		teamsByRole.set(team.role, (teamsByRole.get(team.role) ?? 0) + 1);
	}

	const teamNameIndex = new EntityNameIndex();

	for (const team of teams) {
		teamNameIndex.add(team);
	}

	const teamNames = new Set<string>();

	for (const team of teams) {
		teamNames.add(team.name);

		for (const alias of team.aliases) {
			teamNames.add(alias);
		}

		for (const historicalName of team.historicalNames) {
			teamNames.add(historicalName.name);
		}
	}

	const ambiguousTeamNames = [...teamNames]
		.map((name) => ({
			name,
			matches: teamNameIndex.find(name),
		}))
		.filter(({ matches }) => {
			const uniqueIds = new Set(matches.map((match) => match.id));

			return uniqueIds.size > 1;
		});

	const rinksWithoutCoordinates = rinks.filter((rink) => !rink.coordinates);

	const rinksWithoutCity = rinks.filter((rink) => !rink.city);

	console.log("Bytor Hockey Data Audit");
	console.log("=======================");
	console.log("");

	console.log(`Teams: ${teams.length}`);
	console.log(`Rinks: ${rinks.length}`);
	console.log("");

	console.log(`Teams without rink: ${teamsWithoutRink.length}`);
	console.log(`Teams without logo: ${teamsWithoutLogo.length}`);
	console.log(`Teams without website: ${teamsWithoutWebsite.length}`);
	console.log(`Teams without contact: ${teamsWithoutContact.length}`);
	console.log(`Teams without training: ${teamsWithoutTraining.length}`);
	console.log("");

	console.log("");
	console.log("Organisation relationships");
	console.log("--------------------------");

	console.log(`Organisations: ${organisations.length}`);
	console.log(`Teams with organisation: ${teamsWithOrganisation.length}`);
	console.log(`Teams without organisation: ${teamsWithoutOrganisation.length}`);
	console.log(`Organisations without teams: ${organisationsWithoutTeams.length}`);

	console.log("");
	console.log("Team roles");
	console.log("----------");

	for (const [role, count] of [...teamsByRole.entries()].sort()) {
		console.log(`${role}: ${count}`);
	}

	console.log("");
	console.log(`Rinks without coordinates: ${rinksWithoutCoordinates.length}`);
	console.log(`Rinks without city: ${rinksWithoutCity.length}`);

	console.log("");
	console.log("Entity identity");
	console.log("---------------");

	console.log(`Ambiguous team names/aliases: ${ambiguousTeamNames.length}`);

	for (const ambiguity of ambiguousTeamNames) {
		const ids = [...new Set(ambiguity.matches.map((match) => match.id))];

		console.log(`- "${ambiguity.name}" -> ${ids.join(", ")}`);
	}
}

await main();
