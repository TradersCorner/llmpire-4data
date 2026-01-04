# 4data-bridge-metrics v0  Consumer Contract

This bridge is a **derived observer** for `4data v1.0.0-ephemeral`.
It subscribes to the read-only SSE stream and produces **secondary metrics**.
It does **not** modify or depend on internal behavior of v1.

This contract is explicitly **observer-relative**:

- Metrics describe only what this observer saw.
- No completeness or global accuracy is implied.
- The bridge is replaceable; deleting or rebuilding it must not require changes to v1.

## Purpose

Transform `/stream` events into derived metrics (counts and durations) for observability.

## Inputs

- SSE: `GET /stream` on a running 4data v1 instance.
- Event types (as defined and frozen by v1):
  - `hello`: `{ connectedAt: number }`
  - `state_update`: `{ region: string, signal: string, expiresAt: number }`
  - `state_expired`: `{ expiredAt: number }`

## Outputs

- Metrics snapshots printed to **stdout**.
- Metrics snapshots appended as JSON Lines to `metrics.jsonl` in this folder.

Each snapshot has the shape:

```json
{
  "at": "2026-01-04T18:59:00.000Z",
  "reason": "state_update" | "state_expired" | "hello",
  "updates_total": 3,
  "expires_total": 2,
  "last_active_duration_ms": 30512,
  "uptime_ms": 123456
}
```

## What the Bridge MAY Assume

- `/stream` follows the 4data v1 consumer contract.
- Event payloads conform to the shapes above.
- Connections may drop and be re-established.
- TTL (`expiresAt`) is authoritative for when v1 considers state expired.

## What the Bridge MUST NOT Assume

- That it will see **every** event.
- That every `state_update` is followed by a `state_expired` (process crashes, restarts).
- That event timing is precise (network and processing jitter exist).
- That v1 provides any replay or history.

## What the Bridge Guarantees (Locally Only)

- Metrics reflect **only what this observer instance has seen** (observer-relative truth).
- Within a single process lifetime, counters (`updates_total`, `expires_total`) are monotonic.
- Any persistence (`metrics.jsonl`) is bridge-owned and replaceable.

## Versioning

- This contract applies to **4data-bridge-metrics v0**.
- Changes here do **not** imply changes to 4data v1.
- 4data v1 changes do **not** imply changes here (unless v1 breaks its own event shapes).
