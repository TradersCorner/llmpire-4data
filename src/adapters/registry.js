// Adapter registry (optional)
// Tracks active adapters, feature flags, and configuration

export const ADAPTER_REGISTRY = {
  "openai-trends": {
    enabled: false, // feature flag
    allowedLanes: ["business_movement"],
    rateLimit: 50, // events/min
    description: "Hypothetical OpenAI trend stream observer"
  },
  "gov-status-feed": {
    enabled: false,
    allowedLanes: ["capacity", "business_movement"],
    rateLimit: 100,
    description: "Government/utility status feed"
  },
  "market-prices": {
    enabled: false,
    allowedLanes: ["prices"],
    rateLimit: 60,
    description: "Normalized price delta feed (stub)"
  },
  "tradescout-internal": {
    enabled: true, // always on (core functionality)
    allowedLanes: ["capacity"],
    rateLimit: 200,
    description: "Internal TradeScout bookings/cancellations"
  }
};

export function isAdapterEnabled(adapterId) {
  return ADAPTER_REGISTRY[adapterId]?.enabled ?? false;
}

export function getAdapterConfig(adapterId) {
  return ADAPTER_REGISTRY[adapterId];
}
