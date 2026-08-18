import { z } from "zod";

import { EntityIdSchema } from "./common.js";

export const TeamParticipationStatusSchema = z.enum([
	"confirmed",
	"active",
	"completed",
	"withdrawn",
	"disqualified",
	"unknown",
]);

export type TeamParticipationStatus = z.infer<typeof TeamParticipationStatusSchema>;

export const TeamParticipationSchema = z.object({
	id: EntityIdSchema,

	teamId: EntityIdSchema,

	competitionSeasonId: EntityIdSchema,

	competitionGroupId: EntityIdSchema.optional(),

	status: TeamParticipationStatusSchema,

	displayName: z.string().min(1).optional(),

	sourceIds: z.array(EntityIdSchema).default([]),

	notes: z.string().optional(),
});

export type TeamParticipation = z.infer<typeof TeamParticipationSchema>;
