import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

import { parse } from "yaml";
import type { ZodType } from "zod";

import { OrganisationSchema, RinkSchema, SourceSchema, TeamSchema } from "../schema/index.js";

const DATA_DIR = "data";

async function loadYamlDirectory(
	directory: string,
): Promise<Array<{ file: string; data: unknown }>> {
	const path = join(DATA_DIR, directory);
	const files = await readdir(path);

	const yamlFiles = files.filter((file) => [".yaml", ".yml"].includes(extname(file)));

	return Promise.all(
		yamlFiles.map(async (file) => ({
			file,
			data: parse(await readFile(join(path, file), "utf8")),
		})),
	);
}

async function validateDirectory(directory: string, schema: ZodType, label: string): Promise<void> {
	const records = await loadYamlDirectory(directory);

	for (const { file, data } of records) {
		const result = schema.safeParse(data);

		if (!result.success) {
			console.error(`✗ data/${directory}/${file}`);
			console.error(result.error.issues);

			process.exitCode = 1;

			continue;
		}

		console.log(`✓ data/${directory}/${file}`);
	}

	console.log(`\n${records.length} ${label}(s) checked.`);
}

type EntityWithExternalIds = {
	id: string;
	externalIds: Array<{
		system: string;
		value: string;
	}>;
};

function validateExternalIds(entityType: string, entities: EntityWithExternalIds[]): void {
	const index = new Map<string, string>();

	for (const entity of entities) {
		for (const externalId of entity.externalIds) {
			const key = `${externalId.system}:${externalId.value}`;
			const existingEntityId = index.get(key);

			if (existingEntityId) {
				console.error(
					`✗ duplicate ${entityType} external ID "${key}" ` +
						`used by "${existingEntityId}" and "${entity.id}"`,
				);

				process.exitCode = 1;

				continue;
			}

			index.set(key, entity.id);
		}
	}
}

async function validateReferences(): Promise<void> {
	const sourceRecords = await loadYamlDirectory("sources");
	const rinkRecords = await loadYamlDirectory("rinks");
	const teamRecords = await loadYamlDirectory("teams");

	const sources = sourceRecords.map(({ data }) => SourceSchema.parse(data));

	const rinks = rinkRecords.map(({ data }) => RinkSchema.parse(data));

	const teams = teamRecords.map(({ data }) => TeamSchema.parse(data));

	const sourceIds = new Set(sources.map((source) => source.id));

	const rinkIds = new Set(rinks.map((rink) => rink.id));

	for (const rink of rinks) {
		for (const sourceId of rink.sourceIds) {
			if (!sourceIds.has(sourceId)) {
				console.error(`✗ rink "${rink.id}" references unknown source "${sourceId}"`);

				process.exitCode = 1;
			}
		}
	}

	for (const team of teams) {
		for (const sourceId of team.sourceIds) {
			if (!sourceIds.has(sourceId)) {
				console.error(`✗ team "${team.id}" references unknown source "${sourceId}"`);

				process.exitCode = 1;
			}
		}

		for (const rinkId of team.rinkIds) {
			if (!rinkIds.has(rinkId)) {
				console.error(`✗ team "${team.id}" references unknown rink "${rinkId}"`);

				process.exitCode = 1;
			}
		}
	}

	validateExternalIds("rink", rinks);
	validateExternalIds("team", teams);

	if (!process.exitCode) {
		console.log("\n✓ Referential integrity passed.");
		console.log("✓ External IDs are unique.");
	}
}

await validateDirectory("sources", SourceSchema, "source");

await validateDirectory("organisations", OrganisationSchema, "organisation");

await validateDirectory("rinks", RinkSchema, "rink");

await validateDirectory("teams", TeamSchema, "team");

await validateReferences();

if (process.exitCode) {
	process.exit(process.exitCode);
}
