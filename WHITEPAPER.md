# 4data & Live State Answering (LSA)
### Sampling shared, live state to produce honest, real-time answers

---

## Executive Summary

Most software answers questions by fetching stored data or recomputing knowledge per request. This is expensive, stale-by-default, and poorly suited for a changing world.

4data introduces a different primitive: a live state substrate composed of ephemeral signals emitted by systems, models, and human activity. Live State Answering (LSA) samples 4data at the moment a question is asked, producing answers from what is already moving—without per-request data collection.

**Outcomes**:
- Answers time-sensitive questions honestly
- Avoids scraping and per-request API costs
- Minimizes storage and privacy risk
- Scales as participation grows

---

## Definitions

- **4data**: Continuously flowing, multi-source live state substrate of derived, ephemeral signals.
- **Live State Answering (LSA)**: Answering paradigm that samples 4data at question-time.
- **Lane**: Deterministic category for signals (e.g., `capacity`, `prices`, `business_movement`).
- **Delta**: Minimal signal emitted when a state changes.
- **Snapshot**: One-time capture of what is currently flowing in a specific lane and window, taken only on explicit user submit.
- **Forge**: Deterministic aggregation layer that converts snapshots into derived products.
- **Decay Cache**: Bounded, in-memory pressure memory that decays automatically; not a database.
- **Composer**: Deterministic language layer that turns derived signals into plain-language descriptions.

---

## System Overview

### High-Level Flow

```
World Activity / External Streams
        ↓
   Adapters (observe-only)
        ↓
      4data (live deltas, lanes)
        ↓
   Decay Caches (pressure)
        ↓
User asks → Snapshot → Forge → Composer → Answer
```

### Key Properties

- **Observe, don’t query**: External systems are never queried on behalf of a user.
- **Ephemeral by default**: Process death = data death.
- **Silence is valid**: No signals is an honest outcome.

---

## Doctrine & Safety Guarantees

**Non-Negotiables (mechanically enforced):**
- **No persistence** — In-memory only; restarts wipe state.
- **No replay** — Signals cannot reconstruct timelines.
- **No silent capture** — Snapshots occur only on explicit submit.
- **No inference as fact** — Outputs are situational, hedged, and derived.
- **No personalization** — Lane/region only; no user identifiers.
- **No cross-lane leakage** — Strict lane isolation.

Each rule is enforced by code paths, validation, and invariant tests—not policy alone.

---

## External Adapter Model

Adapters connect already-moving external streams (SSE, webhooks, public feeds) to 4data.

**Adapter Law:**
- Read-only observation
- Ephemeral
- Lane-scoped
- Derived-only (no raw payloads)
- Fail-silent

Adapters emit minimal deltas with lane assignment and confidence hints. They never fetch per user.

---

## Data Products (v1)

**regional_capacity_signal v1**
- Derived from capacity snapshots.
- Fields: `counts` (tightening/opening), `net_state` (tightening/opening/flat), `volatility` (low/moderate/high), `confidence` (0–1), `provenance` (snapshot time)
- **Discard Rule**: Empty snapshots → no product.

---

## Answering Model (LSA)

**Preflight**
- While typing, Scout listens to relevant lanes.
- No capture. No side effects.

**Commit**
- On submit, Scout takes one snapshot (lane + window + intent).

**Derive**
- Forge aggregates snapshot (+ optional decay pressure).

**Compose**
- Composer emits a 3-line situational description:
  - Now (what signals show)
  - What it means (hedged interpretation)
  - Confidence (explicit basis)
- No directives. No predictions. Silence allowed.

---

## Threat Model

**Prevents:**
- Stale answers
- Scraping/TOS violations
- Per-request API cost blowups
- Silent surveillance
- Overclaiming from sparse data

**Does not claim:**
- Omniscience
- Historical completeness
- Predictive certainty
- Replacement of all knowledge systems

---

## Compliance & Privacy Posture

- **Data minimization**: Derived signals only.
- **No identifiers**: No PII, no user histories.
- **Transparency**: Deterministic rules and vocabularies.
- **Auditability limits**: By design, no replay or reconstruction.

---

## Roadmap

- Prices lane v1
- Business movement lane v1
- State decay tuning
- Additional adapters
- Operational hardening

---

## Conclusion

4data provides the live state. LSA decides when to look.

Together, they replace per-request fetching with shared, real-time state sampling—making answers cheaper, faster, and more honest in a changing world.

*End of WHITEPAPER.md*
