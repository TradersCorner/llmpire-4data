# State Decay Caches v1 — Specification

**Purpose**: Bounded, ephemeral pressure memory per lane+region that strengthens answers without storage.

---

## Overview

State decay caches track **recent activity pressure** for each lane+region combination using exponential decay. They solve the "empty snapshot + low confidence" problem while preserving doctrine (no persistence, no replay, bounded memory).

---

## Key Characteristics

- **Ephemeral** — In-memory only; process death = data death
- **Bounded** — Max 10k entries with LRU eviction
- **Lane-scoped** — Capacity pressure never affects prices pressure
- **Decaying** — Pressure reduces exponentially (half-life based)
- **No raw events** — Only aggregated pressure score + minimal counters

---

## Cache Model

### Cache Key
```
cacheKey = "${lane}:${region}"
```

### Cache Entry
```javascript
{
  lane: "capacity",
  region: "PGC",
  pressure: 0.62,              // Decaying score [0, 1]
  updatedAt: "ISO-8601",
  counts: {
    tightening: 12,            // Capped at 50
    opening: 5                 // Capped at 50
  },
  lastSignal: "capacity_tightening"
}
```

---

## Decay Rule

**Exponential decay**:
```javascript
decayFactor = 0.5 ^ (deltaSeconds / halfLifeSeconds)
pressure = pressure * decayFactor
```

### Parameters

- **Half-life**: 120 seconds (default, configurable per lane)
- **Impulse**: `capacity_tightening` → +0.25, `capacity_opening` → +0.15
- **Bounds**: Pressure clamped to [0, 1]
- **Counter cap**: 50 per signal type

---

## Data Flow

```
v1 emits delta
  → bridge validates lane
  → decay cache update (pressure += impulse, apply decay)
  → snapshot reads lane slice + optional decay state
  → forge incorporates pressure into confidence
```

Updates happen **at bridge ingestion time** (not per-request).

---

## Snapshot Integration

Snapshots optionally include decay summary:

```javascript
{
  "lane": "capacity",
  "window": "5m",
  "intent": "answer_user_query",
  "events": [...],
  "decay": {
    "pressure": 0.62,
    "updatedAt": "ISO",
    "halfLifeSeconds": 120,
    "lastSignal": "capacity_tightening"
  }
}
```

**Rules**:
- Decay is optional (safe to omit)
- No raw event arrays
- Not replayable

---

## Forge Integration

Forge incorporates pressure into confidence:

```javascript
baseConfidence = min(1, totalSignals / 5)
pressureBoost = min(0.25, decay.pressure * 0.25)
confidence = clamp(baseConfidence + pressureBoost, 0, 1)
```

---

## API Endpoints

### GET /decay
Returns overall stats:
```json
{
  "totalEntries": 147,
  "maxEntries": 10000,
  "laneStats": {
    "capacity": {
      "entries": 89,
      "avgPressure": 0.42,
      "maxPressure": 0.87
    }
  },
  "memoryEstimateKB": 29
}
```

### GET /decay?lane=capacity
Returns all entries for a lane:
```json
{
  "lane": "capacity",
  "entries": [...],
  "count": 89
}
```

### GET /decay?lane=capacity&region=PGC
Returns specific lane+region state:
```json
{
  "lane": "capacity",
  "region": "PGC",
  "pressure": 0.62,
  "updatedAt": "ISO",
  "halfLifeSeconds": 120,
  "lastSignal": "capacity_tightening",
  "counts": { "tightening": 12, "opening": 5 }
}
```

---

## Doctrine Compliance

✅ **No persistence** — In-memory only  
✅ **No replay** — Pressure can't reconstruct events  
✅ **No silent capture** — Updates from already-observed deltas  
✅ **No inference as fact** — Pressure is "pressure," not truth  
✅ **No personalization** — Keyed by lane/region only  
✅ **No cross-lane leakage** — Per-lane buckets isolated  
✅ **Bounded memory** — Max 10k entries with LRU eviction  
✅ **Process death = data death** — Restart wipes cache  

---

## Testing

All 10 invariant tests pass:

1. ✅ Pressure decays over time
2. ✅ Pressure increases on signal
3. ✅ Pressure clamped at 1.0
4. ✅ No raw event storage
5. ✅ Lane isolation
6. ✅ Counters capped at 50
7. ✅ Memory bound (LRU eviction)
8. ✅ Restart wipes cache
9. ✅ Decay to near-zero with no signals
10. ✅ Stats return valid summary

Run tests:
```bash
node src/decay/tests/decay-invariants.test.js
```

---

## Configuration

### Per-Lane Half-Life

```javascript
import { decayCache } from "./decay/decayCache.js";

decayCache.setHalfLife("capacity", 180); // 3 minutes
decayCache.setHalfLife("prices", 60);    // 1 minute
```

### Impulse Tuning

Edit `IMPULSE_MAP` in [decayCache.js](../src/decay/decayCache.js):

```javascript
const IMPULSE_MAP = {
  capacity_tightening: 0.25,
  capacity_opening: 0.15,
  // Add new signal types
};
```

---

## Philosophy

Decay caches answer:
- "How active is this region/lane recently?"
- "Should I be more confident in sparse signals?"

They do NOT answer:
- "What happened at 3:47pm yesterday?"
- "Show me the event timeline."

Pressure decays naturally. Silence is valid. No storage required.

---

## Implementation Files

- [src/decay/decayCache.js](../src/decay/decayCache.js) — Core cache + decay math
- [src/decay/README.md](../src/decay/README.md) — Usage documentation
- [src/decay/tests/decay-invariants.test.js](../src/decay/tests/decay-invariants.test.js) — Invariant tests
- Bridge integration: [src/bridge/index.js](../src/bridge/index.js)
- Forge integration: [src/forge/builders/regionalCapacity.js](../src/forge/builders/regionalCapacity.js)

---

## Benefits

1. **Reduces empty snapshots** — Pressure signal available even when event count is low
2. **Improves confidence** — Forge products gain pressure-boosted confidence scores
3. **Doctrine-compliant** — No persistence, no replay, bounded memory
4. **Lane-scoped** — Preserves isolation guarantees
5. **Continuous strengthening** — Updates at ingestion time, not per-request

---

## Next Steps

State decay caches are complete and locked. Next capabilities that build on this foundation:

1. **Scout Answer Composer** — Convert signals → natural language (benefits from pressure-boosted confidence)
2. **Public Whitepaper** — Document complete system (4data + LSA + decay)

Or pause for operational observation.
