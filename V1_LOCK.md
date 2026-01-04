# 4data v1 Lock: Ephemeral-Only Core

This document freezes the core guarantees of 4data v1.
These rules are constitutional and MUST NOT be broken.

## Hard Guarantees

- No disk writes of payloads, states, or events.
- No databases (SQL, NoSQL, KV, caches) for payloads or state.
- No replay buffers, queues, or logs that can reconstruct history.
- Process death = data death (no recovery after restart).
- All state is in-memory and overwrite-only.
- SSE `/stream` is **read-only** forever (subscribe-only).
- SSE does **not** support queries, filters, or history.

## Network Behavior

- `POST /request` reads payloads in-flight, once, in memory.
- Parsed payloads are never logged, persisted, or replayed.
- Only derived deltas are emitted to the stream.

## Stream Semantics

- There is at most one current state per signal type.
- New state overwrites old state; no history is retained.
- Expiry (TTL) fully deletes current state from memory.
- After expiry, consumers must treat the state as unknown.

## Contribution Rules

- Any proposal that adds storage MUST be a separate system.
- Any proposal that adds delivery guarantees MUST be opt-in and external.
- New features MUST NOT weaken or bypass these guarantees.

If a future change conflicts with this file, **this file wins**.
