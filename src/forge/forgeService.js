// Forge orchestrator: snapshot → derived product
// Input: snapshots only
// Output: derived aggregates only
// No live streams, no persistence

import { buildRegionalCapacity } from "./builders/regionalCapacity.js";
import { buildRegionalPrices } from "./builders/pricesSignal.js";

export function forgeFromSnapshot(snapshot) {
  if (!snapshot || !snapshot.lane) {
    return null;
  }

  if (snapshot.lane === "capacity") {
    return buildRegionalCapacity(snapshot);
  }

  if (snapshot.lane === "prices") {
    return buildRegionalPrices(snapshot);
  }

  // Future lanes go here
  return null;
}
