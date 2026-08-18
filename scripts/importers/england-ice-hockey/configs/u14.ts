import type { EnglandJuniorCompetitionConfig } from "../config.js";

export const ENGLAND_U14_CONFIG = {
	sourceId: "england-ice-hockey",

	season: "2025/26",

	ageGroup: "U14",

	ageMax: 14,

	sourceUrl: "https://englandicehockey.com/under-14s-league-tables/",

	competitions: {
		"North 1": {
			competitionSeasonId: "junior-u14-north-1-2025-26",
		},

		"North 2E": {
			competitionSeasonId: "junior-u14-north-2-2025-26",

			competitionGroupId: "junior-u14-north-2-2025-26-east",
		},

		"North 2W": {
			competitionSeasonId: "junior-u14-north-2-2025-26",

			competitionGroupId: "junior-u14-north-2-2025-26-west",
		},

		"South 1": {
			competitionSeasonId: "junior-u14-south-1-2025-26",
		},

		"South 2": {
			competitionSeasonId: "junior-u14-south-2-2025-26",
		},
	},
} as const satisfies EnglandJuniorCompetitionConfig;

export type EnglandU14CompetitionName = keyof typeof ENGLAND_U14_CONFIG.competitions;
