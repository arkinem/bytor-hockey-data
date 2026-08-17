import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

import { stringify } from "yaml";

import { RinkSchema, type Rink } from "../schema/index.js";

const IMPORT_DATE = "2026-08-17";

const INPUT_FILE = join("imports", "eiharec", IMPORT_DATE, "rinks.json");

const OUTPUT_DIR = join("data", "rinks");

const SOURCE_ID = "eiharec";

type RawEihaRecRink = {
	id: string;
	name: string;
	city: string;
	coordinates: {
		latitude: number;
		longitude: number;
	};
};

function slugify(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function hasUsableCoordinates(coordinates: RawEihaRecRink["coordinates"]): boolean {
	return !(coordinates.latitude === 0 && coordinates.longitude === 0);
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

async function main() {
	const raw = JSON.parse(await readFile(INPUT_FILE, "utf8")) as RawEihaRecRink[];

	await mkdir(OUTPUT_DIR, { recursive: true });

	const slugCounts = new Map<string, number>();

	for (const rink of raw) {
		const baseSlug = slugify(rink.name);

		slugCounts.set(baseSlug, (slugCounts.get(baseSlug) ?? 0) + 1);
	}

	let created = 0;
	let skipped = 0;

	for (const rawRink of raw) {
		const baseSlug = slugify(rawRink.name);

		if (!baseSlug) {
			throw new Error(`Could not generate ID for EIHA Rec rink ${rawRink.id}`);
		}

		const id = (slugCounts.get(baseSlug) ?? 0) > 1 ? `${baseSlug}-eiharec-${rawRink.id}` : baseSlug;

		const rink: Rink = {
			id,

			name: rawRink.name,

			aliases: [],

			historicalNames: [],

			country: "GB",

			status: "unknown",

			externalIds: [
				{
					system: "eiharec",
					value: rawRink.id,
				},
			],

			sourceIds: [SOURCE_ID],

			...(rawRink.city.trim()
				? {
						city: rawRink.city.trim(),
					}
				: {}),

			...(hasUsableCoordinates(rawRink.coordinates)
				? {
						coordinates: rawRink.coordinates,
					}
				: {}),
		};

		const validated = RinkSchema.parse(rink);

		const outputFile = join(OUTPUT_DIR, `${validated.id}.yaml`);

		if (await fileExists(outputFile)) {
			console.log(`- skip ${validated.id}: already exists`);
			skipped += 1;
			continue;
		}

		await writeFile(
			outputFile,
			stringify(validated, {
				lineWidth: 100,
			}),
			"utf8",
		);

		console.log(`+ ${validated.id} <- EIHA Rec rink ${rawRink.id}`);

		created += 1;
	}

	console.log("");
	console.log(`Created: ${created}`);
	console.log(`Skipped: ${skipped}`);
	console.log(`Total source records: ${raw.length}`);
}

await main();
