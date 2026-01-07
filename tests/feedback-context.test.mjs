import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveFeedbackContext } from '../src/feedback/feedbackContext.mjs';

function sampleDecision(overrides = {}) {
  return {
    id: 'd1',
    claimId: 'c1',
    status: 'verified',
    ruleSetVersion: 'vac-business-v1',
    reasons: ['multi_domain.corroboration'],
    decidedAt: '2024-02-10T00:00:00.000Z',
    decisionMeta: {
      ingestionHealth: 'green',
      evaluatedAt: '2024-02-09T00:00:00.000Z',
    },
    ...overrides,
  };
}

test('resolveFeedbackContext: deterministic for same inputs', () => {
  const decision = sampleDecision({
    decisionMeta: { ingestionHealth: 'yellow', evaluatedAt: '2024-02-09T00:00:00.000Z' },
  });
  const bridgeHealth = { status: 'red', lastHealthAt: '2024-02-09T01:00:00.000Z' };

  const first = resolveFeedbackContext(decision, bridgeHealth);
  const second = resolveFeedbackContext(JSON.parse(JSON.stringify(decision)), {
    status: bridgeHealth.status,
    lastHealthAt: bridgeHealth.lastHealthAt,
  });

  assert.deepEqual(first, second, 'Expected FeedbackContext to be deterministic for same logical input');
});

test('resolveFeedbackContext: prefers decisionMeta.ingestionHealth over bridge status', () => {
  const decision = sampleDecision({
    decisionMeta: { ingestionHealth: 'red', evaluatedAt: '2024-02-09T00:00:00.000Z' },
  });
  const bridgeHealth = { status: 'green', lastHealthAt: '2024-02-09T01:00:00.000Z' };

  const ctx = resolveFeedbackContext(decision, bridgeHealth);

  assert.equal(ctx.ingestionHealth, 'red');
  assert.equal(ctx.suggestedAction, 'pause');
  assert.equal(ctx.lastHealthAt, '2024-02-09T01:00:00.000Z');
});

test('resolveFeedbackContext: uses bridge status when decisionMeta missing', () => {
  const decision = sampleDecision({ decisionMeta: undefined });
  const bridgeHealth = { status: 'yellow', lastHealthAt: '2024-02-10T05:00:00.000Z' };

  const ctx = resolveFeedbackContext(decision, bridgeHealth);

  assert.equal(ctx.ingestionHealth, 'yellow');
  assert.equal(ctx.suggestedAction, 'deprioritize');
  assert.equal(ctx.lastHealthAt, '2024-02-10T05:00:00.000Z');
});

test('resolveFeedbackContext: falls back to evaluatedAt/decidedAt when no bridge health timestamp', () => {
  const decision = sampleDecision({
    decisionMeta: { ingestionHealth: 'green', evaluatedAt: '2024-02-11T00:00:00.000Z' },
  });

  const ctx = resolveFeedbackContext(decision, { status: 'green' });

  assert.equal(ctx.ingestionHealth, 'green');
  assert.equal(ctx.suggestedAction, undefined);
  assert.equal(ctx.lastHealthAt, '2024-02-11T00:00:00.000Z');
});

test('resolveFeedbackContext: unknown health maps to observe suggestion', () => {
  const decision = sampleDecision({ decisionMeta: undefined, decidedAt: '2024-02-12T00:00:00.000Z' });

  const ctx = resolveFeedbackContext(decision, undefined);

  assert.equal(ctx.ingestionHealth, 'unknown');
  assert.equal(ctx.suggestedAction, 'observe');
  assert.equal(ctx.lastHealthAt, '2024-02-12T00:00:00.000Z');
});
