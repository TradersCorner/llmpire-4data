import { publish } from "./stream.js";
import { LANES, isValidLane } from "../lanes/registry.js";

let lastState = null;

// Assign a deterministic lane to the emitted delta so downstream consumers
// can route without guessing. Avoids cross-lane ambiguity while keeping v1 pure.
// Returns a valid lane from the registry or throws.
function buildLane(delta) {
  if (!delta || !delta.signal) {
    throw new Error("Cannot assign lane: missing signal");
  }

  let lane;

  if (delta.signal === "bridge.health" || delta.signal.startsWith("bridge_")) {
    lane = "ops";
  } else if (delta.signal.startsWith("capacity_")) {
    lane = "capacity";
  } else if (delta.signal.startsWith("price_")) {
    lane = "prices";
  } else if (delta.signal.startsWith("business_")) {
    lane = "business_movement";
  } else {
    lane = "unknown";
  }

  // Fail fast if lane is not in registry (should never happen, but defensive)
  if (!isValidLane(lane)) {
    throw new Error(`Invalid lane: ${lane}. Must be one of ${Object.keys(LANES).join(", ")}`);
  }

  return lane;
}

export function emitDelta(current) {
  // Direct signal passthrough (e.g., adapters emitting price_*)
  if (current && current.signal) {
    let lane;
    try {
      lane = buildLane(current);
    } catch (err) {
      console.error(`[4data] Lane assignment failed: ${err.message}. Delta dropped.`);
      return;
    }

    publish({
      ...current,
      lane,
      region: current.region,
      expiresAt: current.expiresAt || Date.now() + 30000
    });
    return;
  }

  if (!lastState) {
    lastState = current;
    return;
  }

  let signal = null;

  if (current.available !== lastState.available) {
    signal = current.available
      ? "capacity_opening"
      : "capacity_tightening";
  }

  if (signal) {
    let lane;
    try {
      lane = buildLane({ signal });
    } catch (err) {
      // Fail fast: log once and drop the delta
      console.error(`[4data] Lane assignment failed: ${err.message}. Delta dropped.`);
      return;
    }

    publish({
      region: current.region,
      signal,
      lane,
      expiresAt: Date.now() + 30000
    });
  }

  lastState = current;
}
