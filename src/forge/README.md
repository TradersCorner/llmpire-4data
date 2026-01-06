# Forge — Snapshot to Product Pipeline

## Purpose

Forge transforms ephemeral snapshots into durable, derived data products.

- **Input**: Snapshots only (never live streams)
- **Output**: Derived aggregates only (never raw events)
- **Memory**: Optional, bounded, product-scoped
- **Authority**: None (informational)

## Hard Rules

1. **Forge never sees SSE or live lanes**
   - Only consumes snapshot outputs from bridge
   - No direct v1 access
   - No event listeners

2. **No raw event leakage**
   - Products contain aggregates, counts, states
   - No event timestamps, IDs, or raw payloads
   - No replay capability

3. **Deterministic transforms**
   - Same snapshot → same product
   - Pure functions only
   - No side effects

4. **Discard rule**
   - Empty or invalid snapshots → `null`
   - Products are optional, not guaranteed

## Flow

```
User query → Scout preflight (no forge)
          ↓
       Submit → Snapshot (lane + window + intent)
          ↓
       Forge (snapshot → product)
          ↓
       Answer (with derived product)
```

**Critical**: Forge runs **after** snapshot, never before or during preflight.

## Products v1

### Regional Capacity Signal

**Builder**: `builders/regionalCapacity.js`  
**Schema**: `schemas/regional_capacity_signal.v1.json`  
**Test**: `tests/forge-regional-capacity.test.js`

**Input** (from snapshot):
```json
{
  "lane": "capacity",
  "window": "5m",
  "generatedAt": "2024-01-01T00:00:00.000Z",
  "events": [
    { "signal": "capacity_tightening" },
    { "signal": "capacity_opening" }
  ]
}
```

**Output** (product):
```json
{
  "product": "regional_capacity_signal",
  "version": "v1",
  "region": "PGC",
  "window": "5m",
  "generatedAt": "2024-01-01T00:00:10.000Z",
  "counts": {
    "capacity_tightening": 1,
    "capacity_opening": 1
  },
  "net_state": "flat",
  "volatility": "low",
  "confidence": 0.4,
  "source": "forge",
  "provenance": {
    "snapshotAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Logic**:
- Count signals by type
- Derive net state: `tightening | opening | flat`
- Classify volatility: `low (<3) | moderate (3-5) | high (6+)`
- Compute confidence: `min(1, total/5)`
- Discard if no events

## Usage

### In-Process (recommended for Scout)

```javascript
import { forgeFromSnapshot } from "./src/forge/index.js";

// After snapshot succeeds
const snapshot = await fetchSnapshot({ lane, window, intent });
const product = forgeFromSnapshot(snapshot);

if (product) {
  console.log("Product:", product);
} else {
  console.log("No product (empty snapshot or unsupported lane)");
}
```

### As HTTP Service (optional)

Not implemented yet. If needed:
- POST `/forge` with snapshot body
- Returns product or 204 (no content)
- Port: TBD (suggest 3003)

## Testing

Run invariant tests:
```bash
node src/forge/tests/forge-regional-capacity.test.js
```

Assertions:
- Empty snapshot → null
- Counts match signals
- Net state correct
- Confidence bounded [0,1]
- No raw events in output
- Deterministic output
- Volatility classification correct
- Schema compliant

## Adding New Products

1. Create builder in `builders/<product>.js`
2. Export pure function: `snapshot → product | null`
3. Add schema in `schemas/<product>.v<N>.json`
4. Wire into `forgeService.js` lane routing
5. Add invariant test in `tests/<product>.test.js`
6. Update this README

## Non-Negotiable

- Forge never writes to v1 or bridge
- Forge never stores snapshots
- Products are derived, not authoritative
- Empty snapshots discard safely
- All builders are pure functions

## Next Products

Candidates (after v1 ships):
- Price movement signal (prices lane)
- Business activity signal (business_movement lane)
- Cross-lane composite (explicit aggregation only)

**Do not build until regional capacity v1 is in production.**
