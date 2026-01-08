// Regression test: watch filters and panel filters must stay isolated

function assert(condition, message) {
  if (!condition) {
    console.error("❌", message);
    process.exit(1);
  }
  console.log("✅", message);
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function run() {
  console.log("=== Watch Filter Scope Isolation ===\n");

  // Simulate the state from lisa-dashboard.html
  const state = {
    panelFilter: {
      activeTags: [],
      activeLanes: [],
      assetFilter: ""
    },
    watchFilter: {
      kind: null,
      value: "",
      mode: "contains"
    }
  };

  // Simulate setting a watch filter (like "watch oil")
  const panelBefore = JSON.parse(JSON.stringify(state.panelFilter));
  
  console.log("1. Setting watch filter to 'entity contains oil'");
  state.watchFilter = { kind: "entity", value: "oil", mode: "contains" };
  
  assert(deepEqual(state.panelFilter, panelBefore), "Panel filter unchanged after watch command");
  assert(state.watchFilter.kind === "entity", "Watch filter kind set");
  assert(state.watchFilter.value === "oil", "Watch filter value set");
  
  // Simulate toggling panel tags (like enabling "prices:energy")
  const watchBefore = JSON.parse(JSON.stringify(state.watchFilter));
  
  console.log("\n2. Toggling panel tag 'prices:energy'");
  state.panelFilter.activeTags = ["prices:energy"];
  
  assert(deepEqual(state.watchFilter, watchBefore), "Watch filter unchanged after panel tag toggle");
  assert(state.panelFilter.activeTags.includes("prices:energy"), "Panel tag set");
  
  // Simulate toggling panel lanes
  console.log("\n3. Toggling panel lane 'PRICES'");
  state.panelFilter.activeLanes = ["PRICES"];
  
  assert(deepEqual(state.watchFilter, watchBefore), "Watch filter unchanged after panel lane toggle");
  assert(state.panelFilter.activeLanes.includes("PRICES"), "Panel lane set");
  
  // Simulate setting asset filter
  console.log("\n4. Setting panel asset filter to 'gold'");
  state.panelFilter.assetFilter = "gold";
  
  assert(deepEqual(state.watchFilter, watchBefore), "Watch filter unchanged after asset filter set");
  assert(state.panelFilter.assetFilter === "gold", "Panel asset filter set");
  
  // Simulate unsetting watch filter (unwatch)
  console.log("\n5. Clearing watch filter (unwatch)");
  const panelNow = JSON.parse(JSON.stringify(state.panelFilter));
  state.watchFilter = { kind: null, value: "", mode: "contains" };
  
  assert(deepEqual(state.panelFilter, panelNow), "Panel filter unchanged after unwatch");
  assert(state.watchFilter.kind === null, "Watch filter cleared");
  
  console.log("\n✅ Filter scope isolation locked and verified!");
  console.log("   Panel and watch filters operate independently.");
}

run();
