import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function extractReasonCodesFromEvaluate() {
  const src = read('src/vac/evaluate.ts');
  const re = /'([a-z0-9_.]+)'/g;
  const codes = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    const code = m[1];
    if (/[.]/.test(code)) {
      codes.add(code);
    }
  }
  return Array.from(codes).sort();
}

function extractReasonCodesFromCopy() {
  const src = read('src/decision/reasonCopy.v1.mjs');
  const re = /'([a-z0-9_.]+)'\s*:/g;
  const codes = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    codes.add(m[1]);
  }
  return Array.from(codes).sort();
}

test('Decision UX: every VAC v1 reason has copy in VAC_REASON_COPY_V1', () => {
  const evalCodes = extractReasonCodesFromEvaluate();
  const copyCodes = extractReasonCodesFromCopy();

  const missing = evalCodes.filter((c) => !copyCodes.includes(c));

  assert.deepEqual(
    missing,
    [],
    `Expected every reason code in evaluate.ts to have copy; missing: ${missing.join(', ')}`,
  );
});

import { buildDecisionCard } from '../src/decision/DecisionCard.mjs';

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

test('DecisionCard: deterministic mapping from ClaimDecision to card', () => {
  const decision = sampleDecision();
  const evidenceSummary = {
    domains: ['mytruck.example', 'listings.example.com'],
    fresh: 1,
    recent: 1,
    stale: 0,
    hasOfficial: false,
    hasDirectory: true,
  };

  const first = buildDecisionCard(decision, evidenceSummary);
  const second = buildDecisionCard(JSON.parse(JSON.stringify(decision)), evidenceSummary);

  assert.deepEqual(first, second, 'Expected DecisionCard rendering to be deterministic');

  assert.equal(first.header.status, 'manual_review');
  assert.equal(first.header.ruleSetVersion, 'vac-business-v1');
  assert.equal(first.header.ingestionHealth, 'yellow');
  assert.ok(first.header.opsNote, 'Expected ops note when ingestion health is not green');

  assert.equal(first.body.primaryReason.code, 'multi_domain.required.for.verification');
  assert.ok(first.body.nextStep.action.length > 0, 'Expected a non-empty next-step action');

  assert.equal(first.footer.evidence.fresh, 1);
  assert.equal(first.footer.evidence.recent, 1);
  assert.ok(
    first.footer.evidence.notes.includes('directory listing present'),
    'Expected evidence notes to mention directory listings',
  );
});
