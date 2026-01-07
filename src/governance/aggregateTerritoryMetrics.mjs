// src/governance/aggregateTerritoryMetrics.mjs
import { createEmptyTerritoryMetrics } from './territoryMetrics.mjs';

/**
 * Determine if an ISO timestamp falls within the rolling window
 * ending at computedAt (inclusive).
 */
function inWindow(window, computedAtIso, eventIso) {
  if (!eventIso) return false;
  const baseEnd = new Date(computedAtIso).getTime();
  const t = new Date(eventIso).getTime();
  if (Number.isNaN(baseEnd) || Number.isNaN(t)) return false;

  const DAY_MS = 24 * 60 * 60 * 1000;

  let windowMs;
  let endShiftMs = 0;
  switch (window) {
    case '24h':
      windowMs = DAY_MS;
      endShiftMs = 0;
      break;
    case '7d':
      windowMs = 7 * DAY_MS;
      // computedAt is floored to the start of the day; treat the
      // *end* of the window as the end of that day to include
      // same-day events deterministically.
      endShiftMs = DAY_MS;
      break;
    case '30d':
      windowMs = 30 * DAY_MS;
      endShiftMs = DAY_MS;
      break;
    default:
      return false;
  }

  const end = baseEnd + endShiftMs;
  const start = end - windowMs;
  return t >= start && t <= end;
}

/**
 * Aggregate metrics for a single territory + window.
 *
 * Inputs are projections only:
 * - decisionCards: array of DecisionCard (admin/internal projection)
 * - feedbackContexts: Map decisionId -> FeedbackContext (or object with same shape)
 * - adminActions: append-only AdminActionLog entries
 *
 * All arrays should already be filtered to the territory scope by the caller.
 */
export function aggregateTerritoryMetrics({
  territoryId,
  window,
  referenceIso,
  decisionCards = [],
  feedbackContexts = new Map(),
  adminActions = [],
}) {
  const metrics = createEmptyTerritoryMetrics({
    territoryId,
    window,
    referenceIso,
  });

  // --- Decisions + Freshness + Ops Context ---
  for (const dc of decisionCards) {
    const decidedAt =
      dc?.decision?.decisionMeta?.evaluatedAt ||
      dc?.decision?.decidedAt ||
      dc?.card?.evaluatedAt ||
      null;

    if (!inWindow(window, metrics.computedAt, decidedAt)) continue;

    // Decisions
    const verdict =
      dc?.card?.status ||
      dc?.card?.verdict ||
      dc?.decision?.status;

    if (verdict === 'verified') metrics.decisions.verified += 1;
    else if (verdict === 'manual_review') metrics.decisions.manual_review += 1;
    else if (verdict === 'rejected') metrics.decisions.rejected += 1;

    // Freshness (counts from evidence summary if present)
    const ev =
      dc?.evidenceSummary ||
      dc?.card?.evidence ||
      null;

    if (ev) {
      metrics.freshness.fresh += Number(ev.fresh || 0);
      metrics.freshness.recent += Number(ev.recent || 0);
      metrics.freshness.stale += Number(ev.stale || 0);
    }

    // Ops context (prefer decisionMeta; fallback to FeedbackContext)
    let health =
      dc?.decision?.decisionMeta?.ingestionHealth ||
      feedbackContexts.get(dc?.decisionId || dc?.decision?.id)?.ingestionHealth ||
      'unknown';

    if (health === 'green') metrics.opsContext.green += 1;
    else if (health === 'yellow') metrics.opsContext.yellow += 1;
    else if (health === 'red') metrics.opsContext.red += 1;
  }

  // --- Admin Activity ---
  for (const act of adminActions) {
    if (!inWindow(window, metrics.computedAt, act?.at)) continue;
    metrics.adminActivity.actions += 1;
  }

  // Backlog is derived from current queues represented in decisionCards
  // (e.g., needs_refresh, needs_second_source, paused_by_ops)
  for (const dc of decisionCards) {
    const q = dc?.adminQueue;
    if (!q) continue;
    if (q === 'needs_refresh' || q === 'needs_second_source' || q === 'paused_by_ops') {
      metrics.adminActivity.backlog += 1;
    }
  }

  return metrics;
}
