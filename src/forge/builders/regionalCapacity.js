// Regional Capacity Signal builder
// Pure function: snapshot → derived aggregate

export function buildRegionalCapacity(snapshot) {
  const counts = {
    capacity_tightening: 0,
    capacity_opening: 0
  };

  for (const e of snapshot.events) {
    if (e.signal === "capacity_tightening") counts.capacity_tightening++;
    if (e.signal === "capacity_opening") counts.capacity_opening++;
  }

  const total = counts.capacity_tightening + counts.capacity_opening;
  if (total === 0) return null; // discard rule

  const net =
    counts.capacity_tightening > counts.capacity_opening
      ? "tightening"
      : counts.capacity_opening > counts.capacity_tightening
      ? "opening"
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
    product: "regional_capacity_signal",
    version: "v1",
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
