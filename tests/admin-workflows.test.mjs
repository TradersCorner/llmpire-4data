import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveFeedbackContext } from '../src/feedback/feedbackContext.mjs';
import { deriveAdminQueue } from '../src/admin/adminQueues.mjs';
import { canPerformAction } from '../src/admin/adminActions.mjs';
import { appendAdminAction, getAdminActions } from '../src/admin/actionLog.mjs';

function decisionWith(overrides = {}) {
  return {
    id: 'd1',
    claimId: 'c1',
    status: 'manual_review',
    ruleSetVersion: 'vac-business-v1',
    reasons: [],
    decidedAt: '2024-02-10T00:00:00.000Z',
    decisionMeta: {
      ingestionHealth: 'green',
      evaluatedAt: '2024-02-09T00:00:00.000Z',
    },
    ...overrides,
  };
}

test('deriveAdminQueue: paused_by_ops when suggestedAction is pause', () => {
  const decision = decisionWith({
    status: 'verified',
    reasons: ['multi_domain.corroboration'],
    decisionMeta: { ingestionHealth: 'red', evaluatedAt: '2024-02-09T00:00:00.000Z' },
  });
  const feedback = resolveFeedbackContext(decision, { status: 'green', lastHealthAt: '2024-02-09T01:00:00.000Z' });

  const queue = deriveAdminQueue(decision, feedback);
  assert.equal(queue, 'paused_by_ops');
});

test('deriveAdminQueue: needs_refresh when stale or needs.refresh present', () => {
  const decision = decisionWith({ reasons: ['stale.multi_domain.evidence'] });
  const feedback = resolveFeedbackContext(decision, { status: 'yellow', lastHealthAt: '2024-02-09T01:00:00.000Z' });

  const queue = deriveAdminQueue(decision, feedback);
  assert.equal(queue, 'needs_refresh');
});

test('deriveAdminQueue: needs_second_source when single-domain reasons present', () => {
  const decision = decisionWith({ reasons: ['single.domain.only'] });
  const feedback = resolveFeedbackContext(decision, { status: 'green', lastHealthAt: '2024-02-09T01:00:00.000Z' });

  const queue = deriveAdminQueue(decision, feedback);
  assert.equal(queue, 'needs_second_source');
});

test('deriveAdminQueue: blocked for rejected decisions when not paused', () => {
  const decision = decisionWith({ status: 'rejected', reasons: ['conflicting.or.missing.website.evidence'] });
  const feedback = resolveFeedbackContext(decision, { status: 'green', lastHealthAt: '2024-02-09T01:00:00.000Z' });

  const queue = deriveAdminQueue(decision, feedback);
  assert.equal(queue, 'blocked');
});

test('canPerformAction: unknown actions are rejected', () => {
  const decision = decisionWith();
  const feedback = resolveFeedbackContext(decision, { status: 'green', lastHealthAt: '2024-02-09T01:00:00.000Z' });

  // @ts-expect-error intentional bad action for test
  const allowed = canPerformAction(decision, 'none', feedback, 'not_a_real_action');
  assert.equal(allowed, false);
});

test('canPerformAction: pause allows only add_note', () => {
  const decision = decisionWith({
    decisionMeta: { ingestionHealth: 'red', evaluatedAt: '2024-02-09T00:00:00.000Z' },
  });
  const feedback = resolveFeedbackContext(decision, { status: 'green', lastHealthAt: '2024-02-09T01:00:00.000Z' });
  const queue = deriveAdminQueue(decision, feedback);

  assert.equal(queue, 'paused_by_ops');

  assert.equal(canPerformAction(decision, queue, feedback, 'request_refresh'), false);
  assert.equal(canPerformAction(decision, queue, feedback, 're_evaluate_v1'), false);
  assert.equal(canPerformAction(decision, queue, feedback, 'mark_reviewed'), false);
  assert.equal(canPerformAction(decision, queue, feedback, 'add_note'), true);
});

test('canPerformAction: refresh only allowed on needs_refresh queue', () => {
  const decision = decisionWith({ reasons: ['needs.refresh'] });
  const feedback = resolveFeedbackContext(decision, { status: 'yellow', lastHealthAt: '2024-02-09T01:00:00.000Z' });
  const refreshQueue = deriveAdminQueue(decision, feedback);

  assert.equal(refreshQueue, 'needs_refresh');
  assert.equal(canPerformAction(decision, refreshQueue, feedback, 'request_refresh'), true);

  const otherDecision = decisionWith({ reasons: ['single.domain.only'] });
  const otherFeedback = resolveFeedbackContext(otherDecision, { status: 'green', lastHealthAt: '2024-02-09T01:00:00.000Z' });
  const otherQueue = deriveAdminQueue(otherDecision, otherFeedback);

  assert.notEqual(otherQueue, 'needs_refresh');
  assert.equal(canPerformAction(otherDecision, otherQueue, otherFeedback, 'request_refresh'), false);
});

test('canPerformAction: cannot mark reviewed when already verified', () => {
  const decision = decisionWith({ status: 'verified' });
  const feedback = resolveFeedbackContext(decision, { status: 'green', lastHealthAt: '2024-02-09T01:00:00.000Z' });

  const allowed = canPerformAction(decision, 'none', feedback, 'mark_reviewed');
  assert.equal(allowed, false);
});

test('canPerformAction: cannot re-evaluate hard rejections', () => {
  const decision = decisionWith({ status: 'rejected', reasons: ['conflicting.or.missing.website.evidence'] });
  const feedback = resolveFeedbackContext(decision, { status: 'green', lastHealthAt: '2024-02-09T01:00:00.000Z' });
  const queue = deriveAdminQueue(decision, feedback);

  assert.equal(queue, 'blocked');
  assert.equal(canPerformAction(decision, queue, feedback, 're_evaluate_v1'), false);
});

test('actionLog: append-only entries with stable shape', () => {
  const before = getAdminActions().length;
  const entry = appendAdminAction({ decisionId: 'd1', action: 'add_note', actor: 'ops@example.com', note: 'Test note' });
  const after = getAdminActions().length;

  assert.equal(after, before + 1);
  assert.ok(entry.actionId.startsWith('aa_'));
  assert.equal(entry.decisionId, 'd1');
  assert.equal(entry.action, 'add_note');
  assert.equal(entry.actor, 'ops@example.com');
  assert.equal(entry.note, 'Test note');
});
