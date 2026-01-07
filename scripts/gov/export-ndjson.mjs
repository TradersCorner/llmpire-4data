#!/usr/bin/env node
/**
 * Cross-platform VAC export runner (Windows-safe).
 *
 * Produces:
 *  - data/gov/decision_card.latest.ndjson
 *  - data/gov/admin_queue.latest.ndjson
 *
 * Pipeline (no shell piping; no direct tsx spawn):
 *  npm run --silent vac:evaluate  |  npm run --silent vac:decision-cards
 *  npm run --silent vac:evaluate  |  npm run --silent admin:queues
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline";

const repoRoot = findRepoRoot(process.cwd());
const outDir = path.join(repoRoot, "data", "gov");
fs.mkdirSync(outDir, { recursive: true });

const decisionOut = path.join(outDir, "decision_card.latest.ndjson");
const adminOut = path.join(outDir, "admin_queue.latest.ndjson");

function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(process.cwd());
    dir = parent;
  }
}

function npmCmd() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function spawnNpmRun(scriptName, opts = {}) {
  const cmd = npmCmd();
  const args = ["run", "--silent", scriptName];

  const child = spawn(cmd, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...opts.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    stdio: opts.stdio ?? ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  return child;
}

function waitExit(child, name) {
  return new Promise((resolve, reject) => {
    child.once("error", (e) => reject(new Error(`[export] spawn failed for ${name}: ${e.message}`)));
    child.once("exit", (code, signal) => {
      if (signal) return reject(new Error(`[export] ${name} exited with signal ${signal}`));
      resolve(code ?? 1);
    });
  });
}

async function validateAndWriteNdjsonFromStream({ readable, outPath, label }) {
  const ws = fs.createWriteStream(outPath, { encoding: "utf8" });

  let lineCount = 0;
  let jsonChecked = 0;
  const MAX_CHECK = 50;

  const rl = readline.createInterface({
    input: readable,
    crlfDelay: Infinity,
  });

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
            `[export] ${label} is not valid NDJSON. Bad JSON line:\n${line.slice(0, 400)}`,
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
    throw new Error(`[export] ${label} produced 0 NDJSON records`);
  }

  const st = fs.statSync(outPath);
  if (!st.isFile() || st.size === 0) {
    throw new Error(`[export] ${label} output file missing or empty: ${outPath}`);
  }

  return { lineCount, bytes: st.size };
}

async function runPipeExport({ consumerScript, outPath, label }) {
  console.error(`[export] ${label}: starting pipeline`);
  console.error(`         vac:evaluate  ->  ${consumerScript}`);
  console.error(`         writing: ${path.relative(repoRoot, outPath)}`);

  const producer = spawnNpmRun("vac:evaluate", {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const consumer = spawnNpmRun(consumerScript, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  producer.stdout.pipe(consumer.stdin);

  let producerErr = "";
  let consumerErr = "";

  producer.stderr.on("data", (d) => (producerErr += d.toString("utf8")));
  consumer.stderr.on("data", (d) => (consumerErr += d.toString("utf8")));

  let writeResult;
  try {
    writeResult = await validateAndWriteNdjsonFromStream({
      readable: consumer.stdout,
      outPath,
      label,
    });
  } catch (e) {
    producer.kill("SIGTERM");
    consumer.kill("SIGTERM");
    throw e;
  }

  const [producerCode, consumerCode] = await Promise.all([
    waitExit(producer, "vac:evaluate"),
    waitExit(consumer, consumerScript),
  ]);

  if (producerCode !== 0) {
    throw new Error(
      `[export] vac:evaluate failed (exit ${producerCode}). Stderr:\n${
        producerErr.trim() || "(none)"
      }`,
    );
  }

  if (consumerCode !== 0) {
    throw new Error(
      `[export] ${consumerScript} failed (exit ${consumerCode}). Stderr:\n${
        consumerErr.trim() || "(none)"
      }`,
    );
  }

  console.error(
    `[export] ${label}: OK (${writeResult.lineCount} records, ${writeResult.bytes} bytes)`,
  );
}

async function main() {
  console.error(`[export] repo: ${repoRoot}`);
  console.error(`[export] out:  ${path.relative(repoRoot, outDir)}/`);
  console.error("");

  await runPipeExport({
    consumerScript: "vac:decision-cards",
    outPath: decisionOut,
    label: "decision_card",
  });

  await runPipeExport({
    consumerScript: "admin:queues",
    outPath: adminOut,
    label: "admin_queue",
  });

  console.error("");
  console.error("[export] done");
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
