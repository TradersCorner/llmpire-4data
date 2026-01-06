import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const scripts = pkg.scripts || {};

test("Repo exposes auditable scripts", () => {
  for (const key of ["check", "typecheck", "lint", "test", "build", "audit:lisa"]) {
    assert.ok(scripts[key], `Expected package.json scripts.${key} to exist`);
  }
});

test("check pipeline uses lisa-check.mjs", () => {
  assert.match(
    scripts.check,
    /scripts[\\/]+lisa-check\.mjs/i,
    "Expected scripts.check to run scripts/lisa-check.mjs",
  );
});
