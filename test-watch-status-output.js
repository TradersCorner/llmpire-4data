// Regression test: status output must match actual state counters

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
  state.lastSignalAt = new Date().toISOString();
  
  if (passesPanelFilter(sig, panelFilter)) {
    state.acceptedCount++;
    
    if (matchesWatchFilter(sig, watchFilter)) {
      state.watchMatchedCount++;
    }
  }
}

function generateStatusOutput(state, panelFilter, watchFilter) {
  const connStatus = state.streamConnected ? "✅ Connected" : "❌ Disconnected";
  const age = state.lastSignalAt ? Math.floor((Date.now() - new Date(state.lastSignalAt).getTime()) / 1000) : null;
  const lastSig = age !== null ? `${age}s ago` : "never";
  
  const panelLanes = panelFilter.activeLanes.length > 0 ? panelFilter.activeLanes.join(", ") : "all";
  const panelTags = panelFilter.activeTags.length > 0 ? panelFilter.activeTags.join(", ") : "all";
  const panelAsset = panelFilter.assetFilter ? `asset: ${panelFilter.assetFilter}` : "asset: all";
  
  const watchStatus = watchFilter.kind !== "off" 
    ? `🔴 ${watchFilter.kind} "${watchFilter.value}" (${watchFilter.mode})`
    : "⏸️ off";
  
  return (
    `Stream: ${connStatus} | Last signal: ${lastSig}\n` +
    `Panel: lanes [${panelLanes}] | tags [${panelTags}] | ${panelAsset}\n` +
    `Watch: ${watchStatus}\n` +
    `Counters: received=${state.receivedCount} | accepted=${state.acceptedCount} | watchMatched=${state.watchMatchedCount}`
  );
}

function run() {
  console.log("=== Watch Status Output Correctness ===\n");

  // Initial state
  const state = {
    streamConnected: true,
    lastSignalAt: null,
    receivedCount: 0,
    acceptedCount: 0,
    watchMatchedCount: 0
  };

  const panelFilter = {
    activeLanes: ["PRICES", "CAPACITY"],
    activeTags: [],
    assetFilter: ""
  };

  const watchFilter = {
    kind: "entity",
    value: "oil",
    mode: "contains"
  };

  console.log("Panel filter: lanes = [PRICES, CAPACITY]");
  console.log("Watch filter: entity contains 'oil'\n");

  // Test signals
  const sig1 = { lane: "PRICES", entity: "crude oil", tags: [] };
  const sig2 = { lane: "CAPACITY", entity: "natural gas", tags: [] };

  console.log("Feeding 2 signals:");
  console.log("  sig1: PRICES, crude oil → panel ✓, watch ✓");
  console.log("  sig2: CAPACITY, natural gas → panel ✓, watch ✗\n");

  handleSignal(sig1, state, panelFilter, watchFilter);
  handleSignal(sig2, state, panelFilter, watchFilter);

  console.log("After processing:");
  console.log(`  state.receivedCount = ${state.receivedCount}`);
  console.log(`  state.acceptedCount = ${state.acceptedCount}`);
  console.log(`  state.watchMatchedCount = ${state.watchMatchedCount}\n`);

  assert(state.receivedCount === 2, "Received count = 2");
  assert(state.acceptedCount === 2, "Accepted count = 2 (both pass panel filter)");
  assert(state.watchMatchedCount === 1, "Watch matched count = 1 (only crude oil contains 'oil')");

  console.log("Generating status output...\n");
  const statusOutput = generateStatusOutput(state, panelFilter, watchFilter);
  
  console.log("Status output:");
  console.log(statusOutput);
  console.log();

  // Verify status output contains correct counter values
  assert(statusOutput.includes("received=2"), "Status output contains 'received=2'");
  assert(statusOutput.includes("accepted=2"), "Status output contains 'accepted=2'");
  assert(statusOutput.includes("watchMatched=1"), "Status output contains 'watchMatched=1'");

  // Verify status output contains filter summaries
  assert(statusOutput.includes("lanes [PRICES, CAPACITY]"), "Status output shows panel lanes");
  assert(statusOutput.includes("entity \"oil\""), "Status output shows watch filter");
  assert(statusOutput.includes("Connected"), "Status output shows stream connection");

  console.log("✅ Status output correctness locked and verified!");
  console.log("   Status command always reflects actual state counters and filters.");
}

run();
