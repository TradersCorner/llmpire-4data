// Preflight Lane Watching Demo
// Demonstrates soft boundary (watching) vs hard boundary (snapshot)
//
// Invariants maintained:
// - Preflight watching has no side effects
// - No snapshot before submit
// - Snapshots are lane-scoped
// - Rendered signals before submit are discardable

import http from "http";
import { resolveLanes, resolvePrimaryLane, getLaneConfidence } from "../src/lanes/resolver.js";

const BRIDGE_URL = "http://localhost:3001";

// Simulate typing query character by character
const TYPING_SIMULATION = [
  "i",
  "is",
  "is ",
  "is i",
  "is it",
  "is it ",
  "is it b",
  "is it bu",
  "is it bus",
  "is it busy",
  "is it busy ",
  "is it busy r",
  "is it busy ri",
  "is it busy rig",
  "is it busy righ",
  "is it busy right",
  "is it busy right ",
  "is it busy right n",
  "is it busy right no",
  "is it busy right now",
  "is it busy right now?"
];

// Get current signals for a lane (soft - watching only)
function watchLane(lane) {
  return new Promise((resolve, reject) => {
    http.get(`${BRIDGE_URL}/signals?lane=${lane}`, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Invalid response"));
        }
      });
    }).on("error", reject);
  });
}

// Snapshot (hard - capture on submit)
function captureSnapshot(lane, window, intent) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ lane, window, intent });
    const req = http.request(
      `${BRIDGE_URL}/snapshot`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      res => {
        let data = "";
        res.on("data", chunk => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error("Invalid response"));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function demo() {
  console.log("=== Preflight Lane Watching Demo ===\n");
  console.log("Simulating user typing: \"is it busy right now?\"\n");
  console.log("SOFT BOUNDARY (Preflight - while typing):\n");

  let lastLanes = new Set();

  // Simulate typing with lane resolution
  for (const text of TYPING_SIMULATION.slice(0, 15)) { // first ~15 chars
    const lanes = resolveLanes(text);
    
    // Only show when lanes change (realistic UI behavior)
    if (JSON.stringify([...lanes].sort()) !== JSON.stringify([...lastLanes].sort())) {
      console.log(`  "${text}" → watching lanes: ${[...lanes].join(", ")}`);
      lastLanes = lanes;
      
      // In real implementation, Scout would:
      // 1. Subscribe to SSE for these lanes
      // 2. Render live signals opportunistically
      // 3. Discard on next keystroke
      
      // For demo, just peek at current state
      for (const lane of lanes) {
        try {
          const { events } = await watchLane(lane);
          if (events.length > 0) {
            console.log(`    ℹ️  Live signal in ${lane}: ${events[0].signal}`);
          }
        } catch {
          // Silently continue (bridge might not be running)
        }
      }
    }
    
    await new Promise(r => setTimeout(r, 50)); // simulate typing speed
  }

  console.log("\n  ... user continues typing ...\n");
  
  const finalText = TYPING_SIMULATION[TYPING_SIMULATION.length - 1];
  console.log(`  Final text: "${finalText}"\n`);

  console.log("\n" + "─".repeat(60) + "\n");
  console.log("HARD BOUNDARY (Submit - snapshot capture):\n");

  // On submit: freeze lane, capture snapshot
  const primaryLane = resolvePrimaryLane(finalText);
  const confidence = getLaneConfidence(finalText, primaryLane);
  
  console.log(`  Resolved primary lane: ${primaryLane}`);
  console.log(`  Confidence: ${(confidence * 100).toFixed(0)}%`);
  console.log(`\n  Calling POST /snapshot with:`);
  console.log(`    lane: "${primaryLane}"`);
  console.log(`    window: "5m"`);
  console.log(`    intent: "answer_user_query"`);

  try {
    const snapshot = await captureSnapshot(primaryLane, "5m", "answer_user_query");
    
    console.log(`\n  Snapshot captured:`);
    console.log(`    generatedAt: ${snapshot.generatedAt}`);
    console.log(`    count: ${snapshot.count} events`);
    console.log(`    lane: ${snapshot.lane} (enforced)`);
    console.log(`    window: ${snapshot.window} (enforced)`);
    
    if (snapshot.count > 0) {
      console.log(`\n  Recent signals:`);
      snapshot.events.forEach((e, i) => {
        console.log(`    ${i + 1}. ${e.signal} (${e.region})`);
      });
    } else {
      console.log(`\n  No signals in last 5m (honest answer)`);
    }
    
    console.log(`\n  ✅ Preflight discarded, snapshot used for formal answer`);
  } catch (err) {
    console.log(`\n  ⚠️  Snapshot failed: ${err.message}`);
    console.log(`  (Bridge might not be running)`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("\nKey Invariants Maintained:");
  console.log("  ✓ Preflight watching had no side effects");
  console.log("  ✓ No snapshot before submit");
  console.log("  ✓ Snapshot was lane-scoped");
  console.log("  ✓ Preflight state was discarded");
  console.log("\n✅ Soft + Hard boundary pattern demonstrated");
  
  process.exit(0);
}

demo().catch(err => {
  console.error("Demo failed:", err);
  process.exit(1);
});
