import { z } from "zod";

export const EntityIdSchema = z
	.string()
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Entity ID must use lowercase kebab-case");

export type EntityId = z.infer<typeof EntityIdSchema>;

export const EntityStatusSchema = z.enum(["active", "inactive", "defunct", "unknown"]);

export type EntityStatus = z.infer<typeof EntityStatusSchema>;

export const GenderCategorySchema = z.enum(["men", "women", "mixed", "open", "unknown"]);

export type GenderCategory = z.infer<typeof GenderCategorySchema>;

export const AgeCategorySchema = z.enum([
	"junior",
	"senior",
	"university",
	"masters",
	"open",
	"unknown",
]);

export type AgeCategory = z.infer<typeof AgeCategorySchema>;

export const CountryCodeSchema = z
	.string()
	.length(2)
	.regex(/^[A-Z]{2}$/, "Country must use ISO 3166-1 alpha-2");

export type CountryCode = z.infer<typeof CountryCodeSchema>;

export const HockeyCategoriesSchema = z.object({
	gender: GenderCategorySchema,
	age: AgeCategorySchema,

	ageBand: z
		.object({
			min: z.number().int().nonnegative().optional(),
			max: z.number().int().nonnegative().optional(),
			label: z.string().optional(),
		})
		.optional(),
});

export type HockeyCategories = z.infer<typeof HockeyCategoriesSchema>;

export const ExternalIdSchema = z.object({
	system: z.string().min(1),
	value: z.string().min(1),
});

export type ExternalId = z.infer<typeof ExternalIdSchema>;

export const TimeBoundarySchema = z.union([
	z.object({
		year: z.number().int().min(1900).max(2200),
	}),
	z.object({
		date: z.iso.date(),
	}),
]);

export type TimeBoundary = z.infer<typeof TimeBoundarySchema>;

export const HistoricalNameSchema = z.object({
	name: z.string().min(1),

	from: TimeBoundarySchema.optional(),

	until: TimeBoundarySchema.optional(),

	sourceIds: z.array(EntityIdSchema).default([]),

	notes: z.string().optional(),
});

export type HistoricalName = z.infer<typeof HistoricalNameSchema>;
