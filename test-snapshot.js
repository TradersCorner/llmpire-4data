// Snapshot enforcement acceptance tests
import http from "http";
import test from "node:test";

// Quarantine: integration test requires live server on port 3001
if (!process.env.RUN_INTEGRATION_TESTS) {
  test("snapshot integration (skipped unless RUN_INTEGRATION_TESTS=1)", { skip: true }, () => {});
  process.exit(0);
}

function post(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request(
      { 
        hostname: "localhost", 
        port: 3001, 
        path, 
        method: "POST", 
        headers: { 
          "Content-Type": "application/json", 
          "Content-Length": Buffer.byteLength(body) 
        } 
      },
      res => {
        let responseData = "";
        res.on("data", chunk => (responseData += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(responseData) });
          } catch {
            resolve({ status: res.statusCode, data: responseData });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function testSnapshot() {
  console.log("=== Snapshot Enforcement Acceptance Tests ===\n");
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Missing lane → 400
  console.log("1. POST /snapshot without lane → expect 400");
  const t1 = await post("/snapshot", { window: "5m", intent: "test" });
  if (t1.status === 400) {
    console.log("   ✅ 400 (correct):", t1.data.error);
    passed++;
  } else {
    console.log("   ❌ Got", t1.status);
    failed++;
  }
  
  // Test 2: Invalid lane → 400
  console.log("\n2. Invalid lane → expect 400");
  const t2 = await post("/snapshot", { lane: "invalid", window: "5m", intent: "test" });
  if (t2.status === 400) {
    console.log("   ✅ 400 (correct):", t2.data.error);
    passed++;
  } else {
    console.log("   ❌ Got", t2.status);
    failed++;
  }
  
  // Test 3: Missing window → 400
  console.log("\n3. Missing window → expect 400");
  const t3 = await post("/snapshot", { lane: "capacity", intent: "test" });
  if (t3.status === 400) {
    console.log("   ✅ 400 (correct):", t3.data.error);
    passed++;
  } else {
    console.log("   ❌ Got", t3.status);
    failed++;
  }
  
  // Test 4: Invalid window → 400
  console.log("\n4. Invalid window → expect 400");
  const t4 = await post("/snapshot", { lane: "capacity", window: "10m", intent: "test" });
  if (t4.status === 400) {
    console.log("   ✅ 400 (correct):", t4.data.error);
    passed++;
  } else {
    console.log("   ❌ Got", t4.status);
    failed++;
  }
  
  // Test 5: Missing intent → 400
  console.log("\n5. Missing intent → expect 400");
  const t5 = await post("/snapshot", { lane: "capacity", window: "5m" });
  if (t5.status === 400) {
    console.log("   ✅ 400 (correct):", t5.data.error);
    passed++;
  } else {
    console.log("   ❌ Got", t5.status);
    failed++;
  }
  
  // Test 6: Empty intent → 400
  console.log("\n6. Empty intent → expect 400");
  const t6 = await post("/snapshot", { lane: "capacity", window: "5m", intent: "" });
  if (t6.status === 400) {
    console.log("   ✅ 400 (correct):", t6.data.error);
    passed++;
  } else {
    console.log("   ❌ Got", t6.status);
    failed++;
  }
  
  // Test 7: Valid request → 200
  console.log("\n7. Valid snapshot request → expect 200");
  const t7 = await post("/snapshot", { 
    lane: "capacity", 
    window: "5m", 
    intent: "answer_user_query" 
  });
  if (t7.status === 200) {
    console.log("   ✅ 200 (correct)");
    console.log("   Snapshot metadata:", {
      lane: t7.data.lane,
      window: t7.data.window,
      intent: t7.data.intent,
      count: t7.data.count,
      generatedAt: t7.data.generatedAt
    });
    passed++;
  } else {
    console.log("   ❌ Got", t7.status);
    failed++;
  }
  
  // Test 8: Different windows
  console.log("\n8. Test all valid windows → expect 200");
  let windowsPassed = 0;
  for (const window of ["1m", "5m", "15m", "1h"]) {
    const t = await post("/snapshot", { 
      lane: "capacity", 
      window, 
      intent: "test_window" 
    });
    if (t.status === 200 && t.data.window === window) {
      windowsPassed++;
    }
  }
  if (windowsPassed === 4) {
    console.log("   ✅ All windows valid (1m, 5m, 15m, 1h)");
    passed++;
  } else {
    console.log("   ❌ Only", windowsPassed, "/ 4 windows passed");
    failed++;
  }
  
  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log("\n✅ Snapshot enforcement locked and verified!");
  } else {
    console.log("\n❌ Some tests failed");
  }
  
  process.exit(failed === 0 ? 0 : 1);
}

testSnapshot().catch(err => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
