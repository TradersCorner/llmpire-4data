// src/governance/__tests__/territory-metrics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  METRIC_WINDOWS,
  computeBucketIso,
  createEmptyTerritoryMetrics,
} from '../territoryMetrics.mjs';

test('METRIC_WINDOWS is fixed and ordered', () => {
  assert.deepEqual(METRIC_WINDOWS, ['24h', '7d', '30d']);
});

test('computeBucketIso floors deterministically for 24h', () => {
  const iso = '2026-01-15T14:37:22.123Z';
  const bucket = computeBucketIso('24h', iso);
  assert.equal(bucket, '2026-01-15T14:00:00.000Z');
});

test('computeBucketIso floors deterministically for 7d', () => {
  const iso = '2026-01-15T14:37:22.123Z';
  const bucket = computeBucketIso('7d', iso);
  assert.equal(bucket, '2026-01-15T00:00:00.000Z');
});

test('computeBucketIso floors deterministically for 30d', () => {
  const iso = '2026-01-31T23:59:59.999Z';
  const bucket = computeBucketIso('30d', iso);
  assert.equal(bucket, '2026-01-31T00:00:00.000Z');
});

test('computeBucketIso rejects invalid windows', () => {
  assert.throws(() => computeBucketIso('1h', '2026-01-01T00:00:00Z'));
});

test('computeBucketIso rejects invalid timestamps', () => {
  assert.throws(() => computeBucketIso('24h', 'not-a-time'));
});

test('createEmptyTerritoryMetrics produces canonical zeroed shape', () => {
  const m = createEmptyTerritoryMetrics({
    territoryId: 'county:12033',
    window: '7d',
    referenceIso: '2026-02-01T05:04:03Z',
  });

  assert.equal(m.territoryId, 'county:12033');
  assert.equal(m.window, '7d');
  assert.equal(m.computedAt, '2026-02-01T00:00:00.000Z');

  assert.deepEqual(m.decisions, {
    verified: 0,
    manual_review: 0,
    rejected: 0,
  });

  assert.deepEqual(m.freshness, {
    fresh: 0,
    recent: 0,
    stale: 0,
  });

  assert.deepEqual(m.opsContext, {
    green: 0,
    yellow: 0,
    red: 0,
  });

  assert.deepEqual(m.adminActivity, {
    actions: 0,
    backlog: 0,
  });
});

test('createEmptyTerritoryMetrics rejects missing territoryId', () => {
  assert.throws(() =>
    createEmptyTerritoryMetrics({
      window: '24h',
      referenceIso: '2026-01-01T00:00:00Z',
    }),
  );
});

test('createEmptyTerritoryMetrics rejects invalid window', () => {
  assert.throws(() =>
    createEmptyTerritoryMetrics({
      territoryId: 'county:12033',
      window: 'bad',
      referenceIso: '2026-01-01T00:00:00Z',
    }),
  );
});

test('determinism: same inputs produce identical metrics', () => {
  const a = createEmptyTerritoryMetrics({
    territoryId: 'city:xyz',
    window: '24h',
    referenceIso: '2026-03-10T11:22:33Z',
  });

  const b = createEmptyTerritoryMetrics({
    territoryId: 'city:xyz',
    window: '24h',
    referenceIso: '2026-03-10T11:22:33Z',
  });

  assert.deepEqual(a, b);
});
