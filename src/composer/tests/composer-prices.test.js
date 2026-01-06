// Prices Composer Invariants

import { composePrices } from "../pricesComposer.js";

function runTests() {
  console.log("=== Prices Composer Invariants ===\n");
  let passed = 0;
  let failed = 0;

  // Silence
  {
    const snap = { lane: "prices", window: "5m", events: [] };
    const result = composePrices(snap);
    if (result.composed.now.includes("No live price changes")) {
      console.log("1. Silence ✅");
      passed++;
    } else { failed++; console.log("1. Silence ❌", result); }
  }

  // Missing product
  {
    const snap = { lane: "prices", window: "5m", events: [{ signal: "price_up" }] };
    const result = composePrices(snap, null);
    if (result.composed.now.includes("Raw price signals")) {
      console.log("2. Missing product ✅");
      passed++;
    } else { failed++; console.log("2. Missing product ❌", result); }
  }

  // Determinism
  {
    const snap = { lane: "prices", window: "5m", events: [{ signal: "price_up" }, { signal: "price_down" }] };
    const product = { product: "regional_prices_signal", version: "v1", net_state: "rising", volatility: "low", confidence: 0.55, counts: { price_up: 1, price_down: 1 } };
    const outs = []; for (let i=0;i<5;i++) outs.push(JSON.stringify(composePrices(snap, product).composed));
    const allSame = outs.every(o => o === outs[0]);
    if (allSame) { console.log("3. Determinism ✅"); passed++; } else { failed++; console.log("3. Determinism ❌"); }
  }

  // No directives
  {
    const snap = { lane: "prices", window: "5m", events: Array(4).fill({ signal: "price_up" }) };
    const product = { product: "regional_prices_signal", version: "v1", net_state: "rising", volatility: "moderate", confidence: 0.6, counts: { price_up: 4, price_down: 0 } };
    const text = JSON.stringify(composePrices(snap, product).composed).toLowerCase();
    const forbidden = ["you should", "we recommend", "act now", "don't wait", "best time"]; // eslint-disable-line quotes
    const has = forbidden.some(p => text.includes(p));
    if (!has) { console.log("4. No directives ✅"); passed++; } else { failed++; console.log("4. No directives ❌"); }
  }

  // Confidence accuracy
  {
    const snap = { lane: "prices", window: "5m", events: Array(7).fill({ signal: "price_down" }) };
    const product = { product: "regional_prices_signal", version: "v1", net_state: "falling", volatility: "high", confidence: 0.8, counts: { price_up: 0, price_down: 7 } };
    const result = composePrices(snap, product);
    if (result.composed.confidence.includes("High") && result.composed.confidence.includes("7 signals")) {
      console.log("5. Confidence accuracy ✅"); passed++; }
    else { failed++; console.log("5. Confidence accuracy ❌", result.composed.confidence); }
  }

  // Pressure mention
  {
    const snap = { lane: "prices", window: "5m", events: [{ signal: "price_up" }], decay: { pressure: 0.7, lastSignal: "price_down" } };
    const product = { product: "regional_prices_signal", version: "v1", net_state: "rising", volatility: "low", confidence: 0.5, counts: { price_up: 1, price_down: 0 } };
    const result = composePrices(snap, product);
    if (result.composed.meaning.includes("pressure")) { console.log("6. Pressure mention ✅"); passed++; }
    else { failed++; console.log("6. Pressure mention ❌", result.composed.meaning); }
  }

  // Invalid lane
  {
    const snap = { lane: "capacity", window: "5m", events: [] };
    const result = composePrices(snap);
    if (result.error && result.composed === null) { console.log("7. Invalid lane ✅"); passed++; }
    else { failed++; console.log("7. Invalid lane ❌", result); }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests();
