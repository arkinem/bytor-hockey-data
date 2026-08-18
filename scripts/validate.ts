import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

import { parse } from "yaml";
import type { ZodType } from "zod";

import {
	CompetitionGroupSchema,
	CompetitionSchema,
	CompetitionSeasonSchema,
	OrganisationSchema,
	RinkSchema,
	SourceSchema,
	TeamParticipationSchema,
	TeamSchema,
} from "../schema/index.js";

const DATA_DIR = "data";

async function loadYamlDirectory(
	directory: string,
): Promise<Array<{ file: string; data: unknown }>> {
	const path = join(DATA_DIR, directory);
	const files = await readdir(path);

	const yamlFiles = files.filter((file) => [".yaml", ".yml"].includes(extname(file)));

	return Promise.all(
		yamlFiles.map(async (file) => ({
			file,
			data: parse(await readFile(join(path, file), "utf8")),
		})),
	);
}

async function validateDirectory(directory: string, schema: ZodType, label: string): Promise<void> {
	const records = await loadYamlDirectory(directory);

	for (const { file, data } of records) {
		const result = schema.safeParse(data);

		if (!result.success) {
			console.error(`✗ data/${directory}/${file}`);
			console.error(result.error.issues);

			process.exitCode = 1;

			continue;
		}

		console.log(`✓ data/${directory}/${file}`);
	}

	console.log(`\n${records.length} ${label}(s) checked.`);
}

type EntityWithExternalIds = {
	id: string;
	externalIds: Array<{
		system: string;
		value: string;
	}>;
};

function validateExternalIds(entityType: string, entities: EntityWithExternalIds[]): void {
	const index = new Map<string, string>();

	for (const entity of entities) {
		for (const externalId of entity.externalIds) {
			const key = `${externalId.system}:${externalId.value}`;
			const existingEntityId = index.get(key);

			if (existingEntityId) {
				console.error(
					`✗ duplicate ${entityType} external ID "${key}" ` +
						`used by "${existingEntityId}" and "${entity.id}"`,
				);

				process.exitCode = 1;

				continue;
			}

			index.set(key, entity.id);
		}
	}
}

type EntityWithHistoricalNames = {
	id: string;
	historicalNames: Array<{
		name: string;
		sourceIds: string[];
	}>;
};

function validateHistoricalNameSources(
	entityType: string,
	entities: EntityWithHistoricalNames[],
	sourceIds: Set<string>,
): void {
	for (const entity of entities) {
		for (const historicalName of entity.historicalNames) {
			for (const sourceId of historicalName.sourceIds) {
				if (!sourceIds.has(sourceId)) {
					console.error(
						`✗ ${entityType} "${entity.id}" historical name ` +
							`"${historicalName.name}" references unknown source "${sourceId}"`,
					);

					process.exitCode = 1;
				}
			}
		}
	}
}

