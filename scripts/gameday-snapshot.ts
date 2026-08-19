import { snapshotGameDayJuniors } from "../providers/england-ice-hockey/gameday/snapshot.js";

/*
 * Migration checkpoint.
 *
 * For now we deliberately reproduce the existing
 * validated 2025/26 snapshot.
 *
 * Snapshot/season selection will become CLI/config
 * input when we add another GameDay season.
 */
await snapshotGameDayJuniors({
	snapshotDate: "2026-08-18",

	seasonId: "6041164",

	seasonLabel: "2025/26",

	requestDelayMs: 250,
});
