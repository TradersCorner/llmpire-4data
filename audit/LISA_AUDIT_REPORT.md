# LISA / LLMpire Top-to-Bottom Audit Report

**Generated:** 2026-01-06T22:12:57.372Z
**OS:** Windows_NT 10.0.19045 | **Node:** v24.11.1 | **npm:** 11.7.0
**Repo Root:** C:\Users\FlavorGood\Documents\AAATraderCorner\TradeScout\llmpire-4data
**Git Commit:** e1fe1b3eae02ace7df29c16ddae08c1d86d0fe9d
**Git Dirty:** true

## 1) Build & Script Health

- `npm run check`  exit 0
  - stdout: > 4data@1.0.0 check
- `npm run typecheck`  exit 0
  - stdout: > 4data@1.0.0 typecheck
- `npm run lint`  exit 0
  - stdout: > 4data@1.0.0 lint
- `npm run test`  exit 0
  - stdout: > 4data@1.0.0 test
- `npm run build`  exit 0
  - stdout: > 4data@1.0.0 build

## 2) Dependency Risk (npm audit)

- audit ran: true
- vulnerabilities: {"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}

## 3) Environment Keys Used in Code

Found **8** unique env keys.

- `DIGEST_BRIDGE_ORIGIN`
- `DIGEST_DRY_RUN`
- `DIGEST_HEALTH_PORT`
- `DIGEST_LEADER`
- `DIGEST_RECIPIENT`
- `DIGEST_RUN_ONCE`
- `DIGEST_TZ`
- `MY_KEY`

## 4) Secret Scan (Heuristic)

Findings: **3** (possible  verify manually)

- package-lock.json | AWS Secret Key-ish | count=39 | sample=w1WVSUED
- audit\LISA_AUDIT_REPORT.json | AWS Secret Key-ish | count=5 | sample=e1fefe9d
- audit\LISA_AUDIT_REPORT.md | AWS Secret Key-ish | count=1 | sample=e1fefe9d

## 5) Cross-Contamination / Keyword Signals

Keyword counts across text files (helps detect MealScout in TradeScout, etc):

- `mealscout`: 14
- `tradescout`: 31
- `4data`: 120
- `lisa`: 92
- `vac`: 50
- `vua`: 9
- `verify all claims`: 9
- `sidekick`: 25
- `county_metrics`: 9
- `county_entities`: 9
- `county_notes`: 9

Top files by keyword hits (first 25):

- audit\LISA_AUDIT_REPORT.json  {"mealscout":5,"tradescout":12,"4data":24,"lisa":32,"vac":18,"vua":4,"verify all claims":4,"sidekick":8,"county_metrics":4,"county_entities":4,"county_notes":4}
- audit\LISA_AUDIT_REPORT.md  {"mealscout":6,"tradescout":9,"4data":24,"lisa":18,"vac":12,"vua":4,"verify all claims":4,"sidekick":8,"county_metrics":4,"county_entities":4,"county_notes":4}
- scripts\lisa-audit.mjs  {"mealscout":2,"tradescout":2,"4data":1,"lisa":7,"vac":1,"vua":1,"verify all claims":1,"sidekick":1,"county_metrics":1,"county_entities":1,"county_notes":1}
- ADAPTER_SPEC.md  {"tradescout":2,"4data":16}
- package.json  {"4data":1,"lisa":8,"vac":2,"sidekick":2}
- LISA_PERSONAL_ROLLOUT.md  {"lisa":11}
- WHITEPAPER.md  {"4data":8,"vac":2}
- scripts\lisa-check.mjs  {"lisa":9}
- src\vac\cli.ts  {"vac":7}
- tests\vac-invariants.test.mjs  {"vac":6}
- CONSUMER_CONTRACT.md  {"4data":5}
- DOCTRINE.md  {"4data":5}
- PORTS.md  {"mealscout":1,"4data":4}
- README.md  {"tradescout":1,"4data":4}
- src\adapters\README.md  {"4data":5}
- RUNTIME_CONTRACT.md  {"tradescout":1,"4data":3}
- tests\repo-audit-pipeline.test.mjs  {"lisa":4}
- src\vac\model.ts  {"vac":1,"sidekick":3}
- COMPOSER_SPEC.md  {"4data":3}
- src\sidekick\foodtrucks.ts  {"sidekick":3}
- .eslintrc.json  {"4data":2}
- lisa-dashboard.html  {"lisa":2}
- package-lock.json  {"4data":2}
- SCOUT_INTEGRATION.md  {"4data":2}
- V1_LOCK.md  {"4data":2}

## 6) Repo Fingerprints

- package.json sha256: `f3b4d01871fda55fe61151251a77382d5ac80ad27f485a468cb0b7fc95327df4`
- lockfile: `package-lock.json`
- lockfile sha256: `c6646f36f2fa53d442255fb7271bffa3558f9f3230cd8e11c84e7ba89ffc2cfa`

---

### What to do next
1) Fix any build/test failures first.
2) Resolve any real secrets (rotate keys, purge history if needed).
3) If keyword contamination is high, isolate brand modules and remove mixed assets.
4) Send this report back here and Il convert it into a ranked patch plan.
