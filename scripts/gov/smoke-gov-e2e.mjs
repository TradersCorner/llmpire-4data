#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";

const REQUIRE_NONEMPTY = process.argv.includes("--require-nonempty");
const repoRoot = findRepoRoot(process.cwd());

function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(process.cwd());
    dir = parent;
  }
}

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on("error", reject);
    req.setTimeout(10_000, () => {
      req.destroy(new Error("timeout"));
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close();
        return reject(new Error("could not allocate free port"));
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

function parseNdjsonFirstTerritoryId(filePath) {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(1024 * 1024);
  const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const head = buf.slice(0, bytes).toString("utf8");
  const lines = head.split(/\r?\n/).filter(Boolean);

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const t = obj?.territoryId;
      if (typeof t === "string" && t.length > 0) return t;
    } catch {
      // ignore
    }
  }
  return null;
}

function extractEnvFromDotEnvGov(dotEnvPath) {
  const raw = fs.readFileSync(dotEnvPath, "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\"/g, '"');
    env[k] = v;
  }
  return env;
}

async function waitForReady(baseUrl) {
  const probes = [
    "/health",
    "/health-digest",
    "/gov/metrics",
    "/",
  ];
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    for (const p of probes) {
      try {
        const r = await get(baseUrl + p);
        if (r.status >= 200 && r.status < 500) return true;
      } catch {
        // ignore
      }
    }
    await sleep(500);
  }
  throw new Error(`server did not become reachable within 30s at ${baseUrl}`);
}

function startServer(env, port) {
  const fullEnv = { ...process.env, ...env, PORT: String(port) };
  const entry = path.join(repoRoot, "src", "v1", "index.js");

  const child = spawn(process.execPath, [entry], {
    cwd: repoRoot,
    env: fullEnv,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  let stdoutBuf = "";
  child.stdout.on("data", (d) => {
    const s = d.toString("utf8");
    process.stdout.write(s);
    stdoutBuf += s;

    // Strong readiness: we only proceed when THIS child says it's listening.
    if (stdoutBuf.includes(`4data listening on http://localhost:${port}`)) {
      readyResolve(true);
    }

    // Keep buffer bounded
    if (stdoutBuf.length > 10_000) stdoutBuf = stdoutBuf.slice(-5_000);
  });

  let stderrBuf = "";
  child.stderr.on("data", (d) => {
    const s = d.toString("utf8");
    process.stderr.write(s);
    stderrBuf += s;
    if (stderrBuf.length > 10_000) stderrBuf = stderrBuf.slice(-5_000);
  });

  child.once("exit", (code) => {
    readyReject(new Error(`server exited early (code ${code ?? "?"})`));
  });

  return { child, ready };
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) return resolve();
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
    }, 5_000);
  });
}

function stableShapeSignature(obj) {
  if (obj === null || typeof obj !== "object") return String(typeof obj);
  if (Array.isArray(obj)) return `array(${obj.length})`;
  const keys = Object.keys(obj).sort();
  return `object(${keys.join(",")})`;
}

async function fetchQueues(baseUrl, territoryId) {
  // Try a few variants because we don't assume whether "queue" is required.
  const candidates = [
    `/gov/territory/${encodeURIComponent(territoryId)}/queues?includeNone=true`,
    `/gov/territory/${encodeURIComponent(territoryId)}/queues?queue=none&includeNone=true`,
    `/gov/territory/${encodeURIComponent(territoryId)}/queues?queue=needs_refresh&includeNone=true`,
    `/gov/territory/${encodeURIComponent(territoryId)}/queues?queue=needs_second_source&includeNone=true`,
    `/gov/territory/${encodeURIComponent(territoryId)}/queues?queue=blocked&includeNone=true`,
    `/gov/territory/${encodeURIComponent(territoryId)}/queues?queue=paused_by_ops&includeNone=true`,
  ];

  let last = null;
  for (const p of candidates) {
    const r = await get(baseUrl + p);
    last = r;
    if (r.status >= 200 && r.status < 300) return { ok: true, url: baseUrl + p, res: r };
  }
  return { ok: false, url: baseUrl + candidates[candidates.length - 1], res: last };
}

function countQueueItems(bodyObj) {
  const q = bodyObj?.queues;

  // Your actual API returns: { territoryId, queues: [...] }
  if (Array.isArray(q)) return q.length;

  // Backward-compatible: if someone later returns { queues: {k:[...]} }
  if (q && typeof q === "object") {
    let total = 0;
    for (const k of Object.keys(q)) {
      const v = q[k];
      if (Array.isArray(v)) total += v.length;
    }
    return total;
  }

  return 0;
}

