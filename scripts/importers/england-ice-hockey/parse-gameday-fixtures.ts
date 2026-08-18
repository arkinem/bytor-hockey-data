import * as cheerio from "cheerio";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SNAPSHOT_DATE = "2026-08-18";
const COMPETITION_ID = "652480";

const INPUT_FILE = join(
	"imports",
	"england-ice-hockey",
	SNAPSHOT_DATE,
	"gameday",
	"competitions",
	COMPETITION_ID,
	"fixture.html",
);

function cleanText(value = ""): string {
	return value
		.replace(/\u00a0/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

async function main(): Promise<void> {
	const html = await readFile(INPUT_FILE, "utf8");

	const $ = cheerio.load(html);

	const matches = $(".match-wrap");

	console.log(`match-wrap elements: ${matches.length}`);

	console.log("");

	matches.slice(0, 3).each((index, match) => {
		const element = $(match);

		console.log(`========== MATCH ${index + 1} ==========`);

		console.log("");

		console.log("TEXT:");

		console.log(cleanText(element.text()));

		console.log("");

		console.log("HTML:");

		console.log($.html(element));

		console.log("");
	});
}

await main();
