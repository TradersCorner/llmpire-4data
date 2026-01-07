// src/governance/territoryMetrics.mjs

export const METRIC_WINDOWS = ['24h', '7d', '30d'];

/**
 * Deterministically compute the bucket timestamp for a window.
 * Uses the provided reference ISO time (not Date.now()).
 *
 * Rules:
 * - 24h: floor to the hour
 * - 7d : floor to UTC day
 * - 30d: floor to UTC day
 */
export function computeBucketIso(window, referenceIso) {
  if (!METRIC_WINDOWS.includes(window)) {
    throw new Error(`Invalid window: ${window}`);
  }
  if (!referenceIso) {
    throw new Error('referenceIso is required');
  }

  const d = new Date(referenceIso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${referenceIso}`);
  }

  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const h = d.getUTCHours();

  if (window === '24h') {
    return new Date(Date.UTC(y, m, day, h, 0, 0, 0)).toISOString();
  }

  // 7d and 30d both floor to day; the window length is applied during aggregation
  return new Date(Date.UTC(y, m, day, 0, 0, 0, 0)).toISOString();
}

/**
 * Create an empty, deterministic metrics object for a territory/window.
 * This is the canonical shape used by aggregators and stores.
 */
export function createEmptyTerritoryMetrics({
  territoryId,
  window,
  referenceIso,
}) {
  if (!territoryId) {
    throw new Error('territoryId is required');
  }
  if (!METRIC_WINDOWS.includes(window)) {
    throw new Error(`Invalid window: ${window}`);
  }

  const computedAt = computeBucketIso(window, referenceIso);

  return {
    territoryId,
    window,
    decisions: {
      verified: 0,
      manual_review: 0,
      rejected: 0,
    },
    freshness: {
      fresh: 0,
      recent: 0,
      stale: 0,
    },
    opsContext: {
      green: 0,
      yellow: 0,
      red: 0,
    },
    adminActivity: {
      actions: 0,
      backlog: 0,
    },
    computedAt,
  };
}
