// Capacity Composer Invariant Tests
// Purpose: Verify composer laws (no invention, uncertainty, silence handling, determinism)

import { composeCapacity } from "../capacityComposer.js";

function runTests() {
  console.log("=== Capacity Composer Invariants ===\n");

  let passed = 0;
  let failed = 0;

  // Test 1: No signals → valid "no activity" output
  {
    const snapshot = {
      lane: "capacity",
      window: "5m",
      events: []
    };

    const result = composeCapacity(snapshot);

    if (
      result.composed.now.includes("No live capacity changes") &&
      result.composed.confidence.includes("None") &&
      result.metadata.signalCount === 0
    ) {
      console.log("1. Silence handling ✅");
      console.log(`   Now: ${result.composed.now}`);
      passed++;
    } else {
      console.log("1. Silence handling ❌");
      console.log(`   Result: ${JSON.stringify(result)}`);
      failed++;
    }
  }

  // Test 2: No product → valid "aggregation unavailable" output
  {
    const snapshot = {
      lane: "capacity",
      window: "5m",
      events: [{ signal: "capacity_tightening" }]
    };

    const result = composeCapacity(snapshot, null);

    if (
      result.composed.now.includes("Raw capacity signals") &&
      result.composed.meaning.includes("Unable to derive net state")
    ) {
      console.log("2. Missing product handling ✅");
      console.log(`   Now: ${result.composed.now}`);
      passed++;
    } else {
      console.log("2. Missing product handling ❌");
      console.log(`   Result: ${JSON.stringify(result)}`);
      failed++;
    }
  }

  // Test 3: Determinism (same input → same output)
  {
    const snapshot = {
      lane: "capacity",
      window: "5m",
      events: [
        { signal: "capacity_tightening" },
        { signal: "capacity_tightening" },
        { signal: "capacity_opening" }
      ]
    };

    const product = {
      net_state: "tightening",
      volatility: "low",
      confidence: 0.6,
      counts: { tightening: 2, opening: 1 }
    };

    const outputs = [];
    for (let i = 0; i < 10; i++) {
      const result = composeCapacity(snapshot, product);
      outputs.push(JSON.stringify(result.composed));
    }

    const allSame = outputs.every(o => o === outputs[0]);

    if (allSame) {
      console.log("3. Determinism (10 runs) ✅");
      console.log(`   All outputs identical`);
      passed++;
    } else {
      console.log("3. Determinism (10 runs) ❌");
      console.log(`   Outputs varied`);
      failed++;
    }
  }

  // Test 4: No directives ("you should", "act now")
  {
    const snapshot = {
      lane: "capacity",
      window: "5m",
      events: [
        { signal: "capacity_tightening" },
        { signal: "capacity_tightening" },
        { signal: "capacity_tightening" }
      ]
    };

    const product = {
      net_state: "tightening",
      volatility: "moderate",
      confidence: 0.6,
      counts: { tightening: 3, opening: 0 }
    };

    const result = composeCapacity(snapshot, product);
    const fullText = JSON.stringify(result.composed).toLowerCase();

    const hasForbidden =
      fullText.includes("you should") ||
      fullText.includes("we recommend") ||
      fullText.includes("act now") ||
      fullText.includes("don't wait") ||
      fullText.includes("best time");

    if (!hasForbidden) {
      console.log("4. No directives ✅");
      console.log(`   No forbidden phrases detected`);
      passed++;
    } else {
      console.log("4. No directives ❌");
      console.log(`   Forbidden phrase found: ${fullText}`);
      failed++;
    }
  }

  // Test 5: Confidence accuracy
  {
    const snapshot = {
      lane: "capacity",
      window: "5m",
      events: Array(8).fill({ signal: "capacity_tightening" })
    };

    const product = {
      net_state: "tightening",
      volatility: "high",
      confidence: 0.82,
      counts: { tightening: 8, opening: 0 }
    };

    const result = composeCapacity(snapshot, product);

    if (
      result.metadata.confidenceScore === 0.82 &&
      result.composed.confidence.includes("High") &&
      result.composed.confidence.includes("8 signals")
    ) {
      console.log("5. Confidence accuracy ✅");
      console.log(`   Confidence: ${result.composed.confidence}`);
      passed++;
    } else {
      console.log("5. Confidence accuracy ❌");
      console.log(`   Expected high confidence, got: ${result.composed.confidence}`);
      failed++;
    }
  }

  // Test 6: Volatility mapping (high → "sustained")
  {
    const snapshot = {
      lane: "capacity",
      window: "5m",
      events: Array(7).fill({ signal: "capacity_opening" })
    };

    const product = {
      net_state: "opening",
      volatility: "high",
      confidence: 0.8,
      counts: { tightening: 0, opening: 7 }
    };

    const result = composeCapacity(snapshot, product);

    if (result.composed.now.includes("sustained")) {
      console.log("6. Volatility mapping (high → sustained) ✅");
      console.log(`   Now: ${result.composed.now}`);
      passed++;
    } else {
      console.log("6. Volatility mapping (high → sustained) ❌");
      console.log(`   Now: ${result.composed.now}`);
      failed++;
    }
  }

  // Test 7: Pressure mention (high pressure)
  {
    const snapshot = {
      lane: "capacity",
      window: "5m",
      events: [
        { signal: "capacity_opening" },
        { signal: "capacity_opening" }
      ],
      decay: {
        pressure: 0.65,
        lastSignal: "capacity_tightening"
      }
    };

    const product = {
      net_state: "opening",
      volatility: "low",
      confidence: 0.55,
      counts: { tightening: 0, opening: 2 }
    };

    const result = composeCapacity(snapshot, product);

    if (result.composed.meaning.includes("pressure")) {
      console.log("7. Pressure mention ✅");
      console.log(`   Meaning: ${result.composed.meaning}`);
      passed++;
    } else {
      console.log("7. Pressure mention ❌");
      console.log(`   Meaning: ${result.composed.meaning}`);
      failed++;
    }
  }

  // Test 8: No fact invention (output only contains input data)
  {
    const snapshot = {
      lane: "capacity",
      window: "5m",
      events: [
        { signal: "capacity_tightening", region: "PGC" }
      ]
    };

    const product = {
      net_state: "tightening",
      volatility: "low",
      confidence: 0.2,
      counts: { tightening: 1, opening: 0 }
    };

    const result = composeCapacity(snapshot, product);
    const fullText = JSON.stringify(result.composed).toLowerCase();

    // Check for invented details
    const hasInvention =
      fullText.includes("historical") ||
      fullText.includes("trend") ||
      fullText.includes("will be") ||
      fullText.includes("tomorrow") ||
      fullText.includes("users are");

    if (!hasInvention) {
      console.log("8. No fact invention ✅");
      console.log(`   No invented details detected`);
      passed++;
    } else {
      console.log("8. No fact invention ❌");
      console.log(`   Invented detail found: ${fullText}`);
      failed++;
    }
  }

  // Test 9: Low volatility → "limited"
  {
    const snapshot = {
      lane: "capacity",
      window: "5m",
      events: [
        { signal: "capacity_opening" }
      ]
    };

    const product = {
      net_state: "opening",
      volatility: "low",
      confidence: 0.2,
      counts: { tightening: 0, opening: 1 }
    };

    const result = composeCapacity(snapshot, product);

    if (result.composed.now.includes("Limited")) {
      console.log("9. Volatility mapping (low → limited) ✅");
      console.log(`   Now: ${result.composed.now}`);
      passed++;
    } else {
      console.log("9. Volatility mapping (low → limited) ❌");
      console.log(`   Now: ${result.composed.now}`);
      failed++;
    }
  }

  // Test 10: Invalid input handling
  {
    const invalidSnapshot = {
      lane: "prices", // wrong lane
      window: "5m",
      events: []
    };

    const result = composeCapacity(invalidSnapshot);

    if (result.error && result.composed === null) {
      console.log("10. Invalid input handling ✅");
      console.log(`   Error: ${result.error}`);
      passed++;
    } else {
      console.log("10. Invalid input handling ❌");
      console.log(`   Expected error, got: ${JSON.stringify(result)}`);
      failed++;
    }
  }

  // Summary
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log("✅ Capacity composer locked!");
  } else {
    console.log("❌ Some tests failed");
    process.exit(1);
  }
}

runTests();
