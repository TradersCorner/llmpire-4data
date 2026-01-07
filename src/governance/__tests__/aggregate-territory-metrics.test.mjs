// src/governance/__tests__/aggregate-territory-metrics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregateTerritoryMetrics } from '../aggregateTerritoryMetrics.mjs';

const REF = '2026-04-10T12:34:56Z';

function mkDecisionCard({
  id,
  status,
  evaluatedAt,
  evidence = { fresh: 0, recent: 0, stale: 0 },
  ingestionHealth = 'green',
  adminQueue,
}) {
  return {
    decisionId: id,
    decision: {
      id,
      status,
      decisionMeta: {
        evaluatedAt,
        ingestionHealth,
      },
    },
    card: {
      status,
      evaluatedAt,
      evidence,
    },
    evidenceSummary: evidence,
    adminQueue,
  };
}

test('aggregates decisions, freshness, ops context, and admin activity deterministically', () => {
  const decisionCards = [
    mkDecisionCard({
      id: 'd1',
      status: 'verified',
      evaluatedAt: '2026-04-10T11:00:00Z',
      evidence: { fresh: 1, recent: 0, stale: 0 },
      ingestionHealth: 'green',
      adminQueue: 'none',
    }),
    mkDecisionCard({
      id: 'd2',
      status: 'manual_review',
      evaluatedAt: '2026-04-09T12:00:00Z',
      evidence: { fresh: 0, recent: 1, stale: 0 },
      ingestionHealth: 'yellow',
      adminQueue: 'needs_refresh',
    }),
    mkDecisionCard({
      id: 'd3',
      status: 'rejected',
      evaluatedAt: '2026-03-01T00:00:00Z', // outside 7d
      evidence: { fresh: 0, recent: 0, stale: 1 },
      ingestionHealth: 'red',
      adminQueue: 'blocked',
    }),
  ];

  const adminActions = [
    { actionId: 'a1', decisionId: 'd2', at: '2026-04-10T10:00:00Z' },
    { actionId: 'a2', decisionId: 'd2', at: '2026-03-01T00:00:00Z' }, // outside 7d
  ];

  const m = aggregateTerritoryMetrics({
    territoryId: 'county:12033',
    window: '7d',
    referenceIso: REF,
    decisionCards,
    feedbackContexts: new Map(),
    adminActions,
  });

  // Decisions (d1 + d2 only)
  assert.deepEqual(m.decisions, {
    verified: 1,
    manual_review: 1,
    rejected: 0,
  });

  // Freshness (from d1 + d2)
  assert.deepEqual(m.freshness, {
    fresh: 1,
    recent: 1,
    stale: 0,
  });

  // Ops context
  assert.deepEqual(m.opsContext, {
    green: 1,
    yellow: 1,
    red: 0,
  });

  // Admin activity
  assert.equal(m.adminActivity.actions, 1);
  assert.equal(m.adminActivity.backlog, 1); // needs_refresh
});

test('determinism: same inputs produce identical aggregates', () => {
  const args = {
    territoryId: 'city:xyz',
    window: '24h',
    referenceIso: REF,
    decisionCards: [
      mkDecisionCard({
        id: 'd1',
        status: 'verified',
        evaluatedAt: '2026-04-10T12:00:00Z',
        evidence: { fresh: 2, recent: 0, stale: 0 },
        ingestionHealth: 'green',
      }),
    ],
    feedbackContexts: new Map(),
    adminActions: [],
  };

  const a = aggregateTerritoryMetrics(args);
  const b = aggregateTerritoryMetrics(args);

  assert.deepEqual(a, b);
});

test('territory isolation: unrelated data does not leak', () => {
  const m = aggregateTerritoryMetrics({
    territoryId: 'county:00000',
    window: '24h',
    referenceIso: REF,
    decisionCards: [],
    feedbackContexts: new Map(),
    adminActions: [],
  });

  assert.equal(m.decisions.verified, 0);
  assert.equal(m.adminActivity.actions, 0);
});
