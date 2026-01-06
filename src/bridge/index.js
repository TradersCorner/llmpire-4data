// Bridge: lane-aware observer of v1 SSE stream
// Responsibilities:
// - Connect to v1 SSE (/stream)
// - Index events by lane
// - Expose lane-scoped API
// - Reject events missing valid lanes
// - Enforce: no event exists outside a lane bucket

import http from "http";
import { LANES, isValidLane } from "../lanes/registry.js";
import { validatePriceEvent } from "../lanes/pricesVocab.js";
import { decayCache } from "../decay/decayCache.js";
import { composeCapacity } from "../composer/capacityComposer.js";
import { composePrices } from "../composer/pricesComposer.js";
import {
  recordIngest,
  recordComposer,
  getMetrics,
  recordRejected,
  recordComposeRequest,
  recordComposeRateLimited
} from "./metrics.js";

// Lane-indexed in-memory storage
const eventsByLane = new Map();
for (const lane of Object.keys(LANES)) {
  eventsByLane.set(lane, []);
}

// Valid snapshot windows
const WINDOWS = new Set(["1m", "5m", "15m", "1h"]);

const COMPOSE_RATE_LIMIT_PER_SEC = 20;
let composeWindowStartMs = 0;
let composeWindowCount = 0;

function bad(res, msg) {
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: msg }));
}

function isComposeRateLimited() {
  const now = Date.now();
  if (now - composeWindowStartMs >= 1000) {
    composeWindowStartMs = now;
    composeWindowCount = 0;
  }
  composeWindowCount += 1;
  return composeWindowCount > COMPOSE_RATE_LIMIT_PER_SEC;
}

function requireSnapshotParams(body) {
  const { lane, window, intent } = body || {};

  if (!lane || !isValidLane(lane)) {
    throw new Error("Valid lane required");
  }

  if (!window || !WINDOWS.has(window)) {
    throw new Error("Valid window required (1m, 5m, 15m, 1h)");
  }

  if (!intent || typeof intent !== "string" || !intent.trim()) {
    throw new Error("Intent required (non-empty string)");
  }

  return { lane, window, intent };
}

// Slice events by time window (lane-scoped only)
function sliceWindow(events, window) {
  const now = Date.now();
  const ms =
    window === "1m"  ? 60_000  :
    window === "5m"  ? 300_000 :
    window === "15m" ? 900_000 :
    3_600_000; // 1h

  return events.filter(e => {
    const receivedTime = new Date(e.receivedAt).getTime();
    return now - receivedTime <= ms;
  });
}

// SSE client state
let sseConnection = null;
let reconnectTimer = null;

// Lane ingestion: add event to the correct lane bucket
function ingestEvent(event) {
  if (!event.lane) {
    console.error(`[bridge] Event missing lane field. Dropped:`, event);
    recordRejected("unknown", "missing_lane");
    return;
  }

  if (!isValidLane(event.lane)) {
    console.error(`[bridge] Invalid lane: ${event.lane}. Dropped:`, event);
    recordRejected(event.lane, "invalid_lane");
    return;
  }

  let normalizedEvent = event;

  if (event.lane === "prices") {
    const validation = validatePriceEvent(event);
    if (!validation.ok) {
      console.error(`[bridge] Dropped prices event (invalid): ${validation.reason}`);
      recordRejected(event.lane, validation.reason);
      return;
    }
    normalizedEvent = validation.normalized;
  }

  const receivedAt = new Date().toISOString();

  const bucket = eventsByLane.get(event.lane);
  bucket.push({
    ...normalizedEvent,
    receivedAt
  });

  const MAX_EVENTS_PER_LANE = 100;
  if (bucket.length > MAX_EVENTS_PER_LANE) {
    bucket.shift();
  }

  decayCache.update(event.lane, event.region || "unknown", normalizedEvent.signal, receivedAt);

  recordIngest({ ...normalizedEvent, lane: event.lane, source: event.source }, receivedAt);

  console.log(`[bridge] Ingested to lane "${event.lane}": ${normalizedEvent.signal} (${bucket.length} total)`);
}

// SSE connection to v1
function connectToV1Stream() {
  console.log("[bridge] Connecting to v1 SSE stream...");

  const req = http.request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/stream",
      method: "GET",
      headers: { Accept: "text/event-stream" }
    },
    res => {
      res.setEncoding("utf8");

      let buffer = "";
      let currentEvent = null;

      res.on("data", chunk => {
        buffer += chunk;

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const raw of lines) {
          const line = raw.trimEnd();

          if (!line) {
            if (currentEvent?.type && currentEvent?.data) {
              handleV1Event(currentEvent.type, currentEvent.data);
            }
            currentEvent = null;
            continue;
          }

          if (line.startsWith("event: ")) {
            currentEvent = currentEvent || {};
            currentEvent.type = line.slice("event: ".length).trim();
          } else if (line.startsWith("data: ")) {
            currentEvent = currentEvent || {};
            const json = line.slice("data: ".length);
            try {
              currentEvent.data = JSON.parse(json);
            } catch {
              currentEvent.data = json;
            }
          }
        }
      });

      res.on("end", () => {
        console.log("[bridge] v1 stream ended; reconnecting in 2s");
        reconnectTimer = setTimeout(connectToV1Stream, 2000);
      });
    }
  );

  req.on("error", err => {
    console.error("[bridge] v1 connection error:", err.message);
    reconnectTimer = setTimeout(connectToV1Stream, 2000);
  });

  req.end();
  sseConnection = req;
}

