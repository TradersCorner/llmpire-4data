# 4data Doctrine — Constitutional Layer**Purpose**: This document defines non-negotiable architectural laws for 4data. These rules are permanent. If a future change conflicts with this doctrine, **the doctrine wins**.---## Core Philosophy4data is a **live, lossless-to-lossy boundary system** where reality speaks first and memory is optional.We did not build:- a database- a cache  - a recommender- a crawlerWe built:- A substrate where authoritative signals flow ephemerally- A bounded capture mechanism (snapshots) with explicit intent- A preflight attention layer with zero side effectsThis enables:- Honest answers (silence is valid)- Cheap scaling (process death = data death)- User trust (no silent surveillance)- Regulatory clarity (no replayable timelines)---## Non-Negotiables### 1. No Persistence in v1 or Bridge- v1 core MUST NOT write to disk, databases, or any persistent store- Bridge MUST keep all state in-memory only- Process death = data death (by design, not accident)- **Enforced by**: ESLint, CI guardrails, code review### 2. No Replay
- No event logs
- No history buffers
- No "catch-up" after disconnect
- Users see "now" and forward only
- **Enforced by**: Architecture (no storage), runtime contract

### 3. No Silent Capture
- All snapshots require explicit `lane + window + intent`
- No auto-generation of snapshots
- No background persistence "for later"
- Users must consciously trigger capture
- **Enforced by**: Bridge snapshot endpoint (400 if missing params)

### 4. No Inference as Fact
- Authoritative signals are real-world deltas only
- Derived/aggregated data MUST be labeled synthetic
- LLMs may not treat predictions as ground truth
- Snapshots are observational, not prescriptive
- **Enforced by**: Data product contracts, documentation

### 5. No Personalization
- No user profiling
- No behavioral targeting
- No per-user state beyond session
- Signals are regional/operational only
- **Enforced by**: Data model (no user IDs), contract reviews

### 6. No Cross-Lane Leakage
- Lanes are isolated at ingestion
- No implicit cross-lane reads
- Aggregation across lanes MUST be explicit and auditable
- Snapshots read exactly one lane
- **Enforced by**: Bridge lane indexing, snapshot validation

---

## Lanes Are Law

### Lane Fundamentals
- **Lanes are structural, not semantic**  
  A lane answers "what category?" not "what does it mean?"
  
- **Lane assignment is deterministic**  
  Pure function: signal type → lane (no ML, no inference)
  
- **Lanes are enumerable**  
  Finite set defined in registry; no dynamic creation at runtime
  
- **Lanes are enforced mechanically**  
  Invalid lanes fail fast at emission, ingestion, and snapshot

### Lane Lifecycle
1. **Emission**: v1 assigns lane deterministically via `buildLane()`
2. **Ingestion**: Bridge validates lane, indexes to correct bucket
3. **Observation**: APIs are lane-scoped (`/signals?lane=capacity`)
4. **Capture**: Snapshots require valid lane from registry

### Lane Invariants
- Every emitted delta MUST have a lane
- Every lane MUST be in the canonical registry
- Snapshots MUST specify exactly one lane
- No event exists outside a lane bucket

**Enforced by**: Lane registry, v1 emission guards, bridge ingestion validation

---

## Preflight vs Commit (The Two Boundaries)

### Soft Boundary: Preflight (While Typing)
**Purpose**: Show live signals opportunistically as user types

**Rules**:
- ✓ Watch candidate lanes (resolved via pure function)
- ✓ Render signals if reality speaks
- ✓ Say nothing if reality is silent
- ✓ Discard all state on next keystroke

**Prohibitions**:
- ✗ No snapshot calls
- ✗ No persistence
- ✗ No claims of completeness
- ✗ No retention across keystrokes

**Philosophy**: Preflight is **attention**, not **memory**.

**Enforced by**: Scout integration pattern, code review

---

### Hard Boundary: Commit (On Submit)
**Purpose**: Capture authoritative snapshot for formal answer

**Rules**:
- ✓ Freeze primary lane (via resolver)
- ✓ Call `POST /snapshot` with `lane + window + intent`
- ✓ Discard all preflight state
- ✓ Answer ONLY from snapshot data

**Prohibitions**:
- ✗ No preflight data in answer
- ✗ No cross-lane snapshots
- ✗ No snapshot persistence (response-only)
- ✗ No snapshot without explicit intent

**Philosophy**: Snapshot is the **only** authoritative data for answers.

**Enforced by**: Bridge snapshot endpoint (hard validation), Scout integration

---

## Snapshots

### Snapshot Rules
- Snapshots exist **only when explicitly requested**
- Every snapshot MUST declare: `lane + window + intent`
- Snapshots are **response-only** (no persistence)
- Snapshots are **discardable immediately** after use
- Snapshots are **never auto-generated**

### Snapshot Guarantees
- Exactly one lane per snapshot
- Time window is enumerated (`1m | 5m | 15m | 1h`)
- Intent is auditable (non-empty string)
- Snapshot = slice of in-memory lane bucket (ephemeral source)

