import { z } from "zod";

import { EntityIdSchema, EntityStatusSchema, ExternalIdSchema } from "./common.js";

export const CompetitionGroupSchema = z.object({
	id: EntityIdSchema,

	name: z.string().min(1),

	competitionSeasonId: EntityIdSchema,

	status: EntityStatusSchema,

	sourceIds: z.array(EntityIdSchema).default([]),

	externalIds: z.array(ExternalIdSchema).default([]),

	notes: z.string().optional(),
});

export type CompetitionGroup = z.infer<typeof CompetitionGroupSchema>;
