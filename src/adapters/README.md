# External Adapters — How to Add One

External adapters extend 4data's sensory surface by observing already-moving data streams.

---

## What is an Adapter?

An adapter:
- Observes an external stream (SSE, webhook, poll)
- Transforms events into lane-tagged signals
- Emits to 4data continuously (not per-user request)
- Respects doctrine (ephemeral, lane-scoped, no persistence)

---

## Quick Start

### 1. Create Adapter File

Create `src/adapters/<adapter-name>.js`:

```javascript
import { isValidLane } from "../lanes/registry.js";

export class MyAdapter {
  id = "my-adapter";
  source = "My External Source";
  lanes = ["capacity"]; // allowed lanes

  constructor() {
    this.active = false;
    this.rateLimiter = new RateLimiter(100); // 100/min
  }

  start() {
    this.active = true;
    console.log(`[${this.id}] Started`);
    // Connect to external stream here
  }

  stop() {
    this.active = false;
    console.log(`[${this.id}] Stopped`);
    // Close connection
  }

  async emit(signal) {
    if (!this.active) return;
    if (!this.rateLimiter.tryEmit()) return;
    if (!isValidLane(signal.lane)) {
      console.warn(`[${this.id}] Invalid lane: ${signal.lane}`);
      return;
    }

    // Emit to 4data v1
    await fetch("http://localhost:3000/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        region: signal.region || "unknown",
        available: signal.available,
        _adapter: this.id
      })
    });
  }
}

class RateLimiter {
  constructor(maxPerMin) {
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
    return false;
  }
}
```

### 2. Register Adapter (Optional)

Add to `src/adapters/registry.js`:

```javascript
export const ADAPTER_REGISTRY = {
  "my-adapter": {
    enabled: false,
    allowedLanes: ["capacity"],
    rateLimit: 100
  }
};
```

### 3. Start Adapter

Create `src/adapters/index.js`:

```javascript
import { MyAdapter } from "./my-adapter.js";

const adapters = [
  new MyAdapter()
];

export function startAdapters() {
  for (const adapter of adapters) {
    adapter.start();
  }
}

export function stopAdapters() {
  for (const adapter of adapters) {
    adapter.stop();
  }
}
```

### 4. Wire into Main

Update `src/v1/index.js` (or separate process):

```javascript
import { startAdapters } from "../adapters/index.js";

// Start adapters alongside v1
startAdapters();
```

---

## Adapter Patterns

### Pattern A: SSE Observer

```javascript
start() {
  const eventSource = new EventSource("https://external.api/stream");
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    this.emit({
      lane: this.determineLane(data),
      region: data.region,
      available: data.status === "open",
    });
  };

  eventSource.onerror = () => {
    console.error(`[${this.id}] SSE error`);
    // Exponential backoff
  };
}
```

### Pattern B: Webhook Listener

```javascript
start() {
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/webhook") {
      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", () => {
        const event = JSON.parse(body);
        this.emit(this.transform(event));
        res.writeHead(200);
        res.end();
      });
    }
  });

  server.listen(this.webhookPort);
}
```

### Pattern C: Polling Observer

```javascript
start() {
  this.interval = setInterval(async () => {
    const data = await fetch("https://external.api/status").then(r => r.json());
    
    if (this.hasChanged(data)) {
      this.emit(this.transform(data));
    }
  }, 60000); // 1 minute
}

stop() {
  clearInterval(this.interval);
}
```

---

## Lane Assignment

Every emission must assign a valid lane:

```javascript
determineLane(event) {
  if (event.type === "business_open") return "business_movement";
  if (event.type === "price_change") return "prices";
  if (event.type === "capacity_change") return "capacity";
  return "unknown"; // safe default
}
```

**Rules**:
- Deterministic (same input → same lane)
- Validated against registry
- No guessing (use `unknown` if ambiguous)

---

## Error Handling

```javascript
async emit(signal) {
  try {
    await fetch("http://localhost:3000/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signal)
    });
  } catch (err) {
    console.error(`[${this.id}] Emit failed:`, err.message);
    // Fail silently; do not throw
  }
}
```

**Rules**:
- Never throw on emit failure
- Log errors for debugging
- Apply exponential backoff on repeated failures
- No retries (events are ephemeral)

---

## Testing Adapters

### Unit Test

```javascript
import { MyAdapter } from "./my-adapter.js";

const adapter = new MyAdapter();
const emissions = [];

adapter.emit = (signal) => emissions.push(signal);
adapter.start();

// Simulate external event
adapter.onExternalEvent({ type: "business_open", region: "PGC" });

assert(emissions.length === 1);
assert(emissions[0].lane === "business_movement");
```

### Integration Test

1. Start v1 + bridge
2. Start adapter
3. Trigger external event (mock)
4. Query `/signals?lane=<lane>`
5. Assert signal appears

---

## Checklist

Before shipping:

- [ ] Adapter observes continuously (not per-user request)
- [ ] Lane assignment is deterministic
- [ ] Rate limiting applied
- [ ] Errors handled gracefully (fail-silent)
- [ ] No raw payloads or PII in emissions
- [ ] Stop method cleans up resources
- [ ] Adapter ID is unique

---

## Examples

See:
- [example-openai-trends.js](example-openai-trends.js) — Stub LLM trend observer
- [example-public-feed.js](example-public-feed.js) — Stub public status feed

---

## Philosophy

Adapters are **observers**, not **queriers**.

They extend 4data's awareness of the world without changing its core principles:
- Ephemeral (no persistence)
- Honest (silence is valid)
- Bounded (rate limits)
- Auditable (source tracking)

Adapters let 4data sense more without becoming a database.
