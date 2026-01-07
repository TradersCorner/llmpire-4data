import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDecisionCard } from '../src/decision/DecisionCard.mjs';
import { buildPublicDecisionCard, projectPublicDecisionCard } from '../src/decision/PublicDecisionCard.mjs';
import { VAC_REASON_COPY_V1 } from '../src/decision/reasonCopy.v1.mjs';

function sampleDecision(overrides = {}) {
  return {
    id: 'd1',
    claimId: 'c1',
    status: 'manual_review',
    ruleSetVersion: 'vac-business-v1',
    reasons: ['single.domain.only', 'multi_domain.required.for.verification'],
    decidedAt: '2024-02-10T00:00:00.000Z',
    decisionMeta: {
      ingestionHealth: 'yellow',
      evaluatedAt: '2024-02-09T00:00:00.000Z',
    },
    ...overrides,
  };
}

test('PublicDecisionCard: deterministic projection from internal DecisionCard', () => {
  const decision = sampleDecision();
  const evidenceSummary = {
    domains: ['mytruck.example', 'listings.example.com'],
    fresh: 1,
    recent: 1,
    stale: 0,
    hasOfficial: false,
    hasDirectory: true,
  };

  const internalFirst = buildDecisionCard(decision, evidenceSummary);
  const internalSecond = buildDecisionCard(JSON.parse(JSON.stringify(decision)), evidenceSummary);

  const publicFirst = projectPublicDecisionCard(internalFirst);
  const publicSecond = projectPublicDecisionCard(internalSecond);

  assert.deepEqual(publicFirst, publicSecond, 'Expected public projection to be deterministic');

  assert.equal(publicFirst.verdict, 'under_review');
  assert.ok(publicFirst.primaryReason);
  assert.ok(publicFirst.primaryReason.title.length > 0);
  assert.ok(publicFirst.nextStep);
  assert.ok(publicFirst.nextStep.action.length > 0);
});

test('PublicDecisionCard: does not leak VAC reason codes or ops metadata', () => {
  const decision = sampleDecision();
  const evidenceSummary = {
    domains: ['mytruck.example', 'listings.example.com'],
    fresh: 1,
    recent: 1,
    stale: 0,
    hasOfficial: false,
    hasDirectory: true,
  };

  const publicCard = buildPublicDecisionCard(decision, evidenceSummary);
  const json = JSON.stringify(publicCard);

  // No raw VAC reason codes in the public representation
  const reasonCodes = Object.keys(VAC_REASON_COPY_V1);
  const leaked = reasonCodes.filter((code) => json.includes(code));
  assert.deepEqual(
    leaked,
    [],
    `Expected no VAC reason codes in PublicDecisionCard; leaked: ${leaked.join(', ')}`,
  );

  // No ingestion health or ops-only metadata
  assert.equal(json.includes('ingestionHealth'), false, 'ingestionHealth must not appear in public card');
  assert.equal(json.includes('opsNote'), false, 'opsNote must not appear in public card');
  assert.equal(json.includes('ruleSetVersion'), false, 'ruleSetVersion must not appear in public card');

  // Shape is projection-only: known fields only
  assert.deepEqual(
    Object.keys(publicCard).sort(),
    ['evaluatedAt', 'evidence', 'nextStep', 'primaryReason', 'reasons', 'verdict'].sort(),
    'PublicDecisionCard should expose only the agreed public fields',
  );
});
