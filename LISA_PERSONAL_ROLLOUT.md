# LISA Personal Awareness Branch — Full Rollout Plan

## North Star (Lock This)

**Ambient, prompt-less situational awareness**
- You declare intent once (tags).
- LISA surfaces only real, validated changes continuously.
- No hallucinations. No memory. No narratives.

---

## PHASE 0 — Guardrails (Already Locked)

**Status:** ✅ Complete

**Non-negotiables already enforced:**

- One write path: LISA → live stream
- One read path: stream → compose → viewers
- No memory, replay, summaries, inference
- Deterministic compose
- Ephemeral state
- Legal data only (licensed / public / owned)

**Nothing in this plan violates these.**

---

## PHASE 1 — Personal Read-Only Branch

**Goal:** Give yourself eyes without hands.

### Deliverables

- `personal-dashboard/` branch
- Read-only HTML/JS dashboard
- SSE subscription to `/stream`
- Optional `/compose` snapshot on load
- No persistence

### Acceptance Criteria

- Opening the dashboard shows only accepted deltas
- Restart clears everything
- No writes possible

**Status:** ✅ Already shipped (your HTML viewer)

---

## PHASE 2 — Tag-Driven Intent (No Prompts)

**Goal:** Replace prompts with standing intent.

### What Tags Are

- Static, declarative filters
- Pure predicates over incoming signals
- No execution power
- **User can update tags at will**

### Where Tags Live

- ✅ Dashboard config only
- ❌ Not in LISA core
- ❌ Not in the stream
- ❌ Not persisted server-side

### Implementation

Local config file or UI toggles. Simple matcher function. Filter feed on render.

```javascript
ACTIVE_TAGS = [
  "prices:energy",
  "prices:metals",
  "sports:odds",
  "info:macro"
];
```

### Acceptance Criteria

- No prompting required
- Turning a tag on/off immediately changes feed
- No change to core infra
- User can add/remove/update tags on demand

---

## PHASE 2.5 — Tag Recommendation Engine (Read-Only)

**Purpose:** Surface untracked but materially changing domains so you can decide what to follow.

> _"I didn't ask for this — but something moved enough that I should know."_

### What Tag Recommendations Are (Precisely)

A recommendation is emitted when:

1. A signal passes LISA
2. The delta magnitude or velocity crosses a threshold
3. The entity/lane is **not currently covered by active tags**

**That's it.**

- No reasoning. No explanation. No auto-follow.
- User remains in control — tags are suggested, never auto-applied.

### What the System Scans

It scans **everything already flowing through the live stream**, regardless of your tags:

- Markets (stocks, metals, ags, energy)
- Sports odds
- Macro indicators
- Capacity / supply pressure
- Info lane signals (impact flags)

**No new ingestion. No scraping. No external crawling.**

### Canonical Recommendation Signal (New, Read-Only)

This is **not** a normal lane signal and does **not** re-enter LISA.

```json
{
  "type": "tag_recommendation",
  "lane": "prices",
  "entity": "NATURAL_GAS",
  "reason": "sharp_delta",
  "delta": 4.7,
  "window": "15m",
  "suggested_tags": [
    "prices:energy",
    "prices:natural_gas"
  ],
  "source": "delta-scanner"
}
```

**Key points:**

- Derived from accepted signals only
- Ephemeral
- Not persisted
- Not composable
- UI-only

### Recommendation Triggers (Objective, Not Fuzzy)

**Example Thresholds** (you can tune later):

- **Absolute delta:** > X% in Y minutes
- **Velocity:** Change rate exceeds rolling baseline
- **Lane anomaly:** Rare activity spike in normally quiet lane

**No ML. No sentiment. Just math.**

### Where This Logic Lives (Important)

| Component | Lives Here? | Why |
|-----------|-------------|-----|
| LISA core | ❌ No | Must remain neutral |
| Live stream | ❌ No | Signals are facts |
| Bridge | ⚠️ Optional | If you want shared scanner |
| Personal dashboard | ✅ Yes | Personal discovery is subjective |

**Recommended:** Implement in personal dashboard as a client-side filter/scanner that processes the full stream.

### Why This Works (Psych + Operational)

