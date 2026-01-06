# State Decay Caches v1

Bounded, ephemeral pressure memory per lane+region that strengthens answers without storage.

---

## What It Is

A tiny in-memory cache that tracks **recent activity pressure** for each lane+region combination.

- **Decays automatically** — Pressure score reduces exponentially over time (half-life based)
- **Bounded memory** — Max 10k entries with LRU eviction
- **Lane-scoped** — Capacity pressure never affects prices pressure
- **No raw events** — Only stores aggregated pressure score + minimal counters

---

## What It Is NOT

- ❌ Event storage
- ❌ A queue
- ❌ Analytics/history
- ❌ Per-user tracking
- ❌ Replayable timeline

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

**Exponential decay** based on elapsed time:

```javascript
decayFactor = 0.5 ^ (deltaSeconds / halfLifeSeconds)
pressure = pressure * decayFactor
```

### Parameters (v1)

- **Half-life**: 120 seconds (default, configurable per lane)
- **Min pressure**: 0
- **Max pressure**: 1
- **Counter cap**: 50

### Impulse on Signal

When a signal arrives:

1. Apply decay based on elapsed time
2. Add impulse: `capacity_tightening` → +0.25, `capacity_opening` → +0.15
3. Clamp pressure to [0, 1]
4. Increment counter (capped at 50)
5. Update timestamp

---

## Data Flow

Cache updates happen **at bridge ingestion time**:

```
v1 emits delta
  → bridge validates lane
  → decay cache update
  → snapshot reads lane slice + cache state
```

**Benefits**:
- Strengthens substrate continuously
- No per-request overhead
- Independent of user actions

---

## Snapshot Integration

Snapshots can optionally include decay summary:

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
- No raw event list
- No per-event timestamps
- Not replayable

---

## Forge Integration

Forge can incorporate pressure into confidence calculation:

```javascript
baseConfidence = min(1, totalSignals / 5)
pressureBoost = min(0.25, decay.pressure * 0.25)
confidence = clamp(baseConfidence + pressureBoost, 0, 1)
```

If no decay present, behavior unchanged.

---

## API Usage

### Update Cache (Internal)

```javascript
import { decayCache } from "./decayCache.js";

// On signal arrival
decayCache.update("capacity", "PGC", "capacity_tightening");
```

### Get Current State

```javascript
const state = decayCache.get("capacity", "PGC");
// Returns: { lane, region, pressure, updatedAt, halfLifeSeconds, lastSignal, counts }
```

### Get Lane Stats

```javascript
const entries = decayCache.getLane("capacity");
// Returns array of all capacity lane entries (with decay applied)
```

### Get Overall Stats

```javascript
const stats = decayCache.getStats();
// Returns: { totalEntries, maxEntries, laneStats, memoryEstimateKB }
```

---

## Doctrine Compliance

✅ **No persistence** — In-memory only  
✅ **No replay** — Pressure can't reconstruct events  
✅ **No silent capture** — Updates from already-observed deltas  
✅ **No inference as fact** — Pressure is explicitly "pressure," not truth  
✅ **No personalization** — Keyed by lane/region only  
✅ **No cross-lane leakage** — Per-lane buckets isolated  
✅ **Bounded memory** — Max 10k entries with LRU eviction  
✅ **Process death = data death** — Restart wipes cache  

---

## Testing

### Invariant Tests

1. **Decay over time** — Pressure → 0 with no new signals
2. **Impulse increases pressure** — Signal arrival boosts pressure
3. **Clamping** — Pressure never exceeds 1
4. **No event reconstruction** — Cache never stores event arrays
5. **Lane isolation** — Updates to capacity don't affect prices
6. **Memory bound** — Eviction kicks in at 10k entries
7. **Restart wipes** — Process death clears cache

### Example Test

```javascript
import { decayCache } from "./decayCache.js";

// Start fresh
decayCache.clear();

// Add signal
decayCache.update("capacity", "PGC", "capacity_tightening");
let state = decayCache.get("capacity", "PGC");
assert(state.pressure > 0);

// Wait and check decay
await sleep(5000);
state = decayCache.get("capacity", "PGC");
assert(state.pressure < initial); // Decayed
```

---

## Configuration

### Per-Lane Half-Life

```javascript
decayCache.setHalfLife("capacity", 180); // 3 minutes for capacity
decayCache.setHalfLife("prices", 60);    // 1 minute for prices
```

### Impulse Tuning

Edit `IMPULSE_MAP` in `decayCache.js`:

```javascript
const IMPULSE_MAP = {
  capacity_tightening: 0.25,
  capacity_opening: 0.15,
  // Add new signal types here
};
```

---

## Philosophy

Decay caches are **pressure memory**, not **history**.

They answer:
- "How active is this region/lane recently?"
- "Should I be more confident in sparse signals?"

They do NOT answer:
- "What happened at 3:47pm yesterday?"
- "Show me the event timeline."

Pressure decays naturally. Silence is valid. No storage required.
