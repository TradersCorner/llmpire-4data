# GOV Queues Live Data Proof

**Machine-enforced proof that GOV queues return real, non-empty data.**

## Prerequisites

**Real claims must exist:**
- File: [data/claims/real-claims.ndjson](data/claims/real-claims.ndjson)
- Must contain at least one claim with `subjectId` (becomes `territoryId`)

## Run the proof

```powershell
# 1. Generate exports from real claims
Get-Content -Encoding utf8 data\claims\real-claims.ndjson | node scripts\gov\export-ndjson.mjs

# 2. Run machine-enforced proof
npm run gov:prove
```

## Expected output

```
[smoke] live OFF shape=object(queues,territoryId) totalItems=0
[smoke] live ON shape=object(queues,territoryId) totalItems=1
[smoke] PASS: live ON has 1 queue items (non-empty requirement met)
[smoke][PASS] GOV queues contract stable; live toggle loads real data
```

**Exit code:** 0 (success)

## Troubleshooting

**If ON returns 0 items:**

1. **Check decision_card has territoryId:**
   ```powershell
   Get-Content data\gov\decision_card.latest.ndjson | Select-Object -First 1
   ```
   Must contain: `"territoryId":"county:12033"` (or similar)

2. **Check decisionId overlap:**
   ```powershell
   # Extract decisionIds from both files
   $cards = Get-Content data\gov\decision_card.latest.ndjson | ConvertFrom-Json | Select -ExpandProperty decisionId
   $queues = Get-Content data\gov\admin_queue.latest.ndjson | ConvertFrom-Json | Select -ExpandProperty decisionId
   Compare-Object $cards $queues -IncludeEqual
   ```
   Must have at least one `==` (equal) match

3. **Check env vars:**
   - `GOV_QUEUES_LIVE=1` must be set
   - Paths in `.env.gov` must point to correct NDJSON files

4. **Re-run export pipeline:**
   ```powershell
   # Clear old exports
   Remove-Item data\gov\*.latest.ndjson -ErrorAction SilentlyContinue
   
   # Regenerate
   Get-Content -Encoding utf8 data\claims\real-claims.ndjson | node scripts\gov\export-ndjson.mjs
   
   # Retry proof
   npm run gov:prove
   ```

## What it proves

✅ **GOV_QUEUES_LIVE=0**: Returns empty queues (placeholder mode)  
✅ **GOV_QUEUES_LIVE=1**: Loads real decision cards + admin queues from NDJSON exports  
✅ **Non-empty enforcement**: `--require-nonempty` flag fails if live ON returns 0 items  
✅ **Contract stability**: Shape matches between OFF and ON modes  
✅ **Real data flow**: Claims → VAC → decision cards → admin queues → GOV API → HTTP response

## Regression guards

Tests ensure the fix stays fixed:

- [tests/gov-route-decoding.test.mjs](tests/gov-route-decoding.test.mjs) - GOV routes decode URL-encoded territoryIds  
- [tests/gov-smoke-contract.test.mjs](tests/gov-smoke-contract.test.mjs) - Smoke uses free port + strong readiness

Run: `npm test`

## Technical details

**Smoke script fixes (Jan 7, 2026):**
- Spawns `node src/v1/index.js` directly (not `npm start`)
- Allocates free port via `getFreePort()` → no port collisions
- Waits for exact "4data listening on http://localhost:${port}" before querying
- Passes `PORT` env var to child process
- Result: smoke always queries the server it spawned (not a random service on port 3000)

**v1 server changes:**
- Listens on `process.env.PORT || 3000`
- Decodes `territoryId` and `moderatorId` from URL segments via `decodeURIComponent()`
- Result: `county%3A12033` → `county:12033` → correct matching

---

**Last verified:** January 7, 2026  
**Proof status:** ✅ PASS (automated, machine-enforced)

