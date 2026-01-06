# Scout Integration Pattern: Soft vs Hard Boundaries

This document defines how Scout (or any consumer) integrates with 4data's lane-aware bridge while maintaining all safety guarantees.

## The Two Boundaries

### Soft Boundary (Preflight - While Typing)
**Purpose**: Show live signals opportunistically as the user types  
**Mechanism**: Lane watching via SSE or polling  
**Guarantees**: Fully reversible, no capture, no side effects

### Hard Boundary (Submit - On Query Execution)
**Purpose**: Capture authoritative snapshot for formal answer  
**Mechanism**: `POST /snapshot` with `lane + window + intent`  
**Guarantees**: Lane-scoped, ephemeral, auditable

---

## Integration Flow

### Phase 1: Preflight (While Typing)

```javascript
import { resolveLanes } from "./src/lanes/resolver.js";

// On every meaningful keystroke
function onTextChange(text) {
  // 1. Resolve candidate lanes (pure function, no side effects)
  const candidateLanes = resolveLanes(text);
  
  // 2. Subscribe to SSE for candidate lanes
  //    (or poll GET /signals?lane=<lane>)
  for (const lane of candidateLanes) {
    subscribeToLane(lane);
  }
  
  // 3. Render signals opportunistically
  //    Example: "Live signal: capacity tightening in PGC"
  //    Never claim completeness or certainty
  
  // 4. On next keystroke: discard all preflight state
  //    This is just attention, not memory
}
```

**Invariants:**
- ✓ No API writes
- ✓ No persistence
- ✓ No snapshot calls
- ✓ Signals are hints, not facts
- ✓ Silence is valid (no signals = no render)

---

### Phase 2: Submit (Hard Boundary)

```javascript
import { resolvePrimaryLane } from "./src/lanes/resolver.js";

async function onSubmit(text) {
  // 1. Freeze lane resolution
  const lane = resolvePrimaryLane(text);
  
  // 2. Discard all preflight state
  unsubscribeAll();
  clearPreflightUI();
  
  // 3. Capture snapshot (hard boundary)
  const snapshot = await fetch("http://localhost:3001/snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lane,
      window: "5m",
      intent: "answer_user_query"
    })
  }).then(r => r.json());
  
  // 4. Use snapshot to answer formally
  //    This is the ONLY authoritative data for the answer
  return generateAnswer(snapshot);
}
```

**Invariants:**
- ✓ Exactly one lane
- ✓ Snapshot enforced by bridge (400 if invalid)
- ✓ Snapshot exists only in response
- ✓ No preflight data used in answer

---

### Phase 3: After Snapshot — Forge Integration (Optional Product Layer)

**Purpose**: Transform snapshots into derived, non-reversible data products.

**When to use**: When you need aggregated signals (counts, net state, confidence) instead of raw snapshot events.

```javascript
import { resolvePrimaryLane } from "./src/lanes/resolver.js";
import { forgeFromSnapshot } from "@4data/forge";

async function onSubmit(text) {
  // 1. Freeze lane resolution
  const lane = resolvePrimaryLane(text);
  
  // 2. Discard all preflight state
  unsubscribeAll();
  clearPreflightUI();
  
  // 3. Capture snapshot (hard boundary)
  const snapshot = await fetch("http://localhost:3001/snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lane,
      window: "5m",
      intent: "answer_user_query"
    })
  }).then(r => r.json());
  
  // 4. Forge product from snapshot (deterministic transform)
  const product = forgeFromSnapshot(snapshot);
  
  // 5. Render product or empty state
  if (product) {
    // Product contains: counts, net_state, volatility, confidence
    // No raw events, no replay capability
    return renderProduct(product);
  } else {
    // Empty snapshot or unsupported lane → null
    return renderEmptyState("No signals in window");
  }
}
```