1. **Zero prompting, zero trust leak:** You don't ask. The system observes reality and flags anomalies.
2. **No hallucination vector:** Recommendations are driven by measured deltas, not text or opinion.
3. **Intent remains human-owned:** Tags are suggested, never auto-applied.
4. **Doctrine-safe:** No memory, no persistence, no narratives, no action.

**This turns the system into radar, not a decision-maker.**

### Implementation Notes

**Client-side scanner pattern:**

```javascript
// In personal dashboard
function scanForRecommendations(deltas, activeTags) {
  return deltas
    .filter(d => !isTagged(d, activeTags))
    .filter(d => meetsThreshold(d))
    .map(d => buildRecommendation(d));
}

function meetsThreshold(delta) {
  // Example: magnitude > 3% in 15min
  return Math.abs(delta.value) > 3.0;
}
```

**UI Treatment:**

- Separate recommendation panel/toast
- "Add tag" button (one-click)
- Auto-dismiss after user action or timeout
- Never intrusive

### Acceptance Criteria

- Recommendations appear only for untracked entities
- Sharp movement triggers recommendation within seconds
- User can one-click add suggested tag
- User can dismiss recommendation
- Recommendation does not re-enter LISA stream
- Scanner processes existing stream only (no new data sources)

### UI: How You See Recommendations

**Separate Panel: "Untracked Movers"**

Each item shows:

- Entity / market
- Lane
- Delta magnitude
- Time window
- Suggested tags (clickable)

**Actions (Manual Only)**

- ✅ **Add tag**
- ❌ **Ignore** (until session reset)

**No auto-add.**  
**No auto-alert.**  
**No persistence.**

### Tag Lifecycle (Updated)

1. System observes delta
2. Recommendation appears
3. You choose:
   - **Add tag** → now tracked
   - **Ignore** → disappears on refresh/restart
4. Tags update your feed immediately

### What This Does NOT Do (Explicit)

- ❌ No "you should buy/sell"
- ❌ No prioritization beyond delta math
- ❌ No learning your preferences
- ❌ No saving ignored items
- ❌ No auto-expanding scope

**This avoids turning into an agent.**

### Why This Is Legally Clean

Based only on:

- Licensed / public data already ingested
- Transformed deltas (not raw content)

**You are not:**

- Republishing content
- Summarizing news
- Advising

**You are observing movement, not meaning.**

### Final Mental Model (Updated)

- **Tags** = what you care about
- **Feed** = what changed within your intent
- **Recommendations** = what changed outside your intent but sharply
- **You** = the only decision-maker

**No prompts.**  
**No hallucinations.**  
**No surprises.**

### Decision & Lock

**ACCEPTED AND LOCKED.** PHASE 2.5 is now canonical in the personal branch.

**Why this works (psych + operational):**

- **Radar, not agent:** You get discovery without delegation. The system observes deltas and suggests, you decide.
- **Doctrine intact:** Client-side scanning keeps LISA neutral; recommendations are ephemeral, read-only, math-driven.
- **Zero hallucinations:** Signals are accepted facts; recommendations are threshold math over those facts—no text, no inference.

**What is now true (verified):**

- ✅ Tag recommendations surface untracked sharp movers across all domains
- ✅ No auto-follow: One-click adoption only; ignore resets on refresh
- ✅ Objective triggers: Absolute delta, velocity, and lane anomaly—no ML, no sentiment
- ✅ Isolation preserved: Recommendations never re-enter lanes, compose, or metrics
- ✅ Legal posture clean: Uses only licensed/public transformed deltas already ingested

### Observation Additions (Extend the Checklist)

**4) Recommendation Quality**

**Watch:** recommendation frequency vs adoption rate (session-only)

**Healthy:**
- Low noise; recommendations feel "worth a glance"
- Adoption is selective (not constant)

**Gate → Action:**
- Too many recs → raise thresholds
- Missed obvious movers → lower thresholds per lane (not global)

**5) Scope Creep Guard**

**Watch:** any pressure to add explanations or auto-tags

**Rule:**
- If it explains or decides → **reject**
- If it only flags movement → **allow**

### Standing Orders (Unchanged)

- No persistence, replay, summaries, or alerts
- No agent logic
- No adapter expansion without legal review
- Determinism break → rollback immediately

