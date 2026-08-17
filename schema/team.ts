import { z } from "zod";

import {
	CountryCodeSchema,
	EntityIdSchema,
	EntityStatusSchema,
	ExternalIdSchema,
	HistoricalNameSchema,
	HockeyCategoriesSchema,
} from "./common.js";

export const TeamContactSchema = z.object({
	name: z.string().min(1).optional(),
	email: z.email().optional(),
	phone: z.string().min(1).optional(),
});

export const TeamRoleSchema = z.enum([
	"primary",
	"age_group",
	"development",
	"reserve",
	"academy",
	"recreational",
	"other",
	"unknown",
]);

export const TeamSchema = z.object({
	id: EntityIdSchema,

	name: z.string().min(1),

	aliases: z.array(z.string().min(1)).default([]),

	historicalNames: z.array(HistoricalNameSchema).default([]),

	country: CountryCodeSchema,

	categories: HockeyCategoriesSchema,

	status: EntityStatusSchema,

	organisationId: EntityIdSchema.optional(),

	role: TeamRoleSchema.default("unknown"),

	rinkIds: z.array(EntityIdSchema).default([]),

	website: z.url().optional(),

	socials: z
		.object({
			facebook: z.url().optional(),
			instagram: z.url().optional(),
			youtube: z.url().optional(),
		})
		.optional(),

	contact: TeamContactSchema.optional(),

	training: z
		.object({
			raw: z.string().min(1),
		})
		.optional(),

	logo: z
		.object({
			path: z.string().min(1),
			quality: z.enum(["low", "medium", "high", "unknown"]).default("unknown"),
		})
		.optional(),

	externalIds: z.array(ExternalIdSchema).default([]),

	sourceIds: z.array(EntityIdSchema).default([]),

	sourceUrls: z.array(z.url()).default([]),

	notes: z.string().optional(),
});

export type Team = z.infer<typeof TeamSchema>;
