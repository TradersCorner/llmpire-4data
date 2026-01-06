import { emitDelta } from "./delta.js";

export function intercept(payload) {
  // payload exists only in memory
  emitDelta(payload);
}
