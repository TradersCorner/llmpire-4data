// Regional Prices Signal builder
// Pure function: snapshot → derived aggregate

import { PRICE_PRODUCT, PRICE_PRODUCT_VERSION, validatePriceEvent } from "../../lanes/pricesVocab.js";

export function buildRegionalPrices(snapshot) {
  const counts = {
    price_up: 0,
    price_down: 0
  };

  const events = snapshot?.events || [];

  for (const e of events) {
    const validation = validatePriceEvent(e);
    if (!validation.ok) continue; // reject ambiguous/invalid

    if (validation.normalized.signal === "price_up") counts.price_up++;
    if (validation.normalized.signal === "price_down") counts.price_down++;
  }

  const total = counts.price_up + counts.price_down;
  if (total === 0) return null; // discard rule

  const net =
    counts.price_up > counts.price_down
      ? "rising"
      : counts.price_down > counts.price_up
      ? "falling"
      : "flat";

  const volatility =
    total >= 6 ? "high" :
    total >= 3 ? "moderate" :
    "low";

  // Base confidence from signal count
  const baseConfidence = Math.min(1, total / 5);

  // Optional pressure boost from decay cache (if present)
  let confidence = baseConfidence;
  if (snapshot.decay?.pressure !== undefined) {
    const pressureBoost = Math.min(0.25, snapshot.decay.pressure * 0.25);
    confidence = Math.min(1, baseConfidence + pressureBoost);
  }

  return {
    product: PRICE_PRODUCT,
    version: PRICE_PRODUCT_VERSION,
    region: snapshot.region ?? "unknown",
    window: snapshot.window,
    generatedAt: new Date().toISOString(),
    counts,
    net_state: net,
    volatility,
    confidence,
    source: "forge",
    provenance: {
      snapshotAt: snapshot.generatedAt
    }
  };
}
