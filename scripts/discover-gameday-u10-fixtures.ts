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

	console.log("GameDay U10 fixture DOM discovery");

	console.log("");

	console.log(`Title: ${cleanText($("title").text())}`);

	console.log(`HTML length: ${html.length}`);

	console.log("");

	console.log("Interesting links");

	console.log("-----------------");

	$("a").each((_, anchor) => {
		const element = $(anchor);

		const href = element.attr("href") ?? "";

		const text = cleanText(element.text());

		if (
			/team_info|match|fixture|game|round|club|team/i.test(href) ||
			/team|fixture|round|game/i.test(text)
		) {
			console.log(`${text || "(no text)"} -> ${href}`);
		}
	});

	console.log("");
	console.log("Elements containing likely fixture text");
	console.log("---------------------------------------");

	const seen = new Set<string>();

	$("div, li, section, article").each((_, element) => {
		const text = cleanText($(element).text());

		if (text.length < 20 || text.length > 500) {
			return;
		}

		if (!/vs| v |fixture|round|bye|home|away|\d{1,2}:\d{2}/i.test(text)) {
			return;
		}

		if (seen.has(text)) {
			return;
		}

		seen.add(text);

		const className = $(element).attr("class") ?? "";

		const id = $(element).attr("id") ?? "";

		console.log("");
		console.log(`<${element.tagName} class="${className}" id="${id}">`);

		console.log(text);
	});

	console.log("");
	console.log("Classes containing fixture/team/game/round");
	console.log("------------------------------------------");

	const classes = new Set<string>();

	$("[class]").each((_, element) => {
		const value = $(element).attr("class");

		if (!value) {
			return;
		}

		for (const className of value.split(/\s+/)) {
			if (/fixture|team|game|match|round|result|schedule/i.test(className)) {
				classes.add(className);
			}
		}
	});

	for (const className of [...classes].sort()) {
		console.log(`- ${className}`);
	}
}

await main();
