import { z } from "zod";

import { EntityIdSchema, EntityStatusSchema } from "./common.js";

export const TeamParticipationSchema = z.object({
	id: EntityIdSchema,

	teamId: EntityIdSchema,

	competitionSeasonId: EntityIdSchema,

	status: EntityStatusSchema,

	displayName: z.string().min(1).optional(),

	sourceIds: z.array(EntityIdSchema).default([]),

	notes: z.string().optional(),
});

export type TeamParticipation = z.infer<typeof TeamParticipationSchema>;
