import { spawn } from "node:child_process";
import * as readline from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { createHash } from "node:crypto";

export type SidekickEvent = {
  ts: string;
  lane: string; // e.g. "demand"
  geo: string;  // e.g. "Escambia County, FL"
  surface: string; // url
  field: string;   // numeric field name
  prev: number | null;
  curr: number | null;
  delta: number | null;
  [k: string]: unknown;
};

export type BridgeConfig = {
  requestUrl: string;
  spawnCmd: string | null;
  readStdin: boolean;
  dryRun: boolean;
  maxInFlight: number;
  maxQueue: number;
  timeoutMs: number;
  retryMax: number;
};

const DEFAULTS = {
  maxInFlight: 1, // keep ordering strict
  maxQueue: 2000,
  timeoutMs: 10_000,
  retryMax: 5,
  dedupTtlMs: 5 * 60_000, // 5 minutes
  healthIntervalMs: 10_000, // 10 seconds
  shutdownDrainMs: 5_000, // 5 seconds
  maxRawBytes: 8_192, // ~8KB cap for raw blobs
} as const;

function parseArgs(argv: string[]): BridgeConfig {
  const cfg: BridgeConfig = {
    requestUrl: process.env.V1_REQUEST_URL?.trim() || "http://localhost:3000/request",
    spawnCmd: null,
    readStdin: false,
    dryRun: false,
    maxInFlight: DEFAULTS.maxInFlight,
    maxQueue: DEFAULTS.maxQueue,
    timeoutMs: DEFAULTS.timeoutMs,
    retryMax: DEFAULTS.retryMax,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--requestUrl") cfg.requestUrl = String(argv[++i] || "").trim();
    else if (a === "--spawn") cfg.spawnCmd = String(argv[++i] || "").trim();
    else if (a === "--stdin") cfg.readStdin = true;
    else if (a === "--dryRun") cfg.dryRun = true;
    else if (a === "--timeoutMs") cfg.timeoutMs = Number(argv[++i] || cfg.timeoutMs);
    else if (a === "--retryMax") cfg.retryMax = Number(argv[++i] || cfg.retryMax);
    else if (a === "--maxInFlight") cfg.maxInFlight = Number(argv[++i] || cfg.maxInFlight);
    else if (a === "--maxQueue") cfg.maxQueue = Number(argv[++i] || cfg.maxQueue);
    else if (a === "--help" || a === "-h") {
      printHelpAndExit();
    } else {
      // ignore unknown flags to keep this robust in scripts
    }
  }

  function ensurePositive(name: string, value: number, max: number): number {
    if (!Number.isFinite(value) || value <= 0 || value > max) {
      console.error(
        `[bridge] invalid ${name}=${value} (must be >0 and <=${max})`,
      );
      process.exit(1);
    }
    return value;
  }

  cfg.timeoutMs = ensurePositive("timeoutMs", cfg.timeoutMs, 60_000);
  cfg.retryMax = ensurePositive("retryMax", cfg.retryMax, 10);
  cfg.maxInFlight = ensurePositive("maxInFlight", cfg.maxInFlight, 10);
  cfg.maxQueue = ensurePositive("maxQueue", cfg.maxQueue, 100_000);

  if (!cfg.requestUrl) {
    console.error("[bridge] missing --requestUrl (or V1_REQUEST_URL).");
    process.exit(1);
  }

  if (!cfg.readStdin && !cfg.spawnCmd) {
    // sensible default: spawn sidekick foodtrucks
    cfg.spawnCmd = "npm run sidekick:foodtrucks";
  }

  return cfg;
}

function printHelpAndExit(): never {
  console.log(
    `Sidekick → v1 Bridge\n\n` +
    `Usage:\n` +
    `  tsx src/bridge/sidekickToV1.ts --spawn "npm run sidekick:foodtrucks"\n` +
    `  tsx src/bridge/sidekickToV1.ts --stdin < sidekick.ndjson\n\n` +
    `Options:\n` +
    `  --requestUrl   URL of v1 /request endpoint (default: http://localhost:3000/request)\n` +
    `  --spawn        Command to run Sidekick (default: npm run sidekick:foodtrucks)\n` +
    `  --stdin        Read NDJSON from stdin instead of spawning\n` +
    `  --dryRun       Do not POST; print what would be sent\n` +
    `  --timeoutMs    HTTP timeout in ms (default: 10000)\n` +
    `  --retryMax     Max retries per event (default: 5)\n` +
    `  --maxInFlight  Concurrent posts (default: 1 for strict ordering)\n` +
    `  --maxQueue     Max queued events before pausing input (default: 2000)`
  );
  process.exit(0);
}

