// src/governance/__tests__/moderator-queues.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeQueueType,
  listQueueItemsForTerritory,
  listQueueItemsForModerator,
  QUEUE_PRIORITY,
} from '../moderatorQueues.mjs';

function mkTerritoryRegistry(territories) {
  // Minimal G1-compatible registry interface
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
      // Deterministic ordering by territoryId
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
      // Deliberately include fields that should NOT leak; projection must ignore them
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

test('normalizeQueueType clamps unknown values to none', () => {
  assert.equal(normalizeQueueType(null), 'none');
  assert.equal(normalizeQueueType('bad_queue'), 'none');
  assert.equal(normalizeQueueType('needs_refresh'), 'needs_refresh');
});

test('listQueueItemsForTerritory filters exact territory and orders deterministically by priority then time', () => {
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
      territoryId: 't2',
      adminQueue: 'needs_refresh',
      evaluatedAt: '2026-04-10T12:00:00.000Z',
    }),
    mkDecisionCard({
      decisionId: 'd4',
      territoryId: 't1',
      adminQueue: 'needs_refresh',
      evaluatedAt: '2026-04-10T12:00:00.000Z',
    }),
  ];

  const fb = new Map([
    ['d2', { ingestionHealth: 'red', lastHealthAt: '2026-04-10T09:00:00Z', suggestedAction: 'pause' }],
  ]);

  const out = listQueueItemsForTerritory({
    territoryId: 't1',
    decisionCards,
    feedbackContexts: fb,
  });

  // Should include only t1 items: d1, d2, d4
  assert.deepEqual(out.map(x => x.decisionId), ['d2', 'd4', 'd1']); // paused > needs_refresh > needs_second_source

  // Priority ordering is consistent with QUEUE_PRIORITY
  assert.ok((QUEUE_PRIORITY[out[0].queue] ?? 99) <= (QUEUE_PRIORITY[out[1].queue] ?? 99));

  // Projection is leak-safe: no reasons/ruleset/meta fields
  for (const item of out) {
    assert.ok(!('reasons' in item));
    assert.ok(!('ruleSetVersion' in item));
    assert.ok(!('decisionMeta' in item));
    assert.ok(!('ingestionHealth' in item)); // only suggestedAction is allowed
  }

  // FeedbackContext applied only where present
  const d2 = out.find(x => x.decisionId === 'd2');
  assert.equal(d2.suggestedAction, 'pause');

  const d1 = out.find(x => x.decisionId === 'd1');
  assert.equal(d1.suggestedAction, undefined);
});

test('listQueueItemsForModerator unions territories and filters deterministically', () => {
  const registry = mkTerritoryRegistry([
    { territoryId: 't1', moderators: ['m1'] },
    { territoryId: 't2', moderators: ['m1'] },
    { territoryId: 't3', moderators: ['m2'] },
  ]);

  const decisionCards = [
    mkDecisionCard({ decisionId: 'a', territoryId: 't1', adminQueue: 'needs_refresh', evaluatedAt: '2026-04-10T12:00:00Z' }),
    mkDecisionCard({ decisionId: 'b', territoryId: 't2', adminQueue: 'blocked', evaluatedAt: '2026-04-10T13:00:00Z' }),
    mkDecisionCard({ decisionId: 'c', territoryId: 't3', adminQueue: 'needs_refresh', evaluatedAt: '2026-04-10T14:00:00Z' }),
  ];

  const out = listQueueItemsForModerator({
    moderatorId: 'm1',
    territoryRegistry: registry,
    decisionCards,
  });

  // m1 moderates t1 & t2 only
  assert.deepEqual(out.map(x => x.decisionId), ['b', 'a']); // blocked higher priority than needs_refresh
});

test('read-only: selectors do not mutate inputs', () => {
  const decisionCards = [
    mkDecisionCard({ decisionId: 'x', territoryId: 't1', adminQueue: 'needs_refresh' }),
  ];
  const snapshot = JSON.stringify(decisionCards);

  const registry = mkTerritoryRegistry([{ territoryId: 't1', moderators: ['m1'] }]);
  listQueueItemsForModerator({ moderatorId: 'm1', territoryRegistry: registry, decisionCards });

  assert.equal(JSON.stringify(decisionCards), snapshot);
});
