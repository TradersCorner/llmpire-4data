// State Decay Cache v1
// Purpose: Bounded, ephemeral pressure memory per lane+region
// Doctrine: No persistence, no replay, no raw events, automatic decay

const MAX_CACHE_ENTRIES = 10000; // Hard limit (LRU eviction)
const DEFAULT_HALF_LIFE_SECONDS = 120; // 2 minutes
const MAX_COUNTER = 50; // Counter cap
const MIN_PRESSURE_FLOOR = 0;
const MAX_PRESSURE_CEILING = 1;

// Impulse values per signal type (tunable)
const IMPULSE_MAP = {
  capacity_tightening: 0.25,
  capacity_opening: 0.15,
  price_up: 0.2,
  price_down: 0.2,
  // Future signal types can be added
};

class DecayCache {
  constructor() {
    this.cache = new Map(); // key: "lane:region", value: DecayCacheEntry
    this.halfLifeByLane = new Map(); // lane -> halfLifeSeconds (overrides)
    this.hwm = 0; // High-water mark for cache size
  }

  // Set half-life for a specific lane (optional override)
  setHalfLife(lane, seconds) {
    this.halfLifeByLane.set(lane, seconds);
  }

  // Get half-life for a lane (or default)
  getHalfLife(lane) {
    return this.halfLifeByLane.get(lane) || DEFAULT_HALF_LIFE_SECONDS;
  }

  // Generate cache key
  _key(lane, region) {
    return `${lane}:${region}`;
  }

  // Apply exponential decay based on elapsed time
  _applyDecay(entry, nowMs) {
    const lastUpdateMs = new Date(entry.updatedAt).getTime();
    const deltaSeconds = (nowMs - lastUpdateMs) / 1000;

    if (deltaSeconds <= 0) return; // No time passed

    const halfLife = this.getHalfLife(entry.lane);
    const decayFactor = Math.pow(0.5, deltaSeconds / halfLife);

    entry.pressure = Math.max(MIN_PRESSURE_FLOOR, entry.pressure * decayFactor);

    // Reset counters if pressure falls below threshold
    if (entry.pressure < 0.1) {
      entry.counts.tightening = 0;
      entry.counts.opening = 0;
      entry.counts.price_up = 0;
      entry.counts.price_down = 0;
    }
  }

  // Update cache on signal arrival
  update(lane, region, signal, timestamp = new Date().toISOString()) {
    const key = this._key(lane, region);
    const nowMs = new Date(timestamp).getTime();

    let entry = this.cache.get(key);

    if (!entry) {
      // Create new entry
      entry = {
        lane,
        region,
        pressure: 0,
        updatedAt: timestamp,
        counts: { tightening: 0, opening: 0, price_up: 0, price_down: 0 },
        lastSignal: null,
      };
      this.cache.set(key, entry);
      this._bumpHwm();
    } else {
      // Apply decay before update
      this._applyDecay(entry, nowMs);
    }

    // Add impulse based on signal type
    const impulse = IMPULSE_MAP[signal] || 0;
    entry.pressure = Math.min(MAX_PRESSURE_CEILING, entry.pressure + impulse);

    // Update counters (capped)
    if (signal === "capacity_tightening") {
      entry.counts.tightening = Math.min(MAX_COUNTER, entry.counts.tightening + 1);
    } else if (signal === "capacity_opening") {
      entry.counts.opening = Math.min(MAX_COUNTER, entry.counts.opening + 1);
    } else if (signal === "price_up") {
      entry.counts.price_up = Math.min(MAX_COUNTER, entry.counts.price_up + 1);
    } else if (signal === "price_down") {
      entry.counts.price_down = Math.min(MAX_COUNTER, entry.counts.price_down + 1);
    }

    entry.lastSignal = signal;
    entry.updatedAt = timestamp;

    // Enforce max cache size (LRU eviction)
    this._evictIfNeeded();
    this._bumpHwm();
  }

  // Get current state for a lane+region (with decay applied)
  get(lane, region) {
    const key = this._key(lane, region);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Apply decay before returning
    const nowMs = Date.now();
    this._applyDecay(entry, nowMs);
    entry.updatedAt = new Date(nowMs).toISOString();

    return {
      lane: entry.lane,
      region: entry.region,
      pressure: entry.pressure,
      updatedAt: entry.updatedAt,
      halfLifeSeconds: this.getHalfLife(entry.lane),
      lastSignal: entry.lastSignal,
      counts: { ...entry.counts }, // shallow copy
    };
  }

  // Get all entries for a lane (with decay applied)
  getLane(lane) {
    const results = [];
    const nowMs = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lane === lane) {
        this._applyDecay(entry, nowMs);
        entry.updatedAt = new Date(nowMs).toISOString();

        results.push({
          lane: entry.lane,
          region: entry.region,
          pressure: entry.pressure,
          updatedAt: entry.updatedAt,
          halfLifeSeconds: this.getHalfLife(entry.lane),
          lastSignal: entry.lastSignal,
          counts: { ...entry.counts },
        });
      }
    }

    return results;
  }

  // Get summary stats
  getStats() {
    const nowMs = Date.now();
    const laneStats = {};
    let totalEntries = 0;

    for (const [key, entry] of this.cache.entries()) {
      this._applyDecay(entry, nowMs);

      if (!laneStats[entry.lane]) {
        laneStats[entry.lane] = {
          entries: 0,
          avgPressure: 0,
          maxPressure: 0,
        };
      }

      laneStats[entry.lane].entries++;
      laneStats[entry.lane].avgPressure += entry.pressure;
      laneStats[entry.lane].maxPressure = Math.max(
        laneStats[entry.lane].maxPressure,
        entry.pressure
      );
      totalEntries++;
    }

    // Compute averages
    for (const lane in laneStats) {
      laneStats[lane].avgPressure /= laneStats[lane].entries;
    }

    return {
      totalEntries,
      maxEntries: MAX_CACHE_ENTRIES,
      currentSize: this.cache.size,
      highWaterMark: this.hwm,
      laneStats,
      memoryEstimateKB: Math.round((totalEntries * 200) / 1024), // ~200 bytes per entry
    };
  }

  // LRU eviction when cache exceeds max size
  _evictIfNeeded() {
    if (this.cache.size <= MAX_CACHE_ENTRIES) return;

    // Find oldest entry (lowest pressure with oldest timestamp)
    let evictKey = null;
    let lowestScore = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      const ageMs = Date.now() - new Date(entry.updatedAt).getTime();
      const score = entry.pressure * 1000 - ageMs; // Prioritize low pressure + old age

      if (score < lowestScore) {
        lowestScore = score;
        evictKey = key;
      }
    }

    if (evictKey) {
      this.cache.delete(evictKey);
    }
  }

  _bumpHwm() {
    const size = this.cache.size;
    if (size > this.hwm) {
      this.hwm = size;
      console.log(`[decay] DECAY_CACHE_HWM size=${size}`);
    }
  }

  // Clear all entries (for testing or restart)
  clear() {
    this.cache.clear();
    this.hwm = 0;
  }

  // Get raw size (for health checks)
  size() {
    return this.cache.size;
  }
}

// Singleton instance
const decayCache = new DecayCache();

export { decayCache, DecayCache };