function safeHostname(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    return u.hostname.replace(/[^a-zA-Z0-9.-]/g, "_");
  } catch {
    return "unknown_surface";
  }
}

function safeField(field: string): string {
  return String(field || "unknown_field")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "unknown_field";
}

/**
 * This payload is intentionally "safe + reduced":
 * - includes enough structure for a composer to interpret
 * - does NOT attempt to scrape or enrich; it only forwards Sidekick deltas
 * - keeps ordering deterministic (one POST at a time by default)
 */
export function toV1RequestPayload(evt: SidekickEvent) {
  const host = safeHostname((evt as any).url ?? evt.surface);
  const field = safeField(evt.field);
  const payload: any = {
    kind: "sidekick_delta",
    ts: evt.ts,
    lane: evt.lane,
    region: evt.geo, // v1/UI can display this directly
    signal: `${evt.lane}.${host}.${field}`,
    surface: evt.surface,
    field: evt.field,
    prev: evt.prev,
    curr: evt.curr,
    delta: evt.delta,
  };

  const rawAny: any = evt as any;
  let oversize = false;
  if (typeof rawAny.raw === "string") {
    const rawStr = rawAny.raw as string;
    const byteLen = Buffer.byteLength(rawStr, "utf8");
    if (byteLen <= DEFAULTS.maxRawBytes) {
      payload.raw = rawStr;
    } else {
      // Avoid shipping arbitrarily large blobs; provide metadata instead
      payload.rawInfo = {
        truncated: true,
        originalBytes: byteLen,
      };
      oversize = true;
    }
  } else {
    // Fallback: retain the structured evt for forensic/debug within a safe bound
    const json = JSON.stringify(evt);
    const byteLen = Buffer.byteLength(json, "utf8");
    if (byteLen <= DEFAULTS.maxRawBytes) {
      payload.raw = evt;
    } else {
      payload.rawInfo = {
        truncated: true,
        originalBytes: byteLen,
      };
      oversize = true;
    }
  }

  return { payload, oversize };
}

