// Forge v1 invariant tests: regional capacity signal builder

import { buildRegionalCapacity } from "../builders/regionalCapacity.js";

console.log("=== Forge Regional Capacity Invariants ===\n");

let passed = 0;
let failed = 0;

// Test 1: Empty snapshot → null (discard rule)
console.log("1. Empty snapshot (no events) → null");
const t1 = buildRegionalCapacity({
  lane: "capacity",
  window: "5m",
  generatedAt: "2024-01-01T00:00:00.000Z",
  events: []
});
if (t1 === null) {
  console.log("   ✅ Discarded correctly");
  passed++;
} else {
  console.log("   ❌ Should discard empty");
  failed++;
}

// Test 2: Counts are correct
console.log("\n2. Counts match event signals");
const t2 = buildRegionalCapacity({
  lane: "capacity",
  window: "5m",
  region: "PGC",
  generatedAt: "2024-01-01T00:00:00.000Z",
  events: [
    { signal: "capacity_tightening" },
    { signal: "capacity_tightening" },
    { signal: "capacity_opening" }
  ]
});
if (t2.counts.capacity_tightening === 2 && t2.counts.capacity_opening === 1) {
  console.log("   ✅ Counts correct:", t2.counts);
  passed++;
} else {
  console.log("   ❌ Counts wrong:", t2.counts);
  failed++;
}

// Test 3: Net state is correct
console.log("\n3. Net state derivation");
if (t2.net_state === "tightening") {
  console.log("   ✅ Net state: tightening (2 > 1)");
  passed++;
} else {
  console.log("   ❌ Net state wrong:", t2.net_state);
  failed++;
}

// Test 4: Confidence bounded [0, 1]
console.log("\n4. Confidence bounded");
if (t2.confidence >= 0 && t2.confidence <= 1) {
  console.log(`   ✅ Confidence in range: ${t2.confidence}`);
  passed++;
} else {
  console.log(`   ❌ Confidence out of bounds: ${t2.confidence}`);
  failed++;
}

// Test 5: No raw events leak
console.log("\n5. No raw event data in output");
const hasEvents = JSON.stringify(t2).includes('"signal"');
if (!hasEvents) {
  console.log("   ✅ No raw events in output");
  passed++;
} else {
  console.log("   ❌ Raw events leaked");
  failed++;
}

// Test 6: Deterministic output
console.log("\n6. Deterministic for same input");
const t6a = buildRegionalCapacity({
  lane: "capacity",
  window: "5m",
  region: "PGC",
  generatedAt: "2024-01-01T00:00:00.000Z",
  events: [
    { signal: "capacity_opening" },
    { signal: "capacity_opening" }
  ]
});
const t6b = buildRegionalCapacity({
  lane: "capacity",
  window: "5m",
  region: "PGC",
  generatedAt: "2024-01-01T00:00:00.000Z",
  events: [
    { signal: "capacity_opening" },
    { signal: "capacity_opening" }
  ]
});
if (
  t6a.counts.capacity_opening === t6b.counts.capacity_opening &&
  t6a.net_state === t6b.net_state &&
  t6a.volatility === t6b.volatility
) {
  console.log("   ✅ Deterministic (counts, net_state, volatility match)");
  passed++;
} else {
  console.log("   ❌ Non-deterministic output");
  failed++;
}

// Test 7: Volatility classification
console.log("\n7. Volatility classification");
const t7low = buildRegionalCapacity({
  lane: "capacity",
  window: "5m",
  region: "PGC",
  generatedAt: "2024-01-01T00:00:00.000Z",
  events: [{ signal: "capacity_opening" }]
});
const t7mod = buildRegionalCapacity({
  lane: "capacity",
  window: "5m",
  region: "PGC",
  generatedAt: "2024-01-01T00:00:00.000Z",
  events: [
    { signal: "capacity_opening" },
    { signal: "capacity_opening" },
    { signal: "capacity_opening" }
  ]
});
const t7high = buildRegionalCapacity({
  lane: "capacity",
  window: "5m",
  region: "PGC",
  generatedAt: "2024-01-01T00:00:00.000Z",
  events: [
    { signal: "capacity_opening" },
    { signal: "capacity_opening" },
    { signal: "capacity_opening" },
    { signal: "capacity_opening" },
    { signal: "capacity_opening" },
    { signal: "capacity_opening" }
  ]
});
if (t7low.volatility === "low" && t7mod.volatility === "moderate" && t7high.volatility === "high") {
  console.log("   ✅ Volatility: low (1), moderate (3), high (6)");
  passed++;
} else {
  console.log("   ❌ Volatility classification wrong");
  failed++;
}

// Test 8: Product schema compliance
console.log("\n8. Product schema fields present");
const required = ["product", "version", "region", "window", "generatedAt", "counts", "net_state", "volatility", "confidence", "source", "provenance"];
const hasAll = required.every(k => k in t2);
if (hasAll && t2.product === "regional_capacity_signal" && t2.version === "v1" && t2.source === "forge") {
  console.log("   ✅ Schema compliant");
  passed++;
} else {
  console.log("   ❌ Schema incomplete");
  failed++;
}

// Summary
console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log("\n✅ Forge regional capacity builder locked!");
} else {
  console.log("\n❌ Some tests failed");
}

process.exit(failed === 0 ? 0 : 1);
