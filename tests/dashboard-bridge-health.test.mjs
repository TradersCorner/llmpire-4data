import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const dashboardPath = resolve(projectRoot, 'lisa-dashboard.html');

const html = readFileSync(dashboardPath, 'utf8');

test('dashboard exposes Bridge Health ops panel', () => {
  assert.ok(
    html.includes('Bridge Health (ops lane)'),
    'expected Bridge Health (ops lane) section title',
  );
  assert.ok(html.includes('"ops"'), 'expected ops lane to be present in DEFAULT_LANES');
});

test('dashboard reacts to bridge_health signals', () => {
  assert.ok(
    html.includes('sig.kind === "bridge_health"') ||
      html.includes('sig.signal === "bridge.health"'),
    'expected handler for bridge_health events by kind or signal',
  );
});

test('dashboard renders bridge health metrics as numeric fields', () => {
  const metricKeys = [
    'forwarded',
    'dropped',
    'duplicates',
    'oversize',
    'retries',
    'failures',
    'backpressureCount',
    'queue',
    'inFlight',
  ];
  metricKeys.forEach((key) => {
    assert.ok(
      html.includes(`metrics.${key}`) || html.includes(`"${key}"`),
      `expected metric key ${key} referenced in bridge health UI`,
    );
  });
});

test('dashboard encodes explicit Bridge Health color rules (no magic numbers)', () => {
  assert.ok(
    html.includes('const BRIDGE_HEALTH_RULES'),
    'expected BRIDGE_HEALTH_RULES mapping for health color decisions',
  );
  assert.ok(
    html.includes('GREEN') && html.includes('YELLOW') && html.includes('RED'),
    'expected GREEN/YELLOW/RED keys in BRIDGE_HEALTH_RULES',
  );
});
