// src/governance/__tests__/territory-metrics-api.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTerritoryMetricsStore } from '../territoryMetricsStore.mjs';
import { buildTerritoryMetricsApi } from '../territoryMetricsApi.mjs';

const TMP = path.join(process.cwd(), 'data', 'test-governance-api.sqlite');

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

test('getTerritoryLatest returns canonical TerritoryMetrics shape without store internals', () => {
  if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
  const store = createTerritoryMetricsStore({ dbPath: TMP });
  const api = buildTerritoryMetricsApi({ store });

  const m = mkMetrics({
    territoryId: 'county:12033',
    window: '7d',
    computedAt: '2026-04-10T00:00:00.000Z',
    n: 1,
  });

  store.upsert(m);

  const result = api.getTerritoryLatest({ territoryId: 'county:12033', window: '7d' });

  assert.equal(result.status, 200);
  const { metrics } = result.body;

  const topLevelKeys = Object.keys(metrics).sort();
  assert.deepEqual(
    topLevelKeys,
    ['adminActivity', 'computedAt', 'decisions', 'freshness', 'opsContext', 'territoryId', 'window'].sort(),
  );

  assert.equal(metrics.territoryId, 'county:12033');
  assert.equal(metrics.window, '7d');
  assert.equal(metrics.decisions.verified, 1);

  assert.ok(!('payload' in metrics), 'metrics payload must not expose store payload field');

  store.close();
});

test('listWindowLatest returns one latest snapshot per territory, ordered deterministically', () => {
  if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
  const store = createTerritoryMetricsStore({ dbPath: TMP });
  const api = buildTerritoryMetricsApi({ store });

  store.upsert(mkMetrics({
    territoryId: 't2',
    window: '7d',
    computedAt: '2026-04-09T00:00:00.000Z',
    n: 1,
  }));
  store.upsert(mkMetrics({
    territoryId: 't2',
    window: '7d',
    computedAt: '2026-04-10T00:00:00.000Z',
    n: 2,
  }));
  store.upsert(mkMetrics({
    territoryId: 't1',
    window: '7d',
    computedAt: '2026-04-10T00:00:00.000Z',
    n: 3,
  }));

  const result = api.listWindowLatest({ window: '7d' });
  assert.equal(result.status, 200);

  const { territories } = result.body;
  assert.equal(territories.length, 2);

  const ids = territories.map((t) => t.territoryId);
  assert.deepEqual(ids, ['t1', 't2']);

  const byId = Object.fromEntries(territories.map((t) => [t.territoryId, t]));
  assert.equal(byId.t1.decisions.verified, 3);
  assert.equal(byId.t2.decisions.verified, 2);

  territories.forEach((m) => {
    assert.ok(!('payload' in m), 'territory metrics must not expose store payload field');
  });

  store.close();
});

test('getTerritoryHistory returns newest-first snapshots up to the requested limit', () => {
  if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
  const store = createTerritoryMetricsStore({ dbPath: TMP });
  const api = buildTerritoryMetricsApi({ store });

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
  store.upsert(mkMetrics({
    territoryId: 't3',
    window: '30d',
    computedAt: '2026-04-10T00:00:00.000Z',
    n: 3,
  }));

  const result = api.getTerritoryHistory({ territoryId: 't3', window: '30d', limit: 2 });
  assert.equal(result.status, 200);

  const { history } = result.body;
  assert.equal(history.length, 2);
  assert.equal(history[0].decisions.verified, 3);
  assert.equal(history[1].decisions.verified, 2);

  history.forEach((m) => {
    assert.ok(!('payload' in m), 'history metrics must not expose store payload field');
  });

  store.close();
});

test('API validates window input', () => {
  if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
  const store = createTerritoryMetricsStore({ dbPath: TMP });
  const api = buildTerritoryMetricsApi({ store });

  assert.throws(
    () => api.listWindowLatest({ window: 'bad' }),
    /Invalid window/,
  );

  assert.throws(
    () => api.getTerritoryLatest({ territoryId: 't1', window: 'bad' }),
    /Invalid window/,
  );

  store.close();
});
