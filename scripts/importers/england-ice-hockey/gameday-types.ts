export type RawGameDayJuniorCompetition = {
	id: string;

	name: string;

	ageGroup: "U10" | "U12" | "U14" | "U16" | "U19" | "unknown";

	kind: "league" | "national" | "challenge" | "unknown";

	hasLadder: boolean;
};

export type RawGameDayJuniorTeam = {
	id: string;

	names: string[];

	ageGroups: string[];

	competitionIds: string[];
};

export type RawGameDayJuniorParticipation = {
	teamId: string;

	teamName: string;

	competitionId: string;

	competitionName: string;

	ageGroup: string;
};

export type RawGameDayJuniorStanding = {
	teamId: string;

	competitionId: string;

	position: number;

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

export type RawGameDayJuniorSnapshot = {
	source: "gameday";

	snapshotDate: string;

	seasonId: string;

	seasonLabel: string;

	competitions: RawGameDayJuniorCompetition[];

	teams: RawGameDayJuniorTeam[];

	participations: RawGameDayJuniorParticipation[];

	standings: RawGameDayJuniorStanding[];
};
