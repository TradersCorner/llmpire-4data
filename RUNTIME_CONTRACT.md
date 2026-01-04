# 4data v1 Runtime Contract (Canonical)

This contract describes the ONLY supported runtime behavior for 4data v1.
v1 is immutable; all extensions live outside v1.

## What v1 is
- An ephemeral signal processor
- In-flight input read
- Delta-only output
- SSE is the output side-channel
- Process-death = data-death (no persistence)

## Ports (see PORTS.md)
- 3000: reserved for v1 runtime
- 4000: forbidden for 4data
- Bridges/tools MUST choose their own port and document it

## Supported surfaces
### GET /stream
- SSE endpoint
- Emits:
  - hello (on connect)
  - state_update (only when derived signal changes)
  - state_expired (after TTL expires)
- No client action may cause writes outside v1 memory

### POST input (in-flight)
- Accepts runtime signal input
- Always returns a clean HTTP surface:
  - {"status":"ok"}
- No payload reflection
- No state echo
- No debug leaks

## Core invariants (non-negotiable)
- No database writes
- No filesystem writes
- No UI
- No background persistence
- Delta-only emission (no repeats for identical state)
- Expiry is in-memory only
- If the process stops, state disappears (no "catch-up")

## Forbidden changes
- Adding any UI to v1
- Adding storage/persistence
- Returning derived state in HTTP responses
- Introducing ports other than 3000 for v1
- Any bridge/tool modifying v1 behavior or contracts

## Extension rule
All future work (bridges, dashboards, TradeScout wiring) must:
- depend only on /stream
- remain read-only with respect to v1
- live on separate ports/repos or clearly separated layers
