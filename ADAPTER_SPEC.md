# 4data External Adapter Specification v1

## Purpose

External adapters observe already-moving data streams and emit lane-tagged deltas into 4data.

**Adapters do NOT**:
- Query on user request
- Store or replay data
- Bypass lane validation
- Leak raw payloads

**Adapters DO**:
- Observe continuously
- Emit ephemeral signals
- Assign deterministic lanes
- Fail silently on error

---

## Adapter Law (Non-Negotiable)

1. **Read-only observation** — Adapters watch existing streams; never trigger fetches per user question
2. **Ephemeral** — No persistence, no replay capability
3. **Lane-scoped** — Every emission assigns exactly one valid lane from registry
4. **Derived only** — No raw payloads, identifiers, or PII
5. **Fail-silent** — On error, emit nothing (no exceptions upstream)

---

## Adapter Interface

```javascript
interface ExternalAdapter {
  id: string;                 // Stable adapter identifier (e.g., "openai-trends")
  source: string;             // Human-readable source name
  lanes: Lane[];              // Allowed lanes this adapter can emit to
  start(): void;              // Begin observing external stream
  stop(): void;               // Stop observing (clean shutdown)
}
```

---

## Emission Contract

Adapters emit signals to 4data via the same mechanism as internal sources:

```javascript
{
  "lane": "capacity | prices | business_movement | unknown",
  "signal": "string",                    // Signal type (e.g., "capacity_tightening")
  "confidence_hint": 0.0,                // Optional: adapter's confidence [0,1]
  "source": "adapter_id",                // Adapter identifier
  "observedAt": "ISO-8601"               // When observation occurred
}
```

**Forbidden fields**:
- User identifiers
- Query text
- Raw event payloads
- Per-event timestamps beyond `observedAt`

---

## Lane Assignment

Adapters must assign a deterministic lane for every emission.

### Rules

1. **Registry-validated** — Lane must exist in `src/lanes/registry.js`
2. **Deterministic** — Same input → same lane
3. **Fail-fast** — Invalid lane → drop emission (log warning)
4. **No guessing** — Use `unknown` lane if ambiguous

### Example

```javascript
function assignLane(externalEvent) {
  if (externalEvent.type === "business_open") {
    return "business_movement";
  }
  if (externalEvent.type === "price_change") {
    return "prices";
  }
  return "unknown"; // safe default
}
```

---

## Rate & Safety Constraints

### Throttling

Adapters must self-throttle to prevent overwhelming 4data:

- **Max rate**: 100 events/min per adapter (configurable)
- **Burst limit**: 10 events/sec
- **Deduplication**: Drop identical consecutive signals within 5s window

### Error Handling

1. **Backoff** — On source error, exponential backoff (1s, 2s, 4s, ..., max 60s)
2. **Circuit breaker** — After 5 consecutive failures, pause for 5 minutes
3. **No retries** — Adapters observe live streams; missed events are acceptable
4. **Heartbeat** — Optional health check; absence of data ≠ error

### Example

```javascript
class RateLimiter {
  constructor(maxPerMin = 100) {
    this.maxPerMin = maxPerMin;
    this.tokens = maxPerMin;
    this.lastRefill = Date.now();
  }

  tryEmit() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const refill = Math.floor((elapsed / 60000) * this.maxPerMin);
    
    this.tokens = Math.min(this.maxPerMin, this.tokens + refill);
    this.lastRefill = now;

    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    return false; // drop emission
  }
}
```

---

## Adapter Lifecycle

### Start

1. Validate configuration (lanes, rate limits)
2. Establish connection to external stream
3. Begin emitting signals to 4data

### Run

1. Observe external stream continuously
2. Transform events → lane-tagged signals
3. Emit to 4data (via bridge or v1 endpoint)
4. Apply rate limiting and deduplication

### Stop

1. Close external stream connection
2. Flush any pending emissions
3. Clean up resources
4. Emit no further signals

---

## Example Adapters (v1)

### A) LLM Trend Observer

**Source**: OpenAI/Gemini public trend streams (hypothetical)  
**Lane**: `business_movement`  
**Signal**: Interest rising/falling for specific categories

```javascript
// Stub example (no real API calls)
export class LLMTrendAdapter {
  id = "openai-trends";
  source = "OpenAI Trends (hypothetical)";
  lanes = ["business_movement"];

  start() {
    // Observe pre-existing trend feed (SSE/webhook)
    // NOT per-user queries
  }

  stop() {
    // Close connection
  }

  // On trend change detected
  onTrendChange(category, direction) {
    if (!this.rateLimiter.tryEmit()) return;

    emit({
      lane: "business_movement",
      signal: direction === "up" ? "interest_rising" : "interest_falling",
      confidence_hint: 0.6,
      source: this.id,
      observedAt: new Date().toISOString()
    });
  }
}
```

