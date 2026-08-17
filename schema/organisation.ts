import { z } from "zod";
import { CountryCodeSchema, EntityIdSchema, EntityStatusSchema } from "./common.js";

export const OrganisationTypeSchema = z.enum([
	"governing_body",
	"league_operator",
	"club",
	"team_operator",
	"event_organiser",
	"rink_operator",
	"other",
]);

export type OrganisationType = z.infer<typeof OrganisationTypeSchema>;

export const OrganisationSchema = z.object({
	id: EntityIdSchema,

	name: z.string().min(1),

	aliases: z.array(z.string().min(1)).default([]),

	types: z.array(OrganisationTypeSchema).min(1),

	country: CountryCodeSchema,

	status: EntityStatusSchema,

	website: z.url().optional(),

	social: z
		.object({
			facebook: z.url().optional(),
			instagram: z.url().optional(),
			youtube: z.url().optional(),
		})
		.optional(),

	sourceIds: z.array(EntityIdSchema).default([]),

	notes: z.string().optional(),
});

export type Organisation = z.infer<typeof OrganisationSchema>;
