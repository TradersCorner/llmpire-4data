#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = [
  path.join(root, "data", "gov", "decision_card.latest.ndjson"),
  path.join(root, "data", "gov", "admin_queue.latest.ndjson"),
];

const missing = files.filter((p) => !fs.existsSync(p) || fs.statSync(p).size === 0);

if (missing.length) {
  console.error("[gov:prove][FAIL] Missing or empty GOV exports:");
  for (const p of missing) console.error("  - " + p);
  console.error("");
  console.error("[gov:prove] Fix: generate exports first (real data):");
  console.error("  Get-Content data/claims/real-claims.ndjson | node scripts/gov/export-ndjson.mjs");
  process.exit(1);
}

console.error("[gov:prove] exports present");
