// Example External Adapter: OpenAI Trends Observer (stub)
// Purpose: Observe hypothetical LLM trend streams and emit business_movement signals
// Status: Stub only (no real API calls)

import { isValidLane } from "../lanes/registry.js";

export class OpenAITrendsAdapter {
  id = "openai-trends";
  source = "OpenAI Trends (hypothetical)";
  lanes = ["business_movement"];

  constructor() {
    this.active = false;
    this.rateLimiter = new RateLimiter(50); // 50 events/min
    this.lastTrend = null;
  }

  start() {
    this.active = true;
    console.log(`[${this.id}] Started (stub mode)`);
    
    // In production: connect to SSE/webhook trend feed
    // For now: simulate with interval
    this.simulateObservation();
  }

  stop() {
    this.active = false;
    if (this.interval) clearInterval(this.interval);
    console.log(`[${this.id}] Stopped`);
  }

  simulateObservation() {
    // Stub: simulate trend changes every 30s
    this.interval = setInterval(() => {
      if (!this.active) return;

      // Simulate random trend change
      const trend = Math.random() > 0.5 ? "rising" : "falling";
      if (trend !== this.lastTrend) {
        this.onTrendChange("restaurant", trend);
        this.lastTrend = trend;
      }
    }, 30000);
  }

  onTrendChange(category, direction) {
    if (!this.active) return;
    if (!this.rateLimiter.tryEmit()) {
      console.warn(`[${this.id}] Rate limit exceeded`);
      return;
    }

    const signal = {
      lane: "business_movement",
      signal: direction === "rising" ? "interest_rising" : "interest_falling",
      confidence_hint: 0.6,
      source: this.id,
      observedAt: new Date().toISOString(),
      category // metadata (not used downstream)
    };

    this.emit(signal);
  }

  async emit(signal) {
    if (!isValidLane(signal.lane)) {
      console.warn(`[${this.id}] Invalid lane: ${signal.lane}`);
      return;
    }

    console.log(`[${this.id}] Emitting:`, signal);

    // In production: POST to v1
    // await fetch("http://localhost:3000/request", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({
    //     region: "global",
    //     available: signal.signal === "interest_rising",
    //     _adapter: this.id
    //   })
    // });
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
    
    this.tokens = Math.min(this.maxPerMin, this.tokens + refill);
    this.lastRefill = now;

    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    return false;
  }
}

// Usage:
// const adapter = new OpenAITrendsAdapter();
// adapter.start();
