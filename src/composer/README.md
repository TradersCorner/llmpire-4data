# Capacity Composer

Natural language layer for capacity signals.

---

## Purpose

Transform capacity snapshots + forge products + decay state into 3-line situational descriptions.

**Output format**:
- **Now**: Current state from signals
- **What it means**: Interpretation with hedging
- **Confidence**: Explicit uncertainty level

---

## Usage

### Basic Example

```javascript
import { composeCapacity } from "./capacityComposer.js";

const snapshot = {
  lane: "capacity",
  window: "5m",
  events: [
    { signal: "capacity_tightening" },
    { signal: "capacity_tightening" },
    { signal: "capacity_opening" }
  ],
  decay: {
    pressure: 0.62,
    lastSignal: "capacity_tightening"
  }
};

const product = {
  net_state: "tightening",
  volatility: "low",
  confidence: 0.6,
  counts: { tightening: 2, opening: 1 }
};

const result = composeCapacity(snapshot, product);
console.log(result.composed.now);
console.log(result.composed.meaning);
console.log(result.composed.confidence);
```

**Output**:
```
Now: Limited capacity tightening signals detected.
What it means: Recent changes suggest availability may be decreasing.
Confidence: Moderate (3 signals in 5m window).
```

---

## Input Format

### Snapshot (required)
```javascript
{
  lane: "capacity",
  window: "5m",
  events: [...],
  decay: { pressure, lastSignal } // optional
}
```

### Product (optional)
```javascript
{
  net_state: "tightening" | "opening" | "flat",
  volatility: "low" | "moderate" | "high",
  confidence: 0.0 - 1.0,
  counts: { tightening, opening }
}
```

---

## Output Format

```javascript
{
  composed: {
    now: "string",
    meaning: "string",
    confidence: "string"
  },
  metadata: {
    lane: "capacity",
    window: "5m",
    signalCount: 3,
    confidenceScore: 0.6,
    netState: "tightening",
    volatility: "low",
    composedAt: "ISO-8601"
  }
}
```

---

## Example Outputs

### High Confidence, Tightening
```
Now: Capacity signals show sustained tightening activity.
What it means: Recent changes suggest availability may be decreasing.
Confidence: High (8 signals, sustained pressure over 5m).
```

### Low Confidence, Sparse Data
```
Now: Limited capacity opening signals detected.
What it means: Recent changes suggest availability may be increasing.
Confidence: Low (sparse data, limited visibility).
```

### No Signals
```
Now: No live capacity changes detected in this window.
What it means: Unable to assess current state from available signals.
Confidence: None (no recent activity).
```

### With Pressure Boost
```
Now: Capacity signals show opening activity.
What it means: Activity appears to be easing, but recent tightening pressure persists.
Confidence: Moderate (3 signals, pressure boost from decay cache).
```

---

## Composer Laws

1. **Never invent facts** — Only describe what's in snapshot/product/decay
2. **Explicit uncertainty** — Use hedging ("may", "suggests", "appears")
3. **Silence is valid** — "No signals" is a correct output
4. **No directives** — No "you should" or "act now"
5. **Deterministic** — Same input → same output

---

## Testing

All 10 invariant tests pass:

```bash
node src/composer/tests/composer-invariants.test.js
```

1. ✅ Silence handling
2. ✅ Missing product handling
3. ✅ Determinism (10 runs)
4. ✅ No directives
5. ✅ Confidence accuracy
6. ✅ Volatility mapping (high → sustained)
7. ✅ Pressure mention
8. ✅ No fact invention
9. ✅ Volatility mapping (low → limited)
10. ✅ Invalid input handling

---

## Phrase Vocabulary

### "Now" Templates

- "Capacity signals show [sustained/limited] [tightening/opening] activity."
- "No live capacity changes detected in this window."

### "Meaning" Templates

- "Recent changes suggest availability may be [decreasing/increasing]."
- "Activity appears to be [tightening/easing], but recent [opening/tightening] pressure persists."
- "Unable to assess current state from available signals."

### "Confidence" Templates

- "High ([N] signals[, sustained pressure] over [window])."
- "Moderate ([N] signals[, pressure boost from decay cache])."
- "Low ([sparse data, limited visibility])."
- "None (no recent activity)."

---

## Philosophy

Composer transforms infrastructure → language while preserving doctrine:

- **Ephemeral** — Output is discardable
- **Honest** — Uncertainty is explicit
- **Read-only** — No side effects
- **Deterministic** — Predictable output

Users get natural language. 4data stays a substrate.
