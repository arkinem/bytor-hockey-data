export type RawGameDayFixtureTeam = {
	id: string;
	name: string;
};

export type RawGameDayFixture = {
	fixtureId: string;

	competitionId: string;
	competitionName: string;

	round: string;

	isBye: boolean;

	homeTeam: RawGameDayFixtureTeam;

	awayTeam?: RawGameDayFixtureTeam;

	dateTime: string;

	venue?: string;

	matchUrl?: string;
};

export type RawGameDayFixturePage = {
	competitionId: string;

	fixtures: RawGameDayFixture[];
};

type GameDayRawMatch = {
	FixtureID?: string | number;

	CompID?: string | number;
	CompName?: string;

	Round?: string | number;

	isBye?: boolean | number;

	HomeID?: string | number;
	HomeName?: string;

	AwayID?: string | number;
	AwayName?: string;

	TimeDateRaw?: string;

	VenueName?: string;

	DetailedResultsURL?: string;
};

function cleanText(value: string | undefined): string {
	return (value ?? "")
		.replace(/\u00a0/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function requiredString(value: string | number | undefined, field: string): string {
	if (value === undefined || value === null || String(value).trim() === "") {
		throw new Error(`Missing ${field} in GameDay fixture.`);
	}

	return String(value);
}

function extractMatchesJson(html: string): string {
	const marker = "var matches = ";

	const start = html.indexOf(marker);

	if (start === -1) {
		throw new Error('Could not find "var matches =" in GameDay fixture page.');
	}

	const jsonStart = start + marker.length;

	/*
	 * The value is JSON followed by a semicolon.
	 * We cannot simply search for the first "]"
	 * because strings inside the payload may
	 * theoretically contain brackets.
	 *
	 * Walk the JSON while respecting quoted strings.
	 */
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let index = jsonStart; index < html.length; index += 1) {
		const char = html[index];

		if (inString) {
			if (escaped) {
				escaped = false;

				continue;
			}

			if (char === "\\") {
				escaped = true;

				continue;
			}

			if (char === '"') {
				inString = false;
			}

			continue;
		}

		if (char === '"') {
			inString = true;

			continue;
		}

		if (char === "[") {
			depth += 1;

			continue;
		}

		if (char === "]") {
			depth -= 1;

			if (depth === 0) {
				return html.slice(jsonStart, index + 1);
			}
		}
	}

	throw new Error("Could not find end of GameDay matches JSON.");
}

export function parseGameDayFixtures(
	html: string,
	expectedCompetitionId: string,
): RawGameDayFixturePage {
	const json = extractMatchesJson(html);

	const rawMatches = JSON.parse(json) as GameDayRawMatch[];

	const fixtures: RawGameDayFixture[] = [];

	for (const raw of rawMatches) {
		const competitionId = requiredString(raw.CompID, "CompID");

		if (competitionId !== expectedCompetitionId) {
			throw new Error(
				`Fixture competition mismatch: expected ${expectedCompetitionId}, got ${competitionId}.`,
			);
		}

		const fixtureId = requiredString(raw.FixtureID, "FixtureID");

		const homeId = requiredString(raw.HomeID, "HomeID");

		const homeName = cleanText(raw.HomeName);

		if (!homeName) {
			throw new Error(`Fixture ${fixtureId} has no HomeName.`);
		}

		const isBye = raw.isBye === true || raw.isBye === 1;

		const dateTime = cleanText(raw.TimeDateRaw);

		const fixture: RawGameDayFixture = {
			fixtureId,

			competitionId,

			competitionName: cleanText(raw.CompName),

			round: requiredString(raw.Round, "Round"),

			isBye,

			homeTeam: {
				id: homeId,

				name: homeName,
			},

			dateTime,

			...(cleanText(raw.VenueName)
				? {
						venue: cleanText(raw.VenueName),
					}
				: {}),

			...(raw.DetailedResultsURL
				? {
						matchUrl: raw.DetailedResultsURL,
					}
				: {}),
		};

		/*
		 * Bye entries deliberately have only one
		 * participating team.
		 */
		if (!isBye) {
			const awayId = requiredString(raw.AwayID, "AwayID");

			const awayName = cleanText(raw.AwayName);

			if (!awayName) {
				throw new Error(`Fixture ${fixtureId} has no AwayName.`);
			}

			fixture.awayTeam = {
				id: awayId,

				name: awayName,
			};
		}

		fixtures.push(fixture);
	}

	return {
		competitionId: expectedCompetitionId,

		fixtures,
	};
}
