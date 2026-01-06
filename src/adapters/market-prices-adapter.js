// Minimal external adapter for prices lane
// Purpose: map price deltas → internal price signals with strict validation

import { isValidLane } from "../lanes/registry.js";
import { validatePriceEvent } from "../lanes/pricesVocab.js";

export class MarketPricesAdapter {
  id = "market-prices";
  source = "Market Prices (stub)";
  lanes = ["prices"];

  constructor(maxPerMin = 60) {
    this.active = false;
    this.rateLimiter = new RateLimiter(maxPerMin);
  }

  start() {
    this.active = true;
    console.log(`[${this.id}] Started (stub mode)`);
  }

  stop() {
    this.active = false;
    console.log(`[${this.id}] Stopped`);
  }

  ingestQuote({ region = "global", currency = "USD", change_pct = null, change_value = null, unit = "per_unit" }) {
    if (!this.active) return;
    if (!this.rateLimiter.tryEmit()) {
      console.warn(`[${this.id}] Rate limit exceeded`);
      return;
    }

    const signal = this._determineSignal(change_pct ?? change_value);
    if (!signal) return; // ignore zero/noise

    const event = {
      lane: "prices",
      signal,
      region,
      currency,
      change_pct: change_pct ?? undefined,
      change_value: change_value ?? undefined,
      unit,
      source: this.id,
      observedAt: new Date().toISOString()
    };

    const validation = validatePriceEvent(event);
    if (!validation.ok) {
      console.warn(`[${this.id}] Dropped quote (invalid): ${validation.reason}`);
      return;
    }

    this.emit(validation.normalized);
  }

  _determineSignal(delta) {
    if (delta === null || delta === undefined) return null;
    if (typeof delta !== "number" || !Number.isFinite(delta)) return null;
    if (delta === 0) return null;
    return delta > 0 ? "price_up" : "price_down";
  }

  async emit(signal) {
    if (!isValidLane(signal.lane)) {
      console.warn(`[${this.id}] Invalid lane: ${signal.lane}`);
      return;
    }

    console.log(`[${this.id}] Emitting:`, signal);

    // In production: POST to v1 endpoint
    // await fetch("http://localhost:3000/request", { ... })
  }
}

class RateLimiter {
  constructor(maxPerMin) {
    this.maxPerMin = maxPerMin;
    this.tokens = maxPerMin;
    this.lastRefill = Date.now();
  }

  tryEmit() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const refill = Math.floor((elapsed / 60000) * this.maxPerMin);
    if (refill > 0) {
      this.tokens = Math.min(this.maxPerMin, this.tokens + refill);
      this.lastRefill = now;
    }

    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    return false;
  }
}
