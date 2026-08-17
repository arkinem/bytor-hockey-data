import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { parse } from "yaml";

import { RinkSchema, TeamSchema } from "../schema/index.js";

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

	const teamsWithoutRink = teams.filter((team) => team.rinkIds.length === 0);

	const teamsWithoutLogo = teams.filter((team) => !team.logo);

	const teamsWithoutWebsite = teams.filter((team) => !team.website);

	const teamsWithoutContact = teams.filter((team) => !team.contact);

	const teamsWithoutTraining = teams.filter((team) => !team.training);

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

	console.log(`Rinks without coordinates: ${rinksWithoutCoordinates.length}`);
	console.log(`Rinks without city: ${rinksWithoutCity.length}`);
}

await main();
