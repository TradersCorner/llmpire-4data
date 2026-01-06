# Bridge

Lane-aware observer for v1 SSE stream.

## Responsibilities
- Subscribe to v1 `/stream`
- Index events by lane
- Expose lane-scoped API
- Reject events without valid lanes
- Enforce invariant: no event exists outside a lane bucket

## Architecture
- **Storage**: In-memory `Map<lane, Event[]>`
- **Ingestion**: Lane validation at entry; drop invalid/missing lanes
- **API**: Lane-scoped queries only; no "all lanes" default
- **Port**: 3001 (v1 owns 3000)

## API Endpoints

### `GET /signals?lane=<lane>`
Returns events for the specified lane.

**Query params:**
- `lane` (required): must be one of the registry lanes

**Response:**
```json
{
  "lane": "capacity",
  "events": [...],
  "count": 5
}
```

**Errors:**
- `400` if lane is missing or invalid

### `GET /lanes`
Returns summary of all lanes.

**Response:**
```json
{
  "lanes": {
    "capacity": { "count": 5, "description": "..." },
    "prices": { "count": 0, "description": "..." }
  }
}
```

### `POST /snapshot`
Lane-scoped temporal slice with hard boundary enforcement.

**Body (all required):**
```json
{
  "lane": "capacity",
  "window": "5m",
  "intent": "answer_user_query"
}
```

**Parameters:**
- `lane` (required): must be one of the registry lanes
- `window` (required): `1m` | `5m` | `15m` | `1h`
- `intent` (required): non-empty string describing purpose

**Response:**
```json
{
  "lane": "capacity",
  "window": "5m",
  "intent": "answer_user_query",
  "generatedAt": "2026-01-05T19:54:21.083Z",
  "count": 3,
  "events": [
    {
      "signal": "capacity_tightening",
      "region": "PGC",
      "expiresAt": "...",
      "receivedAt": "..."
    }
  ]
}
```

**Errors:**
- `400` if lane, window, or intent missing/invalid
- Snapshot exists only in response (no persistence)

## Invariants
- Every ingested event MUST have a `lane` field
- Lane MUST be in the canonical registry
- Events without valid lanes are logged and dropped
- No cross-lane mixing; buckets are isolated

## Usage
```bash
node src/bridge/index.js
```

Then query:
```bash
curl http://localhost:3001/signals?lane=capacity
curl http://localhost:3001/lanes
```
