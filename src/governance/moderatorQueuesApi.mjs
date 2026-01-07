// src/governance/moderatorQueuesApi.mjs
import {
  QUEUE_TYPES,
  normalizeQueueType,
  listQueueItemsForTerritory,
  listQueueItemsForModerator,
} from './moderatorQueues.mjs';

function parseQueueFilter(queue) {
  if (queue === undefined || queue === null || queue === '') return undefined;
  if (!QUEUE_TYPES.includes(queue)) {
    throw new Error(`Invalid queue: ${queue}`);
  }
  return queue;
}

function parseIncludeNone(includeNone, queue) {
  if (includeNone === undefined || includeNone === null || includeNone === '') {
    // If the caller explicitly filters for the "none" queue, force includeNone.
    return queue === 'none';
  }

  if (typeof includeNone === 'boolean') return includeNone;

  if (typeof includeNone === 'string') {
    const v = includeNone.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
  }

  throw new Error('Invalid includeNone value');
}

function filterByQueue(items, queue) {
  const q = parseQueueFilter(queue);
  if (!q) return items;
  return items.filter((item) => normalizeQueueType(item.queue) === q);
}

/**
 * Build a read-only Moderator Queues API on top of the locked selectors.
 *
 * This layer is pure and does not perform any I/O. Callers must supply
 * decisionCards and feedbackContexts explicitly.
 */
export function buildModeratorQueuesApi({ territoryRegistry } = {}) {
  return {
    /**
     * Territory-scoped queues.
     */
    getTerritoryQueues({
      territoryId,
      decisionCards,
      feedbackContexts = new Map(),
      queue,
      includeNone,
    }) {
      if (!territoryId) {
        throw new Error('territoryId is required');
      }
      if (!Array.isArray(decisionCards)) {
        throw new Error('decisionCards must be an array');
      }

      const q = parseQueueFilter(queue);
      const incNone = parseIncludeNone(includeNone, q);

      const items = listQueueItemsForTerritory({
        territoryId,
        decisionCards,
        feedbackContexts,
        includeNone: incNone,
      });

      const filtered = filterByQueue(items, q);

      return {
        status: 200,
        body: {
          territoryId,
          queues: filtered,
        },
      };
    },

    /**
     * Moderator-scoped queues across all moderated territories.
     */
    getModeratorQueues({
      moderatorId,
      decisionCards,
      feedbackContexts = new Map(),
      queue,
      includeNone,
    }) {
      if (!moderatorId) {
        throw new Error('moderatorId is required');
      }
      if (!territoryRegistry || typeof territoryRegistry.listTerritoriesForModerator !== 'function') {
        throw new Error('territoryRegistry.listTerritoriesForModerator is required');
      }
      if (!Array.isArray(decisionCards)) {
        throw new Error('decisionCards must be an array');
      }

      const q = parseQueueFilter(queue);
      const incNone = parseIncludeNone(includeNone, q);

      const items = listQueueItemsForModerator({
        moderatorId,
        territoryRegistry,
        decisionCards,
        feedbackContexts,
        includeNone: incNone,
      });

      const filtered = filterByQueue(items, q);

      return {
        status: 200,
        body: {
          moderatorId,
          queues: filtered,
        },
      };
    },
  };
}