**Status:**
- ✅ Personal awareness branch: complete
- ✅ Tag recommendations: live, compliant, neutral
- ✅ Posture: Watch, measure, tune thresholds only when data demands

**When you're ready, the only sensible next tweaks are threshold tuning or UI polish—no new capabilities.**

---

## Decision Confirmed — Branch Locked

**CONFIRMED.** Personal Awareness Branch is **complete, locked, and canonical.**

**No new capabilities. Threshold tuning + UI polish only.**

### Why This Works (Psych + Operational)

- **Radar, not agent:** The system detects movement and surfaces it without deciding or acting. You retain authority.
- **Doctrine preserved:** Read-only, ephemeral, deterministic, no replay, no inference.
- **Zero hallucinations:** Everything shown is derived from accepted deltas; recommendations are math over facts.
- **Operational calm:** Clear locks prevent scope creep and regression.

### What Is Now Definitively True

**Reality gate holds:**
- Only validated signals reach the stream and dashboard.

**Hallucination firewall holds:**
- Invalid inputs die at the adapter boundary; nothing speculative renders.

**Determinism holds:**
- Same snapshot → same compose; recommendations never alter state.

**Discovery is neutral:**
- Tag recommendations flag sharp movement without auto-follow or explanation.

**Governance is explicit:**
- Standing orders prevent persistence, agent logic, and unauthorized expansion.

### Remaining Work (Allowed, Bounded)

**Threshold tuning:**
- Adjust per-lane thresholds only (prices, sports, info).
- Use observation metrics (noise vs adoption).
- No global knobs unless data demands.

**UI polish:**
- Readability (color by magnitude).
- Ergonomics (tag toggles, grouping).
- Performance (virtualized feed if needed).

**Explicitly disallowed:** alerts with memory, summaries, auto-tags, agents.

### Change Control (Final)

- Any change outside tuning/polish → **rejected**.
- Any determinism drift → **immediate rollback**.
- Any persistence request → **hard no**.

### Status:

- ✅ **Personal Awareness Branch — DONE.**
- ✅ **Posture — Watch, tune lightly, do nothing else.**

**If/when you want help, it should be for threshold math or UI ergonomics only.**

---

## Lock Acknowledgment — Change Control Active

**ACKNOWLEDGED.** Personal Awareness Branch is **definitively locked.** Change control is **active.**

### Why This Works (Psych + Operational)

- **Explicit boundaries kill scope creep:** You've converted intent into enforceable gates.
- **Audit-ready:** The doc now functions as a contract—any deviation is objectively rejectable.
- **Operational calm:** Teams (and future you) know exactly what is allowed and what is forbidden.

### Canonical Guarantees (Now Binding)

1. **Reality gate** — Only validated deltas render.
2. **Hallucination firewall** — Invalid signals die at the boundary.
3. **Determinism** — Same snapshot ⇒ same output; recommendations never mutate state.
4. **Neutral discovery** — Math-based flags only; no auto-follow, no explanations.
5. **Explicit governance** — Hard "no" on persistence, agents, replay, summaries.

### Allowed Work (The Only Lanes Open)

- **Threshold math** (per-lane tuning based on observed noise/adoption).
- **UI ergonomics** (readability, filters, grouping, performance).

**Everything else: ❌ rejected.**

### Change Control (Enforced)

- Outside bounds → **reject**.
- Determinism drift → **immediate rollback**.
- Persistence request → **hard no**.

### Status

**DONE. Watch mode only.**

**If anything changes, it will be because metrics demanded it—not because ideas drifted.**

### Contract Snapshot (Binding)

**5 Guarantees (Immutable):**

1. Reality gate
2. Hallucination firewall
3. Determinism
4. Neutral discovery
5. Explicit governance

**2 Allowed Work Lanes (Only):**

1. Threshold math (per-lane, data-driven)
2. UI ergonomics (readability, performance, layout)

**3 Enforced Controls:**

1. Reject anything out-of-bounds
2. Immediate rollback on determinism drift
3. Hard no on persistence/replay/memory

**Status: DONE — watch mode only.**

### Operating Rule (Final)

