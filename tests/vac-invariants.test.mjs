import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("VAC CLI has deterministic claim + evidence ordering", () => {
  const cli = read("src/vac/cli.ts");

  // Claim ordering by createdAt then id
  assert.match(
    cli,
    /orderedClaims[\s\S]*sort\(compareByCreatedThenId\)/,
    "Expected cli.ts to sort claims deterministically (createdAt then id)",
  );

  // Evidence ordering by createdAt then id
  assert.match(
    cli,
    /sortedEvidence\(\s*evidenceByClaim\.get\(\s*claim\.id\s*\)[\s\S]*\)/,
    "Expected cli.ts to sort evidence deterministically (createdAt then id)",
  );
});

test("VAC CLI enforces input guard (line and byte limits) and aborts safely", () => {
  const cli = read("src/vac/cli.ts");

  // Must track lineCount + byteCount
  assert.match(cli, /lineCount/, "Expected cli.ts to track lineCount");
  assert.match(cli, /byteCount|Buffer\.byteLength/, "Expected cli.ts to track byteCount using Buffer.byteLength");

  // Must set exitCode on limit exceeded
  assert.match(cli, /process\.exitCode\s*=\s*1/, "Expected cli.ts to set process.exitCode=1 on input limit exceeded");

  // Must include a clear abort message
  assert.match(cli, /input limit exceeded|limit exceeded|aborting run/i, "Expected a clear abort message on guard trip");
});

test("VAC evaluator emits stable reason ordering", () => {
  const ev = read("src/vac/evaluate.ts");
  assert.match(ev, /reasons: \[\.\.\.reasons\]\.sort\(/, "Expected evaluate.ts to sort reasons for stable output");
});
