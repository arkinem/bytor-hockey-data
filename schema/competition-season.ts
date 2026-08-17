import { z } from "zod";

import { EntityIdSchema, EntityStatusSchema } from "./common.js";

export const SeasonSchema = z.object({
	startYear: z.number().int().min(1900).max(2200),

	endYear: z.number().int().min(1900).max(2200).optional(),

	label: z.string().min(1),
});

export type Season = z.infer<typeof SeasonSchema>;

export const CompetitionSeasonSchema = z.object({
	id: EntityIdSchema,

	competitionId: EntityIdSchema,

	season: SeasonSchema,

	status: EntityStatusSchema,

	sourceIds: z.array(EntityIdSchema).default([]),

	notes: z.string().optional(),
});

export type CompetitionSeason = z.infer<typeof CompetitionSeasonSchema>;