### B) Public Status Feed

**Source**: Government/utility status APIs  
**Lane**: `capacity` or `prices`  
**Signal**: Status changes (open/closed, price adjustments)

```javascript
export class PublicStatusAdapter {
  id = "gov-status-feed";
  source = "Government Status API";
  lanes = ["capacity", "business_movement"];

  start() {
    // Poll or subscribe to status feed
  }

  onStatusChange(facility, status) {
    const lane = status.type === "hours" ? "capacity" : "business_movement";
    const signal = status.open ? "capacity_opening" : "capacity_tightening";

    emit({ lane, signal, source: this.id, observedAt: new Date().toISOString() });
  }
}
```

### C) TradeScout Action Mirror (Existing)

**Source**: Internal TradeScout bookings/cancellations  
**Lane**: `capacity`  
**Signal**: capacity_opening / capacity_tightening

Already implemented in v1 core.

---

## Integration with 4data

Adapters emit to 4data via one of two paths:

### Option 1: Direct to v1 (recommended)

```javascript
await fetch("http://localhost:3000/request", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    region: "PGC",
    available: false,
    _adapter: "adapter-id" // optional metadata
  })
});
```

### Option 2: Direct to Bridge (future)

Not yet implemented. Would bypass v1 and emit directly to bridge with pre-assigned lane.

---

## Adapter Registry (Optional)

To track active adapters, create `src/adapters/registry.js`:

```javascript
export const ADAPTER_REGISTRY = {
  "openai-trends": {
    enabled: false, // feature flag
    allowedLanes: ["business_movement"],
    rateLimit: 50 // events/min
  },
  "gov-status-feed": {
    enabled: false,
    allowedLanes: ["capacity", "business_movement"],
    rateLimit: 100
  }
};
```

---

## Acceptance Checklist

Before shipping an adapter:

- [ ] Adapter emits only when external source moves (not on user request)
- [ ] Lane validation enforced at emission time
- [ ] Stopping adapter halts emissions immediately
- [ ] Restart does not replay past events
- [ ] Bridge ingests adapter signals without modification
- [ ] Rate limiting applied (max events/min)
- [ ] Deduplication prevents identical consecutive signals
- [ ] Error backoff implemented
- [ ] No raw payloads or PII in emissions
- [ ] Adapter ID is stable and unique

---

## Testing Adapters

### Unit Test (Isolated)

```javascript
const adapter = new MyAdapter();
const emissions = [];

adapter.onEmit = (signal) => emissions.push(signal);
adapter.start();

// Simulate external event
adapter.onExternalEvent({ type: "business_open" });

// Assert
assert(emissions.length === 1);
assert(emissions[0].lane === "business_movement");
assert(emissions[0].signal === "business_opening");
```

### Integration Test (with 4data)

1. Start v1 + bridge
2. Start adapter
3. Trigger external event (mock or real)
4. Query `/signals?lane=<lane>`
5. Assert signal appears
6. Wait for TTL
7. Assert signal expires

---

## Migration Path (Existing → Adapter)

If you have an existing integration that queries per-user:

1. **Decouple** — Separate observation from answering
2. **Continuous** — Observe external stream continuously, not on-demand
3. **Emit** — Send signals to 4data as they occur
4. **Sample** — LSA samples 4data at question-time

**Before** (per-request):
```
User asks → Query API → Return data → Answer
```

**After** (adapter):
```
[Background] API stream → Adapter → 4data
[Foreground] User asks → Sample 4data → Answer
```

---

## Non-Goals (Out of Scope)

- ❌ Adapters triggering queries per user
- ❌ Adapters storing historical data
- ❌ Adapters mixing lanes
- ❌ Adapters with authentication per user
- ❌ Bidirectional adapters (4data → external)

---

## Next Steps

1. Implement one reference adapter (stub)
2. Add adapter lifecycle tests
3. Document adapter onboarding process
4. Enable/disable via feature flags
5. Monitor adapter health via `/health-digest` (future)

---

## Philosophy

Adapters extend 4data's sensory surface without compromising its core principles:

- **Ephemeral** — Adapters observe motion, not history
- **Honest** — Silence is valid; no hallucination
- **Bounded** — Rate limits prevent overwhelm
- **Auditable** — Source tracking for all emissions

Adapters let 4data sense more of the world without becoming a database.
