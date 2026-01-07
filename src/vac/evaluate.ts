import {
  Claim,
  ClaimDecision,
  ClaimEvidence,
  ClaimStatus,
  IngestionHealth,
  nowIso,
  newId,
} from './model.js';

type RuleSetVersion = 'vac-business-v0' | 'vac-business-v1';

interface EvaluationContext {
  claim: Claim;
  evidence: ClaimEvidence[];
  ruleSetVersion: RuleSetVersion;
  evaluationTimeIso: string;
  ingestionHealth: IngestionHealth;
}

function normalizeIngestionHealth(fromEnv: string | undefined): IngestionHealth {
  if (fromEnv === 'green' || fromEnv === 'yellow' || fromEnv === 'red') {
    return fromEnv;
  }
  return 'unknown';
}

function getActiveRuleSetVersion(): RuleSetVersion {
  // Allow VAC_RULESET_VERSION or VAC_RULESET to select ruleset; default to v1.
  // This keeps v0 decisions reproducible while enabling controlled migration.
  // eslint-disable-next-line no-undef
  const env = typeof process !== 'undefined' ? process.env ?? {} : {};
  const fromEnv = (env.VAC_RULESET_VERSION ?? env.VAC_RULESET) as string | undefined;
  if (fromEnv === 'vac-business-v0' || fromEnv === 'vac-business-v1') {
    return fromEnv;
  }
  return 'vac-business-v1';
}

function inferEvaluationTimeIso(claim: Claim, evidence: ClaimEvidence[]): string {
  const timestamps: number[] = [];
  const tc = Date.parse(claim.createdAt);
  if (!Number.isNaN(tc)) timestamps.push(tc);
  for (const e of evidence) {
    const te = Date.parse(e.createdAt);
    if (!Number.isNaN(te)) timestamps.push(te);
  }
  const maxTs = timestamps.length > 0 ? Math.max(...timestamps) : Date.now();
  return new Date(maxTs).toISOString();
}

function decide(
  status: ClaimStatus,
  reasons: string[],
  ctx: Pick<EvaluationContext, 'claim' | 'ruleSetVersion' | 'evaluationTimeIso' | 'ingestionHealth'>,
): ClaimDecision {
  return {
    id: newId(),
    claimId: ctx.claim.id,
    subjectId: ctx.claim.subjectId,
    status,
    ruleSetVersion: ctx.ruleSetVersion,
    reasons: [...reasons].sort(),
    decidedAt: nowIso(),
    decisionMeta: {
      ingestionHealth: ctx.ingestionHealth,
      evaluatedAt: ctx.evaluationTimeIso,
    },
  };
}

function scoreWebsiteClaimV0(ctx: EvaluationContext): ClaimDecision {
  const { claim, evidence } = ctx;
  const website = claim.payload.website?.trim();

  if (!website) {
    return decide('manual_review', ['missing.website'], ctx);
  }

  const normalized = normalizeUrl(website);

  const relevantEvidence = evidence.filter((e) => {
    if (e.website && normalizeUrl(e.website) === normalized) return true;
    if (e.ref && e.ref.includes(normalized)) return true;
    return false;
  });

  if (relevantEvidence.length === 0) {
    return decide('manual_review', ['no.evidence.for.website'], ctx);
  }

  const strongMatches = relevantEvidence.filter((e) => {
    const nameOk = (e.nameMatchScore ?? 0) >= 0.8;
    const phoneOk = (e.phoneMatchScore ?? 0) >= 0.8 || claim.payload.phone === undefined;
    const addrOk = (e.addressMatchScore ?? 0) >= 0.8 || claim.payload.addressLine1 === undefined;
    return nameOk && phoneOk && addrOk;
  });

  if (strongMatches.length >= 2) {
    return decide('verified', ['website.confirmed.2x'], ctx);
  }

  const weakMatches = relevantEvidence.filter((e) => (e.nameMatchScore ?? 0) >= 0.5);

  if (weakMatches.length > 0) {
    return decide('manual_review', ['weak.evidence.for.website'], ctx);
  }

  return decide('rejected', ['conflicting.or.missing.website.evidence'], ctx);
}

