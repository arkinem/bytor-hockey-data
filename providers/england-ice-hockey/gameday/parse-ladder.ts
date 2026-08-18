import * as cheerio from "cheerio";

export type RawGameDayStanding = {
	position: number;

	teamId: string;

	teamName: string;

	played: number;

	wins: number;

	losses: number;

	draws: number;

	points: number;

	goalsFor: number;

	goalsAgainst: number;

	goalDifference: number;

	lastFive: string;
};

export type RawGameDayLadder = {
	competitionId: string;

	competitionName: string;

	seasonId?: string;

	seasonLabel?: string;

	lastUploaded?: string;

	standings: RawGameDayStanding[];
};

function cleanText(value = ""): string {
	return value
		.replace(/\u00a0/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function parseInteger(value: string, field: string): number {
	const parsed = Number.parseInt(value, 10);

	if (Number.isNaN(parsed)) {
		throw new Error(`Invalid integer for ${field}: "${value}"`);
	}

	return parsed;
}

function extractTeamId(href: string): string | null {
	const match = href.match(/[?&]id=(\d+)/);

	return match?.[1] ?? null;
}

function extractCompetitionName($: cheerio.CheerioAPI): string {
	const title = cleanText($("title").text());

	const match = title.match(/^Table for (.+?) - GameDay$/i);

	if (!match?.[1]) {
		throw new Error(`Could not extract competition name from title: "${title}"`);
	}

	return cleanText(match[1]);
}

function extractSeason($: cheerio.CheerioAPI): {
	seasonId?: string;
	seasonLabel?: string;
} {
	const selected = $("#id_seasonID option:selected");

	const seasonId = selected.attr("value");

	const seasonLabel = cleanText(selected.text());

	return {
		...(seasonId
			? {
					seasonId,
				}
			: {}),

		...(seasonLabel
			? {
					seasonLabel,
				}
			: {}),
	};
}

function extractLastUploaded($: cheerio.CheerioAPI): string | undefined {
	const text = cleanText($(".last-updated").text());

	const match = text.match(/Last Uploaded:\s*(.+?)(?:\||$)/i);

	return match?.[1] ? cleanText(match[1]) : undefined;
}

export function parseGameDayLadder(html: string, competitionId: string): RawGameDayLadder {
	const $ = cheerio.load(html);

	const competitionName = extractCompetitionName($);

	const { seasonId, seasonLabel } = extractSeason($);

	const lastUploaded = extractLastUploaded($);

	const table = $("#stats-table");

	if (!table.length) {
		throw new Error(`Could not find ladder table for competition ${competitionId}.`);
	}

	const standings: RawGameDayStanding[] = [];

	table.find("tbody tr").each((_, row) => {
		const cells = $(row)
			.find("td")
			.map((_, cell) => cleanText($(cell).text()))
			.get();

		if (cells.length < 12) {
			throw new Error(
				`Unexpected ladder row shape for competition ${competitionId}: ${cells.length} cells`,
			);
		}

		const teamLink = $(row).find("td.ladder-team-col a").first();

		const href = teamLink.attr("href");

		if (!href) {
			throw new Error(`Missing team link in competition ${competitionId}.`);
		}

		const teamId = extractTeamId(href);

		if (!teamId) {
			throw new Error(`Could not extract GameDay team ID from "${href}".`);
		}

		const teamName = cleanText(teamLink.text());

		standings.push({
			position: parseInteger(cells[0] ?? "", "position"),

			teamId,

			teamName,

			played: parseInteger(cells[3] ?? "", "played"),

			wins: parseInteger(cells[4] ?? "", "wins"),

			losses: parseInteger(cells[5] ?? "", "losses"),

			draws: parseInteger(cells[6] ?? "", "draws"),

			points: parseInteger(cells[7] ?? "", "points"),

			goalsFor: parseInteger(cells[8] ?? "", "goalsFor"),

			goalsAgainst: parseInteger(cells[9] ?? "", "goalsAgainst"),

			goalDifference: parseInteger(cells[10] ?? "", "goalDifference"),

			lastFive: cells[11] ?? "",
		});
	});

	if (!standings.length) {
		throw new Error(`No ladder standings found for competition ${competitionId}.`);
	}

	return {
		competitionId,

		competitionName,

		...(seasonId
			? {
					seasonId,
				}
			: {}),

		...(seasonLabel
			? {
					seasonLabel,
				}
			: {}),

		...(lastUploaded
			? {
					lastUploaded,
				}
			: {}),

		standings,
	};
}
