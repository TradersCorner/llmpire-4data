import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// Resolve the tsx CLI so we invoke the same runtime the scripts use
// Use the exported "./cli" subpath instead of a private dist path.
const tsxBin = require.resolve('tsx/cli');

function runBridgeWithInput(ndjson) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      process.execPath,
      [tsxBin, 'src/bridge/sidekickToV1.ts', '--stdin', '--dryRun'],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          V1_REQUEST_URL: 'http://127.0.0.1:5999/request',
        },
      },
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (buf) => {
      stdout += buf.toString();
    });
    child.stderr.on('data', (buf) => {
      stderr += buf.toString();
    });

    child.on('error', (err) => rejectRun(err));

    child.on('close', (code) => {
      resolveRun({ code, stdout, stderr });
    });

    child.stdin.write(ndjson);
    child.stdin.end();
  });
}

test('bridge harness: duplicates and oversize handled correctly in dryRun mode', async () => {
  const baseTs = '2024-01-01T00:00:00.000Z';

  const baseEvent = {
    ts: baseTs,
    lane: 'demand',
    geo: 'Escambia County, FL',
    surface: 'https://example.com/foodtrucks',
    field: 'count',
    prev: 1,
    curr: 2,
    delta: 1,
    raw: 'ok',
  };

  // Same eventId (same ts minute bucket and key fields)
  const duplicateEvent = { ...baseEvent };

  // Oversized raw payload to trigger truncation guard
  const oversizeEvent = {
    ...baseEvent,
    ts: '2024-01-01T00:01:00.000Z',
    raw: 'x'.repeat(20_000),
  };

  const ndjson = [
    'this is not json',
    JSON.stringify(baseEvent),
    JSON.stringify(duplicateEvent),
    JSON.stringify(oversizeEvent),
    '',
  ].join('\n');

  const { code, stdout, stderr } = await runBridgeWithInput(ndjson);

  assert.equal(code, 0, `expected bridge to exit cleanly, got code=${code}`);

  const outLines = stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Dry run should emit sidekick_delta payloads, with duplicate suppressed
  const payloads = outLines.map((line) => JSON.parse(line));
  assert.equal(
    payloads.length,
    2,
    'expected exactly two forwarded payloads (one duplicate should be dropped)',
  );

  payloads.forEach((p) => {
    assert.equal(p.kind, 'sidekick_delta', 'expected kind sidekick_delta');
    assert.ok(typeof p.signal === 'string' && p.signal.length > 0, 'expected non-empty signal');
    assert.ok(p.ts, 'expected ts field');
    assert.ok(p.lane, 'expected lane field');
    assert.ok(p.region, 'expected region field');
  });

  const oversizePayload = payloads.find((p) => p.ts === oversizeEvent.ts);
  assert.ok(oversizePayload, 'expected oversize event to be forwarded');
  assert.ok(
    !('raw' in oversizePayload) && oversizePayload.rawInfo && oversizePayload.rawInfo.truncated,
    'expected oversize payload to expose rawInfo.truncated and omit raw',
  );

  // Inspect health metrics from final health log
  const healthLines = stderr
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('[bridge] health final'));

  assert.ok(healthLines.length >= 1, 'expected at least one final health log line');

  const lastHealth = healthLines[healthLines.length - 1];

  // duplicate and oversize counts should be reflected in the final metrics
  assert.match(
    lastHealth,
    /duplicate=1\b/,
    `expected duplicate=1 in final health log, got: ${lastHealth}`,
  );
  assert.match(
    lastHealth,
    /oversize=1\b/,
    `expected oversize=1 in final health log, got: ${lastHealth}`,
  );

  // forwarded should match the number of emitted payloads
  const forwardedMatch = lastHealth.match(/forwarded=(\d+)/);
  assert.ok(forwardedMatch, `expected forwarded=... in final health log, got: ${lastHealth}`);
  assert.equal(
    Number(forwardedMatch[1]),
    payloads.length,
    'expected forwarded count to equal number of emitted payloads',
  );
});
