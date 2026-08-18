import type { RawEnglandJuniorParticipation } from "./types.js";

import { normalizeEntityName } from "../../lib/normalize-name.js";

import type { TeamResolutionReport } from "./resolve-teams.js";

export type EnglandTeamProposal = {
	sourceName: string;

	proposedId: string;

	proposedName: string;

	categories: {
		gender: "open";
		age: "junior";
		ageBand: {
			max: number;
			label: string;
		};
	};

	role: "age_group";

	sourceId: string;

	sourceUrls: string[];
};

export type EnglandTeamProposalReport = {
	source: string;

	snapshotDate: string;

	ageGroup: string;

	totalProposals: number;

	idCollisions: number;

	collisions: Array<{
		proposedId: string;
		sourceNames: string[];
	}>;

	proposals: EnglandTeamProposal[];
};

type ProposeEnglandTeamsOptions = {
	source: string;

	snapshotDate: string;

	ageGroup: string;

	ageMax: number;

	participations: RawEnglandJuniorParticipation[];

	resolutionReport: TeamResolutionReport;
};

function slugify(value: string): string {
	return normalizeEntityName(value).replace(/\s+/g, "-");
}

function removeAgeGroupSuffix(value: string, ageGroup: string): string {
	const escaped = ageGroup.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	return value.replace(new RegExp(`\\s+${escaped}$`, "i"), "").trim();
}

function createProposedId(sourceName: string, ageGroup: string): string {
	const cleanName = removeAgeGroupSuffix(sourceName, ageGroup);

	return [slugify(cleanName), ageGroup.toLowerCase()].join("-");
}

function createProposedName(sourceName: string, ageGroup: string): string {
	const cleanName = removeAgeGroupSuffix(sourceName, ageGroup);

	return `${cleanName} ${ageGroup}`;
}

export function proposeEnglandTeams(
	options: ProposeEnglandTeamsOptions,
): EnglandTeamProposalReport {
	const unresolvedNames = new Set(
		options.resolutionReport.results
			.filter((result) => result.status === "unresolved")
			.map((result) => result.sourceName),
	);

	const proposals: EnglandTeamProposal[] = [...unresolvedNames].sort().map((sourceName) => {
		const sourceUrls = [
			...new Set(
				options.participations
					.filter((participation) => participation.teamName === sourceName)
					.map((participation) => participation.sourceUrl),
			),
		];

		return {
			sourceName,

			proposedId: createProposedId(sourceName, options.ageGroup),

			proposedName: createProposedName(sourceName, options.ageGroup),

			categories: {
				gender: "open",
				age: "junior",
				ageBand: {
					max: options.ageMax,

					label: options.ageGroup,
				},
			},

			role: "age_group",

			sourceId: options.source,

			sourceUrls,
		};
	});

	const proposedIds = new Map<string, string[]>();

	for (const proposal of proposals) {
		const names = proposedIds.get(proposal.proposedId) ?? [];

		names.push(proposal.sourceName);

		proposedIds.set(proposal.proposedId, names);
	}

	const collisions = [...proposedIds.entries()]
		.filter(([, names]) => names.length > 1)
		.map(([proposedId, sourceNames]) => ({
			proposedId,
			sourceNames,
		}));

	return {
		source: options.source,

		snapshotDate: options.snapshotDate,

		ageGroup: options.ageGroup,

		totalProposals: proposals.length,

		idCollisions: collisions.length,

		collisions,

		proposals,
	};
}