**Enforced by**: `POST /snapshot` endpoint validation (400 on violation)

---

## Data Product Boundary

### Where It Begins
- Data products start **after** snapshots, never before
- Snapshots → Forge → Aggregated products
- No direct v1 → product pipeline (snapshots are mandatory)

### Product Rules
- Products MUST be derived, non-replayable
- Products MUST NOT contain raw event payloads
- Products MUST NOT contain per-event timestamps (minute precision max)
- Products MUST NOT contain user identifiers

### Product Philosophy
- Observational, not prescriptive
- No scoring, ranking, or recommendations
- Flat-state confidence explicitly capped
- Empty windows → discard (no zero-fill)

**Enforced by**: Data product contracts, schema validation, contract reviews

---

## LLM Boundary

### LLMs May See
- Aggregates (snapshots, products)
- Summaries (windowed counts, volatility)
- Context (lane descriptions, metadata)

### LLMs May NOT See
- Raw streams (live SSE)
- Timelines (event sequences)
- Authoritative signals (deltas)
- Replayable history

### LLM Philosophy
- LLMs interpret derived data, not authoritative signals
- LLMs generate synthetic context, never facts
- LLM output MUST be labeled non-authoritative

**Enforced by**: System architecture (LLMs downstream of forge), documentation

---

## Source of Truth

### Authoritative
- Real-world deltas (v1 input signals)
- Snapshot responses (time-bounded observation)
- Lane registry (enumerated, finite)

### Synthetic (Derived)
- Aggregated counts
- Derived volatility/confidence metrics
- LLM-generated context
- Data products

### Rule
**Synthetic output can NEVER be treated as ground truth.**

**Enforced by**: Documentation, data product contracts, code comments

---

## Governance

### v1 is Frozen
- v1 core is locked at `v1.0.0-ephemeral`
- No changes to v1 signal processing logic
- CI fails if v1 changes vs baseline
- Extensions live outside v1 (bridge, forge, etc.)

**Enforced by**: `.github/workflows/core-guardrails.yml`

### Boundaries Are Mechanical
- ESLint boundaries plugin enforces folder rules
- v1 cannot import persistence libraries
- Bridge must validate lanes
- Violations fail at build/lint, not code review

**Enforced by**: `.eslintrc.json`, VS Code settings

### Violations Fail Fast
- Invalid lanes → dropped at emission
- Missing snapshot params → 400 at bridge
- Persistence imports → lint error
- v1 drift → CI failure

**Philosophy**: Trust the tools, not social conventions.

---

## For OSS Contributors

### If You Want to Add a Feature

**Ask:**
1. Does this require persistence in v1/bridge?  
   → If yes: **rejected** (build it downstream)

2. Does this bypass lane isolation?  
   → If yes: **rejected** (lanes are law)

3. Does this weaken snapshot enforcement?  
   → If yes: **rejected** (intent is mandatory)

4. Does this create silent capture?  
   → If yes: **rejected** (user must trigger)

5. Does this treat synthetic data as authoritative?  
   → If yes: **rejected** (label it synthetic)

**If all answers are no**, your feature likely fits the architecture.

### Safe Additions
- New lanes (add to registry, update resolver)
- New data products (downstream of snapshots)
- UI polish (preflight rendering, decay visuals)
- Forge logic (aggregate → product)
- Tools/scripts (outside core boundaries)

### Forbidden Additions
- v1 persistence
- Cross-lane mixing
- Snapshot auto-generation
- Preflight capture
- Lane inference (must be deterministic)

---

## Invariant Tests (Protected)

These tests MUST always pass:

1. **"No snapshot without lane+window+intent"**  
   `POST /snapshot` with missing params → 400

2. **"No cross-lane data"**  
   `/signals?lane=capacity` returns only capacity events

3. **"Preflight never calls snapshot"**  
   Lane resolution is pure function (no API calls)

4. **"Restart = no history"**  
   Kill process → all state lost

5. **"Invalid lanes fail fast"**  
   v1 emits delta with bad lane → dropped + logged

**Location**: `test-snapshot.js`, `test-resolver.js`, future invariant suite

---

## Summary: What This System Is

4data is:
- **Ephemeral**: Process death = data death
- **Lane-aware**: Isolated categories, no leakage
- **Honest**: Silence is valid (no hallucination)
- **Bounded**: Capture requires explicit intent
- **Auditable**: Every snapshot has lane+window+intent
- **Trustworthy**: No silent surveillance, no replay

4data is NOT:
- A database
- A cache
- A recommender
- A behavioral profiler
- A replay system

---

## Doctrine Governance

**This document is constitutional.**

If a future PR conflicts with this doctrine:
1. The PR is rejected, OR
2. The doctrine is amended via formal proposal + team consensus

Doctrine amendments require:
- Clear rationale
- Safety analysis
- Migration path
- Updated tests

**Doctrine changes are rare and deliberate.**

---

**Version**: 1.0.0  
**Last Updated**: 2026-01-05  
**Status**: Locked
