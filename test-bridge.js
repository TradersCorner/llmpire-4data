// Quick test: send event to v1, query bridge
import http from "http";

function post(data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request(
      { hostname: "localhost", port: 3000, path: "/request", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      res => {
        let data = "";
        res.on("data", chunk => (data += chunk));
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3001${path}`, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });
}

async function test() {
  console.log("1. Sending capacity_tightening event to v1...");
  await post({ region: "PGC", available: false });
  
  console.log("2. Waiting 500ms for ingestion...");
  await new Promise(r => setTimeout(r, 500));
  
  console.log("3. Querying /lanes...");
  const lanes = await get("/lanes");
  console.log(JSON.stringify(lanes, null, 2));
  
  console.log("\n4. Querying /signals?lane=capacity...");
  const capacitySignals = await get("/signals?lane=capacity");
  console.log(JSON.stringify(capacitySignals, null, 2));
  
  console.log("\n5. Testing invalid lane (should 400)...");
  try {
    await get("/signals?lane=invalid");
  } catch (e) {
    console.log("✓ Invalid lane rejected (expected)");
  }
  
  console.log("\n✅ Tests complete");
  process.exit(0);
}

test().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
