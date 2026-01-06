import http from "http";
import { getHealthStatus } from "./scheduler.js";

const HEALTH_PORT = process.env.DIGEST_HEALTH_PORT || 3002;

export function startHealthServer() {
  console.log(`[digest] Attempting to bind health server on port ${HEALTH_PORT}...`);
  
  const server = http.createServer((req, res) => {
    console.log(`[digest] Health request: ${req.method} ${req.url}`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/health-digest") {
      const status = getHealthStatus();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status, null, 2));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.on("error", (err) => {
    console.error(`[digest] Health server error: ${err.message}`);
  });

  server.on("listening", () => {
    console.log(`[digest] Health server is now listening on ${HEALTH_PORT}`);
  });

  server.listen(HEALTH_PORT, "127.0.0.1", () => {
    console.log(`[digest] Health endpoint: http://localhost:${HEALTH_PORT}/health-digest`);
  });

  return server;
}
