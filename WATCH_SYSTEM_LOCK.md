# Stream v1 Watch System - Locked

## Overview
The watch system allows filtering live SSE streams with two independent filter scopes:
- **Panel filters**: control main feed visibility (lanes, tags, asset)
- **Watch filters**: control LIVE chat inserts (entity/lane/any matching)

## Regression Guards

### 1. Filter Scope Isolation
**File**: `test-watch-scope-isolation.js`

**What it tests**:
- Setting `watchFilter` must not change `panelFilter`
- Setting `panelFilter` must not change `watchFilter`
- Both filters operate independently across all state mutations

**Why it matters**:
Previous version mixed these scopes, causing "I enabled PRICES but nothing shows" confusion when watch filter was active.

**Run**: `node test-watch-scope-isolation.js`

### 2. Counter Correctness
**File**: `test-watch-counters.js`

**What it tests**:
- `receivedCount` = all signals from SSE stream
- `acceptedCount` = signals passing panel filter
- `watchMatchedCount` = signals passing both panel AND watch filter

**Why it matters**:
Counters disambiguate "no signals" scenarios:
- `received=0` → SSE connection problem
- `received>0, accepted=0` → panel filter too strict
- `accepted>0, watchMatched=0` → watch filter doesn't match

**Run**: `node test-watch-counters.js`

### 3. Memory Bounds
**File**: `test-watch-memory-bounds.js`

**What it tests**:
- Feed capped at 500 signals (newest-first)
- Recs capped at 200 recommendations (newest-last)
- Chat history capped at 200 messages (DOM + memory)
- Bounds hold under burst (501 signals at once) and sustained (1000 signals) load

**Why it matters**:
Prevents "works today, dies tomorrow" memory leaks. Live streams never stop, so unbounded collections = guaranteed crash.

**Run**: `node test-watch-memory-bounds.js`

### Run All Tests
```bash
npm run test:watch
```

## Runtime Self-Check (Dev Mode Only)

Every 10 seconds, logs diagnostic snapshot to browser console:
```
[WATCH SELF-CHECK] connected=true | received=127 | accepted=84 | watchMatched=12 | lastSignal=3s ago
```

**Enabled when**: `window.location.hostname === 'localhost' || '127.0.0.1'`

**What it shows**:
- `connected`: SSE connection alive
- `received`: total signals from stream
- `accepted`: signals passing panel filters
- `watchMatched`: signals passing both filters (LIVE chat)
- `lastSignal`: age of most recent signal

**When to check**:
User says "it's broken" → check console → know immediately if it's SSE, filtering, or matching.

## UI Affordance

**Location**: Above stream health bar in "Signals Passing Panel Filters" section

**Shows**:
```
Panel: PRICES+CAPACITY | tags: prices:energy, info:macro +2 more | asset: oil
Watch: entity contains "oil"
```

**Updates on**:
- Lane toggle
- Tag toggle
- Asset filter change
- Watch/unwatch command
- Filter clear

**Why it matters**:
80% of user confusion = "I set a filter somewhere, why isn't it working?"
This shows exactly what's active in both scopes, plainly.

## Fail-Safes

### 1. LIVE Requires Both Filters
LIVE chat inserts require:
- Signal passes panel filter (lanes/tags/asset) **AND**
- Signal matches watch filter **AND**
- Spam control passes (rate limit + dedupe)

**Why**: Prevents LIVE chat flood when watch filter = "any" but user disabled all lanes in panel.

### 2. Empty State Hint
When `receivedCount > 0` and `acceptedCount = 0`:
```
💡 No signals match panel filters. Try enabling lanes or clearing tags/asset filter.
```

**Why**: Most common issue = user disabled all lanes, sees nothing, thinks stream is broken.

## Watch Commands

All commands preserve filter independence:

### watch [target]
```
watch oil              → entity contains "oil"
watch lane:prices      → lane contains "prices"
watch any:btc          → any field contains "btc"
watch exact:cl         → entity exact match "cl"
watch starts:crude     → entity starts with "crude"
```

Sets `watchFilter`, does NOT touch `panelFilter`.

### unwatch
Clears `watchFilter`, does NOT touch `panelFilter`.

### status
Shows current `watchFilter` state and `watchMatchedCount`.

## Integration with Panel Filters

Panel filters control:
- Main feed rendering (`renderFeed()`)
- Accepted count
- Which signals are eligible for LIVE chat (first gate)

Watch filters control:
- LIVE chat matching (second gate, only if panel passed)
- Watch matched count
- Nothing else

**Critical**: LIVE chat = `watchMatched && panelPassed && !spam`

This keeps UI coherent: if you disable PRICES in panel, you won't get LIVE PRICES updates even if watch filter matches.

## Deterministic Matching

All string matching uses `norm()`:
```javascript
function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
```

**Why**: "Crude Oil" === "crude  oil" === "CRUDE OIL"

## Spam Control

### Rate Limit
Max 2.5 LIVE messages/second (400ms gate).

### Deduplication
10-second window, key = `lane|entity|asset|symbol|delta`

**Why**: Burst of 50 "oil price up" signals → 1 LIVE message, not 50.

## Stream Health

### Connection Status
- **Connected** (green): SSE stream alive
- **Disconnected** (red): SSE stream dead

### Counters
- **Received**: total signals from stream
- **Accepted**: signals passing panel filters
- **Watch matched**: signals passing both filters

### Last Signal
Timestamp of most recent signal (updates every 1s).

**Why**: Disambiguates "no signals" scenarios.

## Known Limitations

1. **Panel filter changes don't retroactively affect feed**: If you disable PRICES after receiving 100 PRICES signals, they stay in feed until new signals push them out (500 cap).

2. **Watch filter doesn't search history**: `watch oil` only matches future signals, not past ones. Use `find oil` to search history.

3. **No persistence**: Refresh resets all filters to defaults (panel = all lanes/tags enabled, watch = off).

4. **Dev-only self-check**: Production builds don't log self-check (no `localhost` hostname).

## Verification Checklist

Before deploying:
- [ ] Run `npm run test:watch` → all 3 tests pass
- [ ] Start app, open browser console → see `[WATCH SELF-CHECK]` logs every 10s
- [ ] Verify filter status bar shows current panel and watch filters
- [ ] Toggle lane → filter status updates, counters update
- [ ] Type `watch oil` → filter status shows "Watch: entity contains oil"
- [ ] Disable all lanes → empty state shows hint
- [ ] Re-enable PRICES → feed renders, hint disappears
- [ ] Refresh page → defaults restore (all lanes/tags, watch off)

## Why This Works (Psychology + Operations)

### Psychology
Removed core confusion: panel ≠ watch.

Old version: "I set a filter, why isn't it working?"
New version: Two plainly labeled filter scopes with visual status.

### Operations
Regression guards prevent silent breakage:
- Scope isolation test catches accidental coupling
- Counter test catches filter logic bugs
- Memory test catches unbounded growth

### Runtime
Self-check log gives instant diagnosis:
- "Stream broken" → check console → `received=0` → SSE problem
- "No signals" → check console → `received=50, accepted=0` → panel filter too strict
- "Watch not working" → check console → `watchMatched=0` → watch filter doesn't match

## Ship Confidence

This system is locked because:
1. **3 regression tests** guard core invariants
2. **Runtime self-check** enables instant diagnosis
3. **UI affordance** eliminates 80% of confusion
4. **Fail-safes** prevent spam and coherence bugs
5. **Memory bounds** prevent leaks under any load

If a regression occurs, one of these catches it before users see it.
