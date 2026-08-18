import { z } from "zod";

import {
	CountryCodeSchema,
	EntityIdSchema,
	EntityStatusSchema,
	ExternalIdSchema,
	HistoricalNameSchema,
	HockeyCategoriesSchema,
} from "./common.js";

export const CompetitionTypeSchema = z.enum([
	"league",
	"cup",
	"championship",
	"tournament",
	"friendly_series",
	"other",
]);

export type CompetitionType = z.infer<typeof CompetitionTypeSchema>;

export const CompetitionSchema = z.object({
	id: EntityIdSchema,

	name: z.string().min(1),

	aliases: z.array(z.string().min(1)).default([]),

	historicalNames: z.array(HistoricalNameSchema).default([]),

	type: CompetitionTypeSchema,

	country: CountryCodeSchema,

	categories: HockeyCategoriesSchema,

	status: EntityStatusSchema,

	parentCompetitionId: EntityIdSchema.optional(),

	organiserIds: z.array(EntityIdSchema).default([]),

	website: z.url().optional(),

	externalIds: z.array(ExternalIdSchema).default([]),

	sourceIds: z.array(EntityIdSchema).default([]),

	notes: z.string().optional(),
});

export type Competition = z.infer<typeof CompetitionSchema>;
