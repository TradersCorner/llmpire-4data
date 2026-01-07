#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const argv = new Set(process.argv.slice(2));
const WANT_WRITE_ENV = argv.has("--write-env");
const WANT_POWERSHELL = argv.has("--ps");
const WANT_BASH = argv.has("--bash") || (!WANT_POWERSHELL && !argv.has("--both"));
const WANT_BOTH = argv.has("--both");

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "public",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
]);

function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(process.cwd());
    dir = parent;
  }
}

function safeStat(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      walk(full, out);
    } else if (e.isFile()) {
      const lower = e.name.toLowerCase();
      if (
        lower.endsWith(".ndjson") ||
        lower.endsWith(".jsonl") ||
        lower.endsWith(".ndjson.gz") ||
        lower.endsWith(".jsonl.gz")
      ) {
        out.push(full);
      }
    }
  }
}

function fileLooksLikeDecisionCards(filePath) {
  const name = path.basename(filePath).toLowerCase();
  if (name.includes("decision") && name.includes("card")) return true;
  if (name.includes("decision_card")) return true;
  if (name.includes("decisioncards")) return true;
  return false;
}

function fileLooksLikeAdminQueues(filePath) {
  const name = path.basename(filePath).toLowerCase();
  if (name.includes("admin") && name.includes("queue")) return true;
  if (name.includes("admin_queue")) return true;
  if (name.includes("feedback") && name.includes("context")) return true;
  if (name.includes("moderator") && name.includes("queue")) return true;
  return false;
}

function pickNewest(files) {
  let best = null;
  for (const p of files) {
    const st = safeStat(p);
    if (!st) continue;
    if (!best) {
      best = { p, mtimeMs: st.mtimeMs };
      continue;
    }
    if (st.mtimeMs > best.mtimeMs) best = { p, mtimeMs: st.mtimeMs };
  }
  return best?.p ?? null;
}

function toPosixIfNeeded(p) {
  return p.split(path.sep).join(path.posix.sep);
}

function quoteForBash(p) {
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

function quoteForPowerShell(p) {
  return `'${p.replace(/'/g, "''")}'`;
}

const repoRoot = findRepoRoot(process.cwd());
const all = [];
walk(repoRoot, all);

const decisionCandidates = all.filter((p) => fileLooksLikeDecisionCards(p));
const adminQueueCandidates = all.filter((p) => fileLooksLikeAdminQueues(p));

function quickSniffForDecisionCards(p) {
  try {
    const fd = fs.openSync(p, "r");
    const buf = Buffer.alloc(4096);
    const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, bytes).toString("utf8");
    return head.includes('"decisionId"') && head.includes('"territoryId"');
  } catch {
    return false;
  }
}

function quickSniffForAdminQueues(p) {
  try {
    const fd = fs.openSync(p, "r");
    const buf = Buffer.alloc(4096);
    const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, bytes).toString("utf8");
    return (
      head.includes('"decisionId"') &&
      (head.toLowerCase().includes('"queue"') || head.toLowerCase().includes("feedback"))
    );
  } catch {
    return false;
  }
}

let decisionPath = pickNewest(decisionCandidates);
let adminQueuePath = pickNewest(adminQueueCandidates);

if (!decisionPath) {
  const sniffed = all.filter(quickSniffForDecisionCards);
  decisionPath = pickNewest(sniffed);
}

if (!adminQueuePath) {
  const sniffed = all.filter(quickSniffForAdminQueues);
  adminQueuePath = pickNewest(sniffed);
}

if (!decisionPath || !adminQueuePath) {
  const missing = [];
  if (!decisionPath) missing.push("GOV_DECISION_CARDS_PATH (decision_card NDJSON)");
  if (!adminQueuePath) missing.push("GOV_ADMIN_QUEUES_PATH (admin_queue NDJSON)");

  console.error(`[gov][queues] Could not auto-locate: ${missing.join(", ")}`);
  console.error("");
  console.error("[gov][queues] Searched under repo root:");
  console.error(`  ${repoRoot}`);
  console.error("");
  console.error("[gov][queues] Found NDJSON/JSONL files:");
  for (const p of all.slice(0, 200)) console.error(`  - ${p}`);
  if (all.length > 200) console.error(`  ... (${all.length - 200} more)`);
  console.error("");
  console.error(
    "[gov][queues] Action: run your VAC/CLI export that produces the decision_card + admin_queue NDJSON, then re-run this script.",
  );
  process.exit(1);
}

const decisionAbs = path.resolve(decisionPath);
const adminAbs = path.resolve(adminQueuePath);

const envLines = [
  ["GOV_QUEUES_LIVE", "1"],
  ["GOV_DECISION_CARDS_PATH", decisionAbs],
  ["GOV_ADMIN_QUEUES_PATH", adminAbs],
];

function printBash() {
  console.log("# Bash / zsh");
  for (const [k, v] of envLines) {
    const vv = k.endsWith("_PATH") ? toPosixIfNeeded(v) : v;
    console.log(`export ${k}=${quoteForBash(vv)}`);
  }
}

function printPowerShell() {
  console.log("# PowerShell");
  for (const [k, v] of envLines) {
    console.log(`$env:${k} = ${quoteForPowerShell(v)}`);
  }
}

function writeDotEnvGov() {
  const dotEnvPath = path.join(repoRoot, ".env.gov");
  const content =
    envLines
      .map(([k, v]) => {
        const vv = k.endsWith("_PATH") ? v : v;
        if (/\s/.test(vv)) return `${k}="${vv.replace(/"/g, '\\"')}"`;
        return `${k}=${vv}`;
      })
      .join(os.EOL) + os.EOL;

  fs.writeFileSync(dotEnvPath, content, "utf8");
  console.error(`[gov][queues] wrote ${dotEnvPath}`);
}

console.error("[gov][queues] Using real sources:");
console.error(`  GOV_DECISION_CARDS_PATH = ${decisionAbs}`);
console.error(`  GOV_ADMIN_QUEUES_PATH   = ${adminAbs}`);
console.error("");

if (WANT_WRITE_ENV) writeDotEnvGov();

if (WANT_BOTH) {
  printBash();
  console.log("");
  printPowerShell();
} else {
  if (WANT_BASH) printBash();
  if (WANT_POWERSHELL) printPowerShell();
}
