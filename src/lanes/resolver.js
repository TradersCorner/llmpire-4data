// Intent → Lane Resolver (ILR)
// Pure function: maps query text to candidate lanes
// No side effects, no API calls, no persistence

import { LANES } from "./registry.js";

// Lane hint vocabulary (deterministic keyword matching)
const LANE_HINTS = {
  capacity: ["busy", "available", "wait", "crowded", "right now", "capacity", "open slots", "full"],
  prices: ["price", "cost", "rate", "charge", "how much", "expensive", "cheap", "pricing"],
  business_movement: ["open", "closed", "moving", "new", "relocate", "opening", "closing"],
  unknown: []
};

/**
 * Resolve candidate lanes from query text
 * 
 * Invariants:
 * - Pure function (no side effects)
 * - Deterministic (same input → same output)
 * - Conservative (defaults to capacity if ambiguous)
 * - Fast (keyword matching only, no ML)
 * 
 * @param {string} text - Query text (e.g., "is it busy right now?")
 * @returns {Set<string>} - Candidate lanes
 */
export function resolveLanes(text) {
  const normalized = text.toLowerCase().trim();
  const lanes = new Set();

  // Match keywords to lanes
  for (const [lane, hints] of Object.entries(LANE_HINTS)) {
    if (hints.some(hint => normalized.includes(hint))) {
      lanes.add(lane);
    }
  }

  // Conservative default: if ambiguous or no match, watch capacity
  if (lanes.size === 0) {
    lanes.add("capacity");
  }

  // Validation: ensure all resolved lanes exist in registry
  const validLanes = new Set();
  for (const lane of lanes) {
    if (lane in LANES) {
      validLanes.add(lane);
    }
  }

  return validLanes;
}

/**
 * Resolve primary lane (for hard boundary / snapshot)
 * 
 * @param {string} text - Query text
 * @returns {string} - Single lane (highest confidence)
 */
export function resolvePrimaryLane(text) {
  const candidates = resolveLanes(text);
  
  // Priority order for disambiguation
  const priority = ["capacity", "prices", "business_movement", "unknown"];
  
  for (const lane of priority) {
    if (candidates.has(lane)) {
      return lane;
    }
  }
  
  return "capacity"; // fallback
}

/**
 * Get lane confidence score
 * 
 * @param {string} text - Query text
 * @param {string} lane - Lane to score
 * @returns {number} - Confidence 0-1
 */
export function getLaneConfidence(text, lane) {
  const normalized = text.toLowerCase().trim();
  const hints = LANE_HINTS[lane] || [];
  
  if (hints.length === 0) return 0;
  
  const matchCount = hints.filter(hint => normalized.includes(hint)).length;
  return Math.min(1, matchCount / hints.length);
}
