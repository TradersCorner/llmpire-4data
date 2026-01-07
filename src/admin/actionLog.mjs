// Admin Action Log: append-only, in-memory store.
// Doctrine: stores only admin actions, never mutates VAC decisions.

let counter = 0;
const actions = [];

/**
 * @typedef {Object} AdminActionEntry
 * @property {string} actionId
 * @property {string|null} decisionId
 * @property {string} action
 * @property {string} actor
 * @property {string} at ISO timestamp
 * @property {string|undefined} note
 */

/**
 * Append a new admin action entry to the in-memory log.
 *
 * @param {{ decisionId?: string, action: string, actor: string, note?: string }} payload
 * @returns {AdminActionEntry}
 */
export function appendAdminAction(payload) {
  counter += 1;
  const now = new Date().toISOString();
  const entry = {
    actionId: `aa_${now}_${counter}`,
    decisionId: typeof payload.decisionId === 'string' ? payload.decisionId : null,
    action: payload.action,
    actor: payload.actor,
    at: now,
    note: payload.note,
  };
  actions.push(entry);
  return entry;
}

/**
 * Get a shallow copy of the current admin action log.
 *
 * @returns {AdminActionEntry[]}
 */
export function getAdminActions() {
  return actions.slice();
}
