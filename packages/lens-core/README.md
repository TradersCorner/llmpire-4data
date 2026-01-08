# @lisa/lens-core

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
