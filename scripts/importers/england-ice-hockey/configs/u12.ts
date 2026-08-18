import type { EnglandJuniorCompetitionConfig } from "../config.js";

export const ENGLAND_U12_CONFIG = {
	sourceId: "england-ice-hockey",

	season: "2025/26",

	ageGroup: "U12",

	ageMax: 12,

	sourceUrl: "https://englandicehockey.com/under-12s-league-tables/",

	competitions: {},
} as const satisfies EnglandJuniorCompetitionConfig;
