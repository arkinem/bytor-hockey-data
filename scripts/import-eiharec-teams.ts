import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

import { stringify } from "yaml";

import { TeamSchema, type Team } from "../schema/index.js";
import { buildExternalIdIndex } from "./lib/external-id-index.js";
import { classifyWebsite } from "./lib/classify-website.js";

const IMPORT_DATE = "2026-08-17";

const INPUT_FILE = join("imports", "eiharec", IMPORT_DATE, "teams.json");

const OUTPUT_DIR = join("data", "teams");

const SOURCE_ID = "eiharec";

type RawEihaRecTeam = {
	id: string;
	name: string;

	rinkId: string;
	rinkName: string;

	training: string;

	manager: {
		name: string;
		phone: string;
		email: string;
	};

	website: string;
	logo: string;
	eihaUrl: string;
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

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

function optionalContact(manager: RawEihaRecTeam["manager"]): Team["contact"] | undefined {
	const contact = {
		...(manager.name.trim() ? { name: manager.name.trim() } : {}),

		...(manager.email.trim() ? { email: manager.email.trim() } : {}),

		...(manager.phone.trim() ? { phone: manager.phone.trim() } : {}),
	};

	return Object.keys(contact).length > 0 ? contact : undefined;
}

function isTechnicalPlaceholder(team: RawEihaRecTeam): boolean {
	return [
		"BUIHA Teams - Permission Required",
		"IHNI Rec Team - Permission Required",
		"NON EIH/UK Team - Permission Required",
		"Scottish Rec Team - Permission Required",
	].includes(team.name);
}

async function main() {
	const raw = JSON.parse(await readFile(INPUT_FILE, "utf8")) as RawEihaRecTeam[];

	await mkdir(OUTPUT_DIR, { recursive: true });

	const externalIds = await buildExternalIdIndex();

	const slugCounts = new Map<string, number>();

	for (const team of raw) {
		const slug = slugify(team.name);

		slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
	}

	let created = 0;
	let skipped = 0;

	for (const rawTeam of raw) {
		if (isTechnicalPlaceholder(rawTeam)) {
			console.log(`~ skip technical placeholder ${rawTeam.id}: ${rawTeam.name}`);

			skipped += 1;
			continue;
		}

		const baseSlug = slugify(rawTeam.name);

		if (!baseSlug) {
			throw new Error(`Could not generate ID for EIHA Rec team ${rawTeam.id}`);
		}

		const id = (slugCounts.get(baseSlug) ?? 0) > 1 ? `${baseSlug}-eiharec-${rawTeam.id}` : baseSlug;

		const contact = optionalContact(rawTeam.manager);

		const rinkId = rawTeam.rinkId ? externalIds.resolveRink("eiharec", rawTeam.rinkId) : undefined;

		if (rawTeam.rinkId && !rinkId) {
			throw new Error(
				`Could not resolve EIHA Rec rink ${rawTeam.rinkId} ` +
					`for team ${rawTeam.id} (${rawTeam.name})`,
			);
		}

		const web = classifyWebsite(rawTeam.website);

		const team: Team = {
			id,

			name: rawTeam.name.trim(),

			aliases: [],

			historicalNames: [],

			country: "GB",

			categories: {
				age: "senior",
				gender: "open",
			},

			status: "active",

			role: "recreational",

			rinkIds: rinkId ? [rinkId] : [],

			externalIds: [
				{
					system: "eiharec",
					value: rawTeam.id,
				},
			],

			sourceIds: [SOURCE_ID],

			sourceUrls: rawTeam.eihaUrl ? [rawTeam.eihaUrl] : [],

			...(web
				? {
						website: web.website,
					}
				: {}),

			...(web?.facebook || web?.instagram
				? {
						socials: {
							...(web.facebook ? { facebook: web.facebook } : {}),
							...(web.instagram ? { instagram: web.instagram } : {}),
						},
					}
				: {}),

			...(contact
				? {
						contact,
					}
				: {}),

			...(rawTeam.training.trim()
				? {
						training: {
							raw: rawTeam.training.trim(),
						},
					}
				: {}),

			...(rawTeam.logo
				? {
						logo: {
							path: rawTeam.logo,
							quality: "unknown",
						},
					}
				: {}),
		};

		const validated = TeamSchema.parse(team);

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

		console.log(`+ ${validated.id} <- EIHA Rec team ${rawTeam.id}`);

		created += 1;
	}

	console.log("");
	console.log(`Created: ${created}`);
	console.log(`Skipped: ${skipped}`);
	console.log(`Total source records: ${raw.length}`);
}

await main();