**Sequence**:
```
User typing (preflight) → watch lanes (SSE/poll)
       ↓
User submits → POST /snapshot (lane + window + intent)
       ↓
Snapshot (200) → forgeFromSnapshot(snapshot)
       ↓
Product | null → render or empty state
```

**Forge Output Example** (Regional Capacity Signal v1):
```json
{
  "product": "regional_capacity_signal",
  "version": "v1",
  "region": "PGC",
  "window": "5m",
  "generatedAt": "2024-01-01T00:00:10.000Z",
  "counts": {
    "capacity_tightening": 2,
    "capacity_opening": 1
  },
  "net_state": "tightening",
  "volatility": "low",
  "confidence": 0.6,
  "source": "forge",
  "provenance": {
    "snapshotAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Hard Invariants (Forge)**:
- ❌ **Never call Forge during preflight** (only after snapshot succeeds)
- ❌ **Never pass live lanes/SSE to Forge** (snapshot-only input)
- ✅ **Forge input = snapshot only** (pure function)
- ✅ **Forge output = aggregate only** (no raw events)
- ✅ **`null` output is valid** (empty snapshot or unsupported lane)
- ✅ **Deterministic** (same snapshot → same product)

**Rendering Guidelines**:
```javascript
function renderProduct(product) {
  // Show aggregates, not raw events
  console.log(`Net state: ${product.net_state}`);
  console.log(`Volatility: ${product.volatility}`);
  console.log(`Confidence: ${(product.confidence * 100).toFixed(0)}%`);
  
  // Counts are allowed (aggregated)
  console.log(`Events: ${product.counts.capacity_tightening} tightening, ${product.counts.capacity_opening} opening`);
  
  // Provenance is honest
  console.log(`Based on snapshot at ${product.provenance.snapshotAt}`);
}

function renderEmptyState(reason) {
  console.log(`No product available: ${reason}`);
  // Empty is valid and expected—no hallucination
}
```

**Telemetry (Allowed)**:
```javascript
// After forgeFromSnapshot
telemetry.record({
  event: product ? "forge_build_success" : "forge_build_null",
  lane: snapshot.lane,
  window: snapshot.window,
  build_latency_ms: Date.now() - startTime
});

// ❌ Forbidden: query text, user IDs, raw events
```

**Why Forge is optional**:
- If you just need snapshot counts → use snapshot directly
- If you need net state, volatility, confidence → use Forge
- Forge adds value for complex aggregation without raw event leakage

---

## Lane Resolution (ILR)

**File**: `src/lanes/resolver.js`

### `resolveLanes(text: string): Set<Lane>`
Returns candidate lanes for preflight watching.

**Example:**
```javascript
resolveLanes("is it busy right now?")
// → Set { "capacity" }

resolveLanes("how much does it cost?")
// → Set { "prices" }

