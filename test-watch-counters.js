// Regression test: counter correctness for received/accepted/watchMatched

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
  if (!wf.kind) return false;
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

function run() {
  console.log("=== Watch Counter Correctness ===\n");

  // Test signals
  const signals = [
    { 
      id: "sig1", 
      lane: "PRICES", 
      entity: "crude oil", 
      tags: ["prices:energy"], 
      signal: "price_up",
      timestamp: new Date().toISOString()
    },
    { 
      id: "sig2", 
      lane: "CAPACITY", 
      entity: "natural gas", 
      tags: ["capacity:energy"], 
      signal: "capacity_drop",
      timestamp: new Date().toISOString()
    },
    { 
      id: "sig3", 
      lane: "INVENTORY", 
      entity: "gold", 
      tags: ["inventory:metals"], 
      signal: "stock_low",
      timestamp: new Date().toISOString()
    }
  ];

  // Filters: panel allows PRICES and CAPACITY, watch matches "oil"
  const panelFilter = {
    activeTags: [],
    activeLanes: ["PRICES", "CAPACITY"],
    assetFilter: ""
  };
  
  const watchFilter = {
    kind: "entity",
    value: "oil",
    mode: "contains"
  };

  let receivedCount = 0;
  let acceptedCount = 0;
  let watchMatchedCount = 0;

  console.log("Panel filter: lanes = [PRICES, CAPACITY]");
  console.log("Watch filter: entity contains 'oil'\n");

  for (const sig of signals) {
    receivedCount++;
    const panelPassed = passesPanelFilter(sig, panelFilter);
    const watchMatched = matchesWatchFilter(sig, watchFilter);
    
    if (panelPassed) acceptedCount++;
    if (panelPassed && watchMatched) watchMatchedCount++;
    
    console.log(`Signal ${sig.id} (${sig.lane}, ${sig.entity}):`);
    console.log(`  Panel: ${panelPassed ? "✓" : "✗"}, Watch: ${watchMatched ? "✓" : "✗"}`);
  }

  console.log("\nExpected results:");
  console.log("  sig1 (PRICES, crude oil): panel ✓, watch ✓ → accepted, watch matched");
  console.log("  sig2 (CAPACITY, natural gas): panel ✓, watch ✗ → accepted only");
  console.log("  sig3 (INVENTORY, gold): panel ✗, watch ✗ → neither");

  assert(receivedCount === 3, `Received count = 3 (got ${receivedCount})`);
  assert(acceptedCount === 2, `Accepted count = 2 (got ${acceptedCount})`);
  assert(watchMatchedCount === 1, `Watch matched count = 1 (got ${watchMatchedCount})`);

  console.log("\n✅ Counter correctness locked and verified!");
  console.log("   Filters correctly partition signals into received/accepted/watch matched.");
}

run();
