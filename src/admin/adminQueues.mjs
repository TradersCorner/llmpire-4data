// Admin Queues: pure derivation from decisions + feedback context
// Doctrine: no side effects, no storage.

/**
 * @typedef {Object} FeedbackContext
 * @property {('green'|'yellow'|'red'|'unknown')} ingestionHealth
 * @property {string|null} lastHealthAt
 * @property {('pause'|'deprioritize'|'observe')|undefined} [suggestedAction]
 */

/**
 * @typedef {('none'|'needs_refresh'|'needs_second_source'|'blocked'|'paused_by_ops')} AdminQueueType
 */

function hasReason(decision, code) {
  const reasons = Array.isArray(decision && decision.reasons) ? decision.reasons : [];
  return reasons.includes(code);
}

/**
 * Deterministically derive an admin queue label from a decision and feedback context.
 *
 * Priority (highest first):
 * - paused_by_ops when feedback suggests pause
 * - blocked when decision.status === 'rejected'
 * - needs_refresh when stale / refresh reasons present
 * - needs_second_source when single-domain reasons present
 * - none otherwise
 *
 * @param {object} decision ClaimDecision-like object
 * @param {FeedbackContext} feedbackContext
 * @returns {AdminQueueType}
 */
export function deriveAdminQueue(decision, feedbackContext) {
  const suggested = feedbackContext && feedbackContext.suggestedAction;
  if (suggested === 'pause') {
    return 'paused_by_ops';
  }

  if (decision && decision.status === 'rejected') {
    return 'blocked';
  }

  // Evidence too old / needs refresh
  if (
    hasReason(decision, 'stale.multi_domain.evidence') ||
    hasReason(decision, 'needs.refresh')
  ) {
    return 'needs_refresh';
  }

  // Only one domain or explicit multi-domain requirement not yet met
  if (
    hasReason(decision, 'single.domain.only') ||
    hasReason(decision, 'multi_domain.required.for.verification')
  ) {
    return 'needs_second_source';
  }

  return 'none';
}
