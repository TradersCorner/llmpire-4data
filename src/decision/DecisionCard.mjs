import { getReasonCopy } from './reasonCopy.v1.mjs';
import { deriveNextStep } from './deriveNextStep.mjs';

function normalizeIngestionHealth(meta) {
  const h = meta && meta.ingestionHealth;
  if (h === 'green' || h === 'yellow' || h === 'red' || h === 'unknown') return h;
  return 'unknown';
}

function summarizeEvidence(evidenceSummary) {
  if (!evidenceSummary) {
    return {
      domains: [],
      fresh: 0,
      recent: 0,
      stale: 0,
      notes: [],
    };
  }
  const { domains = [], fresh = 0, recent = 0, stale = 0, hasOfficial, hasDirectory } =
    evidenceSummary;
  const notes = [];
  if (hasOfficial) notes.push('official registry present');
  if (hasDirectory) notes.push('directory listing present');
  return { domains, fresh, recent, stale, notes };
}

export function buildDecisionCard(decision, evidenceSummary) {
  const status = decision.status;
  const ruleSetVersion = decision.ruleSetVersion;
  const evaluatedAt = decision.decisionMeta?.evaluatedAt ?? decision.decidedAt;
  const ingestionHealth = normalizeIngestionHealth(decision.decisionMeta);

  const reasons = Array.isArray(decision.reasons) ? [...decision.reasons].sort() : [];
  const primaryReasonCode = reasons[0] ?? null;
  const primaryCopy = primaryReasonCode ? getReasonCopy(primaryReasonCode) : null;

  const why = reasons.map((code) => ({ code, copy: getReasonCopy(code) }));

  const nextStep = deriveNextStep(decision);
  const evidence = summarizeEvidence(evidenceSummary);

  const opsNote =
    ingestionHealth && ingestionHealth !== 'green'
      ? 'Data ingestion was degraded at evaluation time.'
      : null;

  return {
    header: {
      status,
      ruleSetVersion,
      evaluatedAt,
      ingestionHealth,
      opsNote,
    },
    body: {
      primaryReason: primaryReasonCode
        ? { code: primaryReasonCode, title: primaryCopy.title, explanation: primaryCopy.explanation }
        : null,
      why,
      nextStep,
    },
    footer: {
      evidence,
    },
  };
}
