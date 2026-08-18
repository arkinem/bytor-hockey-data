export type RawEnglandJuniorCompetition = {
	sourceId: string;

	name: string;

	ageGroup: string;

	parentName?: string;

	url: string;
};

export type RawEnglandJuniorTeam = {
	sourceId?: string;

	name: string;

	ageGroup: string;

	rinkName?: string;

	organisationName?: string;

	url?: string;
};

export type RawEnglandJuniorFixtureObservation = {
	competitionName: string;

	teamNames: string[];

	season: string;

	sourceUrl: string;
};

export type RawEnglandJuniorParticipation = {
	competitionName: string;
	teamName: string;
	season: string;
	sourceUrl: string;
};
