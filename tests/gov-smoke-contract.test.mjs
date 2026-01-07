import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

/**
 * Regression guard: smoke script must enforce strong readiness + free port
 *
 * Why:
 * - Port collision: spawned server exits → smoke queries whatever is on port 3000 → wrong service → 0 items
 * - Weak readiness: HTTP probe can succeed against wrong service
 *
 * Fix:
 * - getFreePort() allocates random port per run
 * - startServer() waits for exact "4data listening on http://localhost:${port}" before proceeding
 * - PORT env var passed to spawned child
 *
 * This test ensures these critical strings stay in the smoke script.
 */

test('smoke script has getFreePort function', () => {
  const smokePath = path.join(repoRoot, 'scripts', 'gov', 'smoke-gov-e2e.mjs');
  const src = fs.readFileSync(smokePath, 'utf8');

  assert.ok(
    src.includes('function getFreePort') || src.includes('async function getFreePort'),
    'smoke script must have getFreePort() to avoid port collisions'
  );
});

test('smoke script waits for exact listening line (strong readiness)', () => {
  const smokePath = path.join(repoRoot, 'scripts', 'gov', 'smoke-gov-e2e.mjs');
  const src = fs.readFileSync(smokePath, 'utf8');

  assert.ok(
    src.includes('4data listening on http://localhost:'),
    'smoke must wait for exact "listening" log from child process'
  );
});

test('smoke script passes PORT env var to spawned child', () => {
  const smokePath = path.join(repoRoot, 'scripts', 'gov', 'smoke-gov-e2e.mjs');
  const src = fs.readFileSync(smokePath, 'utf8');

  assert.ok(
    src.includes('PORT: String(port)') || src.includes('PORT'),
    'smoke must pass PORT env var to ensure child binds to correct port'
  );
});

test('smoke script spawns node directly (not npm start)', () => {
  const smokePath = path.join(repoRoot, 'scripts', 'gov', 'smoke-gov-e2e.mjs');
  const src = fs.readFileSync(smokePath, 'utf8');

  // Check for path.join pattern: path.join(repoRoot, "src", "v1", "index.js")
  assert.ok(
    src.includes('path.join(repoRoot, "src", "v1", "index.js")') ||
    src.includes("path.join(repoRoot, 'src', 'v1', 'index.js')"),
    'smoke must spawn node src/v1/index.js directly (not npm start) for reliable env propagation'
  );
});

test('v1 server accepts PORT env var', () => {
  const v1Path = path.join(repoRoot, 'src', 'v1', 'index.js');
  const src = fs.readFileSync(v1Path, 'utf8');

  assert.ok(
    src.includes('process.env.PORT'),
    'v1 server must read PORT from env to bind to free port'
  );

  assert.ok(
    src.includes('const port = Number(process.env.PORT') || src.includes('port = Number(process.env.PORT'),
    'v1 server must parse PORT as Number'
  );
});
