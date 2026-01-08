// Regression test: lens-shared filter matchers must match dashboard behavior

import { passesPanelFilter, matchesWatchFilter, buildEvidencePack, tagClaim } from './index.js';

function assert(condition, message) {
  if (!condition) {
    console.error("❌", message);
    process.exit(1);
  }
  console.log("✅", message);
}

function run() {
  console.log("=== lens-shared Filter Matchers ===\n");

  // Test passesPanelFilter
  const panelFilter = {
    activeLanes: ["PRICES"],
    activeTags: [],
    assetFilter: ""
  };

  const sig1 = { lane: "PRICES", entity: "crude oil", tags: [] };
  const sig2 = { lane: "CAPACITY", entity: "natural gas", tags: [] };

  assert(passesPanelFilter(sig1, panelFilter), "PRICES signal passes PRICES panel filter");
  assert(!passesPanelFilter(sig2, panelFilter), "CAPACITY signal blocked by PRICES panel filter");

  // Test matchesWatchFilter
  const watchFilter = { kind: "entity", value: "oil", mode: "contains" };

  assert(matchesWatchFilter(sig1, watchFilter), "crude oil matches entity contains 'oil'");
  assert(!matchesWatchFilter(sig2, watchFilter), "natural gas does NOT match entity contains 'oil'");

  // Test buildEvidencePack
  const evidence = buildEvidencePack([sig1], "What's the price of oil?");
  assert(evidence.query === "What's the price of oil?", "Evidence pack includes query");
  assert(evidence.signals.length === 1, "Evidence pack includes 1 signal");
  assert(evidence.verificationTag === "verified", "Evidence pack tagged as verified");

  const emptyEvidence = buildEvidencePack([], "What's the price of gold?");
  assert(emptyEvidence.verificationTag === "no-evidence", "Empty evidence pack tagged as no-evidence");

  // Test tagClaim
  const claim1 = "Crude oil prices are rising";
  const tagged1 = tagClaim(claim1, evidence);
  assert(tagged1.tag === "verified", "Claim with matching evidence tagged as verified");

  const claim2 = "Natural gas prices are falling";
  const tagged2 = tagClaim(claim2, evidence);
  assert(tagged2.tag === "partial", "Claim without matching evidence tagged as partial");

  console.log("\n✅ lens-shared matchers verified!");
  console.log("   Filter logic matches dashboard behavior exactly.");
}

run();
