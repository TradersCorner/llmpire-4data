// VAC v1 reason code → human-readable copy mapping.
// Pure data, stable and versioned.

/**
 * @typedef {Object} ReasonCopy
 * @property {string} title
 * @property {string} explanation
 * @property {string} [action]
 */

/** @type {Record<string, ReasonCopy>} */
export const VAC_REASON_COPY_V1 = {
  'multi_domain.corroboration': {
    title: 'Verified by multiple independent sources',
    explanation: 'We found matching evidence from different domains.',
  },
  'fresh.evidence': {
    title: 'Recent evidence',
    explanation: 'At least one strong source is fresh (≤ 30 days).',
  },
  'website.confirmed.2x': {
    title: 'Website confirmed twice',
    explanation: 'Two or more strong sources confirm this website.',
  },
  'tie.prefer.official.registry': {
    title: 'Official registry preferred',
    explanation: 'An official registry entry was favored when resolving ties.',
  },
  'tie.prefer.directory.listing': {
    title: 'Directory listing preferred',
    explanation: 'A trusted directory listing was favored when resolving ties.',
  },
  'single.domain.only': {
    title: 'Only one source domain',
    explanation: 'Evidence came from a single domain.',
    action: 'Add an independent listing or registry link.',
  },
  'multi_domain.required.for.verification': {
    title: 'More independent sources required',
    explanation: 'Verification requires corroboration from at least two domains.',
    action: 'Provide evidence from a second independent domain.',
  },
  'stale.multi_domain.evidence': {
    title: 'Evidence is outdated',
    explanation: 'Sources agree, but the data is older than 90 days.',
    action: 'Provide a recent listing or re-verify the website.',
  },
  'needs.refresh': {
    title: 'Re-verification needed',
    explanation: 'Existing evidence is too old to stand on its own.',
    action: 'Submit a recent URL or directory entry for this business.',
  },
  'weak.evidence.for.website': {
    title: 'Evidence is weak',
    explanation: 'The available evidence only partially matches this business.',
    action: 'Ensure the business name, phone, and address match across sources.',
  },
  'missing.website': {
    title: 'Website missing from claim',
    explanation: 'This claim does not include a website URL to verify.',
    action: 'Add the official website URL for this business.',
  },
  'no.evidence.for.website': {
    title: 'No evidence for website',
    explanation: 'We could not find any external evidence for this website.',
    action: 'Provide links to official listings or directories that mention this site.',
  },
  'conflicting.or.missing.website.evidence': {
    title: 'Conflicting or missing website evidence',
    explanation: 'Available sources either disagree with this website or lack enough detail.',
    action: 'Confirm the official website and update external listings to match.',
  },
  'identity.incomplete': {
    title: 'Identity information incomplete',
    explanation: 'Key details like business name, city, or region are missing.',
    action: 'Fill in the missing identity fields before requesting verification.',
  },
  'identity.structure.ok.no.external.evidence': {
    title: 'Identity structure looks valid',
    explanation: 'The basic identity fields are present, but no external evidence was provided.',
    action: 'Add at least one external source that mentions this business.',
  },
  'unsupported.claim.type': {
    title: 'Unsupported claim type',
    explanation: 'This kind of claim is not evaluated by the current VAC ruleset.',
    action: 'Use a supported claim type or extend the ruleset explicitly.',
  },
};

export function getReasonCopy(reasonCode) {
  return VAC_REASON_COPY_V1[reasonCode] ?? {
    title: reasonCode,
    explanation: 'No copy is defined for this reason code in VAC_REASON_COPY_V1.',
  };
}
