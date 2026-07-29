# LISA Lens Core

Operator-grade proof and production habits for header-only auth and SSE.

## Quick Start (Two Terminals)

Terminal A (v1):

```powershell
npm start
```

Terminal B (lens-core):

```powershell
cd packages\lens-core
npm run build
npm start
```

## Health (no token)
Open http://localhost:3001/health

KPI: `connected=true` when v1 stream reachable; `received` increments as facts arrive.

## SSE (header-only, production-safe)
Use headers (no query tokens):

```powershell
curl -N -H "Authorization: Bearer YOUR_TOKEN" "http://localhost:3001/lens/stream"
```

Expected:
- `status` events every 1s
- `fact` events when v1 emits
- `watch_match` when a watch hits

## Watch (header token)
```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/lens/watch `
  -ContentType "application/json" `
  -Headers @{Authorization="Bearer YOUR_TOKEN"} `
  -Body '{"kind":"entity","value":"oil","mode":"contains"}'
```

## Answer (assist)
```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/lens/answer `
  -ContentType "application/json" `
  -Headers @{Authorization="Bearer YOUR_TOKEN"} `
  -Body '{"input":"What changed recently?","mode":"assist","upstream":"openai"}'
```

## Verify (assist)
```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/lens/verify `
  -ContentType "application/json" `
  -Headers @{Authorization="Bearer YOUR_TOKEN"} `
  -Body '{"text":"Summarize the last changes and cite what supports it.","mode":"assist","upstream":"openai"}'
```

## Strict Refusal
```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/lens/answer `
  -ContentType "application/json" `
  -Headers @{Authorization="Bearer YOUR_TOKEN"} `
  -Body '{"input":"What changed recently?","mode":"strict","upstream":"openai"}'
```
KPI: If evidence is empty, strict refuses.

## Production Habits
- Set `LENS_ALLOW_QUERY_TOKEN=false` to disable `?token=`.
- Use headers (`Authorization: Bearer`) for all clients (extension/apps).
- Keep `LENS_ALLOWED_ORIGINS` to `http://localhost:3000` plus exact `chrome-extension://<ID>` only.

## CI (deterministic)
Run:
```bash
npm run ci:lens
```
This builds lens-core, starts it with a temp token and headers-only, waits for `/health`, then runs tokenized smoke tests.# @lisa/lens-core

Local daemon: proxy server + fact store + verifier for LISA Lens.

## What it does

- Runs HTTP server on port 3001
- Subscribes to 4data v1 SSE stream (localhost:3000/stream)
- Builds in-memory fact store (recent 500 signals)
- Exposes `/lens/answer` for verified question answering
- Exposes `/lens/stream` for filtered SSE
- Proxies `/v1/*` for backwards compatibility

## Running

```bash
npm start
# or with custom config
LENS_PORT=3001 UPSTREAM_STREAM=http://localhost:3000/stream npm start
```

## Endpoints

### `POST /lens/answer`
Verified question answering with evidence pack.

Request:
```json
{
  "query": "What's the price of oil?",
  "mode": "assist"
}
```

Response:
```json
{
  "query": "What's the price of oil?",
  "answer": "...",
  "evidencePack": {
    "signals": [...],
    "verificationTag": "verified"
  },
  "mode": "assist"
}
```

### `GET /lens/stream`
Filtered SSE stream (same format as v1 stream, but filtered by Lens logic).

### `GET /health`
Health check showing fact store status.

## Configuration

Environment variables:
- `LENS_PORT`: Port to listen on (default: 3001)
- `UPSTREAM_STREAM`: URL of v1 SSE stream (default: http://localhost:3000/stream)
- `FACT_STORE_CAPACITY`: Max signals in memory (default: 500)

## Development

```bash
npm run dev    # starts with --watch (auto-reload)
npm test       # run tests
```

## Dependencies

- `express`: HTTP server
- `cors`: CORS middleware
- `@lisa/lens-shared`: Shared matchers and schemas
