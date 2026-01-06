# Repository Structure — Semantic Boundaries

## Purpose
This structure enforces architectural constraints mechanically. Folders are not just organization—they are semantic boundaries with enforced rules.

## Structure

```
llmpire-4data/
├── src/
│   ├── v1/                # v1 core (FROZEN, ephemeral)
│   │   ├── index.js
│   │   ├── interceptor.js
│   │   ├── delta.js
│   │   ├── stream.js
│   │   └── cli/
│   ├── magnets/           # routing primitives (pure)
│   ├── lanes/             # categorical substreams
│   ├── bridge/            # observers + viewport
│   ├── adapters/          # external stream observers
│   ├── decay/             # bounded pressure memory
│   ├── digest/            # informational digests (read-only)
│   ├── forge/             # snapshot → derived products
│   ├── composer/          # signals → natural language
│   ├── products/          # product code (future)
│   ├── llmpire/           # LLM-facing logic (future)
│   └── ui/                # UX layer (future)
│
├── data-products/         # Product contracts & one-pagers
│   ├── regional_capacity_signal.v1.md
│   └── REGIONAL_CAPACITY_SIGNAL_ONE_PAGER.md
│
├── .vscode/               # Tooling enforcement
│   ├── extensions.json    # Required extensions
│   ├── settings.json      # Persistence bans
│   └── extensions.txt     # Bulk install list
│
├── .github/workflows/     # CI guardrails
│   └── core-guardrails.yml
│
├── V1_LOCK.md             # Constitutional guarantees
├── CONSUMER_CONTRACT.md   # /stream contract
├── RUNTIME_CONTRACT.md    # v1 behavior invariants
├── PORTS.md               # Port ownership
├── DATA_PRODUCTS.md       # Product catalog
└── README.md              # Core rule
```

## Boundary Rules

### `src/v1`
- **Allowed**: Native Node modules only (`http`, `events`)
- **Forbidden**: `fs`, `sqlite`, any persistence layer
- **Enforced by**: ESLint + CI
- **Philosophy**: Ephemeral only. Process death = data death.

### `src/magnets`
- **Allowed**: Pure routing; no side effects
- **Forbidden**: Aggregation, persistence
- **Philosophy**: Deterministic classification into lanes

### `src/lanes`
- **Allowed**: Lane-local logic
- **Forbidden**: Cross-lane mixing unless explicit aggregation layer
- **Philosophy**: Independent TTL and snapshot rules

### `src/adapters`
- **Allowed**: Observe external streams; emit lane-tagged signals; rate limiting; error handling
- **Forbidden**: Per-user queries; persistence; lane mixing; raw payload emission
- **Enforced by**: Adapter spec + registry validation
- **Philosophy**: Extend sensory surface without violating doctrine (ephemeral, lane-scoped, honest)

### `src/decay`
- **Allowed**: In-memory pressure scores; exponential decay; bounded counters; lane+region keying
- **Forbidden**: Raw event storage; replay capability; unbounded growth; cross-lane access
- **Enforced by**: Invariant tests + LRU eviction
- **Philosophy**: Bounded pressure memory strengthens answers without storage

### `src/digest`
- **Allowed**: Read-only consumption of bridge APIs; idempotent weekly digest logging
- **Forbidden**: Persistence, mutation of v1/bridge state, automated capture beyond snapshots
- **Philosophy**: Informational-only reporting with explicit leader gating

### `src/forge`
- **Allowed**: Snapshot-only inputs; derived aggregates; deterministic transforms; product schemas
- **Forbidden**: Live stream access, raw event storage, replay capability, upstream writes
- **Philosophy**: Snapshots → sellable products; no authority, no capture

### `src/composer`
- **Allowed**: Snapshot+product+decay → natural language; hedging phrases; deterministic output
- **Forbidden**: Fact invention, directives ("you should"), personalization, future claims
- **Enforced by**: Phrase vocabulary + invariant tests
- **Philosophy**: Infrastructure → language while preserving doctrine (no hallucination, silence is valid)

### `data-products/`
- **Allowed**: Aggregation, derivation, non-reversible transforms
- **Forbidden**: Raw event storage, replay mechanisms, identifiers
- **Enforced by**: Contract reviews + schema validation
- **Philosophy**: Derived data only, not access resale.

### `.vscode/`
- **Purpose**: Encode architecture into tooling
- **Enforcement**: Mechanical, not social
- **Philosophy**: Violations surface instantly, not at code review.

### `.github/workflows/`
- **Purpose**: Block core drift
- **Enforcement**: CI fails if v1 changes vs `v1.0.0-ephemeral`
- **Philosophy**: Infrastructure frozen forever.

## Lane Taxonomy (Future)

When lanes are implemented, structure will become:

```
src/
├── v1/               # Frozen signal engine
├── magnets/          # Routing primitives (pure functions)
└── lanes/
    ├── capacity/
    ├── prices/
    ├── business/
    └── trend/
```

Each lane:
- Independent TTL
- Independent snapshot rules
- Cannot implicitly mix
- Explicit aggregation only

## Tooling Integration

VS Code understands this structure semantically via:
- `settings.json` → forbids imports
- `extensions.json` → recommends Error Lens, ESLint
- ESLint boundaries → enforces folder rules

## Violation Examples

❌ **Forbidden** (will error):
```javascript
// src/delta.js
import fs from 'fs';  // ERROR: persistence forbidden
```

✅ **Allowed**:
```javascript
// data-products/forge.js
import fs from 'fs';  // OK: forge may write products
```

## Next Evolution

When magnets + lanes land:
1. Add `src/magnets/` (pure routing functions)
2. Add `src/lanes/` (categorical substreams)
3. Update ESLint to enforce lane isolation
4. Update CI to validate magnet purity

This keeps the architecture mechanically enforceable as it grows.
