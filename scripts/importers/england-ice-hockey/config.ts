export type EnglandCompetitionDestination = {
	competitionSeasonId: string;

	competitionGroupId?: string;
};

export type EnglandJuniorCompetitionConfig = {
	sourceId: string;

	season: string;

	ageGroup: string;

	ageMax: number;

	sourceUrl: string;

	competitions: Record<string, EnglandCompetitionDestination>;
};
