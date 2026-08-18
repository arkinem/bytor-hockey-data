import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { parse } from "yaml";

import { RinkSchema, type Rink } from "../schema/index.js";

type ExternalIdKey = `${string}:${string}`;

export class ExternalIdIndex {
	private readonly rinks = new Map<ExternalIdKey, string>();

	addRink(rink: Rink) {
		for (const externalId of rink.externalIds) {
			const key = this.key(externalId.system, externalId.value);

			if (this.rinks.has(key)) {
				throw new Error(`Duplicate rink external ID: ${key}`);
			}

			this.rinks.set(key, rink.id);
		}
	}

	resolveRink(system: string, value: string): string | undefined {
		return this.rinks.get(this.key(system, value));
	}

	private key(system: string, value: string): ExternalIdKey {
		return `${system}:${value}`;
	}
}

async function loadYamlDirectory(directory: string): Promise<unknown[]> {
	const files = await readdir(directory);

	const yamlFiles = files.filter((file) => [".yaml", ".yml"].includes(extname(file)));

	return Promise.all(
		yamlFiles.map(async (file) => parse(await readFile(join(directory, file), "utf8"))),
	);
}

export async function buildExternalIdIndex() {
	const index = new ExternalIdIndex();

	const rawRinks = await loadYamlDirectory(join("data", "rinks"));

	for (const rawRink of rawRinks) {
		index.addRink(RinkSchema.parse(rawRink));
	}

	return index;
}
