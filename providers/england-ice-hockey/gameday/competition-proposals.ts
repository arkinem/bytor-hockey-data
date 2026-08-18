import type { RawGameDayJuniorSnapshot } from "./types.js";

export type GameDayCompetitionProposalKind = "competition" | "competition_group" | "deferred_event";

export type GameDayCompetitionProposal = {
	gameDayCompetitionId: string;

	sourceName: string;

	ageGroup: string;

	kind: GameDayCompetitionProposalKind;

	proposedCompetitionId?: string;

	proposedParentCompetitionId?: string;

	proposedGroupName?: string;

	notes?: string;
};

export type GameDayCompetitionProposalReport = {
	source: "gameday";

	snapshotDate: string;

	seasonId: string;

	seasonLabel: string;

	total: number;

	competitions: number;

	groups: number;

	deferred: number;

	proposals: GameDayCompetitionProposal[];
};

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function ageRootId(ageGroup: string): string {
	return `junior-${ageGroup.toLowerCase()}`;
}

function classifyCompetition(
	id: string,
	name: string,
	ageGroup: string,
): GameDayCompetitionProposal {
	/*
	 * Tournament/event-like competitions.
	 *
	 * We deliberately defer these until Event /
	 * EventEdition exists in the canonical model.
	 */
	if (name === "Junior Challenge Matches" || /Junior Nationals?$/i.test(name)) {
		return {
			gameDayCompetitionId: id,

			sourceName: name,

			ageGroup,

			kind: "deferred_event",

			notes: "Deferred until tournament/event modelling is introduced.",
		};
	}

	/*
	 * U14 North 2 is represented by GameDay as
	 * two competition IDs, but canonically we
	 * already model it as one CompetitionSeason
	 * with East/West CompetitionGroups.
	 */
	const u14North2 = name.match(/^U14 North 2 \((East|West)\)$/i);

	if (u14North2?.[1]) {
		return {
			gameDayCompetitionId: id,

			sourceName: name,

			ageGroup,

			kind: "competition_group",

			proposedParentCompetitionId: "junior-u14-north-2",

			proposedGroupName: u14North2[1],
		};
	}

	/*
	 * Standard age-group competitions.
	 *
	 * Examples:
	 *
	 * U12 North 1
	 * U12 South 2
	 * U16 North 1
	 * U19 National
	 */
	const agePrefix = new RegExp(`^${ageGroup}\\s+`, "i");

	const suffix = name.replace(agePrefix, "");

	return {
		gameDayCompetitionId: id,

		sourceName: name,

		ageGroup,

		kind: "competition",

		proposedCompetitionId: `${ageRootId(ageGroup)}-${slugify(suffix)}`,

		proposedParentCompetitionId: ageRootId(ageGroup),
	};
}

export function proposeGameDayCompetitions(
	snapshot: RawGameDayJuniorSnapshot,
): GameDayCompetitionProposalReport {
	const proposals = snapshot.competitions.map((competition) =>
		classifyCompetition(competition.id, competition.name, competition.ageGroup),
	);

	return {
		source: "gameday",

		snapshotDate: snapshot.snapshotDate,

		seasonId: snapshot.seasonId,

		seasonLabel: snapshot.seasonLabel,

		total: proposals.length,

		competitions: proposals.filter((proposal) => proposal.kind === "competition").length,

		groups: proposals.filter((proposal) => proposal.kind === "competition_group").length,

		deferred: proposals.filter((proposal) => proposal.kind === "deferred_event").length,

		proposals,
	};
}
