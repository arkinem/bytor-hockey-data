import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { parse, stringify } from "yaml";

import { TeamSchema } from "../schema/index.js";

const TEAMS_DIR = join("data", "teams");

async function main() {
	const files = await readdir(TEAMS_DIR);

	const yamlFiles = files.filter((file) => [".yaml", ".yml"].includes(extname(file)));

	let updated = 0;
	let skipped = 0;

	for (const file of yamlFiles) {
		const path = join(TEAMS_DIR, file);

		const raw = parse(await readFile(path, "utf8"));

		const team = TeamSchema.parse(raw);

		const isEihaRecTeam = team.externalIds.some((externalId) => externalId.system === "eiharec");

		if (!isEihaRecTeam) {
			skipped += 1;
			continue;
		}

		if (raw.role === "recreational") {
			skipped += 1;
			continue;
		}

		const updatedTeam = TeamSchema.parse({
			...raw,
			role: "recreational",
		});

		await writeFile(
			path,
			stringify(updatedTeam, {
				lineWidth: 100,
			}),
			"utf8",
		);

		console.log(`✓ ${team.id} -> recreational`);

		updated += 1;
	}

	console.log("");
	console.log(`Updated: ${updated}`);
	console.log(`Skipped: ${skipped}`);
}

await main();
