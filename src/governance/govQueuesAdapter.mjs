// src/governance/govQueuesAdapter.mjs

/**
 * Thin adapter that wires moderatorQueuesApi to DecisionCard + FeedbackContext
 * readers, with an env flag gate.
 *
 * - No writes
 * - No selector changes
 * - Deterministic ordering delegated to moderatorQueuesApi/selectors
 */

function isGovQueuesLive() {
  const v = process.env.GOV_QUEUES_LIVE;
  if (v === undefined) return false;
  const s = String(v).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

export function buildGovQueuesAdapter({
  moderatorQueuesApi,
  decisionCardReader,
  feedbackContextReader,
} = {}) {
  if (!moderatorQueuesApi) {
    throw new Error('moderatorQueuesApi is required');
  }

  const readCards = decisionCardReader || (async () => []);
  const readFeedback = feedbackContextReader || (async () => new Map());

  async function getTerritoryQueuesView({ territoryId, queue, includeNone }) {
    if (!territoryId) {
      throw new Error('territoryId is required');
    }

    if (!isGovQueuesLive()) {
      return moderatorQueuesApi.getTerritoryQueues({
        territoryId,
        decisionCards: [],
        feedbackContexts: new Map(),
        queue,
        includeNone,
      });
    }

    const decisionCards = await readCards({ territoryId });
    const decisionIds = decisionCards
      .map((dc) => dc?.decisionId)
      .filter((id) => typeof id === 'string' && id);

    const feedbackContexts = await readFeedback(decisionIds);

    const result = moderatorQueuesApi.getTerritoryQueues({
      territoryId,
      decisionCards,
      feedbackContexts,
      queue,
      includeNone,
    });

    const count = Array.isArray(result?.body?.queues) ? result.body.queues.length : 0;
    // Minimal observability; safe to leave in logs.
    // Example: [gov][queues] territory=t1 returned=12
    console.log(`[gov][queues] territory=${territoryId} returned=${count}`);

    return result;
  }

  async function getModeratorQueuesView({ moderatorId, queue, includeNone }) {
    if (!moderatorId) {
      throw new Error('moderatorId is required');
    }

    if (!isGovQueuesLive()) {
      return moderatorQueuesApi.getModeratorQueues({
        moderatorId,
        decisionCards: [],
        feedbackContexts: new Map(),
        queue,
        includeNone,
      });
    }

    const decisionCards = await readCards({});
    const decisionIds = decisionCards
      .map((dc) => dc?.decisionId)
      .filter((id) => typeof id === 'string' && id);

    const feedbackContexts = await readFeedback(decisionIds);

    const result = moderatorQueuesApi.getModeratorQueues({
      moderatorId,
      decisionCards,
      feedbackContexts,
      queue,
      includeNone,
    });

    const count = Array.isArray(result?.body?.queues) ? result.body.queues.length : 0;
    console.log(`[gov][queues] moderator=${moderatorId} returned=${count}`);

    return result;
  }

  return {
    getTerritoryQueuesView,
    getModeratorQueuesView,
  };
}
