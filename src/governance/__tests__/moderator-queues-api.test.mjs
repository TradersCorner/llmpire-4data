// src/governance/__tests__/moderator-queues-api.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildModeratorQueuesApi } from '../moderatorQueuesApi.mjs';
import { QUEUE_TYPES } from '../moderatorQueues.mjs';

function mkTerritoryRegistry(territories) {
  const byMod = new Map();
  for (const t of territories) {
    for (const m of t.moderators || []) {
      if (!byMod.has(m)) byMod.set(m, []);
      byMod.get(m).push(t);
    }
  }
  return {
    listTerritoriesForModerator(moderatorId) {
      const ts = byMod.get(moderatorId) || [];
      return [...ts].sort((a, b) => a.territoryId.localeCompare(b.territoryId));
    },
  };
}

function mkDecisionCard({
  decisionId,
  territoryId,
  adminQueue,
  status = 'manual_review',
  evaluatedAt = '2026-04-10T00:00:00.000Z',
  evidence = { fresh: 0, recent: 0, stale: 0 },
  nextStepTitle = 'Add listing',
}) {
  return {
    decisionId,
    territoryId,
    adminQueue,
    card: {
      status,
      evaluatedAt,
      nextStep: { title: nextStepTitle },
      evidence,
      reasons: ['single.domain.only'],
      ruleSetVersion: 'vac-business-v1',
      decisionMeta: { ingestionHealth: 'red' },
    },
    decision: {
      id: decisionId,
      status,
      decidedAt: evaluatedAt,
      decisionMeta: { ingestionHealth: 'red', evaluatedAt },
    },
    evidenceSummary: evidence,
  };
}

test('getTerritoryQueues filters by queue and preserves deterministic ordering and leak-safe shape', () => {
  const api = buildModeratorQueuesApi({});

  const decisionCards = [
    mkDecisionCard({
      decisionId: 'd1',
      territoryId: 't1',
      adminQueue: 'needs_second_source',
      evaluatedAt: '2026-04-10T10:00:00.000Z',
    }),
    mkDecisionCard({
      decisionId: 'd2',
      territoryId: 't1',
      adminQueue: 'paused_by_ops',
      evaluatedAt: '2026-04-10T09:00:00.000Z',
    }),
    mkDecisionCard({
      decisionId: 'd3',
      territoryId: 't1',
      adminQueue: 'needs_refresh',
      evaluatedAt: '2026-04-10T12:00:00.000Z',
    }),
  ];

  const fb = new Map([
    ['d2', { suggestedAction: 'pause' }],
  ]);

  const result = api.getTerritoryQueues({
    territoryId: 't1',
    decisionCards,
    feedbackContexts: fb,
    queue: 'needs_refresh',
    includeNone: false,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.territoryId, 't1');

  const { queues } = result.body;
  assert.deepEqual(queues.map((q) => q.decisionId), ['d3']);

  for (const item of queues) {
    assert.ok(!('reasons' in item));
    assert.ok(!('ruleSetVersion' in item));
    assert.ok(!('decisionMeta' in item));
    assert.ok(!('ingestionHealth' in item));
  }
});

test('getModeratorQueues unions territories for moderator and supports queue filter', () => {
  const registry = mkTerritoryRegistry([
    { territoryId: 't1', moderators: ['m1'] },
    { territoryId: 't2', moderators: ['m1'] },
  ]);

  const api = buildModeratorQueuesApi({ territoryRegistry: registry });

  const decisionCards = [
    mkDecisionCard({
      decisionId: 'a',
      territoryId: 't1',
      adminQueue: 'needs_refresh',
      evaluatedAt: '2026-04-10T12:00:00Z',
    }),
    mkDecisionCard({
      decisionId: 'b',
      territoryId: 't2',
      adminQueue: 'blocked',
      evaluatedAt: '2026-04-10T13:00:00Z',
    }),
  ];

  const result = api.getModeratorQueues({
    moderatorId: 'm1',
    decisionCards,
    queue: 'blocked',
    includeNone: false,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.moderatorId, 'm1');

  const { queues } = result.body;
  assert.deepEqual(queues.map((q) => q.decisionId), ['b']);
});

test('includeNone=true allows none-queue items to be returned', () => {
  const registry = mkTerritoryRegistry([
    { territoryId: 't1', moderators: ['m1'] },
  ]);

  const api = buildModeratorQueuesApi({ territoryRegistry: registry });

  const decisionCards = [
    mkDecisionCard({ decisionId: 'x', territoryId: 't1', adminQueue: null }),
  ];

  const result = api.getModeratorQueues({
    moderatorId: 'm1',
    decisionCards,
    includeNone: true,
  });

  const { queues } = result.body;
  assert.equal(queues.length, 1);
  assert.equal(queues[0].queue, 'none');
});

test('API validates queue and includeNone inputs', () => {
  const api = buildModeratorQueuesApi({});
  const decisionCards = [];

  assert.throws(
    () => api.getTerritoryQueues({ territoryId: 't1', decisionCards, queue: 'bad' }),
    /Invalid queue/,
  );

  assert.throws(
    () => api.getTerritoryQueues({ territoryId: 't1', decisionCards, includeNone: 'maybe' }),
    /Invalid includeNone value/,
  );

  // Sanity: QUEUE_TYPES are all accepted
  QUEUE_TYPES.forEach((q) => {
    api.getTerritoryQueues({ territoryId: 't1', decisionCards, queue: q });
  });
});

test('read-only: API does not mutate decisionCards', () => {
  const registry = mkTerritoryRegistry([
    { territoryId: 't1', moderators: ['m1'] },
  ]);
  const api = buildModeratorQueuesApi({ territoryRegistry: registry });

  const decisionCards = [
    mkDecisionCard({ decisionId: 'x', territoryId: 't1', adminQueue: 'needs_refresh' }),
  ];
  const snapshot = JSON.stringify(decisionCards);

  api.getTerritoryQueues({ territoryId: 't1', decisionCards });
  api.getModeratorQueues({ moderatorId: 'm1', decisionCards });

  assert.equal(JSON.stringify(decisionCards), snapshot);
});