async function main() {
  const port = await getFreePort();
  const baseUrl = `http://localhost:${port}`;

  console.error(`[smoke] using port=${port}`);

  // Step 1: ensure .env.gov exists by running your helper with --write-env
  console.error("[smoke] generating .env.gov via print-gov-env.mjs --both --write-env");
  const write = spawn(process.execPath, [
    path.join(repoRoot, "scripts", "gov", "print-gov-env.mjs"),
    "--both",
    "--write-env",
  ], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });

  const writeExit = await new Promise((r) => write.once("exit", (code) => r(code ?? 1)));
  if (writeExit !== 0) process.exit(writeExit);

  const dotEnvGov = path.join(repoRoot, ".env.gov");
  if (!fs.existsSync(dotEnvGov)) {
    console.error("[smoke] expected .env.gov but did not find it");
    process.exit(1);
  }

  const discovered = extractEnvFromDotEnvGov(dotEnvGov);
  const decisionPath = discovered.GOV_DECISION_CARDS_PATH;
  const adminPath = discovered.GOV_ADMIN_QUEUES_PATH;

  if (!decisionPath || !adminPath) {
    console.error("[smoke] .env.gov missing GOV_DECISION_CARDS_PATH or GOV_ADMIN_QUEUES_PATH");
    process.exit(1);
  }

  const territoryId = parseNdjsonFirstTerritoryId(decisionPath);
  if (!territoryId) {
    console.error(`[smoke] could not find a territoryId in decision cards: ${decisionPath}`);
    console.error(`[smoke] Exports must contain real claims with subjectId (territoryId). Refusing to proceed with synthetic fallback.`);
    process.exit(1);
  }

  console.error(`[smoke] using territoryId=${territoryId}`);

  // Step 2: run server with live OFF
  console.error("[smoke] starting server with GOV_QUEUES_LIVE=0");
  let started = startServer({
    GOV_QUEUES_LIVE: "0",
    GOV_DECISION_CARDS_PATH: decisionPath,
    GOV_ADMIN_QUEUES_PATH: adminPath,
  }, port);

  let child = started.child;

  try {
    await started.ready;
    const off = await fetchQueues(baseUrl, territoryId);
    if (!off.ok) {
      console.error("[smoke] live OFF: queues endpoint did not return 2xx");
      console.error(off.res?.status, off.res?.body);
      process.exit(1);
    }

    let offObj;
    try { offObj = JSON.parse(off.res.body); } catch {
      console.error("[smoke] live OFF: response not JSON");
      process.exit(1);
    }

    const offShape = stableShapeSignature(offObj?.body ?? offObj);
    const offCount = countQueueItems(offObj?.body ?? offObj);

    console.error(`[smoke] live OFF url=${off.url}`);
    console.error(`[smoke] live OFF shape=${offShape} totalItems=${offCount}`);

    // Step 3: restart with live ON
    await stopServer(child);

    console.error("[smoke] starting server with GOV_QUEUES_LIVE=1");
    started = startServer({
      GOV_QUEUES_LIVE: "1",
      GOV_DECISION_CARDS_PATH: decisionPath,
      GOV_ADMIN_QUEUES_PATH: adminPath,
    }, port);

    child = started.child;
    await started.ready;
    const on = await fetchQueues(baseUrl, territoryId);
    if (!on.ok) {
      console.error("[smoke] live ON: queues endpoint did not return 2xx");
      console.error(on.res?.status, on.res?.body);
      process.exit(1);
    }

    let onObj;
    try { onObj = JSON.parse(on.res.body); } catch {
      console.error("[smoke] live ON: response not JSON");
      process.exit(1);
    }

    const onShape = stableShapeSignature(onObj?.body ?? onObj);
    const onCount = countQueueItems(onObj?.body ?? onObj);

    console.error(`[smoke] live ON url=${on.url}`);
    console.error(`[smoke] live ON shape=${onShape} totalItems=${onCount}`);

    // Step 4: assertions
    if (offShape !== onShape) {
      console.error("[smoke][FAIL] contract shape changed between live OFF and ON");
      process.exit(1);
    }

    // Note: live OFF is intentionally empty (returns [] when GOV_QUEUES_LIVE=0)
    // so we only enforce non-empty for live ON when real exports are loaded.

    if (REQUIRE_NONEMPTY) {
      // This is the whole point: prove live data actually surfaces queue items
      if (onCount <= 0) {
        console.error("[smoke][FAIL] --require-nonempty set but live ON returned 0 queue items.");
        console.error("[smoke] Likely causes:");
        console.error("  - decision_card has no matching territoryId for the queried territory");
        console.error("  - decisionId overlap between decision_card and admin_queue is 0");
        console.error("  - queue filter excludes all items (try includeNone=true and queue=none)");
        console.error("  - adminQueue projection not present (decision cards default to none)");
        process.exit(1);
      }
      console.error(`[smoke] PASS: live ON has ${onCount} queue items (non-empty requirement met)`);
    }

    console.error("[smoke][PASS] GOV queues contract stable; live toggle loads real data");
  } finally {
    await stopServer(child);
  }
}

main().catch((e) => {
  console.error("[smoke][ERROR]", e?.stack || String(e));
  process.exit(1);
});
