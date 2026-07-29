# Chrome Operator Validation Runbook

> Status: **UNEXECUTED RECOVERY RUNBOOK.** The automated checks validate the
> daemon, header-only default, and text-only overlay rendering. They do not
> prove that this Chrome workflow has been completed. Record dated browser
> evidence before changing this status.

## Prerequisites
- Chrome browser with Developer Mode enabled
- v1 stream running on port 3000
- lens-core built and ready to start

---

## Step A: Get Extension ID First

1. **Open Chrome** → `chrome://extensions`
2. **Enable "Developer mode"** (toggle in top-right)
3. **Click "Load unpacked"** → Navigate to `packages\lens-ext`
4. **Copy the Extension ID** from the card (looks like `abcdefghijklmnopqrstuvwxyz123456`)

---

## Step B: Update .env with Extension ID

Open `packages/lens-core/.env` and replace `REPLACE_WITH_ACTUAL_ID`:

```env
LENS_ALLOWED_ORIGINS=http://localhost:3000,chrome-extension://YOUR_ACTUAL_EXTENSION_ID
```

**Verify these settings:**
```env
LENS_ALLOW_QUERY_TOKEN=false
LENS_TOKEN=lens-proof-token-2026
```

---

## Step C: Start Services

**Terminal A** (v1 stream):
```powershell
npm start
```

**Terminal B** (lens-core):
```powershell
cd packages\lens-core
npm start
```

**Expected output in Terminal B:**
```
lens-core listening on :3001
upstream default openai
```

---

## Step D: Inspect Service Worker Console

1. In `chrome://extensions`, find **LISA Lens**
2. Click **"Service worker"** link → Opens DevTools for background script

**Inspect:**
- The service worker stays active while the stream is open.
- The Network panel shows `GET /lens/stream` returning HTTP 200.
- The overlay status changes as `status` and `fact` events arrive.

The current service worker does not emit dedicated connection or
authorization log messages. Do not claim those logs as evidence.

**Common errors:**
- `401/403` → Token missing or wrong
- `CORS error` → Extension ID not in `LENS_ALLOWED_ORIGINS`

---

## Step E: Verify Overlay Receives Messages

1. **Open a target site** (chatgpt.com, claude.ai, gemini.google.com, or perplexity.ai)
2. **Open the LISA Lens overlay**
3. **Open DevTools** on that page (F12) → Console tab

**Expected:**
- Status line updates every 1 second:
  - `connected: true, received: N, last: X ms ago`
  - Totals and age of last signal
- When v1 emits facts: fact notices appear

---

## Step F: Setup PowerShell Session

In a **new PowerShell terminal** (workspace root):

```powershell
cd C:\Users\FlavorGood\Documents\AAATraderCorner\TradeScout\llmpire-4data
$token = (Get-Content -Raw packages\lens-core\.env | Select-String -Pattern '^LENS_TOKEN=').Line.Split('=',2)[1].Trim()
```

This extracts the token from .env (no hardcoding, no leaks).

**Verify token extracted:**
```powershell
$token
```

Should output: `lens-proof-token-2026`

---

## Step F2: Prove Headers-Only is Enforced

**Negative test** - should fail without Authorization header:

```powershell
try {
  Invoke-RestMethod -Method Get -Uri http://localhost:3001/lens/watch
} catch {
  $_.Exception.Message
}
```

**Expected:** 401 Unauthorized error

**KPI:** Request fails without Authorization header (proves headers-only enforcement).

---

## Step G: Deterministic Watch Match Test

### G1) List Recent Facts (Deterministic Entity Source)

```powershell
$facts = Invoke-RestMethod -Method Get -Uri "http://localhost:3001/lens/facts?limit=10" `
  -Headers @{Authorization=("Bearer " + $token)}

$facts
```

**Output structure:**
```json
{
  "facts": [
    {
      "factId": "...",
      "receivedAt": "...",
      "entity": "WTI",
      "asset": "crude",
      "symbol": "CLF5",
      "payload": {...}
    }
  ],
  "stats": {
    "connected": true,
    "received": 123,
    "lastSignalAt": "..."
  }
}
```

**Pick an entity** from the results. Example:
```powershell
# View all entities
$facts.facts | Select-Object entity, asset, symbol

# Pick one (e.g., first fact with an entity)
$targetEntity = $facts.facts | Where-Object { $_.entity } | Select-Object -First 1 -ExpandProperty entity
$targetEntity
```

---

### G2) Create a Watch for That Entity

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/lens/watch `
  -ContentType "application/json" `
  -Headers @{Authorization=("Bearer " + $token)} `
  -Body ('{"kind":"entity","value":"' + $targetEntity + '","mode":"contains"}')
```

**Expected response:**
```json
{
  "id": "...",
  "kind": "entity",
  "value": "WTI",
  "mode": "contains"
}
```

---

### G3) Verify the Watch Exists

```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:3001/lens/watch `
  -Headers @{Authorization=("Bearer " + $token)}
```

**Expected:** List includes the watch you just created.

---

### G4) Wait for Watch Match

**Within 60 seconds**, when v1 emits a fact containing that entity:
- **Service Worker console** will log `watch_match` event
- **Overlay** should show a `watch_match` notice

**KPI:** `watch_match` appears deterministically without guessing.

---

## Step H: Verify Token Storage (Service Worker Console)

**CRITICAL:** Don't check page DevTools → Application → Storage. That's the wrong place.

**Correct location:**

1. `chrome://extensions` → **LISA Lens** → **Service worker** → Inspect
2. In the **Console tab**, run:

```javascript
chrome.storage.local.get(null).then(console.log)
```

**Expected output:**
```javascript
{LENS_TOKEN: "lens-proof-token-2026"}
// or
{lensToken: "lens-proof-token-2026"}
```

If the token is missing, the overlay should prompt you to enter it on first use.

---

## Step I: Test Send Through LISA Button

1. **Type a prompt** in the AI UI (e.g., "What is happening with oil prices?")
2. **Click "Send through LISA"** button
3. **Check overlay** for:
   - Evidence pack building
   - Facts selected
   - Upstream response

---

## Troubleshooting Order

Check in this order:

1. **Health check**:
   ```powershell
   Invoke-RestMethod -Uri http://localhost:3001/health
   ```
   Shows `connected: true` and `received > 0`?

2. **Service worker console**: Shows `SSE connected (HTTP 200)` and no 401/403?

3. **CORS**: Does `LENS_ALLOWED_ORIGINS` include your exact extension ID?

4. **Token in chrome.storage**: Run `chrome.storage.local.get(null).then(console.log)` in SW console?

5. **v1 stream live**: Terminal A shows v1 emitting facts?

---

## Final Checklist

- [ ] Extension loads successfully
- [ ] Service worker Network panel shows `/lens/stream` HTTP 200
- [ ] Overlay receives status updates
- [ ] Token present in `chrome.storage.local`
- [ ] Headers-only enforcement verified (401 without auth)
- [ ] `/lens/facts` returns recent facts with entities
- [ ] Watch created successfully
- [ ] `watch_match` notice appears in overlay
- [ ] "Send through LISA" button works

---

## When All Green

Reply **"Chrome proof passed"** to proceed with polish:
- Reconnect button on SSE error
- watch_match toast notifications (rate-limited)
