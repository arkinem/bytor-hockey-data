import type { RawEnglandJuniorParticipation } from "./types.js";

import type { EnglandJuniorCompetitionConfig } from "./config.js";

export type EnglandConfigCheckResult = {
	sourceCompetitions: string[];

	configuredCompetitions: string[];

	missingConfig: string[];

	unusedConfig: string[];
};

export function checkEnglandJuniorConfig(
	participations: RawEnglandJuniorParticipation[],
	config: EnglandJuniorCompetitionConfig,
): EnglandConfigCheckResult {
	const sourceCompetitions = [
		...new Set(participations.map((participation) => participation.competitionName)),
	].sort();

	const configuredCompetitions = Object.keys(config.competitions).sort();

	const missingConfig = sourceCompetitions.filter((name) => !(name in config.competitions));

	const unusedConfig = configuredCompetitions.filter((name) => !sourceCompetitions.includes(name));

	return {
		sourceCompetitions,
		configuredCompetitions,
		missingConfig,
		unusedConfig,
	};
}
