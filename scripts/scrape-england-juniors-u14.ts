import * as cheerio from "cheerio";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
	RawEnglandJuniorCompetition,
	RawEnglandJuniorParticipation,
} from "./importers/england-ice-hockey/types.js";

const SOURCE_URL = "https://englandicehockey.com/under-14s-league-tables/";

const SNAPSHOT_DATE = "2026-08-18";

const OUTPUT_DIR = join("imports", "england-ice-hockey", SNAPSHOT_DATE, "juniors");

const HTML_SNAPSHOT_FILE = join(OUTPUT_DIR, "u14-page.html");

const COMPETITIONS_FILE = join(OUTPUT_DIR, "u14-competitions.json");

const PARTICIPATIONS_FILE = join(OUTPUT_DIR, "u14-participations.json");

const HEADERS = {
	"User-Agent": "Mozilla/5.0 (compatible; BytorHockeyDataImporter/1.0; +https://bytorhockey.co.uk)",

	Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

	"Accept-Language": "en-GB,en;q=0.9",
};

function cleanText(value = ""): string {
	return value
		.replace(/\u00a0/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function looksLikeChallengePage(html: string): boolean {
	const lower = html.toLowerCase();

	return (
		lower.includes("please wait while your request is being verified") ||
		lower.includes("checking your browser") ||
		lower.includes("just a moment")
	);
}

async function fetchHtml(): Promise<string> {
	const response = await fetch(SOURCE_URL, {
		headers: HEADERS,
		redirect: "follow",
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status} ${response.statusText}`);
	}

	const html = await response.text();

	if (looksLikeChallengePage(html)) {
		throw new Error(
			"England Ice Hockey returned an anti-bot verification page instead of league data.",
		);
	}

	return html;
}

type StatsRow = [string, string, ...string[]];

function isStatsRow(values: string[]): values is StatsRow {
	const teamName = values[0];
	const gamesPlayed = values[1];

	if (!teamName || !gamesPlayed) {
		return false;
	}

	return /^\d+$/.test(gamesPlayed);
}

function getLogicalCells($: cheerio.CheerioAPI, row: ReturnType<cheerio.CheerioAPI>): string[] {
	const cells: string[] = [];

	row.children("td").each((_, cell) => {
		const element = $(cell);

		const text = cleanText(element.text());

		const colspanRaw = element.attr("colspan");

		const colspan = colspanRaw ? Number.parseInt(colspanRaw, 10) : 1;

		cells.push(text);

		for (let index = 1; index < colspan; index += 1) {
			cells.push("");
		}
	});

	return cells;
}

function parsePage(html: string): {
	competitions: RawEnglandJuniorCompetition[];
	participations: RawEnglandJuniorParticipation[];
} {
	const $ = cheerio.load(html);

	const leagueTable = $("table")
		.toArray()
		.find((table) => {
			const text = cleanText($(table).text());

			return (
				text.includes("U14 South1") &&
				text.includes("U14 North1") &&
				text.includes("U14 South2") &&
				text.includes("U14 North2")
			);
		});

	if (!leagueTable) {
		throw new Error("Could not find U14 league table.");
	}

	const competitionNames = new Set<string>();

	const participations: RawEnglandJuniorParticipation[] = [];

	let leftCompetition: string | null = null;

	let rightCompetition: string | null = null;

	$(leagueTable)
		.find("tr")
		.each((_, row) => {
			/*
			 * IMPORTANT:
			 *
			 * The source uses colspan heavily.
			 * We expand every colspan into logical
			 * empty cells so that the table always
			 * follows its real 21-column layout:
			 *
			 * 0..9   = left table
			 * 10     = separator
			 * 11..20 = right table
			 */
			const cells = getLogicalCells($, $(row));

			if (!cells.length) {
				return;
			}

			const left = cells.slice(0, 10);

			const right = cells.slice(11, 21);

			const leftHeading = left[0] ?? "";

			const rightHeading = right[0] ?? "";

			/*
			 * Left competition headings.
			 */

			if (leftHeading === "U14 South1") {
				leftCompetition = "South 1";

				competitionNames.add(leftCompetition);
			}

			if (leftHeading === "U14 South2") {
				leftCompetition = "South 2";

				competitionNames.add(leftCompetition);
			}

			/*
			 * Right competition headings.
			 */

			if (rightHeading === "U14 North1") {
				rightCompetition = "North 1";

				competitionNames.add(rightCompetition);
			}

			/*
			 * U14 North2 is a parent
			 * heading. Its actual groups
			 * are N2 EAST and N2 WEST.
			 */
			if (rightHeading === "U14 North2") {
				rightCompetition = null;
			}

			if (rightHeading === "N2 EAST") {
				rightCompetition = "North 2E";

				competitionNames.add(rightCompetition);
			}

			if (rightHeading === "N2 WEST") {
				rightCompetition = "North 2W";

				competitionNames.add(rightCompetition);
			}

			/*
			 * Actual standings rows.
			 */

			if (leftCompetition && isStatsRow(left)) {
				participations.push({
					competitionName: leftCompetition,

					teamName: left[0],

					season: "2025/26",

					sourceUrl: SOURCE_URL,
				});
			}

			if (rightCompetition && isStatsRow(right)) {
				participations.push({
					competitionName: rightCompetition,

					teamName: right[0],

					season: "2025/26",

					sourceUrl: SOURCE_URL,
				});
			}
		});

	const uniqueParticipations = [
		...new Map(
			participations.map((participation) => [
				[participation.competitionName, participation.teamName, participation.season].join("|"),

				participation,
			]),
		).values(),
	];

	const competitions: RawEnglandJuniorCompetition[] = [...competitionNames].sort().map((name) => ({
		sourceId: `U14 ${name}`,

		name,

		ageGroup: "U14",

		parentName: "Junior Ice Hockey League",

		url: SOURCE_URL,
	}));

	uniqueParticipations.sort((a, b) => {
		const competitionCompare = a.competitionName.localeCompare(b.competitionName);

		if (competitionCompare !== 0) {
			return competitionCompare;
		}

		return a.teamName.localeCompare(b.teamName);
	});

	return {
		competitions,
		participations: uniqueParticipations,
	};
}

async function main(): Promise<void> {
	console.log("England Ice Hockey U14 scraper");

	console.log(`Source: ${SOURCE_URL}`);
	console.log("");

	const html = await fetchHtml();

	await mkdir(OUTPUT_DIR, {
		recursive: true,
	});

	/*
	 * Preserve the exact source HTML used for
	 * this snapshot.
	 */
	await writeFile(HTML_SNAPSHOT_FILE, html, "utf8");

	const { competitions, participations } = parsePage(html);

	if (competitions.length !== 5) {
		throw new Error(
			`Expected 5 U14 competitions, found ${competitions.length}: ` +
				competitions.map((competition) => competition.name).join(", "),
		);
	}

	if (!participations.length) {
		throw new Error("No U14 team participations found. Page structure may have changed.");
	}

	await writeFile(COMPETITIONS_FILE, JSON.stringify(competitions, null, 2), "utf8");

	await writeFile(PARTICIPATIONS_FILE, JSON.stringify(participations, null, 2), "utf8");

	console.log(`Competitions found: ${competitions.length}`);

	for (const competition of competitions) {
		const count = participations.filter(
			(participation) => participation.competitionName === competition.name,
		).length;

		console.log(`- ${competition.name}: ${count} teams`);
	}

	console.log("");

	console.log(`Team participations: ${participations.length}`);

	console.log("");

	console.log(`Written: ${COMPETITIONS_FILE}`);

	console.log(`Written: ${PARTICIPATIONS_FILE}`);

	console.log(`Written: ${HTML_SNAPSHOT_FILE}`);
}

try {
	await main();
} catch (error) {
	console.log("Error during scraping:", error);
}
