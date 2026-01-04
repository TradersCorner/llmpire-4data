// 4data-bridge-metrics v0
// Derived observer for 4data v1.0.0-ephemeral.
// Connects to /stream (SSE), tracks simple metrics, and writes snapshots.

import http from "http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const METRICS_LOG_PATH = path.join(__dirname, "..", "metrics.jsonl");

const startTime = Date.now();
let updatesTotal = 0;
let expiresTotal = 0;
let lastActiveStartMs = null;
let lastActiveDurationMs = null;

function snapshot(reason) {
  const uptimeMs = Date.now() - startTime;
  const record = {
    at: new Date().toISOString(),
    reason,
    updates_total: updatesTotal,
    expires_total: expiresTotal,
    last_active_duration_ms: lastActiveDurationMs,
    uptime_ms: uptimeMs
  };

  const line = JSON.stringify(record);
  console.log("[metrics]", line);

  fs.appendFile(METRICS_LOG_PATH, line + "\n", err => {
    if (err) {
      console.error("[metrics] failed to write metrics.jsonl:", err.message);
    }
  });
}

function handleEvent(type, data) {
  if (type === "hello") {
    snapshot("hello");
    return;
  }

  if (type === "state_update") {
    updatesTotal += 1;
    lastActiveStartMs = Date.now();
    snapshot("state_update");
    return;
  }

  if (type === "state_expired") {
    expiresTotal += 1;
    if (lastActiveStartMs != null) {
      lastActiveDurationMs = Date.now() - lastActiveStartMs;
    }
    snapshot("state_expired");
    return;
  }

  // Unknown event types are still recorded for visibility
  snapshot(type);
}

function connect() {
  const req = http.request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/stream",
      method: "GET",
      headers: {
        Accept: "text/event-stream"
      }
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

          // Empty line signals end of an SSE event
          if (!line) {
            if (currentEvent && currentEvent.type && currentEvent.data !== undefined) {
              handleEvent(currentEvent.type, currentEvent.data);
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
        console.log("[metrics] stream ended; reconnecting in 1000ms");
        setTimeout(connect, 1000);
      });
    }
  );

  req.on("error", err => {
    console.error("[metrics] connection error:", err.message);
    setTimeout(connect, 1000);
  });

  req.end();
}

console.log("[metrics] starting 4data-bridge-metrics v0");
connect();
