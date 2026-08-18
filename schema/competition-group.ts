import { z } from "zod";

import { EntityIdSchema, EntityStatusSchema } from "./common.js";

export const CompetitionGroupSchema = z.object({
	id: EntityIdSchema,

	name: z.string().min(1),

	competitionSeasonId: EntityIdSchema,

	status: EntityStatusSchema,

	sourceIds: z.array(EntityIdSchema).default([]),

	notes: z.string().optional(),
});

export type CompetitionGroup = z.infer<typeof CompetitionGroupSchema>;
