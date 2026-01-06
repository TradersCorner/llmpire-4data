import http from "http";
import { spawn } from "child_process";
import { buildRegionalCapacity } from "./src/forge/builders/regionalCapacity.js";
import { buildRegionalPrices } from "./src/forge/builders/pricesSignal.js";

const BRIDGE_PORT = 3001;
const V1_PORT = 3000;

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

function request({ method, port, path, body }) {
  const data = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port,
        path,
        method,
        headers: data
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
          : {}
      },
      res => {
        let chunks = "";
        res.on("data", c => (chunks += c));
        res.on("end", () => {
          const text = chunks.toString();
          try {
            const json = JSON.parse(text);
            resolve(json);
          } catch {
            resolve(text);
          }
        });
      }
    );

    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function waitForHealth(port) {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await request({ method: "GET", port, path: "/health" });
      if (res && res.status === "ok") return;
    } catch (err) {
      // keep waiting
    }
    await sleep(250);
  }
  throw new Error(`Service on port ${port} did not become healthy`);
}

function startProc(cmd, args) {
  const child = spawn(cmd, args, { stdio: "inherit" });
  return child;
}

async function main() {
  const v1 = startProc("node", ["src/v1/index.js"]);
  const bridge = startProc("node", ["src/bridge/index.js"]);

  try {
    await sleep(300); // v1 has no health endpoint; allow boot
    await waitForHealth(BRIDGE_PORT);

    // Initial metrics
    const coldMetrics = await request({ method: "GET", port: BRIDGE_PORT, path: "/metrics" });
    console.log("Cold metrics", coldMetrics);

    if (coldMetrics?.compose?.requests !== 0 || coldMetrics?.compose?.rateLimited !== 0) {
      throw new Error("Compose metrics not zero on cold start");
    }

    // Emit capacity signals (two valid toggles)
    await request({ method: "POST", port: V1_PORT, path: "/request", body: { region: "PGC", available: false } });
    await request({ method: "POST", port: V1_PORT, path: "/request", body: { region: "PGC", available: true } });
    await request({ method: "POST", port: V1_PORT, path: "/request", body: { region: "PGC", available: false } });

    // Emit prices valid
    await request({ method: "POST", port: V1_PORT, path: "/request", body: { region: "PGC", signal: "price_up", lane: "prices", currency: "USD", change_pct: 1.2 } });
    // Emit prices invalid (bad currency)
    await request({ method: "POST", port: V1_PORT, path: "/request", body: { region: "PGC", signal: "price_up", lane: "prices", currency: "US", change_pct: 99 } });

    await sleep(500);

    const metricsAfterEvents = await request({ method: "GET", port: BRIDGE_PORT, path: "/metrics" });
    console.log("Metrics after events", metricsAfterEvents);

    // Snapshots
    const capSnap = await request({ method: "POST", port: BRIDGE_PORT, path: "/snapshot", body: { lane: "capacity", window: "5m", intent: "test", region: "PGC" } });
    const priceSnap = await request({ method: "POST", port: BRIDGE_PORT, path: "/snapshot", body: { lane: "prices", window: "5m", intent: "test", region: "PGC" } });

    const capProduct = buildRegionalCapacity(capSnap);
    const priceProduct = buildRegionalPrices(priceSnap);

    const capCompose1 = await request({ method: "POST", port: BRIDGE_PORT, path: "/compose", body: { lane: "capacity", snapshot: capSnap, product: capProduct } });
    const capCompose2 = await request({ method: "POST", port: BRIDGE_PORT, path: "/compose", body: { lane: "capacity", snapshot: capSnap, product: capProduct } });
    const priceCompose1 = await request({ method: "POST", port: BRIDGE_PORT, path: "/compose", body: { lane: "prices", snapshot: priceSnap, product: priceProduct } });
    const priceCompose2 = await request({ method: "POST", port: BRIDGE_PORT, path: "/compose", body: { lane: "prices", snapshot: priceSnap, product: priceProduct } });

    const capDeterministic = JSON.stringify(capCompose1.composed) === JSON.stringify(capCompose2.composed);
    const priceDeterministic = JSON.stringify(priceCompose1.composed) === JSON.stringify(priceCompose2.composed);

    const ingestCapacity = metricsAfterEvents?.ingest?.perLane?.capacity || 0;
    const ingestPrices = metricsAfterEvents?.ingest?.perLane?.prices || 0;
    const rejectedPrices = metricsAfterEvents?.rejected?.perLane?.prices || 0;

    if (!capDeterministic || !priceDeterministic) {
      throw new Error("Composer determinism failed");
    }

    if (ingestCapacity < 2 || ingestPrices < 1) {
      throw new Error("Ingest counts missing expected events");
    }

    if (rejectedPrices < 1) {
      throw new Error("Rejected counter did not increment for bad price input");
    }

    if (!metricsAfterEvents || metricsAfterEvents.ingest?.total === undefined) {
      throw new Error("Metrics unavailable");
    }

    // Rate limit burst
    let rateLimitedResponses = 0;
    const burstRequests = 30;
    const burstPayload = { lane: "prices", snapshot: priceSnap, product: priceProduct };
    const burst = Array.from({ length: burstRequests }, () =>
      request({ method: "POST", port: BRIDGE_PORT, path: "/compose", body: burstPayload })
    );
    const burstResults = await Promise.all(burst);
    for (const res of burstResults) {
      if (res?.error === "Rate limit exceeded") {
        rateLimitedResponses += 1;
      }
    }

    const metricsAfterCompose = await request({ method: "GET", port: BRIDGE_PORT, path: "/metrics" });

    const composeRequests = metricsAfterCompose?.compose?.requests || 0;
    const composeRateLimited = metricsAfterCompose?.compose?.rateLimited || 0;

    if (composeRequests < burstRequests + 4) {
      throw new Error("Compose requests metric missing expected traffic");
    }

    if (composeRateLimited < rateLimitedResponses || rateLimitedResponses === 0) {
      throw new Error("Compose rate-limit not enforced or not counted");
    }

    if (metricsAfterCompose?.decay?.highWaterMark === undefined) {
      throw new Error("Decay cache HWM missing from metrics");
    }

    console.log("Runtime verification passed.");
    process.exit(0);
  } catch (err) {
    console.error("Runtime verification failed:", err.message);
    process.exit(1);
  } finally {
    bridge.kill();
    v1.kill();
  }
}

main();
