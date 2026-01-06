// Golden path for prices lane: ingest → forge → compose → metrics

import { buildRegionalPrices } from "./src/forge/builders/pricesSignal.js";
import { composePrices } from "./src/composer/pricesComposer.js";
import { decayCache } from "./src/decay/decayCache.js";
import { resetMetrics, getMetrics, recordIngest, recordComposer } from "./src/bridge/metrics.js";

function assert(condition, message) {
  if (!condition) {
    console.error("❌", message);
    process.exit(1);
  }
  console.log("✅", message);
}

function run() {
  console.log("=== Prices Golden Path ===\n");

  resetMetrics();
  decayCache.clear();

  const now = new Date("2025-01-01T00:00:00.000Z").toISOString();

  const events = [
    { lane: "prices", signal: "price_up", region: "PGC", currency: "usd", change_pct: 1.2, source: "golden" },
    { lane: "prices", signal: "price_up", region: "PGC", currency: "usd", change_pct: 0.8, source: "golden" },
    { lane: "prices", signal: "price_down", region: "PGC", currency: "usd", change_pct: -0.4, source: "golden" }
  ];

  for (const e of events) {
    recordIngest(e, now);
    decayCache.update(e.lane, e.region, e.signal, now);
  }

  const decay = decayCache.get("prices", "PGC");

  const snapshot = {
    lane: "prices",
    window: "5m",
    region: "PGC",
    generatedAt: now,
    events,
    decay
  };

  const product = buildRegionalPrices(snapshot);
  assert(product !== null, "Forge produced product");
  assert(product.net_state === "rising", "Net state rising");
  assert(product.volatility === "moderate", "Volatility moderate");
  assert(product.counts.price_up === 2 && product.counts.price_down === 1, "Counts match");
  assert(product.confidence > 0 && product.confidence <= 1, "Confidence bounded");

  const composed = composePrices(snapshot, product);
  assert(!composed.error, "Composer accepted product");
  assert(composed.composed.now.includes("upward") || composed.composed.now.includes("upward movement"), "Now line references upward movement");

  recordComposer("prices");

  const metrics = getMetrics();
  assert(metrics.ingest.total === 3, "Metrics ingest total recorded");
  assert(metrics.ingest.perLane.prices === 3, "Metrics ingest perLane recorded");
  assert(metrics.ingest.perSource.golden === 3, "Metrics perSource recorded");
  assert(metrics.composer.prices === 1, "Metrics composer recorded");

  resetMetrics();
  const afterReset = getMetrics();
  assert(afterReset.ingest.total === 0 && afterReset.composer.prices === 0, "Metrics reset on restart");

  console.log("\nAll golden assertions passed.\n");
}

run();