resolveLanes("are there new businesses opening?")
// → Set { "business_movement" }
```

### `resolvePrimaryLane(text: string): Lane`
Returns single lane for snapshot (hard boundary).

**Example:**
```javascript
resolvePrimaryLane("is it busy and expensive?")
// → "capacity" (first in priority order)
```

### `getLaneConfidence(text: string, lane: Lane): number`
Returns confidence score (0-1) for a specific lane.

**Example:**
```javascript
getLaneConfidence("is it busy right now?", "capacity")
// → 0.67
```

---

## UI Behavior Rules

### ✅ Allowed (Soft Boundary)
- Render live signals inline: "Live: capacity tightening in PGC"
- Show lane badges: "Watching: capacity"
- Decay indicators: "Last signal 2m ago"
- Empty state: "No live signals right now"

### ❌ Forbidden (Soft Boundary)
- Claim completeness: ~~"All signals shown"~~
- Claim certainty: ~~"Definitely busy"~~
- Show historical data: ~~"3 signals in last hour"~~ (use snapshot)
- Persist rendered signals across keystrokes

### ✅ Allowed (Hard Boundary)
- Formal answer from snapshot: "Based on last 5m..."
- Historical counts: "2 tightening events in 5m window"
- Confidence indicators: "High confidence (83%)"
- Empty snapshot honesty: "No signals in last 5m"

### ❌ Forbidden (Hard Boundary)
- Use preflight data in answer
- Mix lanes in snapshot
- Persist snapshot beyond answer generation
- Re-snapshot without new user intent

---

## Integration Checklist

Before shipping Scout integration:

- [ ] Preflight uses `resolveLanes()` (pure function)
- [ ] Preflight renders opportunistically (no claims)
- [ ] Preflight state discarded on keystroke
- [ ] Submit uses `resolvePrimaryLane()` (frozen)
- [ ] Submit calls `POST /snapshot` (hard boundary)
- [ ] Submit discards all preflight state
- [ ] Answer uses ONLY snapshot data
- [ ] UI never mixes soft + hard data
- [ ] Empty snapshots handled honestly
- [ ] No lane guessing downstream
- [ ] **[Optional]** Forge called only after snapshot (never during preflight)
- [ ] **[Optional]** Forge output (`null`) handled gracefully
- [ ] **[Optional]** No raw events rendered from Forge products

---

## Example: Full Flow

**User types:** "is it busy right now?"

1. **Preflight (soft)**:
   - Text: "is i" → lanes: `["capacity"]`
   - Text: "is it" → lanes: `["capacity"]`
   - Text: "is it busy" → lanes: `["capacity"]` ✓ stable
   - Scout subscribes to capacity lane SSE
   - Live signal appears: "capacity_tightening in PGC"
   - User sees: "Live: tightening"

2. **Submit (hard)**:
   - User hits Enter
   - Scout calls `resolvePrimaryLane("is it busy right now?")` → `"capacity"`
   - Scout calls `POST /snapshot`:
     ```json
     {
       "lane": "capacity",
       "window": "5m",
       "intent": "answer_user_query"
     }
     ```
   - Bridge returns snapshot with 2 events
   
3. **[Optional] Forge (product)**:
   - Scout calls `forgeFromSnapshot(snapshot)`
   - Returns:
     ```json
     {
       "product": "regional_capacity_signal",
       "net_state": "tightening",
       "volatility": "low",
       "confidence": 0.4,
       "counts": { "capacity_tightening": 2, "capacity_opening": 0 }
     }
     ```
   - Scout renders: "Yes, capacity is tight (confidence: 40%, volatility: low)"
   - Preflight UI cleared

**Alternative (without Forge)**:
   - Scout generates answer from snapshot directly: "Yes, capacity is tight—2 tightening signals in last 5m"
   - Preflight UI cleared

---

## Safety Properties (Invariants)

1. **Preflight watching has no side effects**  
   Watching lanes does not trigger snapshots, persistence, or capture.

2. **No snapshot before submit**  
   Snapshots only occur on explicit user intent (submit).

3. **Snapshots are lane-scoped**  
   Bridge enforces: one lane per snapshot, validated against registry.

4. **Rendered signals before submit are discardable**  
   Preflight UI is ephemeral; no guarantee of retention.

5. **Snapshot is the only authoritative data for answers**  
   Formal answers must use snapshot, never preflight signals.

---

## What This Enables

- **Answers while asking**: Live signals appear mid-typing
- **Honest silence**: No signals = no render (not a failure)
- **No hallucination**: Hard boundary prevents speculation
- **Lane isolation**: No accidental cross-lane leakage
- **Auditable capture**: Every snapshot has lane + window + intent

---

## Next Steps

1. Wire Scout's typing handler to call `resolveLanes()`
2. Implement SSE subscription for candidate lanes
3. Add preflight UI rendering (opportunistic, honest)
4. Wire Scout's submit handler to call `POST /snapshot`
5. Clear preflight state on submit
6. Generate answers ONLY from snapshot data

This pattern preserves all safety guarantees while delivering the "magical" UX.
