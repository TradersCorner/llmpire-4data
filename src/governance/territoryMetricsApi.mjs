// src/governance/territoryMetricsApi.mjs
import { METRIC_WINDOWS } from './territoryMetrics.mjs';

function assertValidWindow(window) {
  if (!window) {
    throw new Error('window is required');
  }
  if (!METRIC_WINDOWS.includes(window)) {
    throw new Error(`Invalid window: ${window}`);
  }
}

function assertTerritoryId(territoryId) {
  if (!territoryId) {
    throw new Error('territoryId is required');
  }
}

export function buildTerritoryMetricsApi({ store }) {
  if (!store) {
    throw new Error('store is required');
  }

  return {
    getTerritoryLatest({ territoryId, window }) {
      assertTerritoryId(territoryId);
      assertValidWindow(window);

      const metrics = store.getLatest({ territoryId, window });
      if (!metrics) {
        return {
          status: 404,
          body: { error: 'territory_metrics_not_found', territoryId, window },
        };
      }

      return {
        status: 200,
        body: { territoryId, window, metrics },
      };
    },

    listWindowLatest({ window }) {
      assertValidWindow(window);

      const territories = store.listLatest({ window });

      return {
        status: 200,
        body: { window, territories },
      };
    },

    getTerritoryHistory({ territoryId, window, limit = 30 }) {
      assertTerritoryId(territoryId);
      assertValidWindow(window);

      const n = Number(limit);
      const safeLimit = Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;

      const history = store.history({ territoryId, window, limit: safeLimit });

      return {
        status: 200,
        body: { territoryId, window, history },
      };
    },
  };
}
