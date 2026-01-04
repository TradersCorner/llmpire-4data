# 4data-bridge-metrics v0

Minimal derived observer for `4data v1.0.0-ephemeral`.

- Subscribes to the read-only SSE `/stream` endpoint.
- Derives simple metrics (counts and durations).
- Prints snapshots to stdout and appends them to `metrics.jsonl`.
- Never writes back to 4data v1.

## Running

Prerequisites:

- `4data v1` server running locally on `http://localhost:3000`.

From this folder:

```bash
npm start
```

This will:

- Connect to `http://localhost:3000/stream`.
- Log connection and metric snapshots to stdout.
- Append snapshots as JSON Lines to `metrics.jsonl`.

See `CONTRACT.md` for the precise observer contract.
