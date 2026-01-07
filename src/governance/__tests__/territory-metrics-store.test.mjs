// src/governance/__tests__/territory-metrics-store.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTerritoryMetricsStore } from '../territoryMetricsStore.mjs';

const TMP = path.join(process.cwd(), 'data', 'test-governance.sqlite');

function mkMetrics({ territoryId, window, computedAt, n }) {
  return {
    territoryId,
    window,
    computedAt,
    decisions: { verified: n, manual_review: 0, rejected: 0 },
    freshness: { fresh: n, recent: 0, stale: 0 },
    opsContext: { green: n, yellow: 0, red: 0 },
    adminActivity: { actions: 0, backlog: 0 },
  };
}

test('upsert and getLatest are idempotent', () => {
  if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
  const store = createTerritoryMetricsStore({ dbPath: TMP });

  const m1 = mkMetrics({
    territoryId: 'county:12033',
    window: '7d',
    computedAt: '2026-04-10T00:00:00.000Z',
    n: 1,
  });

  store.upsert(m1);
  store.upsert(m1); // idempotent

  const got = store.getLatest({ territoryId: 'county:12033', window: '7d' });
  assert.deepEqual(got, m1);

  store.close();
});

test('upsert overwrites payload for same key (recompute safe)', () => {
  if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
  const store = createTerritoryMetricsStore({ dbPath: TMP });

  const base = {
    territoryId: 'city:xyz',
    window: '24h',
    computedAt: '2026-04-10T14:00:00.000Z',
  };

  store.upsert(mkMetrics({ ...base, n: 1 }));
  store.upsert(mkMetrics({ ...base, n: 2 }));

  const got = store.getLatest({ territoryId: 'city:xyz', window: '24h' });
  assert.equal(got.decisions.verified, 2);

  store.close();
});

test('listLatest returns one per territory for a window', () => {
  if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
  const store = createTerritoryMetricsStore({ dbPath: TMP });

  store.upsert(mkMetrics({
    territoryId: 't1',
    window: '7d',
    computedAt: '2026-04-09T00:00:00.000Z',
    n: 1,
  }));
  store.upsert(mkMetrics({
    territoryId: 't1',
    window: '7d',
    computedAt: '2026-04-10T00:00:00.000Z',
    n: 2,
  }));
  store.upsert(mkMetrics({
    territoryId: 't2',
    window: '7d',
    computedAt: '2026-04-10T00:00:00.000Z',
    n: 3,
  }));

  const rows = store.listLatest({ window: '7d' });
  assert.equal(rows.length, 2);

  const byId = Object.fromEntries(rows.map((r) => [r.territoryId, r]));
  assert.equal(byId.t1.decisions.verified, 2);
  assert.equal(byId.t2.decisions.verified, 3);

  store.close();
});

test('history returns ordered snapshots', () => {
  if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
  const store = createTerritoryMetricsStore({ dbPath: TMP });

  store.upsert(mkMetrics({
    territoryId: 't3',
    window: '30d',
    computedAt: '2026-04-08T00:00:00.000Z',
    n: 1,
  }));
  store.upsert(mkMetrics({
    territoryId: 't3',
    window: '30d',
    computedAt: '2026-04-09T00:00:00.000Z',
    n: 2,
  }));

  const hist = store.history({ territoryId: 't3', window: '30d', limit: 10 });
  assert.equal(hist.length, 2);
  assert.equal(hist[0].decisions.verified, 2);
  assert.equal(hist[1].decisions.verified, 1);

  store.close();
});
