// Admin Actions: explicit whitelist + permission checks.
// Doctrine: no direct mutation of VAC decisions or ingestion state.

/**
 * @typedef {import('./adminQueues.mjs').AdminQueueType} AdminQueueType
 */

/**
 * @typedef {Object} FeedbackContext
 * @property {('green'|'yellow'|'red'|'unknown')} ingestionHealth
 * @property {string|null} lastHealthAt
 * @property {('pause'|'deprioritize'|'observe')|undefined} [suggestedAction]
 */

/**
 * @typedef {('request_refresh'|'mark_reviewed'|'re_evaluate_v1'|'add_note')} AdminActionType
 */

export const ALLOWED_ACTIONS = new Set([
  'request_refresh',
  'mark_reviewed',
  're_evaluate_v1',
  'add_note',
]);

/**
 * Check whether an admin action is permitted for a given decision.
 *
 * Guardrails (v1):
 * - Unknown actions are always rejected.
 * - When ops suggest pause, disallow refresh/re-eval but allow notes.
 * - mark_reviewed is disallowed for already-verified decisions.
 * - request_refresh only allowed when queue === 'needs_refresh'.
 * - re_evaluate_v1 only allowed when decision.status !== 'rejected'.
 *
 * @param {object} decision ClaimDecision-like object
 * @param {AdminQueueType} queue
 * @param {FeedbackContext} feedbackContext
 * @param {AdminActionType} action
 * @returns {boolean}
 */
export function canPerformAction(decision, queue, feedbackContext, action) {
  if (!ALLOWED_ACTIONS.has(action)) {
    return false;
  }

  const suggested = feedbackContext && feedbackContext.suggestedAction;

  // Ops pause: allow only notes
  if (suggested === 'pause') {
    return action === 'add_note';
  }

  // Verified decisions cannot be "marked reviewed" again
  if (action === 'mark_reviewed' && decision && decision.status === 'verified') {
    return false;
  }

  // Refresh is meaningful only for refresh queue
  if (action === 'request_refresh' && queue !== 'needs_refresh') {
    return false;
  }

  // Do not re-evaluate hard rejections by default
  if (action === 're_evaluate_v1' && decision && decision.status === 'rejected') {
    return false;
  }

  return true;
}