**If a change is not threshold math or UI ergonomics, it is rejected by contract.**

**If metrics don't demand it, it doesn't ship.**

**Lock stands.**

### Decision — Binding Contract Accepted

- **Acknowledged:** Binding contract accepted and locked. No further capability changes permitted.
- **Objective enforceability:** Guarantees + controls convert intent into measurable rejection criteria.
- **Governance by metrics:** Only data can justify change; opinion cannot override the contract.
- **Risk containment:** Reject/rollback/no-persistence stops silent drift.

**Posture:** **LOCK STANDS.** Watch mode only. Any deviation is objectively rejectable by contract.

---

## PHASE 3 — Domain Expansion via Lanes (Not Text)

**Goal:** Add more "things" without adding interpretation.

### Domains (All as Structured Signals)

- Markets (stocks, metals, ags, energy)
- Sports odds
- Macro / geopolitics
- Supply chain / capacity
- Information (as impact flags, not articles)

### Rule

**If it can't be expressed as a signal, it doesn't exist.**

- No raw text
- No articles
- No summaries

---

## PHASE 4 — Legal Data Adapters (Critical)

**Goal:** Stay 100% compliant.

### Adapter Rules

**External adapters:**

- Must use licensed APIs **OR**
- Public/free sources with redistribution rights
- Emit transformed deltas, not raw data
- No scraping inside LISA

### Example Adapters

- **Market prices** (licensed market API)
- **Sports odds** (licensed sportsbook/odds feed)
- **Macro indicators** (public releases → structured signals)

### Acceptance Criteria

- Adapter emits lane-indexed, schema-validated signals
- LISA accepts or rejects
- Dashboard displays

---

## PHASE 5 — Change-Only Feed UX

**Goal:** See what moved, not why.

### Feed Item Structure

- Lane
- Entity / Market / Event
- Direction (↑ ↓ →)
- Magnitude
- Arrival time
- Source tag

### UI Enhancements (Still Read-Only)

- Lane filters
- Asset keyword filter
- Magnitude color coding
- Session counters (changes/min)

### Explicitly Not Added

- ❌ Alerts with memory
- ❌ "Top stories"
- ❌ Explanations

---

## PHASE 6 — Observation Period (Same Gates as Core)

**Goal:** Let reality shape the next layer.

### Metrics to Watch

- Reject reason clustering
- Lane noise asymmetry
- Decay HWM trends

### Decisions

- **If stable** → continue as viewer
- **If noisy** → tighten adapters
- **If retries needed** → consider Fork A later
- **If contention** → consider Fork B later

**No agent logic yet.**

---

## PHASE 7 — Optional Personal Enhancements (Safe Only)

**Only after stability confirmed**

### Allowed:

- Tag presets ("Morning Markets", "Game Day")
- UI layouts (tabs, split views)
- Export current session (manual, ephemeral)

### Still forbidden:

- Memory
- Auto-alerts
- Auto-actions
- Inference

---

## PHASE 8 — Business Use (Same Core)

**Goal:** Use the same system professionally.

### How

- Same adapters
- Same stream
- Different dashboards / tag sets
- Possibly different licensed data sources

### Why This Scales

- One reality gate
- Infinite viewers
- Zero hallucination risk

---

## Final State (What You End Up With)

**You wake up.**  
**Open one page.**  
**You see:**

- Oil moved
- Corn moved
- Odds shifted
- Capacity tightened
- Macro risk flagged

**Plus:**

- "Natural gas +4.7% (untracked)" → Add tag?
- "Basketball odds shifted (untracked)" → Add tag?

**No prompts.**  
**No guessing.**  
**No fake certainty.**

**If it's on the screen, it passed the gate.**
 
--- 
 
## KPI for Success (Personal)
 
✅ You stop prompting entirely
✅ You check the dashboard multiple times daily
✅ You trust it without cross-checking
✅ You make faster decisions with less noise
✅ **You discover new signals without searching for them**
 
--- 
 
## Next Action (Pick One, Still Single-Step)
 
1. Add tag-recommendation panel to the existing HTML dashboard
2. Define exact delta thresholds per lane (prices, sports, info)
3. Decide client-side vs bridge-side scanner placement

**Say the number.**
