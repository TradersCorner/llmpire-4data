import { publish } from "./stream.js";

let lastState = null;

export function emitDelta(current) {
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
    publish({
      region: current.region,
      signal,
      expiresAt: Date.now() + 30000
    });
  }

  lastState = current;
}
