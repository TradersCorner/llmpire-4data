# 4data v1 Consumer Contract

This contract defines what downstream consumers of the 4data v1 stream can and cannot assume.
It is intentionally small and restrictive.

## What You CAN Assume

- **Live-only stream**: `/stream` exposes the **current** state and future changes.
- **No history**: you will only ever see "now" and what happens after you subscribe.
- **TTL is authoritative**: when a `state_expired` event fires, that state is gone.
- **Overwrite semantics**: the latest `state_update` replaces the previous one for that signal.
- **Event shapes are stable**:
  - `hello`: `{ connectedAt: number }`
  - `state_update`: `{ region: string, signal: string, expiresAt: number }`
  - `state_expired`: `{ expiredAt: number }`

## What You CANNOT Assume

- **No delivery guarantees**: events may be dropped; you must tolerate gaps.
- **No ordering guarantees beyond "latest wins"**: do not depend on strict sequencing.
- **No persistence**: 4data does not store or replay events for you.
- **No historical queries**: you cannot ask 4data what happened in the past.
- **No filters or queries on `/stream`**: it is subscribe-only, not a query API.

## Recommended Consumer Behavior

- Treat `/stream` as a volatile hint, not an oracle.
- Cache or persist downstream **only in your own system**, if needed.
- Handle disconnects by:
  - reconnecting to `/stream`, and
  - treating the period while disconnected as "unknown" state.
- Use `expiresAt` to clear or downgrade your local view when the signal is stale.

## Versioning

- This contract applies to **4data v1.0.0-ephemeral**.
- Any breaking change to event shapes or semantics MUST bump the version and be documented separately.
