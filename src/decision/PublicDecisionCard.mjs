import { buildDecisionCard } from './DecisionCard.mjs';

/**
 * Project an internal DecisionCard into a public-safe representation.
 *
 * Doctrine:
 * - No VAC reason codes in the output.
 * - No ingestion health, ops notes, or ruleset internals.
 * - Projection-only: pure function, no side effects.
 */
export function projectPublicDecisionCard(decisionCard) {
  if (!decisionCard || typeof decisionCard !== 'object') {
    throw new TypeError('decisionCard object required');
  }

  const header = decisionCard.header || {};
  const body = decisionCard.body || {};
  const footer = decisionCard.footer || {};

  const status = header.status;
  let verdict;
  if (status === 'verified') {
    verdict = 'verified';
  } else if (status === 'rejected') {
    verdict = 'cannot_verify';
  } else {
    verdict = 'under_review';
  }

  const primary = body.primaryReason;
  const primaryReason = primary
    ? {
        title: primary.title,
        explanation: primary.explanation,
      }
    : null;

  const reasons = Array.isArray(body.why)
    ? body.why.map((item) => ({
        title: item.copy?.title ?? '',
        explanation: item.copy?.explanation ?? '',
      }))
    : [];

  const nextStep = body.nextStep
    ? {
        title: body.nextStep.title,
        action: body.nextStep.action,
      }
    : null;

  const evidence = footer.evidence || {};
  const publicEvidence = {
    fresh: typeof evidence.fresh === 'number' ? evidence.fresh : 0,
    recent: typeof evidence.recent === 'number' ? evidence.recent : 0,
    stale: typeof evidence.stale === 'number' ? evidence.stale : 0,
  };

  return {
    verdict,
    evaluatedAt: header.evaluatedAt ?? null,
    primaryReason,
    reasons,
    nextStep,
    evidence: publicEvidence,
  };
}

/**
 * Convenience wrapper: build internal DecisionCard first, then project.
 *
 * @param {object} decision ClaimDecision-like object
 * @param {object} evidenceSummary Optional evidence summary
 */
export function buildPublicDecisionCard(decision, evidenceSummary) {
  const internalCard = buildDecisionCard(decision, evidenceSummary);
  return projectPublicDecisionCard(internalCard);
}
