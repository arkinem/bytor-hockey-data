import { normalizeEntityName } from "./normalize-name.js";

type NamedEntity = {
	id: string;
	name: string;
	aliases: string[];
	historicalNames: Array<{
		name: string;
	}>;
};

export type EntityNameMatch = {
	id: string;
	matchedBy: "name" | "alias" | "historicalName";
	matchedValue: string;
};

export class EntityNameIndex {
	private readonly index = new Map<string, EntityNameMatch[]>();

	add(entity: NamedEntity): void {
		this.addValue(entity.id, entity.name, "name");

		for (const alias of entity.aliases) {
			this.addValue(entity.id, alias, "alias");
		}

		for (const historicalName of entity.historicalNames) {
			this.addValue(entity.id, historicalName.name, "historicalName");
		}
	}

	find(value: string): EntityNameMatch[] {
		const normalized = normalizeEntityName(value);

		return this.index.get(normalized) ?? [];
	}

	private addValue(id: string, value: string, matchedBy: EntityNameMatch["matchedBy"]): void {
		const normalized = normalizeEntityName(value);

		if (!normalized) {
			return;
		}

		const matches = this.index.get(normalized) ?? [];

		matches.push({
			id,
			matchedBy,
			matchedValue: value,
		});

		this.index.set(normalized, matches);
	}
}
