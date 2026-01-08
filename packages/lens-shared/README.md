# @lisa/lens-shared

Shared types, schemas, and filter matchers for LISA Lens.

## What it contains

- **Signal types**: `LaneTypes`, `TagTypes`
- **Filter matchers**: `passesPanelFilter`, `matchesWatchFilter` (pure functions from dashboard)
- **Evidence pack**: `buildEvidencePack`, `tagClaim`
- **Normalization**: `norm` (case-insensitive string matching)

## Usage

```javascript
import { matchesWatchFilter, buildEvidencePack } from '@lisa/lens-shared';

const watchFilter = { kind: "entity", value: "oil", mode: "contains" };
const signal = { lane: "PRICES", entity: "crude oil", delta: +5 };

if (matchesWatchFilter(signal, watchFilter)) {
  const evidence = buildEvidencePack([signal], "What's the price of oil?");
  console.log(evidence);
}
```

## Design principles

- **Pure functions only**: No side effects, no state
- **No dependencies**: Zero npm deps (just Node builtins)
- **Extracted from dashboard**: Logic matches existing watch system exactly

## Testing

```bash
npm test
```

Tests verify:
- Filter matching correctness (entity/lane/any modes)
- Evidence pack structure
- Claim tagging logic
