import { z } from "zod";

import {
	CountryCodeSchema,
	EntityIdSchema,
	EntityStatusSchema,
	ExternalIdSchema,
	HistoricalNameSchema,
} from "./common.js";

export const CoordinatesSchema = z.object({
	latitude: z.number().min(-90).max(90),
	longitude: z.number().min(-180).max(180),
});

export type Coordinates = z.infer<typeof CoordinatesSchema>;

export const RinkSchema = z.object({
	id: EntityIdSchema,

	name: z.string().min(1),

	aliases: z.array(z.string().min(1)).default([]),

	historicalNames: z.array(HistoricalNameSchema).default([]),

	country: CountryCodeSchema,

	city: z.string().min(1).optional(),

	coordinates: CoordinatesSchema.optional(),

	status: EntityStatusSchema,

	externalIds: z.array(ExternalIdSchema).default([]),

	sourceIds: z.array(EntityIdSchema).default([]),

	notes: z.string().optional(),
});

export type Rink = z.infer<typeof RinkSchema>;
