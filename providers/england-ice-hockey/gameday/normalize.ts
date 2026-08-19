import type { RawGameDayFixture } from "./parse-fixtures.js";

import type {
	NormalizedGameDayJuniorSnapshot,
	NormalizedGameDayJuniorTeam,
	RawGameDayJuniorSnapshot,
} from "./types.js";

type RawU10Team = {
	id: string;

	names: string[];

	competitionIds: string[];
};

type RawU10Participation = {
	teamId: string;

	teamName: string;

	competitionId: string;

	competitionName: string;
};

type RawU10Competition = {
	id: string;

	name: string;

	fixtureRecords: number;

	realGames: number;

	byes: number;

	teamIds: string[];
};

type RawU10Fixture = RawGameDayFixture & {
	sourceCompetitionId?: string;
};

export type RawGameDayU10Snapshot = {
	source: "gameday";

	snapshotDate: string;

	ageGroup: "U10";

	competitions: RawU10Competition[];

	teams: RawU10Team[];

	participations: RawU10Participation[];

	fixtures: RawU10Fixture[];
};

function participationKey(teamId: string, competitionId: string): string {
	return [teamId, competitionId].join("|");
}

function mergeTeams(
	juniors: RawGameDayJuniorSnapshot,
	u10: RawGameDayU10Snapshot,
): NormalizedGameDayJuniorTeam[] {
	const accumulator = new Map<
		string,
		{
			names: Set<string>;

			ageGroups: Set<string>;

			competitionIds: Set<string>;
		}
	>();

	function observe(
		id: string,
		names: string[],
		ageGroups: string[],
		competitionIds: string[],
	): void {
		const existing = accumulator.get(id) ?? {
			names: new Set<string>(),

			ageGroups: new Set<string>(),

			competitionIds: new Set<string>(),
		};

		for (const name of names) {
			existing.names.add(name);
		}

		for (const ageGroup of ageGroups) {
			existing.ageGroups.add(ageGroup);
		}

		for (const competitionId of competitionIds) {
			existing.competitionIds.add(competitionId);
		}

		accumulator.set(id, existing);
	}

	for (const team of juniors.teams) {
		observe(team.id, team.names, team.ageGroups, team.competitionIds);
	}

	for (const team of u10.teams) {
		observe(team.id, team.names, ["U10"], team.competitionIds);
	}

	return [...accumulator.entries()]
		.map(([id, value]) => ({
			id,

			names: [...value.names].sort(),

			ageGroups: [...value.ageGroups].sort(),

			competitionIds: [...value.competitionIds].sort(),
		}))
		.sort((a, b) => a.id.localeCompare(b.id));
}

export function normalizeGameDayJuniorSnapshot(
	juniors: RawGameDayJuniorSnapshot,
	u10: RawGameDayU10Snapshot,
): NormalizedGameDayJuniorSnapshot {
	if (juniors.source !== "gameday") {
		throw new Error(`Expected GameDay junior snapshot, got ${juniors.source}.`);
	}

	if (u10.source !== "gameday") {
		throw new Error(`Expected GameDay U10 snapshot, got ${u10.source}.`);
	}

	if (juniors.snapshotDate !== u10.snapshotDate) {
		throw new Error(
			`Snapshot date mismatch: juniors=${juniors.snapshotDate}, U10=${u10.snapshotDate}.`,
		);
	}

	const competitionById = new Map(
		juniors.competitions.map((competition) => [competition.id, competition]),
	);

	/*
	 * U10 competition metadata already exists in
	 * the main GameDay competition discovery.
	 *
	 * The U10 snapshot is therefore used to verify
	 * membership/fixtures, not to create a second
	 * competition catalogue.
	 */
	for (const competition of u10.competitions) {
		const discovered = competitionById.get(competition.id);

		if (!discovered) {
			throw new Error(
				`U10 competition ${competition.id} (${competition.name}) does not exist in GameDay competition discovery.`,
			);
		}

		if (discovered.ageGroup !== "U10") {
			throw new Error(
				`Competition ${competition.id} is ${discovered.ageGroup}, but U10 snapshot treats it as U10.`,
			);
		}
	}

	const participationMap = new Map<
		string,
		NormalizedGameDayJuniorSnapshot["participations"][number]
	>();

	for (const participation of juniors.participations) {
		const key = participationKey(participation.teamId, participation.competitionId);

		if (participationMap.has(key)) {
			throw new Error(`Duplicate junior participation ${key}.`);
		}

		participationMap.set(key, participation);
	}

	for (const participation of u10.participations) {
		const competition = competitionById.get(participation.competitionId);

		if (!competition) {
			throw new Error(
				`Missing competition metadata for U10 participation ${participation.teamId}/${participation.competitionId}.`,
			);
		}

		const key = participationKey(participation.teamId, participation.competitionId);

		if (participationMap.has(key)) {
			throw new Error(`U10 participation ${key} already exists in ladder-derived junior data.`);
		}

		participationMap.set(key, {
			teamId: participation.teamId,

			teamName: participation.teamName,

			competitionId: participation.competitionId,

			competitionName: participation.competitionName,

			ageGroup: "U10",
		});
	}

	const fixtures: RawGameDayFixture[] = u10.fixtures.map((fixture) => ({
		fixtureId: fixture.fixtureId,

		competitionId: fixture.competitionId,

		competitionName: fixture.competitionName,

		round: fixture.round,

		isBye: fixture.isBye,

		homeTeam: fixture.homeTeam,

		...(fixture.awayTeam
			? {
					awayTeam: fixture.awayTeam,
				}
			: {}),

		dateTime: fixture.dateTime,

		...(fixture.venue
			? {
					venue: fixture.venue,
				}
			: {}),

		...(fixture.matchUrl
			? {
					matchUrl: fixture.matchUrl,
				}
			: {}),
	}));

	const teams = mergeTeams(juniors, u10);

	return {
		provider: "gameday",

		snapshotDate: juniors.snapshotDate,

		seasonId: juniors.seasonId,

		seasonLabel: juniors.seasonLabel,

		competitions: juniors.competitions,

		teams,

		participations: [...participationMap.values()].sort((a, b) =>
			participationKey(a.teamId, a.competitionId).localeCompare(
				participationKey(b.teamId, b.competitionId),
			),
		),

		standings: juniors.standings,

		fixtures,
	};
}