async function validateReferences(): Promise<void> {
	const sourceRecords = await loadYamlDirectory("sources");
	const rinkRecords = await loadYamlDirectory("rinks");
	const teamRecords = await loadYamlDirectory("teams");
	const organisationRecords = await loadYamlDirectory("organisations");
	const competitionRecords = await loadYamlDirectory("competitions");
	const competitionSeasonRecords = await loadYamlDirectory("competition-seasons");
	const teamParticipationRecords = await loadYamlDirectory("team-participations");
	const competitionGroupRecords = await loadYamlDirectory("competition-groups");

	const sources = sourceRecords.map(({ data }) => SourceSchema.parse(data));

	const rinks = rinkRecords.map(({ data }) => RinkSchema.parse(data));

	const teams = teamRecords.map(({ data }) => TeamSchema.parse(data));

	const sourceIds = new Set(sources.map((source) => source.id));

	const rinkIds = new Set(rinks.map((rink) => rink.id));

	const organisations = organisationRecords.map(({ data }) => OrganisationSchema.parse(data));

	const competitions = competitionRecords.map(({ data }) => CompetitionSchema.parse(data));

	const competitionSeasons = competitionSeasonRecords.map(({ data }) =>
		CompetitionSeasonSchema.parse(data),
	);

	const competitionGroups = competitionGroupRecords.map(({ data }) =>
		CompetitionGroupSchema.parse(data),
	);

	const teamParticipations = teamParticipationRecords.map(({ data }) =>
		TeamParticipationSchema.parse(data),
	);

	const organisationIds = new Set(organisations.map((organisation) => organisation.id));

	const competitionIds = new Set(competitions.map((competition) => competition.id));

	const teamIds = new Set(teams.map((team) => team.id));

	const competitionSeasonIds = new Set(competitionSeasons.map((season) => season.id));

	const competitionGroupIds = new Set(competitionGroups.map((group) => group.id));

	for (const rink of rinks) {
		for (const sourceId of rink.sourceIds) {
			if (!sourceIds.has(sourceId)) {
				console.error(`✗ rink "${rink.id}" references unknown source "${sourceId}"`);

				process.exitCode = 1;
			}
		}
	}

	for (const team of teams) {
		if (team.organisationId && !organisationIds.has(team.organisationId)) {
			console.error(`✗ team "${team.id}" references unknown organisation "${team.organisationId}"`);

			process.exitCode = 1;
		}

		for (const sourceId of team.sourceIds) {
			if (!sourceIds.has(sourceId)) {
				console.error(`✗ team "${team.id}" references unknown source "${sourceId}"`);

				process.exitCode = 1;
			}
		}

		for (const rinkId of team.rinkIds) {
			if (!rinkIds.has(rinkId)) {
				console.error(`✗ team "${team.id}" references unknown rink "${rinkId}"`);

				process.exitCode = 1;
			}
		}
	}

	for (const competition of competitions) {
		if (competition.parentCompetitionId && !competitionIds.has(competition.parentCompetitionId)) {
			console.error(
				`✗ competition "${competition.id}" references unknown parent competition "${competition.parentCompetitionId}"`,
			);

			process.exitCode = 1;
		}

		for (const sourceId of competition.sourceIds) {
			if (!sourceIds.has(sourceId)) {
				console.error(`✗ competition "${competition.id}" references unknown source "${sourceId}"`);

				process.exitCode = 1;
			}
		}

		for (const organiserId of competition.organiserIds) {
			if (!organisationIds.has(organiserId)) {
				console.error(
					`✗ competition "${competition.id}" references unknown organiser "${organiserId}"`,
				);

				process.exitCode = 1;
			}
		}
	}

	for (const competitionSeason of competitionSeasons) {
		if (!competitionIds.has(competitionSeason.competitionId)) {
			console.error(
				`✗ competition season "${competitionSeason.id}" references unknown competition "${competitionSeason.competitionId}"`,
			);

			process.exitCode = 1;
		}

		for (const sourceId of competitionSeason.sourceIds) {
			if (!sourceIds.has(sourceId)) {
				console.error(
					`✗ competition season "${competitionSeason.id}" references unknown source "${sourceId}"`,
				);

				process.exitCode = 1;
			}
		}
	}

	for (const group of competitionGroups) {
		if (!competitionSeasonIds.has(group.competitionSeasonId)) {
			console.error(
				`✗ competition group "${group.id}" references unknown competition season "${group.competitionSeasonId}"`,
			);

			process.exitCode = 1;
		}

		for (const sourceId of group.sourceIds) {
			if (!sourceIds.has(sourceId)) {
				console.error(`✗ competition group "${group.id}" references unknown source "${sourceId}"`);

				process.exitCode = 1;
			}
		}
	}

	for (const participation of teamParticipations) {
		if (!teamIds.has(participation.teamId)) {
			console.error(
				`✗ team participation "${participation.id}" references unknown team "${participation.teamId}"`,
			);

			process.exitCode = 1;
		}

		if (!competitionSeasonIds.has(participation.competitionSeasonId)) {
			console.error(
				`✗ team participation "${participation.id}" references unknown competition season "${participation.competitionSeasonId}"`,
			);

			process.exitCode = 1;
		}

		if (
			participation.competitionGroupId &&
			!competitionGroupIds.has(participation.competitionGroupId)
		) {
			console.error(
				`✗ team participation "${participation.id}" references unknown competition group "${participation.competitionGroupId}"`,
			);

			process.exitCode = 1;
		}

		if (participation.competitionGroupId) {
			const group = competitionGroups.find(
				(group) => group.id === participation.competitionGroupId,
			);

			if (group && group.competitionSeasonId !== participation.competitionSeasonId) {
				console.error(
					`✗ team participation "${participation.id}" references group ` +
						`"${group.id}" from a different competition season`,
				);

				process.exitCode = 1;
			}
		}

		for (const sourceId of participation.sourceIds) {
			if (!sourceIds.has(sourceId)) {
				console.error(
					`✗ team participation "${participation.id}" references unknown source "${sourceId}"`,
				);

				process.exitCode = 1;
			}
		}
	}

	validateHistoricalNameSources("rink", rinks, sourceIds);
	validateHistoricalNameSources("team", teams, sourceIds);
	validateHistoricalNameSources("organisation", organisations, sourceIds);
	validateHistoricalNameSources("competition", competitions, sourceIds);

	validateExternalIds("rink", rinks);
	validateExternalIds("team", teams);
	validateExternalIds("competition", competitions);
	validateExternalIds("competition group", competitionGroups);
	validateExternalIds("competition season", competitionSeasons);

	if (!process.exitCode) {
		console.log("\n✓ Referential integrity passed.");
		console.log("✓ External IDs are unique.");
	}
}

await validateDirectory("sources", SourceSchema, "source");

await validateDirectory("organisations", OrganisationSchema, "organisation");

await validateDirectory("rinks", RinkSchema, "rink");

await validateDirectory("teams", TeamSchema, "team");

await validateDirectory("competitions", CompetitionSchema, "competition");

await validateDirectory("competition-seasons", CompetitionSeasonSchema, "competition season");

await validateDirectory("team-participations", TeamParticipationSchema, "team participation");

await validateDirectory("competition-groups", CompetitionGroupSchema, "competition group");

await validateReferences();

if (process.exitCode) {
	process.exit(process.exitCode);
}
