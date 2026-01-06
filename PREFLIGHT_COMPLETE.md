# Preflight Lane Watching - Implementation Complete

## What Was Locked

### 1. Intent → Lane Resolver (ILR)
**File**: [src/lanes/resolver.js](src/lanes/resolver.js)

Pure function that maps query text to candidate lanes:
- `resolveLanes(text)`: Returns `Set<Lane>` for preflight watching
- `resolvePrimaryLane(text)`: Returns single lane for snapshot (hard boundary)
- `getLaneConfidence(text, lane)`: Returns confidence score 0-1

**Examples:**
```
"is it busy right now?" → capacity (25% confidence)
"how much does it cost?" → prices (25% confidence)
"are there new businesses opening?" → business_movement (43% confidence)
"is it busy and expensive?" → capacity, prices (multi-lane, capacity primary)
```

**Invariants:**
- ✓ Pure function (no side effects)
- ✓ Deterministic (same input → same output)
- ✓ Conservative (defaults to capacity if ambiguous)
- ✓ Fast (keyword matching, no ML)

### 2. Integration Pattern
**File**: [SCOUT_INTEGRATION.md](SCOUT_INTEGRATION.md)

Complete specification for Scout (or any consumer) integration:

**Soft Boundary (Preflight)**:
- Watch lanes while typing
- Render signals opportunistically
- Never claim completeness
- Discard on keystroke

**Hard Boundary (Submit)**:
- Freeze lane via `resolvePrimaryLane()`
- Call `POST /snapshot` with `lane + window + intent`
- Discard all preflight state
- Answer ONLY from snapshot

### 3. Demo
**File**: [demo-preflight.js](demo-preflight.js)

Demonstrates:
- Lane resolution as user types
- Soft boundary (watching)
- Hard boundary (snapshot on submit)
- Invariant preservation

**Run** (requires v1 + bridge running):
```bash
node demo-preflight.js
```

---

## Complete System Overview

### Hard Boundaries (Locked ✅)

1. **v1 Emission** ([src/v1/delta.js](src/v1/delta.js))
   - Deterministic lane assignment
   - Fail-fast on invalid lanes
   - Drop deltas that can't be routed

2. **Bridge Ingestion** ([src/bridge/index.js](src/bridge/index.js))
   - Lane-indexed storage
   - Missing-lane rejection
   - Invariant: no event outside lane bucket

3. **Snapshot Enforcement** ([src/bridge/index.js](src/bridge/index.js#L190-L253))
   - `POST /snapshot` requires `lane + window + intent`
   - Lane validated against registry
   - Window enumerated (1m|5m|15m|1h)
   - Response-only (no persistence)

4. **Lane Registry** ([src/lanes/registry.js](src/lanes/registry.js))
   - Canonical: capacity, prices, business_movement, unknown
   - Enumerable, finite, documented
   - Single source of truth

### Soft Boundary (Locked ✅)

5. **Lane Resolver** ([src/lanes/resolver.js](src/lanes/resolver.js))
   - Maps intent to lanes
   - Pure function
   - No side effects
   - Conservative defaults

---

## Integration Checklist

Ready for Scout:

- [x] Lane registry defined
- [x] Lane tagging at v1 emission
- [x] Bridge lane indexing
- [x] Lane-scoped API endpoints
- [x] Snapshot enforcement
- [x] Intent → Lane resolver
- [x] Soft vs hard boundary documented
- [x] Integration pattern specified

**Next: Wire Scout**
1. Import `resolveLanes()` for preflight
2. Subscribe to SSE for candidate lanes
3. Render opportunistically (honest)
4. On submit: `resolvePrimaryLane()` + `POST /snapshot`
5. Clear preflight, answer from snapshot

---

## Safety Properties (End-to-End)

1. **No accidental cross-lane reads**  
   Bridge enforces lane isolation at ingestion and query.

2. **No snapshot without intent**  
   All snapshots require explicit `intent` field.

3. **No persistence in v1 or preflight**  
   v1 is ephemeral; preflight is discardable.

4. **No claims during preflight**  
   UI may render signals but never claims completeness.

5. **Snapshots are auditable**  
   Every snapshot has `lane + window + intent + generatedAt`.

---

## What This Enables

**The "Magical" UX:**
- Answers appear while user is still typing
- No hallucination (silence is honest)
- No cross-lane leakage
- Formal answers use snapshots only
- Every capture is auditable

**The "Safe" Architecture:**
- Lane assignment deterministic
- Invalid lanes fail fast
- Snapshots enforced by bridge
- Preflight has no side effects
- Hard boundaries mechanically checked

---

## Test Coverage

- [test-snapshot.js](test-snapshot.js): Snapshot enforcement (8/8 passed)
- [test-resolver.js](test-resolver.js): Lane resolver (6 queries tested)
- [demo-preflight.js](demo-preflight.js): End-to-end soft+hard boundaries

All invariants verified ✅

---

## Next Locks

After Scout integration:

1. **Feedback loop** (lane-scoped, lossy, synthetic label)
2. **Forge integration** (snapshots → data products)
3. **UX polish** (confidence indicators, decay visuals)

Current state: **Ready for production integration**
