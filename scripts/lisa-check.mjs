#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const isWin = process.platform === "win32";
const BIN_EXT = isWin ? ".cmd" : "";

function binPath(name) {
  return path.join(ROOT, "node_modules", ".bin", name + BIN_EXT);
}

function exists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function runBin(name, args, label) {
  const p = binPath(name);
  if (!exists(p)) {
    console.log(`[lisa-check] skip ${label}: ${name} not installed`);
    return { skipped: true, code: 0 };
  }

  const cmd = p;
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    stdio: "inherit",
  });

  const code = r.status ?? 0;
  if (code !== 0) {
    console.error(`[lisa-check] FAIL ${label}: exit ${code}`);
  } else {
    console.log(`[lisa-check] OK ${label}`);
  }
  return { skipped: false, code };
}

function runNode(args, label) {
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    stdio: "inherit",
  });
  const code = r.status ?? 0;
  if (code !== 0) console.error(`[lisa-check] FAIL ${label}: exit ${code}`);
  else console.log(`[lisa-check] OK ${label}`);
  return { code };
}

function hasAnyEslintConfig() {
  const candidates = [
    ".eslintrc",
    ".eslintrc.json",
    ".eslintrc.js",
    ".eslintrc.cjs",
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
  ].map((f) => path.join(ROOT, f));

  if (candidates.some(exists)) return true;

  // package.json eslintConfig
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    return Boolean(pkg.eslintConfig);
  } catch {
    return false;
  }
}

function main() {
  const mode = (process.argv[2] || "all").toLowerCase();

  const tsconfig = path.join(ROOT, "tsconfig.json");
  const hasTsconfig = exists(tsconfig);

  const tasks = [];

  const typecheck = () => {
    if (!hasTsconfig) {
      console.log("[lisa-check] skip typecheck: tsconfig.json not found");
      return 0;
    }
    // noEmit ensures "check only"
    return runBin("tsc", ["-p", "tsconfig.json", "--noEmit"], "typecheck").code;
  };

  const lint = () => {
    if (!hasAnyEslintConfig()) {
      console.log("[lisa-check] skip lint: eslint config not found");
      return 0;
    }
    // Lint entire repo; config controls included files
    return runBin("eslint", ["."], "lint").code;
  };

  const test = () => {
    // Prefer vitest if present, else jest, else node --test if any tests exist
    const vitest = binPath("vitest");
    const jest = binPath("jest");

    if (exists(vitest)) return runBin("vitest", ["run"], "test").code;
    if (exists(jest)) return runBin("jest", [], "test").code;

    // Node's built-in test runner (only if test files exist)
    const testDirs = ["test", "tests", "__tests__"].map((d) => path.join(ROOT, d));
    const hasTestsDir = testDirs.some((d) => exists(d));
    if (!hasTestsDir) {
      console.log("[lisa-check] skip test: no vitest/jest and no test directory");
      return 0;
    }
    return runNode(["--test"], "test(node)").code;
  };

  const build = () => {
    // If TS project exists, "build" = compile (safe, deterministic).
    // If you later add a bundler, you can replace this with that tool explicitly.
    if (!hasTsconfig) {
      console.log("[lisa-check] skip build: tsconfig.json not found");
      return 0;
    }
    return runBin("tsc", ["-p", "tsconfig.json"], "build").code;
  };

  if (mode === "typecheck") tasks.push(typecheck);
  else if (mode === "lint") tasks.push(lint);
  else if (mode === "test") tasks.push(test);
  else if (mode === "build") tasks.push(build);
  else {
    tasks.push(typecheck, lint, test, build);
  }

  let failed = 0;
  for (const t of tasks) {
    const code = t();
    if (code !== 0) failed += 1;
  }

  if (failed > 0) process.exit(1);
}

main();
