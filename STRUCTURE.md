# Repository Structure — Semantic Boundaries

## Purpose
This structure enforces architectural constraints mechanically. Folders are not just organization—they are semantic boundaries with enforced rules.

## Structure

```
llmpire-4data/
├── src/                    # v1 core (FROZEN, ephemeral only)
│   ├── index.js           # HTTP server
│   ├── interceptor.js     # Request handler
│   ├── delta.js           # Delta extraction
│   ├── stream.js          # SSE broadcaster
│   └── cli/               # Reference consumers
│
├── data-products/         # Product contracts & forge (derived only)
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

### `src/` (v1 Core)
- **Allowed**: Native Node modules only (`http`, `events`)
- **Forbidden**: `fs`, `sqlite`, any persistence layer
- **Enforced by**: ESLint + CI
- **Philosophy**: Ephemeral only. Process death = data death.

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
