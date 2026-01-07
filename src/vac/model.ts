export type ClaimType =
  | 'business_identity_basic' // name/category/service area
  | 'business_website'; // website URL owned by business

export type ClaimStatus =
  | 'unverified'
  | 'verified'
  | 'manual_review'
  | 'rejected';

export interface ClaimPayloadBase {
  businessName?: string;
  dbaName?: string;
  category?: string;
  serviceArea?: string;
  website?: string;
  phone?: string;
  addressLine1?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

export interface Claim {
  id: string;
  subjectId: string; // business/user id in your system
  type: ClaimType;
  payload: ClaimPayloadBase;
  createdAt: string; // ISO
}

export interface ClaimEvidence {
  id: string;
  claimId?: string; // optional direct link
  subjectId?: string; // or link via subject
  evidenceType:
    | 'website_probe' // result of fetching claimed site
    | 'directory_listing' // chamber/tourism listing
    | 'official_registry' // gov/permit listings
    | 'sidekick_signal'; // generic sidekick exhaust
  source: string; // e.g. 'sidekick:web', 'admin', 'user_upload'
  website?: string;
  nameCandidate?: string;
  phoneCandidate?: string;
  addressCandidate?: string;
  // Simple match scores (0..1), computed upstream by evidence collectors
  nameMatchScore?: number;
  phoneMatchScore?: number;
  addressMatchScore?: number;
  // Raw reference to where this came from (URL, doc id, etc.)
  ref?: string;
  createdAt: string; // ISO
}

export interface ClaimDecision {
  id: string;
  claimId: string;
  status: ClaimStatus;
  ruleSetVersion: string; // for reproducibility
  reasons: string[]; // machine- and human-readable reason codes
  decidedAt: string; // ISO
  decisionMeta?: ClaimDecisionMeta;
}

export interface ExposureSnapshot {
  subjectId: string;
  claimId: string;
  claimStatus: ClaimStatus;
  exposureTier: 'blocked' | 'limited' | 'normal' | 'boosted';
  routingWeight: number; // higher = preferred
}

export type IngestionHealth = 'green' | 'yellow' | 'red' | 'unknown';

export interface ClaimDecisionMeta {
  ingestionHealth: IngestionHealth;
  evaluatedAt: string; // ISO, derived from claim/evidence timestamps (not wall clock)
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  // Deterministic-enough UUID for VAC records
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    // eslint-disable-next-line no-undef
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
