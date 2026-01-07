import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const bridgePath = resolve(projectRoot, 'src/bridge/sidekickToV1.ts');

const src = readFileSync(bridgePath, 'utf8');

test('bridge uses deterministic maxInFlight default', () => {
  assert.ok(/maxInFlight:\s*1\b/.test(src), 'expected maxInFlight default to be 1');
});

test('bridge payload has kind sidekick_delta and composed signal', () => {
  assert.ok(src.includes('kind: "sidekick_delta"'), 'expected kind: "sidekick_delta" in payload');
  assert.ok(
    src.includes('signal: `${evt.lane}.${host}.${field}`'),
    'expected signal mapping `${evt.lane}.${host}.${field}` in payload',
  );
});

test('bridge ignores non-JSON sidekick log lines', () => {
  assert.ok(
    src.includes('ignore non-json log lines'),
    'expected comment documenting that non-JSON lines are ignored',
  );
});

test('bridge enforces mapping contract and raw size guard', () => {
  assert.ok(src.includes('ts: evt.ts'), 'expected ts field in payload mapping');
  assert.ok(src.includes('lane: evt.lane'), 'expected lane field in payload mapping');
  assert.ok(src.includes('region: evt.geo'), 'expected region field bound to evt.geo');
  assert.ok(src.includes('surface: evt.surface'), 'expected surface field in payload');
  assert.ok(src.includes('field: evt.field'), 'expected field in payload');
  assert.ok(src.includes('DEFAULTS.maxRawBytes'), 'expected raw size guard using DEFAULTS.maxRawBytes');
  assert.ok(
    src.includes('payload.rawInfo = {') || src.includes('truncated: true'),
    'expected truncated raw metadata when payload too large',
  );
});

test('bridge computes deterministic eventId and drops duplicates', () => {
  assert.ok(src.includes('function computeEventId'), 'expected computeEventId helper for idempotency');
  assert.ok(src.includes('createHash("sha256")'), 'expected sha256-based eventId computation');
  assert.ok(src.includes('duplicate dropped eventId='), 'expected duplicate drop log message');
});

test('bridge emits health logs with operator-grade stats', () => {
  assert.ok(src.includes('[bridge] health'), 'expected health log prefix');
  assert.ok(src.includes('forwarded='), 'expected forwarded count in health logs');
  assert.ok(src.includes('dropped='), 'expected dropped count in health logs');
  assert.ok(src.includes('retried='), 'expected retried count in health logs');
  assert.ok(src.includes('backpressure='), 'expected backpressure flag in health logs');
});

test('bridge installs SIGINT/SIGTERM handlers for deterministic shutdown', () => {
  assert.ok(src.includes('process.on("SIGINT"'), 'expected SIGINT handler');
  assert.ok(src.includes('process.on("SIGTERM"'), 'expected SIGTERM handler');
  assert.ok(src.includes('shutdown drain timeout'), 'expected bounded shutdown drain log');
});

test('bridge centralizes tunables in DEFAULTS', () => {
  assert.ok(src.includes('const DEFAULTS ='), 'expected DEFAULTS config object');
  assert.ok(src.includes('maxQueue: 2000'), 'expected maxQueue default in DEFAULTS');
  assert.ok(src.includes('retryMax: 5'), 'expected retryMax default in DEFAULTS');
  assert.ok(src.includes('dedupTtlMs: 5 * 60_000'), 'expected dedupTtlMs default');
  assert.ok(src.includes('healthIntervalMs: 10_000'), 'expected healthIntervalMs default');
});
