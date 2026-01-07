// Canonical lane registry. All lanes must be enumerated here.
// No dynamic lane creation at runtime. Lanes are structural, not semantic.

export const LANES = {
  capacity: {
    description: "Local supply/demand availability",
  },
  prices: {
    description: "Material and labor price movement",
  },
  business_movement: {
    description: "Business open/close/relocation activity",
  },
  ops: {
    description: "Operational health and telemetry for internal systems",
  },
  unknown: {
    description: "Unclassified signals (should be rare and audited)",
  },
};

// Runtime validation helper
export function isValidLane(lane) {
  return lane in LANES;
}

// Get all valid lane keys (for iteration, validation, docs)
export function getLaneKeys() {
  return Object.keys(LANES);
}
