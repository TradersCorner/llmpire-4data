// Feedback Loop: derive read-only operational context for a decision
// Doctrine: pure function, no side effects, no writes.

/**
 * @typedef {Object} FeedbackContext
 * @property {('green'|'yellow'|'red'|'unknown')} ingestionHealth
 * @property {string|null} lastHealthAt ISO timestamp of last known health signal
 * @property {('pause'|'deprioritize'|'observe')|undefined} [suggestedAction]
 */

/**
 * @typedef {Object} BridgeHealthSnapshot
 * @property {('green'|'yellow'|'red'|'unknown')} [status]
 * @property {string} [lastHealthAt]
 */

function normalizeIngestionHealth(value) {
  if (value === 'green' || value === 'yellow' || value === 'red' || value === 'unknown') {
    return value;
  }
  return 'unknown';
}

function normalizeLastHealthAt(decision, bridgeHealth) {
  if (bridgeHealth && typeof bridgeHealth.lastHealthAt === 'string') {
    return bridgeHealth.lastHealthAt;
  }
  const evaluatedAt = decision && decision.decisionMeta && decision.decisionMeta.evaluatedAt;
  if (typeof evaluatedAt === 'string') {
    return evaluatedAt;
  }
  const decidedAt = decision && decision.decidedAt;
  if (typeof decidedAt === 'string') {
    return decidedAt;
  }
  return null;
}

function deriveSuggestedAction(health) {
  switch (health) {
    case 'red':
      return 'pause';
    case 'yellow':
      return 'deprioritize';
    case 'green':
      return undefined; // no annotation needed
    case 'unknown':
    default:
      return 'observe';
  }
}

/**
 * Resolve a read-only FeedbackContext for a decision.
 *
 * @param {object} decision ClaimDecision-like object with optional decisionMeta.ingestionHealth
 * @param {BridgeHealthSnapshot|undefined} bridgeHealth Optional ops snapshot from bridge_health lane
 * @returns {FeedbackContext}
 */
export function resolveFeedbackContext(decision, bridgeHealth) {
  const meta = decision && decision.decisionMeta;
  const fromDecision = meta && meta.ingestionHealth;
  const fromBridge = bridgeHealth && bridgeHealth.status;

  const ingestionHealth = normalizeIngestionHealth(fromDecision || fromBridge || 'unknown');
  const lastHealthAt = normalizeLastHealthAt(decision, bridgeHealth);
  const suggestedAction = deriveSuggestedAction(ingestionHealth);

  return {
    ingestionHealth,
    lastHealthAt,
    suggestedAction,
  };
}
