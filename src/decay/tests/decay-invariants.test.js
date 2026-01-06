// State Decay Cache Invariant Tests
// Purpose: Verify decay behavior, bounds, isolation, and doctrine compliance

import { DecayCache } from "../decayCache.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log("=== State Decay Cache Invariants ===\n");

  const cache = new DecayCache();
  let passed = 0;
  let failed = 0;

  // Test 1: Pressure decays over time
  {
    cache.clear();
    const t0 = new Date().toISOString();
    cache.update("capacity", "PGC", "capacity_tightening", t0);

    const state1 = cache.get("capacity", "PGC");
    const initialPressure = state1.pressure;

    // Simulate 60 seconds passing (half-life = 120s, so ~70% remaining)
    const t1 = new Date(Date.now() + 60000).toISOString();
    cache.update("capacity", "PGC", "capacity_opening", t1);
    const state2 = cache.get("capacity", "PGC");

    // Pressure should have decayed before adding new impulse
    // Initial: 0.25, after 60s decay: ~0.176, + 0.15 impulse = ~0.326
    if (state2.pressure < initialPressure + 0.15) {
      console.log("1. Pressure decays over time ✅");
      console.log(`   Initial: ${initialPressure.toFixed(3)}, After 60s+impulse: ${state2.pressure.toFixed(3)}`);
      passed++;
    } else {
      console.log("1. Pressure decays over time ❌");
      console.log(`   Expected decay+impulse < ${(initialPressure + 0.15).toFixed(3)}, got ${state2.pressure.toFixed(3)}`);
      failed++;
    }
  }

  // Test 2: Pressure increases on signal
  {
    cache.clear();
    cache.update("capacity", "NYC", "capacity_tightening");
    const state = cache.get("capacity", "NYC");

    if (Math.abs(state.pressure - 0.25) < 0.001) {
      console.log("2. Pressure increases on signal ✅");
      console.log(`   Pressure: ${state.pressure.toFixed(3)}`);
      passed++;
    } else {
      console.log("2. Pressure increases on signal ❌");
      console.log(`   Expected ~0.25, got ${state.pressure}`);
      failed++;
    }
  }

  // Test 3: Pressure clamped at 1.0
  {
    cache.clear();
    for (let i = 0; i < 10; i++) {
      cache.update("capacity", "LAX", "capacity_tightening");
    }
    const state = cache.get("capacity", "LAX");

    if (state.pressure <= 1.0) {
      console.log("3. Pressure clamped at 1.0 ✅");
      console.log(`   Pressure after 10 signals: ${state.pressure.toFixed(3)}`);
      passed++;
    } else {
      console.log("3. Pressure clamped at 1.0 ❌");
      console.log(`   Pressure exceeded: ${state.pressure}`);
      failed++;
    }
  }

  // Test 4: No raw event storage
  {
    cache.clear();
    cache.update("capacity", "SFO", "capacity_tightening");
    cache.update("capacity", "SFO", "capacity_opening");
    const state = cache.get("capacity", "SFO");

    const hasEvents = JSON.stringify(state).includes("events");
    if (!hasEvents) {
      console.log("4. No raw event storage ✅");
      console.log("   Cache contains no event arrays");
      passed++;
    } else {
      console.log("4. No raw event storage ❌");
      console.log("   Cache contains event data");
      failed++;
    }
  }

  // Test 5: Lane isolation
  {
    cache.clear();
    cache.update("capacity", "BOS", "capacity_tightening");
    cache.update("prices", "BOS", "capacity_opening");

    const capacityState = cache.get("capacity", "BOS");
    const pricesState = cache.get("prices", "BOS");

    if (capacityState.pressure === 0.25 && pricesState.pressure === 0.15) {
      console.log("5. Lane isolation ✅");
      console.log(`   Capacity: ${capacityState.pressure}, Prices: ${pricesState.pressure}`);
      passed++;
    } else {
      console.log("5. Lane isolation ❌");
      console.log(`   Capacity: ${capacityState.pressure}, Prices: ${pricesState.pressure}`);
      failed++;
    }
  }

  // Test 6: Counters capped at 50
  {
    cache.clear();
    for (let i = 0; i < 100; i++) {
      cache.update("capacity", "DFW", "capacity_tightening");
    }
    const state = cache.get("capacity", "DFW");

    if (state.counts.tightening === 50) {
      console.log("6. Counters capped at 50 ✅");
      console.log(`   Tightening count: ${state.counts.tightening}`);
      passed++;
    } else {
      console.log("6. Counters capped at 50 ❌");
      console.log(`   Expected 50, got ${state.counts.tightening}`);
      failed++;
    }
  }

  // Test 7: Memory bound (LRU eviction at 10k entries)
  {
    cache.clear();
    for (let i = 0; i < 10100; i++) {
      cache.update("capacity", `region-${i}`, "capacity_tightening");
    }

    const size = cache.size();
    if (size <= 10000) {
      console.log("7. Memory bound (LRU eviction) ✅");
      console.log(`   Cache size: ${size} (max 10000)`);
      passed++;
    } else {
      console.log("7. Memory bound (LRU eviction) ❌");
      console.log(`   Cache size exceeded: ${size}`);
      failed++;
    }
  }

  // Test 8: Restart wipes cache
  {
    const tempCache = new DecayCache();
    tempCache.update("capacity", "ATL", "capacity_tightening");
    const before = tempCache.size();

    tempCache.clear(); // Simulate process restart
    const after = tempCache.size();

    if (before === 1 && after === 0) {
      console.log("8. Restart wipes cache ✅");
      console.log(`   Before: ${before}, After: ${after}`);
      passed++;
    } else {
      console.log("8. Restart wipes cache ❌");
      console.log(`   Before: ${before}, After: ${after}`);
      failed++;
    }
  }

  // Test 9: Decay to near-zero with no signals
  {
    cache.clear();
    cache.setHalfLife("capacity", 1); // 1 second half-life for fast test

    const t0 = new Date().toISOString();
    cache.update("capacity", "SEA", "capacity_tightening", t0);

    // Simulate 10 seconds passing (10 half-lives)
    const t1 = new Date(Date.now() + 10000).toISOString();
    cache.update("capacity", "SEA", "capacity_opening", t1);
    const state = cache.get("capacity", "SEA");

    // After 10 half-lives: 0.25 * (0.5^10) ≈ 0.00024, + 0.15 ≈ 0.150
    if (state.pressure < 0.16) {
      console.log("9. Decay to near-zero with no signals ✅");
      console.log(`   Pressure after 10 half-lives: ${state.pressure.toFixed(5)}`);
      passed++;
    } else {
      console.log("9. Decay to near-zero with no signals ❌");
      console.log(`   Expected < 0.16, got ${state.pressure}`);
      failed++;
    }

    cache.setHalfLife("capacity", 120); // Reset to default
  }

  // Test 10: Stats return valid summary
  {
    cache.clear();
    cache.update("capacity", "MIA", "capacity_tightening");
    cache.update("prices", "MIA", "capacity_opening");

    const stats = cache.getStats();

    if (
      stats.totalEntries === 2 &&
      stats.laneStats.capacity &&
      stats.laneStats.prices &&
      stats.memoryEstimateKB >= 0
    ) {
      console.log("10. Stats return valid summary ✅");
      console.log(`   Total: ${stats.totalEntries}, Memory: ${stats.memoryEstimateKB} KB`);
      passed++;
    } else {
      console.log("10. Stats return valid summary ❌");
      console.log(`   Stats: ${JSON.stringify(stats)}`);
      failed++;
    }
  }

  // Summary
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log("✅ State decay cache locked!");
  } else {
    console.log("❌ Some tests failed");
    process.exit(1);
  }
}

runTests();
