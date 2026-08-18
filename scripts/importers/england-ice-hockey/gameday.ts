import * as cheerio from "cheerio";

const GAMEDAY_BASE_URL = "https://websites.mygameday.app";

const ORGANISATION_ID = "12997";
const SITE_ID = "6041164";

const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
	"AppleWebKit/537.36 (KHTML, like Gecko) " +
	"Chrome/151.0.0.0 Safari/537.36";

export type GameDayCompetition = {
	id: string;

	name: string;

	client: string;

	ageGroup: "U10" | "U12" | "U14" | "U16" | "U19" | "unknown";

	kind: "league" | "national" | "challenge" | "unknown";
};

type GameDayCompetitionResponse = {
	errors: unknown[];
	data: string;
};

type GameDaySession = {
	cookie: string;
	referer: string;
};

function cleanText(value: string): string {
	return value
		.replace(/\u00a0/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function extractCompetitionId(client: string): string | null {
	const parts = client.split("-");

	const competitionId = parts[3];

	if (!competitionId || competitionId === "0") {
		return null;
	}

	return competitionId;
}

function detectAgeGroup(name: string): GameDayCompetition["ageGroup"] {
	const match = name.match(/\bU(10|12|14|16|19)\b/i);

	if (!match?.[1]) {
		return "unknown";
	}

	return `U${match[1]}` as GameDayCompetition["ageGroup"];
}

function detectCompetitionKind(name: string): GameDayCompetition["kind"] {
	const normalized = name.toLowerCase();

	if (normalized.includes("challenge")) {
		return "challenge";
	}

	if (normalized.includes("national")) {
		return "national";
	}

	if (detectAgeGroup(name) !== "unknown") {
		return "league";
	}

	return "unknown";
}

function extractCookies(response: Response): string {
	const headers = response.headers;

	/*
	 * Node 22 exposes getSetCookie().
	 */
	const setCookies = headers.getSetCookie();

	return setCookies
		.map((cookie) => cookie.split(";")[0]?.trim())
		.filter((cookie): cookie is string => Boolean(cookie))
		.join("; ");
}

async function createGameDaySession(competitionId: string): Promise<GameDaySession> {
	const referer =
		`${GAMEDAY_BASE_URL}/comp_info.cgi` +
		`?c=0-${ORGANISATION_ID}-0-${competitionId}-0` +
		"&a=STATS";

	const response = await fetch(referer, {
		headers: {
			"User-Agent": USER_AGENT,

			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

			"Accept-Language": "en-GB,en;q=0.9",
		},

		redirect: "follow",
	});

	if (!response.ok) {
		throw new Error(`GameDay session bootstrap failed: HTTP ${response.status}`);
	}

	/*
	 * Consume response body.
	 */
	await response.text();

	return {
		cookie: extractCookies(response),

		referer,
	};
}

export async function fetchGameDayCompetitions(
	selectedCompetitionId: string,
): Promise<GameDayCompetition[]> {
	const session = await createGameDaySession(selectedCompetitionId);

	const url = new URL("/aj_complist.cgi", GAMEDAY_BASE_URL);

	url.searchParams.set("sID", SITE_ID);

	url.searchParams.set("c", `0-${ORGANISATION_ID}-0-xxxcompid-0`);

	url.searchParams.set("selectedComp", selectedCompetitionId);

	const headers: Record<string, string> = {
		"User-Agent": USER_AGENT,

		Accept: "application/json, text/javascript, */*; q=0.01",

		"Accept-Language": "en-GB,en;q=0.9",

		Referer: session.referer,

		"X-Requested-With": "XMLHttpRequest",
	};

	if (session.cookie) {
		headers.Cookie = session.cookie;
	}

	const response = await fetch(url, {
		headers,
		redirect: "follow",
	});

	if (!response.ok) {
		throw new Error(`GameDay competition request failed: HTTP ${response.status}`);
	}

	const payload = (await response.json()) as GameDayCompetitionResponse;

	if (payload.errors.length) {
		throw new Error(`GameDay returned ${payload.errors.length} error(s).`);
	}

	const $ = cheerio.load(`<select>${payload.data}</select>`);

	const competitions: GameDayCompetition[] = [];

	$("option").each((_, option) => {
		const element = $(option);

		const client = element.attr("value");

		if (!client) {
			return;
		}

		const id = extractCompetitionId(client);

		if (!id) {
			return;
		}

		const name = cleanText(element.text());

		if (!name) {
			return;
		}

		competitions.push({
			id,

			name,

			client,

			ageGroup: detectAgeGroup(name),

			kind: detectCompetitionKind(name),
		});
	});

	return competitions;
}

export type GameDayCompetitionAction = "STATS" | "FIXTURE" | "LADDER";

export async function fetchGameDayCompetitionPage(
	competitionId: string,
	action: GameDayCompetitionAction,
): Promise<string> {
	const url =
		`${GAMEDAY_BASE_URL}/comp_info.cgi` +
		`?c=0-${ORGANISATION_ID}-0-${competitionId}-0` +
		`&a=${action}`;

	const response = await fetch(url, {
		headers: {
			"User-Agent": USER_AGENT,

			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

			"Accept-Language": "en-GB,en;q=0.9",
		},

		redirect: "follow",
	});

	if (!response.ok) {
		throw new Error(`GameDay competition page failed: HTTP ${response.status}`);
	}

	return response.text();
}
