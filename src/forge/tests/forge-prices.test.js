// Forge Prices Signal Invariants

import { buildRegionalPrices } from "../builders/pricesSignal.js";

function runTests() {
  console.log("=== Forge Prices Invariants ===\n");

  let passed = 0;
  let failed = 0;

  // Test 1: Empty snapshot -> null
  {
    const snap = { events: [], window: "5m", generatedAt: new Date().toISOString() };
    const result = buildRegionalPrices(snap);
    if (result === null) {
      console.log("1. Empty snapshot -> null ✅");
      passed++;
    } else {
      console.log("1. Empty snapshot -> null ❌", result);
      failed++;
    }
  }

  // Test 2: Counts and net_state rising
  {
    const snap = {
      events: [
        { signal: "price_up" },
        { signal: "price_up" },
        { signal: "price_down" }
      ],
      window: "5m",
      generatedAt: new Date().toISOString(),
      region: "PGC"
    };
    const result = buildRegionalPrices(snap);
    if (
      result.counts.price_up === 2 &&
      result.counts.price_down === 1 &&
      result.net_state === "rising"
    ) {
      console.log("2. Rising counts/net_state ✅");
      passed++;
    } else {
      console.log("2. Rising counts/net_state ❌", result);
      failed++;
    }
  }

  // Test 3: Confidence with pressure boost
  {
    const snap = {
      events: [
        { signal: "price_up" },
        { signal: "price_up" }
      ],
      window: "5m",
      generatedAt: new Date().toISOString(),
      decay: { pressure: 0.8 }
    };
    const result = buildRegionalPrices(snap);
    if (result.confidence > 0.4 && result.confidence <= 1) {
      console.log("3. Confidence pressure boost ✅", result.confidence.toFixed(2));
      passed++;
    } else {
      console.log("3. Confidence pressure boost ❌", result.confidence);
      failed++;
    }
  }

  // Test 4: Deterministic output
  {
    const snap = {
      events: [ { signal: "price_down" }, { signal: "price_down" } ],
      window: "5m",
      generatedAt: "2024-01-01T00:00:00.000Z",
      decay: { pressure: 0.5 }
    };
    const r1 = buildRegionalPrices(snap);
    const r2 = buildRegionalPrices(snap);
    if (JSON.stringify(r1) === JSON.stringify({ ...r2, generatedAt: r1.generatedAt })) {
      console.log("4. Deterministic ✅");
      passed++;
    } else {
      console.log("4. Deterministic ❌");
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
