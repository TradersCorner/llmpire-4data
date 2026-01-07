#!/usr/bin/env node
/**
 * Windows-safe, real-data-only GOV exports runner.
 *
 * Produces (no BOM, true NDJSON):
 *  - data/gov/decisions.latest.ndjson
 *  - data/gov/decision_card.latest.ndjson
 *  - data/gov/admin_queue.latest.ndjson
 *
 * IMPORTANT:
 *  - Requires REAL claims/evidence NDJSON piped into this script via stdin
 *    (same format vac:evaluate expects).
 *
 * Usage (PowerShell):
 *   Get-Content ./path/to/real-claims.ndjson | node scripts/gov/export-ndjson.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import readline from "node:readline";

const repoRoot = findRepoRoot(process.cwd());
const outDir = path.join(repoRoot, "data", "gov");
fs.mkdirSync(outDir, { recursive: true });

const decisionsOut = path.join(outDir, "decisions.latest.ndjson");
const decisionCardOut = path.join(outDir, "decision_card.latest.ndjson");
const adminQueueOut = path.join(outDir, "admin_queue.latest.ndjson");

function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(process.cwd());
    dir = parent;
  }
}

function mustExist(p, label) {
  if (!fs.existsSync(p)) {
    throw new Error(`[gov:export] missing ${label}: ${p}`);
  }
}

function spawnNode(args, opts = {}) {
  const env = {
    ...process.env,
    ...opts.env,
    FORCE_COLOR: "0",
    NO_COLOR: "1",
  };

  return spawn(process.execPath, args, {
    cwd: repoRoot,
    env,
    stdio: opts.stdio ?? ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
}

async function validateNdjsonStream({ readable, outPath, label }) {
  const ws = fs.createWriteStream(outPath, { encoding: "utf8" });

  let lineCount = 0;
  let jsonChecked = 0;
  const MAX_CHECK = 50;

  const rl = readline.createInterface({ input: readable, crlfDelay: Infinity });

  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;

      lineCount += 1;

      if (jsonChecked < MAX_CHECK) {
        try {
          JSON.parse(line);
        } catch {
          throw new Error(
            `[gov:export] ${label} is not valid NDJSON. Bad JSON line:\n${line.slice(0, 400)}`,
          );
        }
        jsonChecked += 1;
      }

      ws.write(line + "\n");
    }
  } finally {
    rl.close();
    ws.end();
  }

  if (lineCount === 0) {
    throw new Error(`[gov:export] ${label} produced 0 records`);
  }

  const st = fs.statSync(outPath);
  if (!st.isFile() || st.size === 0) {
    throw new Error(`[gov:export] ${label} output file missing or empty: ${outPath}`);
  }

  return { lineCount, bytes: st.size };
}

function collectStderr(child, name) {
  let buf = "";
  child.stderr.on("data", (d) => (buf += d.toString("utf8")));
  return () => (buf.trim() ? `[${name} stderr]\n${buf.trim()}` : "");
}

function waitExit(child, name) {
  return new Promise((resolve, reject) => {
    child.once("error", (e) => reject(new Error(`[gov:export] spawn failed for ${name}: ${e.message}`)));
    child.once("exit", (code, signal) => {
      if (signal) return reject(new Error(`[gov:export] ${name} exited with signal ${signal}`));
      resolve(code ?? 1);
    });
  });
}

function parseDecisionIdsFromNdjson(filePath, max = 50000) {
  const ids = new Set();
  const data = fs.readFileSync(filePath, "utf8");
  const lines = data.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    if (ids.size >= max) break;
    try {
      const obj = JSON.parse(line);
      const id = obj?.decisionId ?? obj?.id;
      if (typeof id === "string" && id) ids.add(id);
    } catch {
      // ignore
    }
  }
  return ids;
}

function fileHasTerritoryId(filePath) {
  const data = fs.readFileSync(filePath, "utf8");
  const lines = data.split(/\r?\n/).filter(Boolean);
  for (const line of lines.slice(0, 2000)) {
    try {
      const obj = JSON.parse(line);
      if (typeof obj?.territoryId === "string" && obj.territoryId.length > 0) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

async function main() {
  console.error(`[gov:export] repo: ${repoRoot}`);
  console.error(`[gov:export] out:  ${path.relative(repoRoot, outDir)}/`);

  // 1) Locate TSX CLI (we run it via node, NOT via npm)
  const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
  mustExist(tsxCli, "tsx CLI (node_modules/tsx/dist/cli.mjs)");
  const vacCliTs = path.join(repoRoot, "src", "vac", "cli.ts");
  mustExist(vacCliTs, "VAC CLI (src/vac/cli.ts)");

  // 2) Spawn VAC evaluate (TypeScript) via: node tsxCli src/vac/cli.ts
  const vac = spawnNode([tsxCli, vacCliTs], { stdio: ["pipe", "pipe", "pipe"] });
  const vacErr = collectStderr(vac, "vac:evaluate(tsx)");

  // Feed REAL claims/evidence NDJSON from *this* process stdin into vac stdin
  process.stdin.pipe(vac.stdin);

  // Tee vac stdout to:
  //  - decisions file
  //  - decision-cards projector
  //  - admin-queues projector
  const teeForDecisions = new PassThrough();
  const teeForCards = new PassThrough();
  const teeForAdmin = new PassThrough();

  vac.stdout.pipe(teeForDecisions);
  vac.stdout.pipe(teeForCards);
  vac.stdout.pipe(teeForAdmin);

  // Write raw decisions stream to disk (validated NDJSON)
  const decisionsWrite = validateNdjsonStream({
    readable: teeForDecisions,
    outPath: decisionsOut,
    label: "decisions (kind:decision)",
  });

  // 3) Spawn decision-card projector (node .mjs)
  const decisionCardsCli = path.join(repoRoot, "src", "decision", "cli-decision-cards.mjs");
  mustExist(decisionCardsCli, "Decision Cards CLI (src/decision/cli-decision-cards.mjs)");

  const dc = spawnNode([decisionCardsCli], { stdio: ["pipe", "pipe", "pipe"] });
  const dcErr = collectStderr(dc, "vac:decision-cards");
  teeForCards.pipe(dc.stdin);

  const dcWrite = validateNdjsonStream({
    readable: dc.stdout,
    outPath: decisionCardOut,
    label: "decision_card",
  });

  // 4) Spawn admin-queues projector (node .mjs)
  const adminQueuesCli = path.join(repoRoot, "src", "admin", "cli-admin-queues.mjs");
  mustExist(adminQueuesCli, "Admin Queues CLI (src/admin/cli-admin-queues.mjs)");

  const aq = spawnNode([adminQueuesCli], { stdio: ["pipe", "pipe", "pipe"] });
  const aqErr = collectStderr(aq, "admin:queues");
  teeForAdmin.pipe(aq.stdin);

  const aqWrite = validateNdjsonStream({
    readable: aq.stdout,
    outPath: adminQueueOut,
    label: "admin_queue",
  });

  // 5) Wait for outputs + processes
  const [decisionsRes, dcRes, aqRes] = await Promise.all([decisionsWrite, dcWrite, aqWrite]);

  const [vacCode, dcCode, aqCode] = await Promise.all([
    waitExit(vac, "vac:evaluate(tsx)"),
    waitExit(dc, "vac:decision-cards"),
    waitExit(aq, "admin:queues"),
  ]);

  if (vacCode !== 0) throw new Error(`[gov:export] VAC failed (exit ${vacCode}).\n${vacErr()}`);
  if (dcCode !== 0) throw new Error(`[gov:export] decision-cards failed (exit ${dcCode}).\n${dcErr()}`);
  if (aqCode !== 0) throw new Error(`[gov:export] admin-queues failed (exit ${aqCode}).\n${aqErr()}`);

  // 6) Hard validations that prove exports are actually usable for GOV live queues
  if (!fileHasTerritoryId(decisionCardOut)) {
    throw new Error(
      `[gov:export] decision_card export has no territoryId. This breaks /gov/territory/:id/queues filtering.\n` +
      `Expected territoryId to be derived from decision.subjectId (see cli-decision-cards.mjs).`
    );
  }

  const dcIds = parseDecisionIdsFromNdjson(decisionCardOut);
  const aqIds = parseDecisionIdsFromNdjson(adminQueueOut);

  let overlap = 0;
  for (const id of dcIds) {
    if (aqIds.has(id)) overlap += 1;
    if (overlap >= 1) break;
  }

  if (overlap === 0) {
    throw new Error(
      `[gov:export] decisionId overlap is 0 between decision_card and admin_queue.\n` +
      `Live queues will be empty because feedbackContexts can't join to decisionCards.`
    );
  }

  console.error("");
  console.error(`[gov:export] OK decisions:      ${decisionsRes.lineCount} records (${decisionsRes.bytes} bytes)`);
  console.error(`[gov:export] OK decision_card:  ${dcRes.lineCount} records (${dcRes.bytes} bytes)`);
  console.error(`[gov:export] OK admin_queue:    ${aqRes.lineCount} records (${aqRes.bytes} bytes)`);
  console.error(`[gov:export] OK overlap:        >= 1 decisionId shared`);
  console.error("[gov:export] done");
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
