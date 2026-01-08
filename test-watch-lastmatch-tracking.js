// Regression test: lastMatchAt and matchCount only update when BOTH panel + watch pass

function assert(condition, message) {
  if (!condition) {
    console.error("❌", message);
    process.exit(1);
  }
  console.log("✅", message);
}

// Utilities from lisa-dashboard.html
function norm(s) {
  return String(s || "").toLowerCase().trim();
}

function passesPanelFilter(sig, pf) {
  if (pf.activeLanes.length > 0 && !pf.activeLanes.includes(sig.lane)) return false;
  if (pf.activeTags.length > 0) {
    const tags = sig.tags || [];
    if (!tags.some(t => pf.activeTags.includes(t))) return false;
  }
  if (pf.assetFilter) {
    const assetNorm = norm(pf.assetFilter);
    const entityNorm = norm(sig.entity || "");
    const assetValNorm = norm(sig.asset || "");
    const symbolNorm = norm(sig.symbol || "");
    if (!entityNorm.includes(assetNorm) && !assetValNorm.includes(assetNorm) && !symbolNorm.includes(assetNorm)) {
      return false;
    }
  }
  return true;
}

function matchesWatchFilter(sig, wf) {
  if (!wf.kind || wf.kind === "off") return false;
  if (wf.kind === "any") return true;
  
  const val = norm(wf.value);
  if (!val) return false;
  
  let targets = [];
  if (wf.kind === "entity") {
    targets = [norm(sig.entity || ""), norm(sig.asset || ""), norm(sig.symbol || "")];
  } else if (wf.kind === "lane") {
    targets = [norm(sig.lane || "")];
  }
  
  for (const t of targets) {
    if (wf.mode === "exact" && t === val) return true;
    if (wf.mode === "startsWith" && t.startsWith(val)) return true;
    if (wf.mode === "contains" && t.includes(val)) return true;
  }
  return false;
}

function handleSignal(sig, state, panelFilter, watchFilter) {
  state.receivedCount++;
  state.lastSignalAt = Date.now();
  
  const watchMatched = matchesWatchFilter(sig, watchFilter);
  const panelPassed = passesPanelFilter(sig, panelFilter);
  
  // Only increment matchCount and update lastMatchAt when BOTH pass
  if (watchMatched && panelPassed) {
    state.watchMatchedCount++;
    state.lastMatchAt = Date.now();
  }
}

function run() {
  console.log("=== Last Match Tracking Correctness ===\n");

  // Initial state
  const state = {
    receivedCount: 0,
    lastSignalAt: null,
    watchMatchedCount: 0,
    lastMatchAt: null
  };

  const panelFilter = {
    activeLanes: ["PRICES"], // Only accept PRICES
    activeTags: [],
    assetFilter: ""
  };

  const watchFilter = {
    kind: "entity",
    value: "oil",
    mode: "contains"
  };

  console.log("Panel filter: lanes = [PRICES]");
  console.log("Watch filter: entity contains 'oil'\n");

  // Test signals
  const sig1 = { lane: "PRICES", entity: "crude oil", tags: [] };
  const sig2 = { lane: "CAPACITY", entity: "crude oil", tags: [] }; // panel rejects
  const sig3 = { lane: "PRICES", entity: "natural gas", tags: [] }; // watch rejects

  console.log("Feeding 3 signals:");
  console.log("  sig1: PRICES + crude oil → panel ✓, watch ✓ (SHOULD MATCH)");
  console.log("  sig2: CAPACITY + crude oil → panel ✗, watch ✓ (NO MATCH - panel blocks)");
  console.log("  sig3: PRICES + natural gas → panel ✓, watch ✗ (NO MATCH - watch blocks)\n");

  // Feed sig1 - should match and set lastMatchAt
  handleSignal(sig1, state, panelFilter, watchFilter);
  const firstMatchTime = state.lastMatchAt;
  
  console.log("After sig1:");
  console.log(`  receivedCount = ${state.receivedCount}`);
  console.log(`  watchMatchedCount = ${state.watchMatchedCount}`);
  console.log(`  lastMatchAt = ${state.lastMatchAt !== null ? 'set' : 'null'}\n`);
  
  assert(state.receivedCount === 1, "Received count = 1 after sig1");
  assert(state.watchMatchedCount === 1, "Match count = 1 after sig1 (panel + watch passed)");
  assert(state.lastMatchAt !== null, "lastMatchAt set after sig1");
  
  // Small delay to ensure time difference
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  setTimeout(() => {
    // Feed sig2 - panel rejects, should NOT increment or update lastMatchAt
    handleSignal(sig2, state, panelFilter, watchFilter);
    
    console.log("After sig2 (panel rejects CAPACITY):");
    console.log(`  receivedCount = ${state.receivedCount}`);
    console.log(`  watchMatchedCount = ${state.watchMatchedCount}`);
    console.log(`  lastMatchAt changed = ${state.lastMatchAt !== firstMatchTime}\n`);
    
    assert(state.receivedCount === 2, "Received count = 2 after sig2");
    assert(state.watchMatchedCount === 1, "Match count STILL 1 after sig2 (panel blocked)");
    assert(state.lastMatchAt === firstMatchTime, "lastMatchAt NOT updated after sig2 (panel blocked)");
    
    // Feed sig3 - watch rejects, should NOT increment or update lastMatchAt
    handleSignal(sig3, state, panelFilter, watchFilter);
    
    console.log("After sig3 (watch rejects 'natural gas'):");
    console.log(`  receivedCount = ${state.receivedCount}`);
    console.log(`  watchMatchedCount = ${state.watchMatchedCount}`);
    console.log(`  lastMatchAt changed = ${state.lastMatchAt !== firstMatchTime}\n`);
    
    assert(state.receivedCount === 3, "Received count = 3 after sig3");
    assert(state.watchMatchedCount === 1, "Match count STILL 1 after sig3 (watch blocked)");
    assert(state.lastMatchAt === firstMatchTime, "lastMatchAt NOT updated after sig3 (watch blocked)");
    
    console.log("✅ Last match tracking locked and verified!");
    console.log("   matchCount and lastMatchAt update ONLY when both panel + watch pass.");
  }, 10);
}

run();
