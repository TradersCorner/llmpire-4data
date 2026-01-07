// src/governance/moderatorQueues.mjs

/**
 * G3.1: Read-only Moderator Queues UI core (projection + selectors)
 *
 * Inputs:
 * - decisionCards: array of DecisionCard-like objects (admin/internal projection)
 * - feedbackContexts: Map<decisionId, FeedbackContext> (optional)
 * - territoryRegistry: object with territory lookup helpers (from G1)
 *
 * Outputs:
 * - QueueItem: public-safe for moderators/admin UI (no VAC reason codes)
 * - listQueueItemsForTerritory(...)
 * - listQueueItemsForModerator(...)
 *
 * No I/O. No writes. Deterministic ordering.
 */

export const QUEUE_TYPES = [
  'needs_refresh',
  'needs_second_source',
  'paused_by_ops',
  'blocked',
  'none',
];

// Priority for deterministic ordering (lower = higher priority)
export const QUEUE_PRIORITY = {
  paused_by_ops: 0,
  blocked: 1,
  needs_refresh: 2,
  needs_second_source: 3,
  none: 9,
};

export function normalizeQueueType(q) {
  if (!q) return 'none';
  if (QUEUE_TYPES.includes(q)) return q;
  return 'none';
}

export function isActionableQueue(q) {
  const nq = normalizeQueueType(q);
  return nq !== 'none';
}

/**
 * Minimal, leak-safe QueueItem used by the Moderator Queues UI.
 * Explicitly excludes:
 * - VAC reason codes
 * - raw reasons arrays
 * - ingestion/ops internals beyond suggestedAction (optional)
 */
export function projectQueueItemFromDecisionCard(dc, feedbackContext, territoryId) {
  const decisionId = dc?.decisionId || dc?.decision?.id || null;
  if (!decisionId) throw new Error('DecisionCard is missing decisionId');

  const status =
    dc?.card?.status ||
    dc?.card?.verdict ||
    dc?.decision?.status ||
    'unknown';

  const evaluatedAt =
    dc?.card?.evaluatedAt ||
    dc?.decision?.decisionMeta?.evaluatedAt ||
    dc?.decision?.decidedAt ||
    null;

  const adminQueue = normalizeQueueType(dc?.adminQueue);

  const nextStepTitle =
    dc?.card?.nextStep?.title ||
    dc?.card?.nextStepTitle ||
    null;

  const evidence =
    dc?.card?.evidence ||
    dc?.evidenceSummary ||
    { fresh: 0, recent: 0, stale: 0 };

  const suggestedAction = feedbackContext?.suggestedAction;

  // Explicitly controlled output shape
  return {
    decisionId,
    territoryId,
    queue: adminQueue,
    status,
    evaluatedAt,
    nextStepTitle,
    suggestedAction,
    evidence: {
      fresh: Number(evidence?.fresh || 0),
      recent: Number(evidence?.recent || 0),
      stale: Number(evidence?.stale || 0),
    },
  };
}

function compareQueueItemsDeterministic(a, b) {
  const ap = QUEUE_PRIORITY[a.queue] ?? 99;
  const bp = QUEUE_PRIORITY[b.queue] ?? 99;
  if (ap !== bp) return ap - bp;

  // Newest first (nulls last)
  const at = a.evaluatedAt ? Date.parse(a.evaluatedAt) : -Infinity;
  const bt = b.evaluatedAt ? Date.parse(b.evaluatedAt) : -Infinity;

  const aValid = Number.isFinite(at);
  const bValid = Number.isFinite(bt);

  if (aValid && bValid && at !== bt) return bt - at;
  if (aValid && !bValid) return -1;
  if (!aValid && bValid) return 1;

  // Stable tie-breaker
  return String(a.decisionId).localeCompare(String(b.decisionId));
}

/**
 * Select queue items for a territory.
 *
 * territoryId is required and treated as an exact match.
 * The caller supplies already-filtered decisionCards if desired, but we also accept a resolver.
 */
export function listQueueItemsForTerritory({
  territoryId,
  decisionCards,
  feedbackContexts = new Map(),
  includeNone = false,
}) {
  if (!territoryId) throw new Error('territoryId is required');
  if (!Array.isArray(decisionCards)) throw new Error('decisionCards must be an array');

  const out = [];
  for (const dc of decisionCards) {
    const dcTerritoryId = dc?.territoryId || null;
    if (dcTerritoryId !== territoryId) continue;

    const decisionId = dc?.decisionId || dc?.decision?.id || null;
    const fb = decisionId ? (feedbackContexts.get(decisionId) || null) : null;
    const item = projectQueueItemFromDecisionCard(dc, fb, territoryId);

    if (!includeNone && item.queue === 'none') continue;
    out.push(item);
  }

  out.sort(compareQueueItemsDeterministic);
  return out;
}

/**
 * Select queue items for a moderator across all territories they moderate.
 * Uses territoryRegistry.listTerritoriesForModerator(moderatorId) from G1.
 */
export function listQueueItemsForModerator({
  moderatorId,
  territoryRegistry,
  decisionCards,
  feedbackContexts = new Map(),
  includeNone = false,
}) {
  if (!moderatorId) throw new Error('moderatorId is required');
  if (!territoryRegistry?.listTerritoriesForModerator) {
    throw new Error('territoryRegistry.listTerritoriesForModerator is required');
  }
  if (!Array.isArray(decisionCards)) throw new Error('decisionCards must be an array');

  const territories = territoryRegistry.listTerritoriesForModerator(moderatorId);
  const territoryIds = new Set(territories.map(t => t.territoryId));

  const out = [];
  for (const dc of decisionCards) {
    const territoryId = dc?.territoryId || null;
    if (!territoryId || !territoryIds.has(territoryId)) continue;

    const decisionId = dc?.decisionId || dc?.decision?.id || null;
    const fb = decisionId ? (feedbackContexts.get(decisionId) || null) : null;
    const item = projectQueueItemFromDecisionCard(dc, fb, territoryId);

    if (!includeNone && item.queue === 'none') continue;
    out.push(item);
  }

  out.sort(compareQueueItemsDeterministic);
  return out;
}