export async function postJsonWithRetry(
  url: string,
  body: unknown,
  timeoutMs: number,
  retryMax: number,
): Promise<{ attempts: number; retries: number }> {
  const textBody = JSON.stringify(body);
  let attempt = 0;

  while (true) {
    attempt += 1;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: textBody,
        signal: ac.signal,
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}${msg ? ` :: ${msg}` : ""}`);
      }
      return { attempts: attempt, retries: attempt - 1 };
    } catch (err) {
      clearTimeout(t);

      if (attempt > retryMax) {
        throw err;
      }
      // Exponential backoff with cap
      const backoffMs = Math.min(250 * Math.pow(2, attempt - 1), 8_000);
      console.error(`[bridge] POST failed (attempt ${attempt}/${retryMax}) -> retrying in ${backoffMs}ms :: ${String(err)}`);
      await sleep(backoffMs);
      continue;
    } finally {
      clearTimeout(t);
    }
  }
}

export function tryParseSidekickLine(line: string): SidekickEvent | null {
  const s = line.trim();
  if (!s.startsWith("{") || !s.endsWith("}")) return null;

  try {
    const obj = JSON.parse(s) as Record<string, unknown>;
    // minimal schema check
    if (typeof obj.ts !== "string") return null;
    if (typeof obj.lane !== "string") return null;
    if (typeof obj.geo !== "string") return null;
    if (typeof obj.surface !== "string") return null;
    if (typeof obj.field !== "string") return null;

    return obj as SidekickEvent;
  } catch {
    return null;
  }
}

async function main() {
  const cfg = parseArgs(process.argv);

  console.error(`[bridge] requestUrl=${cfg.requestUrl}`);
  console.error(`[bridge] mode=${cfg.readStdin ? "stdin" : "spawn"} dryRun=${cfg.dryRun}`);
  console.error(
    `[bridge] config maxInFlight=${cfg.maxInFlight} maxQueue=${cfg.maxQueue} timeoutMs=${cfg.timeoutMs} retryMax=${cfg.retryMax}`,
  );

  const stats = {
    forwarded: 0,
    droppedDuplicate: 0,
    droppedOversize: 0,
    droppedOnShutdown: 0,
    retries: 0,
    failures: 0,
    backpressureCount: 0,
  };

  const dedup = new Map<string, number>(); // eventId -> lastSeenMs

  function computeEventId(evt: SidekickEvent): string {
    const tsMs = Date.parse(evt.ts || "") || 0;
    const bucketMs = 60_000; // 1-minute buckets
    const bucket = Math.floor(tsMs / bucketMs) * bucketMs;
    const key = [
      evt.lane,
      evt.geo,
      evt.surface,
      evt.field,
      evt.curr == null ? "null" : String(evt.curr),
      String(bucket),
    ].join("|");
    return createHash("sha256").update(key).digest("hex");
  }

  function markDedup(evt: SidekickEvent): { isDuplicate: boolean; eventId: string } {
    const eventId = computeEventId(evt);
    const now = Date.now();
    const last = dedup.get(eventId);
    if (last !== undefined && now - last < DEFAULTS.dedupTtlMs) {
      return { isDuplicate: true, eventId };
    }
    dedup.set(eventId, now);

    // Opportunistic TTL cleanup to keep memory bounded
    if (dedup.size > 10_000) {
      for (const [id, ts] of dedup) {
        if (now - ts > DEFAULTS.dedupTtlMs) dedup.delete(id);
      }
    }

    return { isDuplicate: false, eventId };
  }

  let child: ReturnType<typeof spawn> | null = null;
  const input =
    cfg.readStdin
      ? process.stdin
      : (() => {
          child = spawn(cfg.spawnCmd as string, {
            shell: true,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
            env: process.env,
          });

          child.stderr.on("data", (buf: Buffer) => {
            const s = String(buf).trimEnd();
            if (s) process.stderr.write(`[sidekick:stderr] ${s}\n`);
          });

          child.on("exit", (code) => {
            if (code && code !== 0) {
              console.error(`[bridge] sidekick exited with code=${code}`);
              process.exitCode = code;
            }
          });

          return child.stdout!;
        })();

  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let inFlight = 0;
  const queue: (() => Promise<void>)[] = [];
  let pausedForBackpressure = false;
  let shutdownRequestedAt: number | null = null;
  let healthTimer: ReturnType<typeof setInterval> | null = null;
  let acceptingInput = true;

  async function pump() {
    while (inFlight < cfg.maxInFlight && queue.length > 0) {
      const job = queue.shift()!;
      inFlight += 1;
      job()
        .catch((e) => {
          stats.failures += 1;
          console.error(`[bridge] publish failed :: ${String(e)}`);
        })
        .finally(() => {
          inFlight -= 1;
          // If we had paused due to backpressure, resume once queue drains sufficiently
          if (pausedForBackpressure && queue.length <= cfg.maxQueue * 0.5) {
            pausedForBackpressure = false;
            rl.resume();
            console.error(
              `[bridge] backpressure cleared: queue=${queue.length} (resumeThreshold=${Math.floor(
                cfg.maxQueue * 0.5,
              )}) -> resuming input`,
            );
          }
          void pump();
        });
    }
  }

  function logHealth(label: string) {
    const droppedTotal =
      stats.droppedDuplicate + stats.droppedOversize + stats.droppedOnShutdown;
    console.error(
      `[bridge] health ${label} forwarded=${stats.forwarded} dropped=${droppedTotal} duplicate=${stats.droppedDuplicate} oversize=${stats.droppedOversize} shutdownDropped=${stats.droppedOnShutdown} retried=${stats.retries} failures=${stats.failures} backpressure=${pausedForBackpressure} queue=${queue.length} inFlight=${inFlight}`,
    );
  }

  async function publishHealthSnapshot(label: string): Promise<void> {
    const droppedTotal =
      stats.droppedDuplicate + stats.droppedOversize + stats.droppedOnShutdown;
    const metrics = {
      forwarded: stats.forwarded,
      dropped: droppedTotal,
      duplicates: stats.droppedDuplicate,
      oversize: stats.droppedOversize,
      retries: stats.retries,
      failures: stats.failures,
      backpressureCount: stats.backpressureCount,
      queue: queue.length,
      inFlight,
    };

    const payload = {
      kind: "bridge_health",
      ts: new Date().toISOString(),
      lane: "ops",
      region: "local",
      signal: "bridge.health",
      metrics,
      label,
    };

    if (cfg.dryRun) {
      console.error(`[bridge] health dryRun payload=${JSON.stringify(payload)}`);
      return;
    }

    const ac = new AbortController();
    const timeout = Math.min(cfg.timeoutMs, 2_000);
    const t = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(cfg.requestUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
      if (!res.ok) {
        // Best-effort: log and move on; do not retry
        const msg = await res.text().catch(() => "");
        console.error(
          `[bridge] health publish non-OK HTTP ${res.status} ${res.statusText}${
            msg ? ` :: ${msg}` : ""
          }`,
        );
      }
    } catch (err) {
      console.error(`[bridge] health publish failed (best-effort) :: ${String(err)}`);
    } finally {
      clearTimeout(t);
    }
  }

  healthTimer = setInterval(() => {
    logHealth("ok");
    void publishHealthSnapshot("ok");
  }, DEFAULTS.healthIntervalMs);
  // Do not keep the process alive solely for health logging
  (healthTimer as any).unref?.();

  rl.on("line", (line: string) => {
    if (!acceptingInput) return;

    const evt = tryParseSidekickLine(line);
    if (!evt) return; // ignore non-json log lines

    const { isDuplicate, eventId } = markDedup(evt);
    if (isDuplicate) {
      stats.droppedDuplicate += 1;
      console.error(`[bridge] duplicate dropped eventId=${eventId}`);
      return;
    }

    const { payload, oversize } = toV1RequestPayload(evt);
    if (oversize) {
      stats.droppedOversize += 1;
    }

    const job = async () => {
      if (cfg.dryRun) {
        process.stdout.write(JSON.stringify(payload) + "\n");
        stats.forwarded += 1;
        return;
      }
      const { retries } = await postJsonWithRetry(
        cfg.requestUrl,
        payload,
        cfg.timeoutMs,
        cfg.retryMax,
      );
      stats.retries += retries;
      stats.forwarded += 1;
    };

    queue.push(job);

    if (!pausedForBackpressure && queue.length >= cfg.maxQueue) {
      pausedForBackpressure = true;
      stats.backpressureCount += 1;
      rl.pause();
      console.error(
        `[bridge] backpressure engaged: queue=${queue.length} (maxQueue=${cfg.maxQueue}) -> pausing input`,
      );
    }

    void pump();
  });

  rl.on("close", async () => {
    const startDrain = Date.now();
    // drain remaining jobs deterministically, but respect shutdown drain window
    while (queue.length > 0 || inFlight > 0) {
      if (
        shutdownRequestedAt !== null &&
        Date.now() - shutdownRequestedAt > DEFAULTS.shutdownDrainMs
      ) {
        const remaining = queue.length;
        stats.droppedOnShutdown += remaining;
        queue.length = 0;
        console.error(
          `[bridge] shutdown drain timeout after ${Date.now() - startDrain}ms; dropping remaining=${remaining}`,
        );
        break;
      }
      await sleep(100);
    }

    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }

    logHealth("final");
    const droppedTotal =
      stats.droppedDuplicate + stats.droppedOversize + stats.droppedOnShutdown;
    console.error(
      `[bridge] done forwarded=${stats.forwarded} dropped=${droppedTotal} duplicate=${stats.droppedDuplicate} oversize=${stats.droppedOversize} shutdownDropped=${stats.droppedOnShutdown}`,
    );

    if (shutdownRequestedAt !== null && droppedTotal > 0) {
      process.exitCode = 1;
    }
  });

  function requestShutdown(signal: string) {
    if (shutdownRequestedAt !== null) {
      console.error(`[bridge] second signal ${signal}, forcing shutdown`);
      process.exit(1);
      return;
    }
    shutdownRequestedAt = Date.now();
    acceptingInput = false;
    console.error(`[bridge] shutdown requested via ${signal}`);
    rl.pause();
    rl.close();
    if (child) {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
  }

  process.on("SIGINT", () => requestShutdown("SIGINT"));
  process.on("SIGTERM", () => requestShutdown("SIGTERM"));
}

main().catch((e) => {
  console.error(`[bridge] fatal: ${String(e)}`);
  process.exit(1);
});
