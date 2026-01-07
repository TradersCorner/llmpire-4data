# TradeScout Core Rule

# 4data — Live Reasoning Substrate

**A lane-scoped situational awareness system where reality speaks first and memory is optional.**

---

## Core Rule

Nothing is stored.  
Only deltas exist.  
If the process stops, the data is gone.

---

## What This Is

4data is **not**:
- A database
- A cache
- A recommender
- A behavioral profiler
- A replay system

4data **is**:
- **Ephemeral**: Process death = data death
- **Lane-aware**: Isolated categories, no leakage
- **Honest**: Silence is valid (no hallucination)
- **Bounded**: Capture requires explicit intent
- **Auditable**: Every snapshot has `lane + window + intent`
- **Trustworthy**: No silent surveillance, no replay

---

## Architecture

```
Reality → v1 (ephemeral deltas, lane-tagged)
			 → Bridge (lane-indexed, in-memory, decay cache updates)
			 → Snapshots (lane + window + intent, optional decay summary)
			 → Forge (snapshot → derived products, pressure-boosted confidence)
			 → Composer (signals → natural language, 3-line format)
			 → Scout (preflight watching + hard boundary)

External Adapters → v1 (observe streams, emit lane-tagged signals)
```

**Hard boundaries** (mechanically enforced):
- v1 emits delta-only signals with deterministic lanes
- Bridge ingests by lane, rejects invalid/missing lanes
- Snapshots require `lane + window + intent` (no defaults)

**Soft boundary** (reversible):
- Preflight watching (attention, not memory)
- Rendered signals are discardable
- No capture before submit

---

## Documentation (Read in Order)

**Constitutional Layer** (non-negotiable):
1. **[DOCTRINE.md](DOCTRINE.md)** ← Start here
2. **[V1_LOCK.md](V1_LOCK.md)** — v1 core frozen forever
3. **[RUNTIME_CONTRACT.md](RUNTIME_CONTRACT.md)** — Canonical runtime behavior
4. **[CONSUMER_CONTRACT.md](CONSUMER_CONTRACT.md)** — `/stream` guarantees

**Integration**:
- **[SCOUT_INTEGRATION.md](SCOUT_INTEGRATION.md)** — How to wire Scout (or any consumer)
- **[ADAPTER_SPEC.md](ADAPTER_SPEC.md)** — External adapter specification (how outside streams join 4data)
- **[DECAY_SPEC.md](DECAY_SPEC.md)** — State decay caches (bounded pressure memory)
- **[COMPOSER_SPEC.md](COMPOSER_SPEC.md)** — Natural language composer (signals → language)
- **[PORTS.md](PORTS.md)** — Port ownership

**Products**:
- **[DATA_PRODUCTS.md](DATA_PRODUCTS.md)** — Product catalog
- **[data-products/](data-products/)** — Contracts + one-pagers

**Internal**:
- **[STRUCTURE.md](STRUCTURE.md)** — Folder taxonomy + boundaries
- **[PREFLIGHT_COMPLETE.md](PREFLIGHT_COMPLETE.md)** — Preflight pattern summary

---

## Quick Start

### Run v1 Core
```bash
npm install
npm run start  # v1 on port 3000
```

### Run Bridge
```bash
npm run bridge  # Bridge on port 3001
```

### Send Test Signal
```bash
curl -X POST http://localhost:3000/request \
	-H "Content-Type: application/json" \
	-d '{"region":"PGC","available":false}'
```

### Query Lane
```bash
curl "http://localhost:3001/signals?lane=capacity"
```

### Capture Snapshot
```bash
curl -X POST http://localhost:3001/snapshot \
	-H "Content-Type: application/json" \
	-d '{"lane":"capacity","window":"5m","intent":"answer_user_query"}'
```

### Run Digest (informational-only)
```bash
export DIGEST_LEADER=true
export DIGEST_RUN_ONCE=true
npm run digest
```
Runs a one-off weekly digest (empty-safe) against the local bridge. Scheduler mode runs Mondays 08:00 local time.

### Check Digest Health
```bash
curl http://localhost:3002/health-digest
```
Shows scheduler status, leader flag, next/last run times, and uptime.

