# GOV queues: live data switch (read-only)

## What this does

The `/gov/territory/:id/queues` and `/gov/moderator/:id/queues` endpoints stay contract-locked.
When `GOV_QUEUES_LIVE=1`, they load real `decision_card` + `admin_queue` NDJSON from disk and
pass them into the existing selectors.
When `GOV_QUEUES_LIVE` is unset/false, queues are returned as empty-but-well-formed (baseline
public contract behavior).

## Fastest way to enable live queues

This repo includes an auto-discovery helper that finds the newest real exports:

- PowerShell:
  - `npm run gov:env:ps`
- bash/zsh:
  - `npm run gov:env:bash`

Copy/paste the printed env lines into your terminal, then start the server.

## Required env vars

- `GOV_QUEUES_LIVE` (`1` enables, unset/0 disables)
- `GOV_DECISION_CARDS_PATH` (path to NDJSON/JSONL decision_card export)
- `GOV_ADMIN_QUEUES_PATH` (path to NDJSON/JSONL admin_queue export)

## Safety

- Read-only: no writes, no schema changes.
- Deterministic: readers sort by decisionId and cap results.
- Failure mode: if files can’t be found/read, the helper fails loudly and the server can
  be run with `GOV_QUEUES_LIVE` off.

## Canonical end-to-end proof

- `npm run gov:prove`

This command:
- Runs the real VAC + admin pipelines to export NDJSON under `data/gov/`.
- Generates `.env.gov` pointing at those exports.
- Runs the GOV queues live-toggle smoke test to prove that turning `GOV_QUEUES_LIVE` on
  does not change the HTTP contract shape, only the populated queue contents.
