import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGovQueuesAdapter } from '../govQueuesAdapter.mjs';

test('govQueuesAdapter: when GOV_QUEUES_LIVE is disabled, returns empty queues and skips readers', async () => {
  delete process.env.GOV_QUEUES_LIVE;

  let readCardsCalled = false;
  let readFeedbackCalled = false;

  const moderatorQueuesApi = {
    getTerritoryQueues({ territoryId, decisionCards, feedbackContexts }) {
      assert.equal(territoryId, 't1');
      assert.deepEqual(decisionCards, []);
      assert.ok(feedbackContexts instanceof Map);
      return { status: 200, body: { territoryId, queues: [] } };
    },
    getModeratorQueues({ moderatorId, decisionCards, feedbackContexts }) {
      assert.equal(moderatorId, 'm1');
      assert.deepEqual(decisionCards, []);
      assert.ok(feedbackContexts instanceof Map);
      return { status: 200, body: { moderatorId, queues: [] } };
    },
  };

  const adapter = buildGovQueuesAdapter({
    moderatorQueuesApi,
    decisionCardReader: async () => {
      readCardsCalled = true;
      return [];
    },
    feedbackContextReader: async () => {
      readFeedbackCalled = true;
      return new Map();
    },
  });

  const tResult = await adapter.getTerritoryQueuesView({ territoryId: 't1', queue: null, includeNone: false });
  assert.equal(tResult.body.territoryId, 't1');
  assert.deepEqual(tResult.body.queues, []);

  const mResult = await adapter.getModeratorQueuesView({ moderatorId: 'm1', queue: null, includeNone: false });
  assert.equal(mResult.body.moderatorId, 'm1');
  assert.deepEqual(mResult.body.queues, []);

  assert.equal(readCardsCalled, false, 'decisionCardReader should not be called when disabled');
  assert.equal(readFeedbackCalled, false, 'feedbackContextReader should not be called when disabled');
});

test('govQueuesAdapter: when GOV_QUEUES_LIVE is enabled, uses readers and passes through API result', async () => {
  process.env.GOV_QUEUES_LIVE = '1';

  const fakeDecisionCards = [
    { decisionId: 'a', territoryId: 't1', adminQueue: 'needs_refresh', card: { status: 'pending' } },
  ];
  const fakeFeedbackMap = new Map([
    ['a', { suggestedAction: 'refresh' }],
  ]);

  let apiTerritoryArgs = null;

  const moderatorQueuesApi = {
    getTerritoryQueues(args) {
      apiTerritoryArgs = args;
      return {
        status: 200,
        body: {
          territoryId: args.territoryId,
          queues: [
            {
              decisionId: 'a',
              queue: 'needs_refresh',
            },
          ],
        },
      };
    },
    getModeratorQueues() {
      throw new Error('not exercised in this test');
    },
  };

  const adapter = buildGovQueuesAdapter({
    moderatorQueuesApi,
    decisionCardReader: async ({ territoryId }) => {
      assert.equal(territoryId, 't1');
      return fakeDecisionCards;
    },
    feedbackContextReader: async (decisionIds) => {
      assert.deepEqual(decisionIds, ['a']);
      return fakeFeedbackMap;
    },
  });

  const result = await adapter.getTerritoryQueuesView({
    territoryId: 't1',
    queue: 'needs_refresh',
    includeNone: false,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.territoryId, 't1');
  assert.equal(result.body.queues.length, 1);

  assert.ok(apiTerritoryArgs, 'moderatorQueuesApi.getTerritoryQueues should have been called');
  assert.deepEqual(apiTerritoryArgs.decisionCards, fakeDecisionCards);
  assert.equal(apiTerritoryArgs.feedbackContexts.get('a').suggestedAction, 'refresh');
});
