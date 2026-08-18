import { ENGLAND_U14_CONFIG } from "./u14.js";

import type { EnglandJuniorCompetitionConfig } from "../config.js";

export const ENGLAND_JUNIOR_CONFIGS = {
	U14: ENGLAND_U14_CONFIG,
} as const satisfies Record<string, EnglandJuniorCompetitionConfig>;

export type EnglandJuniorAgeGroup = keyof typeof ENGLAND_JUNIOR_CONFIGS;

export function getEnglandJuniorConfig(
	ageGroup: EnglandJuniorAgeGroup,
): EnglandJuniorCompetitionConfig {
	return ENGLAND_JUNIOR_CONFIGS[ageGroup];
}