// Handle v1 SSE events
function handleV1Event(type, data) {
  if (type === "hello") {
    console.log("[bridge] Connected to v1 at", new Date(data.connectedAt).toISOString());
    return;
  }

  if (type === "state_update") {
    ingestEvent(data);
    return;
  }

  if (type === "state_expired") {
    console.log("[bridge] State expired at", new Date(data.expiredAt).toISOString());
    return;
  }

  console.log(`[bridge] Unhandled event: ${type}`, data);
}

// API server
const apiServer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.method === "GET" && req.url === "/metrics") {
    const decayStats = decayCache.getStats();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ...getMetrics(), decay: decayStats }));
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/signals")) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const lane = url.searchParams.get("lane");

    if (!lane || !isValidLane(lane)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "Valid lane required",
        validLanes: Object.keys(LANES)
      }));
      return;
    }

    const events = eventsByLane.get(lane) || [];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ lane, events, count: events.length }));
    return;
  }

  if (req.method === "GET" && req.url === "/lanes") {
    const summary = {};
    for (const [lane, events] of eventsByLane.entries()) {
      summary[lane] = {
        count: events.length,
        description: LANES[lane]?.description || ""
      };
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ lanes: summary }));
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/decay")) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const lane = url.searchParams.get("lane");
    const region = url.searchParams.get("region");

    if (!lane && !region) {
      const stats = decayCache.getStats();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(stats));
      return;
    }

    if (!lane || !isValidLane(lane)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "Valid lane required",
        validLanes: Object.keys(LANES)
      }));
      return;
    }

    if (region) {
      const state = decayCache.get(lane, region);
      if (!state) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No decay state for this lane+region" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(state));
      return;
    }

    const entries = decayCache.getLane(lane);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ lane, entries, count: entries.length }));
    return;
  }

  if (req.method === "POST" && req.url === "/snapshot") {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        bad(res, "Invalid JSON");
        return;
      }

      let params;
      try {
        params = requireSnapshotParams(payload);
      } catch (err) {
        bad(res, err.message);
        return;
      }

      const { lane, window, intent } = params;
      const bucket = eventsByLane.get(lane);
      if (!bucket) {
        bad(res, "Lane bucket missing (internal error)");
        return;
      }

      const data = sliceWindow(bucket, window);
      const decay = decayCache.get(lane, payload.region || null);

      const snapshot = {
        lane,
        window,
        intent,
        generatedAt: new Date().toISOString(),
        count: data.length,
        events: data.map(e => ({
          signal: e.signal,
          region: e.region,
          expiresAt: e.expiresAt,
          receivedAt: e.receivedAt
        }))
      };

      if (decay && payload.region) {
        snapshot.decay = {
          pressure: decay.pressure,
          updatedAt: decay.updatedAt,
          halfLifeSeconds: decay.halfLifeSeconds,
          lastSignal: decay.lastSignal
        };
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(snapshot));
    });

    return;
  }

  if (req.method === "POST" && req.url === "/compose") {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        bad(res, "Invalid JSON");
        return;
      }

      const { lane, snapshot, product } = payload;

      recordComposeRequest();

      if (isComposeRateLimited()) {
        recordComposeRateLimited();
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Rate limit exceeded" }));
        return;
      }

      if (!snapshot) {
        bad(res, "Snapshot required");
        return;
      }

      let result;
      if (lane === "capacity") {
        result = composeCapacity(snapshot, product || null);
        recordComposer("capacity");
      } else if (lane === "prices") {
        result = composePrices(snapshot, product || null);
        recordComposer("prices");
      } else {
        bad(res, "Unsupported lane for composer");
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    });

    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// Start bridge
const BRIDGE_PORT = 3001;
apiServer.listen(BRIDGE_PORT, () => {
  console.log(`[bridge] API listening on http://localhost:${BRIDGE_PORT}`);
  console.log(`[bridge] Endpoints:`);
  console.log(`  GET /signals?lane=<lane>`);
  console.log(`  GET /lanes`);
  console.log(`  GET /decay (stats) | /decay?lane=<lane> | /decay?lane=<lane>&region=<region>`);
  console.log(`  POST /snapshot (body: { lane, window, intent, region? })`);
  console.log(`  POST /compose (body: { lane, snapshot, product? })`);
  connectToV1Stream();
});

// Graceful shutdown (only on explicit SIGINT, e.g., Ctrl+C)
if (process.platform !== "win32") {
  process.on("SIGINT", () => {
    console.log("\n[bridge] Shutting down...");
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (sseConnection) sseConnection.destroy();
    apiServer.close(() => {
      console.log("[bridge] Closed.");
      process.exit(0);
    });
  });
}
