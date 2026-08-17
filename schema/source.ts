import { z } from "zod";
import { EntityIdSchema } from "./common.js";

export const SourceTypeSchema = z.enum([
	"official_website",
	"governing_body",
	"registry",
	"league_website",
	"team_website",
	"facebook_post",
	"facebook_page",
	"instagram_post",
	"youtube",
	"pdf",
	"news_article",
	"database",
	"image",
	"manual_observation",
	"other",
]);

export type SourceType = z.infer<typeof SourceTypeSchema>;

export const SourceReliabilitySchema = z.enum(["primary", "secondary", "unknown"]);

export const SourceSchema = z.object({
	id: EntityIdSchema,

	type: SourceTypeSchema,

	title: z.string().min(1),

	url: z.url().optional(),

	publisher: z.string().optional(),

	publishedAt: z.iso.datetime({ offset: true }).optional(),
	retrievedAt: z.iso.datetime({ offset: true }),

	reliability: SourceReliabilitySchema,

	notes: z.string().optional(),
});

export type Source = z.infer<typeof SourceSchema>;
