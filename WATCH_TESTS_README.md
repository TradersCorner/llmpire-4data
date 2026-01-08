# Stream v1 Watch System - Regression Guard Suite

## Quick Start

```bash
# Run all watch system regression tests
npm run test:watch

# Run individual tests
node test-watch-scope-isolation.js
node test-watch-counters.js
node test-watch-memory-bounds.js
```

## What This Guards Against

### 1. Filter Scope Leakage
**Regression**: Panel filters and watch filters mixing, causing confusion
**Guard**: `test-watch-scope-isolation.js`
**Symptoms if broken**: Toggling lanes affects watch filter, or vice versa

### 2. Counter Corruption
**Regression**: receivedCount/acceptedCount/watchMatchedCount not updating correctly
**Guard**: `test-watch-counters.js`
**Symptoms if broken**: "No signals" but counters show received=0 when stream is actually working

### 3. Memory Leaks
**Regression**: feed/recs/chat collections grow unbounded
**Guard**: `test-watch-memory-bounds.js`
**Symptoms if broken**: Browser tab crashes after hours of streaming

## Integration with CI/CD

### Preflight Check
Added to `npm run preflight`:
```json
"preflight": "npm run check && npm run test && npm run test:watch && npm run audit:lisa"
```

Runs before:
- GOV proof generation
- Production deployments
- Any "ship checklist" validation

### Failure = No Ship
If any test fails, preflight exits with code 1, blocking:
- `npm run gov:prove`
- Any automation that depends on preflight
- Manual ship checklist completion

## Runtime Diagnostics

### Dev Mode Self-Check
Every 10s in browser console (localhost only):
```
[WATCH SELF-CHECK] connected=true | received=127 | accepted=84 | watchMatched=12 | lastSignal=3s ago
```

### UI Filter Status
Shows current state above stream health:
```
Panel: PRICES+CAPACITY | tags: prices:energy, info:macro +2 more | asset: oil
Watch: entity contains "oil"
```

### Stream Health Bar
Shows live counters:
```
Connected | Last: 10:42:15 AM | Received: 127 | Accepted: 84 | Watch matched: 12
```

## Test Coverage

### Scope Isolation (12 assertions)
- Watch filter mutations don't affect panel filter
- Panel filter mutations don't affect watch filter
- Verified across: tags, lanes, asset, watch kind, watch value

### Counter Correctness (3 assertions)
- Received = all signals
- Accepted = signals passing panel filter
- Watch matched = signals passing both filters

### Memory Bounds (11 assertions)
- Feed capped at 500 under burst and sustained load
- Recs capped at 200 under burst and sustained load
- Chat capped at 200 under burst and sustained load
- Newest/oldest items correctly positioned
- Caps hold through 1000+ signal stream

## Why This Works

### Deterministic
Tests use exact same filter logic as production code:
- `norm()` for string normalization
- `matchMode()` for exact/startsWith/contains
- `passesPanelFilter()` and `matchesWatchFilter()` from dashboard

### Fast
All tests run in <1 second total:
- No network calls
- No file I/O
- Pure in-memory validation

### Comprehensive
Covers the 3 failure modes that would silently regress:
1. Filters coupling (scope leak)
2. Counters breaking (false negatives)
3. Memory growing (production crash)

## Deployment Checklist

Before shipping any dashboard changes:
- [ ] Run `npm run test:watch` → all pass
- [ ] Run `npm run preflight` → all pass
- [ ] Start app, open browser console → see self-check logs
- [ ] Verify filter status shows current state
- [ ] Toggle filters, observe counters update
- [ ] Type `watch oil`, verify watch status updates

## Maintenance

### When to Update Tests

**Add assertions when**:
- Adding new filter types (e.g., "watch tag:prices:energy")
- Adding new collection types (e.g., alerts, bookmarks)
- Changing filter logic (e.g., adding regex support)

**Don't update tests when**:
- Changing UI styling
- Adding unrelated features
- Refactoring without changing behavior

### Test Philosophy
These tests lock *behavior*, not *implementation*.
Refactor freely, but if tests break, behavior changed.

## Known Gaps (Intentional)

### Not Tested
- Actual SSE connection (integration test territory)
- UI rendering (DOM manipulation)
- Spam control timing (flaky in unit tests)
- Browser-specific quirks

### Why Not
These are **regression guards**, not **integration tests**.
Goal: prevent "worked yesterday, broke today" on core logic.
SSE/UI tested manually or via separate integration suite.

## Ship Confidence

You can ship with confidence because:
1. **Tests run in preflight** → blocks broken builds
2. **Tests are deterministic** → no flakes, no false positives
3. **Tests match production** → same filter logic, same bounds
4. **Runtime diagnostics** → instant diagnosis if tests miss something

If a regression occurs, at least one of these catches it before users see it.
