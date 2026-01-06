// Bridge metrics tracker (ingest + composer)
// Doctrine: in-memory only, reset on restart

function createEmptyMetrics() {
  return {
    ingest: {
      total: 0,
      perLane: {},
      perSource: {},
      lastEventAt: {}
    },
    rejected: {
      total: 0,
      perLane: {},
      reasons: {}
    },
    compose: {
      requests: 0,
      rateLimited: 0
    },
    composer: {
      capacity: 0,
      prices: 0
    }
  };
}

let metrics = createEmptyMetrics();

export function recordIngest(event, timestamp = new Date().toISOString()) {
  metrics.ingest.total += 1;
  metrics.ingest.perLane[event.lane] = (metrics.ingest.perLane[event.lane] || 0) + 1;
  if (event.source) {
    metrics.ingest.perSource[event.source] = (metrics.ingest.perSource[event.source] || 0) + 1;
    metrics.ingest.lastEventAt[event.source] = timestamp;
  }
  metrics.ingest.lastEventAt[event.lane] = timestamp;
}

export function recordComposer(lane) {
  metrics.composer[lane] = (metrics.composer[lane] || 0) + 1;
}

export function recordComposeRequest() {
  metrics.compose.requests += 1;
}

export function recordComposeRateLimited() {
  metrics.compose.rateLimited += 1;
}

export function recordRejected(lane = "unknown", reason = "unknown") {
  metrics.rejected.total += 1;
  metrics.rejected.perLane[lane] = (metrics.rejected.perLane[lane] || 0) + 1;
  metrics.rejected.reasons[reason] = (metrics.rejected.reasons[reason] || 0) + 1;
}

export function getMetrics() {
  return metrics;
}

export function resetMetrics() {
  metrics = createEmptyMetrics();
}