---

## Sidekick  v1 Bridge (Ops-grade)

The bridge connects Sidekick NDJSON output to the v1 `/request` endpoint in a
deterministic, auditable way.

### Modes

- **Live**

	```bash
	npm run bridge:sidekick
	```

	Requires v1 running on http://localhost:3000.

- **Dry-run (no POSTs)**

	```bash
	npm run bridge:sidekick:dry
	```

	Prints reduced payloads to stdout for inspection.

### Guarantees

- Deterministic ordering (maxInFlight = 1)
- Idempotency via eventId + TTL de-dup
- Backpressure with pause/resume
- Bounded shutdown drain
- Size-guarded raw payloads
- Periodic `bridge_health` events (ops lane)

### Offline verification (no v1 required)

```bash
npm test
```

Includes a harness that feeds NDJSON into the bridge in `--dryRun` mode and
asserts duplicate dropping, oversize truncation, and health metrics.

---

## Contributing

**Read [DOCTRINE.md](DOCTRINE.md) first.** It defines non-negotiable architectural laws.

### Before You Open a PR

Ask yourself:
1. Does this require persistence in v1/bridge? → **Rejected**
2. Does this bypass lane isolation? → **Rejected**
3. Does this weaken snapshot enforcement? → **Rejected**
4. Does this create silent capture? → **Rejected**
5. Does this treat synthetic data as authoritative? → **Rejected**

If all answers are **no**, your PR likely fits the architecture.

### Safe Additions
- New lanes (add to registry, update resolver)
- New data products (downstream of snapshots)
- UI polish (preflight rendering, decay visuals)
- Forge logic (snapshot → aggregated product)
- Tools/scripts (outside core boundaries)

### Forbidden Additions
- v1 persistence
- Cross-lane mixing
- Snapshot auto-generation
- Preflight capture
- Lane inference (must be deterministic)

### Proposing Doctrine Changes

Doctrine changes require:
- Clear rationale
- Safety analysis
- Migration path
- Updated invariant tests
- Team consensus

**Doctrine changes are rare and deliberate.**

---

## Testing

### Run Invariant Tests
```bash
node test-snapshot.js  # Snapshot enforcement
node test-resolver.js  # Lane resolver
node test-digest-idempotency.js  # Digest host/week idempotency
node digest_dst_scheduling.test.js  # DST-safe Monday 08:00 scheduling
node src/forge/tests/forge-regional-capacity.test.js  # Forge product builder
```

### Preflight

```bash
npm run preflight
```

> **Note:** One integration test is intentionally skipped unless
> `V1_INTEGRATION=1` is set and v1 is running.

### CI Guardrails
- **core-guardrails.yml**: Blocks v1 drift vs `v1.0.0-ephemeral`
- **invariant-tests.yml**: Protects constitutional compliance

All tests must pass before merge.

---

### Governance Metrics (Read-Only)

The system exposes read-only territory metrics derived from DecisionCard, FeedbackContext, and AdminActionLog—without modifying verification logic.

Endpoints:
- GET /gov/territory/:id/metrics?window=24h|7d|30d
- GET /gov/territory/:id/metrics/history?window=…&limit=…
- GET /gov/metrics?window=…

Guarantees: deterministic aggregation, recomputable cache, no VAC/ingestion writes.
Tag: territory-governance-metrics-v1

### Governance Queues (Read-Only)

The system exposes read-only moderator queues derived from existing projections.
These endpoints do not mutate state and may return empty results when no data
sources are wired.

Endpoints:
- GET /gov/territory/:id/queues?queue=...
- GET /gov/moderator/:id/queues?queue=...

Queue types:
paused_by_ops, blocked, needs_refresh, needs_second_source, none

Guarantees:
- Deterministic ordering
- Leak-safe QueueItem projection (no VAC reason codes or ops internals)
- Read-only selectors; no writes
Tag: territory-governance-queues-v1

---

## License

[Add your license here]

---

## Support

For questions or issues, see [DOCTRINE.md](DOCTRINE.md) and [SCOUT_INTEGRATION.md](SCOUT_INTEGRATION.md).

**If your question requires violating a non-negotiable, the answer is no.**
