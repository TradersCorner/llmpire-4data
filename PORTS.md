# 4data Port Allocation (Canonical)

This document defines **non-negotiable port ownership** for 4data.

## Reserved Ports

- **3000**
  - 4data v1 canonical runtime
  - SSE, ephemeral state, contracts-only
  - No UI surfaces
  - No secondary services bind here

- **3001**
  - Bridge (lane-aware observer)
  - Lane-scoped API, snapshot endpoint
  - Read-only queries

- **3002**
  - Digest health endpoint
  - `/health-digest` only
  - Scheduler status, leader flag, next/last run

## Explicitly Forbidden

- **4000**
  - Never used by 4data
  - Known to be used by other apps (e.g. MealScout dev servers)
  - Prevents UI/process ambiguity during local development

## Rule

If a bridge, dashboard, or tool needs a port:
- It MUST NOT reuse 3000 or 4000
- It must declare its port explicitly
- Port ownership is considered part of the contract

Port collisions are treated as runtime violations, not bugs.
