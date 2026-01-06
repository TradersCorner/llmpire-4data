import { Claim, ClaimDecision, ClaimEvidence, ClaimStatus, nowIso, newId } from './model.js';

const RULESET_VERSION = 'vac-business-v0';

export interface EvaluationContext {
  claim: Claim;
  evidence: ClaimEvidence[];
}

function decide(status: ClaimStatus, reasons: string[], claimId: string): ClaimDecision {
  return {
    id: newId(),
    claimId,
    status,
    ruleSetVersion: RULESET_VERSION,
    reasons: [...reasons].sort(),
    decidedAt: nowIso()
  };
}

function scoreWebsiteClaim(ctx: EvaluationContext): ClaimDecision {
  const { claim, evidence } = ctx;
  const website = claim.payload.website?.trim();

  if (!website) {
    return decide('manual_review', ['missing.website'], claim.id);
  }

  const normalized = normalizeUrl(website);

  const relevantEvidence = evidence.filter((e) => {
    if (e.website && normalizeUrl(e.website) === normalized) return true;
    if (e.ref && e.ref.includes(normalized)) return true;
    return false;
  });

  if (relevantEvidence.length === 0) {
    return decide('manual_review', ['no.evidence.for.website'], claim.id);
  }

  const strongMatches = relevantEvidence.filter((e) => {
    const nameOk = (e.nameMatchScore ?? 0) >= 0.8;
    const phoneOk = (e.phoneMatchScore ?? 0) >= 0.8 || claim.payload.phone === undefined;
    const addrOk = (e.addressMatchScore ?? 0) >= 0.8 || claim.payload.addressLine1 === undefined;
    return nameOk && phoneOk && addrOk;
  });

  if (strongMatches.length >= 2) {
    return decide('verified', ['website.confirmed.2x'], claim.id);
  }

  const weakMatches = relevantEvidence.filter((e) => (e.nameMatchScore ?? 0) >= 0.5);

  if (weakMatches.length > 0) {
    return decide('manual_review', ['weak.evidence.for.website'], claim.id);
  }

  return decide('rejected', ['conflicting.or.missing.website.evidence'], claim.id);
}

function scoreBusinessIdentityBasic(ctx: EvaluationContext): ClaimDecision {
  const { claim } = ctx;
  const p = claim.payload;

  if (!p.businessName || !p.city || !p.region) {
    return decide('manual_review', ['identity.incomplete'], claim.id);
  }

  // v0: structure-only check, no auto-verify without external evidence
  return decide('unverified', ['identity.structure.ok.no.external.evidence'], claim.id);
}

export function evaluateClaim(claim: Claim, evidence: ClaimEvidence[]): ClaimDecision {
  const ctx: EvaluationContext = { claim, evidence };

  switch (claim.type) {
    case 'business_website':
      return scoreWebsiteClaim(ctx);
    case 'business_identity_basic':
      return scoreBusinessIdentityBasic(ctx);
    default:
      return decide('manual_review', ['unsupported.claim.type'], claim.id);
  }
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    u.hash = '';
    u.search = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return url.trim().toLowerCase();
  }
}
