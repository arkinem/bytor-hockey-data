import { join } from "node:path";

export function getEnglandJuniorSnapshotDir(snapshotDate: string): string {
	return join("imports", "england-ice-hockey", snapshotDate, "juniors");
}

export function getEnglandJuniorParticipationsFile(snapshotDate: string, ageGroup: string): string {
	return join(
		getEnglandJuniorSnapshotDir(snapshotDate),
		`${ageGroup.toLowerCase()}-participations.json`,
	);
}

export function getEnglandJuniorCompetitionsFile(snapshotDate: string, ageGroup: string): string {
	return join(
		getEnglandJuniorSnapshotDir(snapshotDate),
		`${ageGroup.toLowerCase()}-competitions.json`,
	);
}

export function getEnglandJuniorHtmlSnapshotFile(snapshotDate: string, ageGroup: string): string {
	return join(getEnglandJuniorSnapshotDir(snapshotDate), `${ageGroup.toLowerCase()}-page.html`);
}

export function getEnglandResolutionDir(snapshotDate: string): string {
	return join("generated", "resolution", "england-ice-hockey", snapshotDate);
}

export function getEnglandTeamResolutionFile(snapshotDate: string, ageGroup: string): string {
	return join(
		getEnglandResolutionDir(snapshotDate),
		`${ageGroup.toLowerCase()}-team-resolution.json`,
	);
}

export function getEnglandProposalDir(snapshotDate: string): string {
	return join("generated", "proposals", "england-ice-hockey", snapshotDate);
}

export function getEnglandTeamProposalsFile(snapshotDate: string, ageGroup: string): string {
	return join(getEnglandProposalDir(snapshotDate), `${ageGroup.toLowerCase()}-team-proposals.json`);
}
