# Composer Specification v1

**Purpose**: Transform 4data signals into natural language while preserving doctrine (no invented facts, explicit uncertainty, silence is valid).

---

## What Composer Is

Composer converts snapshots + forge products + decay state into **situational descriptions**, not claims or recommendations.

**Output format**: 3-line structured text
- **Now**: Current state from signals
- **What it means**: Interpretation with hedging
- **Confidence**: Explicit uncertainty level

---

## What Composer Is NOT

- ❌ Recommendation engine ("you should book now")
- ❌ Prediction system ("capacity will tighten tomorrow")
- ❌ Analytics dashboard ("historical trends show...")
- ❌ Personalization layer ("based on your preferences...")

---

## Composer Laws (Non-Negotiable)

1. **Never invent facts** — Only describe what's in snapshot/product/decay
2. **Explicit uncertainty** — Use hedging language ("may", "signals suggest", "appears to be")
3. **Silence is valid** — "No live signals" is a correct output
4. **No directives** — No "do this" or "act now" framing
5. **No personalization** — Output is situational, not user-specific
6. **Deterministic** — Same input → same output
7. **Read-only** — Composing has no side effects

---

## 3-Line Format Structure

```
Now: [Current state from signals]
What it means: [Interpretation with hedging]
Confidence: [Explicit uncertainty + basis]
```

### Example Outputs

**High confidence, tightening**:
```
Now: Capacity signals show tightening activity.
What it means: Recent changes suggest availability may be decreasing.
Confidence: High (8 signals, sustained pressure over 5 minutes).
```

**Low confidence, sparse signals**:
```
Now: Limited capacity activity detected.
What it means: Signals suggest stable conditions, but data is sparse.
Confidence: Low (2 signals in 5-minute window).
```

**No signals (silence)**:
```
Now: No live capacity changes detected in this window.
What it means: Unable to assess current state from available signals.
Confidence: None (no recent activity).
```

**Pressure boost from decay**:
```
Now: Capacity opening signals with recent pressure.
What it means: Activity appears to be easing, but recent tightening pressure persists.
Confidence: Moderate (3 signals, pressure boost from decay cache).
```

---

## Capacity Composer v1 (Reference Implementation)

### Input

```javascript
{
  snapshot: {
    lane: "capacity",
    window: "5m",
    events: [...],
    decay: { pressure: 0.62, ... } // optional
  },
  product: {
    net_state: "tightening",
    volatility: "moderate",
    confidence: 0.68,
    counts: { tightening: 5, opening: 2 }
  } // optional
}
```

