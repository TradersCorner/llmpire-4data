# LISA Monorepo Structure

This repository contains both the existing 4data v1 system and the new LISA Lens packages.

## Directory Structure

```
/src/               → 4data v1 (SSE stream, governance, lanes, digest)
/packages/
  /lens-shared/     → Shared types, matchers, evidence pack schema
  /lens-core/       → Local daemon (proxy server + fact store + verifier)
  /lens-ext/        → Browser extension (UI injection + route-through)
/DOCS/              → Architecture docs (see LISA_LENS_OVERVIEW.md)
/test-*.js          → Watch regression tests (7 suites, 53 assertions)
```

## Running the System

### Existing 4data v1 (unchanged)
```bash
npm start           # v1 stream on :3000
npm run bridge      # bridge service
npm run digest      # digest service
npm test            # existing tests
npm run preflight   # full preflight checks
```

### LISA Lens (new)
```bash
npm run lens:core       # start local daemon on :3001
npm run lens:ext:dev    # build extension in watch mode
npm run lens:test       # run lens-specific tests
npm run dev:all         # run v1 + lens-core together
```

## Package Boundaries

- **src/**: V1 stream, governance, all existing APIs → **unchanged**
- **packages/lens-shared/**: Pure functions, schemas → **no side effects**
- **packages/lens-core/**: Local HTTP server → **read-only consumer of v1 stream**
- **packages/lens-ext/**: Browser extension → **calls lens-core only**

## Fail-Safes

✅ Old workflows continue working without Lens installed  
✅ `npm start` unchanged, still runs v1 stream  
✅ Existing tests still pass (watch regression suite)  
✅ Lens packages isolated (can be deleted without breaking v1)

## Documentation

See [DOCS/LISA_LENS_OVERVIEW.md](DOCS/LISA_LENS_OVERVIEW.md) for full architecture, routing, and design principles.

## CI Strategy

Two separate CI jobs:
1. **v1 invariants**: Runs existing tests + watch regression suite
2. **Lens tests**: Runs lens-shared + lens-core tests

Both must be green to merge.