function scoreBusinessIdentityBasicV0(ctx: EvaluationContext): ClaimDecision {
  const { claim } = ctx;
  const p = claim.payload;

  if (!p.businessName || !p.city || !p.region) {
    return decide('manual_review', ['identity.incomplete'], ctx);
  }

  // v0: structure-only check, no auto-verify without external evidence
  return decide('unverified', ['identity.structure.ok.no.external.evidence'], ctx);
}
/**
 * v1 website scoring: independent corroboration, freshness decay, deterministic
 * tie-breakers via domain + evidence type.
 */
type FreshnessBucket = 'fresh' | 'recent' | 'stale';

interface ClassifiedEvidence {
  ev: ClaimEvidence;
  sourceDomain: string;
  sourceKind: 'official' | 'directory' | 'web' | 'sidekick' | 'other';
  freshness: FreshnessBucket;
  baseStrength: 'strong' | 'weak' | 'none';
  adjustedStrength: 'strong' | 'medium' | 'weak' | 'none';
}

function daysBetween(olderIso: string, newerIso: string): number {
  const tOld = Date.parse(olderIso);
  const tNew = Date.parse(newerIso);
  if (Number.isNaN(tOld) || Number.isNaN(tNew)) return Infinity;
  const diffMs = tNew - tOld;
  return diffMs <= 0 ? 0 : Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function classifyFreshness(ev: ClaimEvidence, evaluationTimeIso: string): FreshnessBucket {
  const days = daysBetween(ev.createdAt, evaluationTimeIso);
  if (days <= 30) return 'fresh';
  if (days <= 90) return 'recent';
  return 'stale';
}

function extractSourceDomain(ev: ClaimEvidence): string {
  const candidate = ev.ref ?? ev.source ?? '';
  try {
    const u = new URL(candidate);
    return u.hostname.toLowerCase() || 'unknown';
  } catch {
    // Try to salvage something that looks like a hostname
    const match = candidate.match(/([a-z0-9.-]+\.[a-z]{2,})/i);
    return match ? match[1].toLowerCase() : 'unknown';
  }
}

function classifySourceKind(ev: ClaimEvidence): ClassifiedEvidence['sourceKind'] {
  switch (ev.evidenceType) {
    case 'official_registry':
      return 'official';
    case 'directory_listing':
      return 'directory';
    case 'website_probe':
      return 'web';
    case 'sidekick_signal':
      return 'sidekick';
    default:
      return 'other';
  }
}

function classifyStrength(ev: ClaimEvidence, claim: Claim): 'strong' | 'weak' | 'none' {
  const nameScore = ev.nameMatchScore ?? 0;
  const phoneScore = ev.phoneMatchScore ?? 0;
  const addrScore = ev.addressMatchScore ?? 0;
  const nameOk = nameScore >= 0.8;
  const phoneOk = phoneScore >= 0.8 || claim.payload.phone === undefined;
  const addrOk = addrScore >= 0.8 || claim.payload.addressLine1 === undefined;
  if (nameOk && phoneOk && addrOk) return 'strong';
  if (nameScore >= 0.5) return 'weak';
  return 'none';
}

function adjustStrength(base: 'strong' | 'weak' | 'none', freshness: FreshnessBucket): ClassifiedEvidence['adjustedStrength'] {
  if (base === 'none') return 'none';
  if (base === 'weak') {
    if (freshness === 'stale') return 'none';
    return 'weak';
  }
  // base === 'strong'
  if (freshness === 'fresh') return 'strong';
  if (freshness === 'recent') return 'medium';
  return 'weak'; // stale strong evidence is weak unless corroborated
}

function classifyEvidenceForWebsite(ctx: EvaluationContext, relevant: ClaimEvidence[]): ClassifiedEvidence[] {
  return relevant.map((ev) => {
    const freshness = classifyFreshness(ev, ctx.evaluationTimeIso);
    const baseStrength = classifyStrength(ev, ctx.claim);
    const adjustedStrength = adjustStrength(baseStrength, freshness);
    return {
      ev,
      sourceDomain: extractSourceDomain(ev),
      sourceKind: classifySourceKind(ev),
      freshness,
      baseStrength,
      adjustedStrength,
    };
  });
}

function scoreWebsiteClaimV1(ctx: EvaluationContext): ClaimDecision {
  const { claim, evidence } = ctx;
  const website = claim.payload.website?.trim();

  if (!website) {
    return decide('manual_review', ['missing.website'], ctx);
  }

  const normalized = normalizeUrl(website);

  const relevantEvidence = evidence.filter((e) => {
    if (e.website && normalizeUrl(e.website) === normalized) return true;
    if (e.ref && e.ref.includes(normalized)) return true;
    return false;
  });

  if (relevantEvidence.length === 0) {
    return decide('manual_review', ['no.evidence.for.website'], ctx);
  }

  const classified = classifyEvidenceForWebsite(ctx, relevantEvidence);

  const strongOrMedium = classified.filter((c) => c.adjustedStrength === 'strong' || c.adjustedStrength === 'medium');
  const hasFreshStrong = strongOrMedium.some((c) => c.freshness === 'fresh');

  const strongByDomain = new Map<string, ClassifiedEvidence[]>();
  for (const c of strongOrMedium) {
    const key = c.sourceDomain || 'unknown';
    const arr = strongByDomain.get(key) ?? [];
    arr.push(c);
    strongByDomain.set(key, arr);
  }

  const distinctDomains = Array.from(strongByDomain.keys()).filter((d) => d !== 'unknown');
  const distinctDomainCount = distinctDomains.length > 0 ? distinctDomains.length : strongByDomain.size;

  const hasOfficial = classified.some((c) => c.sourceKind === 'official');
  const hasDirectory = classified.some((c) => c.sourceKind === 'directory');

  // P0: Verification requires ≥2 sources from different domains with
  // sufficiently strong & fresh support.
  if (distinctDomainCount >= 2 && hasFreshStrong) {
    const reasons = ['website.confirmed.2x', 'multi_domain.corroboration', 'fresh.evidence'];
    if (hasOfficial) reasons.push('tie.prefer.official.registry');
    else if (hasDirectory) reasons.push('tie.prefer.directory.listing');
    return decide('verified', reasons, ctx);
  }

  // Multi-domain but no fresh strong evidence → cannot silently stay verified.
  if (distinctDomainCount >= 2 && !hasFreshStrong && strongOrMedium.length > 0) {
    return decide('manual_review', ['stale.multi_domain.evidence', 'needs.refresh'], ctx);
  }

  // Single-domain strong evidence → still needs human review.
  if (strongOrMedium.length > 0 && hasFreshStrong) {
    return decide('manual_review', ['single.domain.only', 'multi_domain.required.for.verification'], ctx);
  }

  const weakAny = classified.some((c) => c.adjustedStrength === 'weak');
  if (weakAny) {
    return decide('manual_review', ['weak.evidence.for.website'], ctx);
  }

  return decide('rejected', ['conflicting.or.missing.website.evidence'], ctx);
}

function scoreBusinessIdentityBasicV1(ctx: EvaluationContext): ClaimDecision {
  // For v1 we keep the conservative identity behavior: structural checks only.
  return scoreBusinessIdentityBasicV0(ctx);
}

export function evaluateClaim(claim: Claim, evidence: ClaimEvidence[]): ClaimDecision {
  const ruleSetVersion = getActiveRuleSetVersion();
  const evaluationTimeIso = inferEvaluationTimeIso(claim, evidence);
  // eslint-disable-next-line no-undef
  const env = typeof process !== 'undefined' ? process.env ?? {} : {};
  const ingestionHealth = normalizeIngestionHealth(env.VAC_INGESTION_HEALTH);

  const ctx: EvaluationContext = {
    claim,
    evidence,
    ruleSetVersion,
    evaluationTimeIso,
    ingestionHealth,
  };

  switch (ruleSetVersion) {
    case 'vac-business-v0': {
      switch (claim.type) {
        case 'business_website':
          return scoreWebsiteClaimV0(ctx);
        case 'business_identity_basic':
          return scoreBusinessIdentityBasicV0(ctx);
        default:
          return decide('manual_review', ['unsupported.claim.type'], ctx);
      }
    }
    case 'vac-business-v1':
    default: {
      switch (claim.type) {
        case 'business_website':
          return scoreWebsiteClaimV1(ctx);
        case 'business_identity_basic':
          return scoreBusinessIdentityBasicV1(ctx);
        default:
          return decide('manual_review', ['unsupported.claim.type'], ctx);
      }
    }
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