### Output

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
    signalCount: 7,
    confidenceScore: 0.68,
    composedAt: "ISO-8601"
  }
}
```

---

## Phrase Vocabulary (Approved)

### "Now" Line Templates

**Tightening**:
- "Capacity signals show tightening activity."
- "Recent signals indicate capacity tightening."

**Opening**:
- "Capacity signals show opening activity."
- "Recent signals indicate capacity opening."

**Flat/Mixed**:
- "Capacity signals show mixed activity."
- "Limited capacity activity detected."

**No signals**:
- "No live capacity changes detected in this window."

### "Meaning" Line Templates

**Tightening**:
- "Recent changes suggest availability may be decreasing."
- "Signals suggest capacity is becoming more constrained."

**Opening**:
- "Recent changes suggest availability may be increasing."
- "Signals suggest capacity is becoming less constrained."

**Flat**:
- "Signals suggest stable conditions, but data is sparse."
- "Activity appears balanced between opening and tightening."

**No signals**:
- "Unable to assess current state from available signals."

**With pressure**:
- "Activity appears to be [easing/tightening], but recent [tightening/opening] pressure persists."

### "Confidence" Line Templates

**High** (confidence ≥ 0.7):
- "High ([N] signals, sustained pressure over [window])."
- "High ([N] signals in [window] window)."

**Moderate** (0.4 ≤ confidence < 0.7):
- "Moderate ([N] signals, [pressure boost from decay cache])."
- "Moderate ([N] signals in [window] window)."

**Low** (confidence < 0.4):
- "Low ([N] signals in [window] window)."
- "Low (sparse data, limited visibility)."

**None** (no signals):
- "None (no recent activity)."

---

## Urgency Modifiers (Volatility + Pressure)

Composer can add urgency hints based on volatility + decay pressure:

### Volatility Rules

- **High volatility** (≥6 signals): Add "rapid" or "sustained"
- **Moderate volatility** (3-5 signals): Standard phrasing
- **Low volatility** (<3 signals): Add "limited" or "sparse"

### Pressure Rules

- **High pressure** (≥0.7): Add "persistent" or "sustained"
- **Moderate pressure** (0.4-0.7): Mention "recent pressure"
- **Low pressure** (<0.4): No pressure mention

---

## Forbidden Phrases

**Never use**:
- "You should..." or "We recommend..."
- "This is the best time to..."
- "Act now" or "Don't wait"
- "Based on your preferences..."
- "Historically, this means..."
- "Capacity will..." (future claims)
- "Guaranteed" or "Certain"

**Replace with**:
- "Signals suggest..."
- "Recent changes indicate..."
- "May be..." / "Appears to be..."
- "Unable to assess..."

---

## Determinism Rules

Composer must be **deterministic**: same input → same output.

- No randomness in phrase selection
- No time-of-day variations
- No user context
- Phrase choice driven only by: net_state, confidence, volatility, pressure

---

## Error Handling

### Missing Product

If forge product is unavailable:
```
Now: Raw capacity signals detected (no aggregate available).
What it means: Unable to derive net state from current data.
Confidence: None (aggregation unavailable).
```

### Invalid Input

Return structured error:
```javascript
{
  error: "Invalid input: missing snapshot",
  composed: null
}
```

---

## Testing Requirements

All tests must pass:

1. ✅ **No fact invention** — Output contains only snapshot/product/decay data
2. ✅ **Silence handling** — No signals → valid "no activity" output
3. ✅ **Determinism** — Same input → identical output (10 runs)
4. ✅ **No directives** — No "you should" or "act now" phrasing
5. ✅ **Confidence accuracy** — Confidence line matches confidenceScore
6. ✅ **Volatility mapping** — High volatility → "sustained", low → "limited"
7. ✅ **Pressure mention** — High pressure → mentioned in meaning line
8. ✅ **No personalization** — Output identical regardless of "user context"

---

## Future Expansion

Composers for other lanes (not v1):
- **Prices Composer** — "Price pressure rising/falling/flat"
- **Business Movement Composer** — "Activity increasing/decreasing/quiet"

Each lane gets its own composer with lane-specific phrase vocabulary.

---

## Doctrine Compliance

✅ **No persistence** — Composing is read-only  
✅ **No silent capture** — Composition has no side effects  
✅ **No inference as fact** — Hedging language enforces uncertainty  
✅ **Ephemeral** — Output is discardable  
✅ **Honest** — Silence is explicitly communicated  
✅ **Auditable** — Metadata tracks source snapshot/product  

---

## API Endpoint (Optional)

### POST /compose

**Request**:
```json
{
  "lane": "capacity",
  "snapshot": {...},
  "product": {...}
}
```

**Response**:
```json
{
  "composed": {
    "now": "Capacity signals show tightening activity.",
    "meaning": "Recent changes suggest availability may be decreasing.",
    "confidence": "High (8 signals, sustained pressure over 5 minutes)."
  },
  "metadata": {
    "lane": "capacity",
    "window": "5m",
    "signalCount": 8,
    "confidenceScore": 0.82,
    "composedAt": "ISO-8601"
  }
}
```

---

## Philosophy

Composer is the **language layer** for 4data:

- Transforms deltas → descriptions
- Preserves uncertainty (no hallucination)
- Makes substrate feel like "answers"
- Stays doctrine-compliant (read-only, ephemeral, honest)

Users get natural language. 4data stays a substrate.
