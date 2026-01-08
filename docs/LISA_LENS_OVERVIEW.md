# LISA Lens Overview

## What LISA Lens Is

LISA Lens is a **local-first verification layer** that routes AI interactions through your local LISA instance for evidence-backed validation before sending queries to upstream providers (OpenAI, Anthropic, etc.).

It consists of three packages:
- **lens-core**: Local daemon (proxy server + fact store + verifier)
- **lens-ext**: Browser extension (UI injection + route-through controls)
- **lens-shared**: Shared schemas, matchers, and evidence pack format

## What LISA Lens Does NOT Do

❌ **No stealth interception**: Users must explicitly opt-in via "Send through LISA" button  
❌ **No automatic rewriting**: Lens assists or blocks, it doesn't silently modify queries  
❌ **No data exfiltration**: All processing happens locally, evidence stays on your machine  
❌ **No vendor lock-in**: Works with any AI provider via standard proxy pattern

## Architecture

```
[Browser Extension]
       ↓ (intercept on button click)
[lens-core local daemon :3001]
       ↓ (verify + enrich)
[Upstream AI Provider]
       ↓ (response)
[lens-core] → add evidence overlay
       ↓
[Browser Extension] → inject verification UI
```

## How Routing Works

### Proxy Mode (lens-core)
- Runs local HTTP server on `:3001`
- Exposes endpoints:
  - `/lens/answer` - Verified question answering
  - `/lens/stream` - SSE stream with evidence tags
  - `/v1/*` - Proxies to existing 4data v1 API (compatibility layer)

### Extension Mode (lens-ext)
- Injects "Send through LISA" button on ChatGPT/Claude/other AI UIs
- Intercepts query on button click
- Routes to `http://localhost:3001/lens/answer`
- Displays verification overlay on response

## Behavior Modes

### Assist Mode (default)
- Queries route through LISA
- Evidence pack attached to context
- Response includes verification tags
- User sees both AI answer + LISA evidence

### Strict Mode (opt-in)
- LISA blocks query if no matching evidence found
- Returns: "No verified data available for [query]. Try rephrasing or check LISA dashboard."
- Forces user to work within verified fact space

## How It Consumes Existing SSE Stream

lens-core subscribes to the existing 4data v1 SSE stream (`http://localhost:3000/stream`):

1. Receives signals (PRICES, CAPACITY, INVENTORY, etc.)
2. Applies watch filters (same logic as dashboard)
3. Builds local fact store (recent 500 signals)
4. Generates evidence packs on query

**No changes to v1 stream required** - Lens is a read-only consumer.

## Module Boundaries

### src/ (existing - unchanged)
- V1 SSE stream server
- Governance system (decision cards, admin queues)
- Lane/tag system
- Digest service
- All existing APIs

### packages/lens-shared/
**Owns:**
- Signal schema types (`Signal`, `LaneType`, `TagType`)
- Watch/panel filter matchers (`matchesWatchFilter`, `passesPanelFilter`)
- Evidence pack schema (`EvidencePack`, `VerificationTag`)
- Claim tagging logic

**Exports:**
```typescript
export { Signal, LaneType, TagType }
export { matchesWatchFilter, passesPanelFilter }
export { EvidencePack, buildEvidencePack }
export { VerificationTag, tagClaim }
```

### packages/lens-core/
**Owns:**
- Local HTTP server (Express on :3001)
- Fact store (in-memory signal cache)
- Upstream adapters (OpenAI, Anthropic proxies)
- `/lens/answer` endpoint
- `/lens/stream` endpoint (filtered SSE)
- `/v1/*` proxy (backwards compatibility)

**Does NOT own:**
- Original v1 stream generation
- Governance workflows
- Digest scheduling

### packages/lens-ext/
**Owns:**
- Browser extension manifest
- Content scripts (UI injection)
- Background service worker
- "Send through LISA" button logic
- Verification overlay rendering

**Does NOT own:**
- Local daemon (that's lens-core)
- Signal processing (that's lens-shared)

## Development Workflow

### Run existing 4data system (unchanged)
```bash
npm start              # v1 stream on :3000
npm run bridge         # bridge service
npm run digest         # digest service
npm run test           # existing tests
npm run preflight      # full preflight checks
```

### Run LISA Lens components
```bash
npm run lens:core      # start local daemon on :3001
npm run lens:ext:dev   # build extension in watch mode
npm run lens:test      # run lens-specific tests
```

### Run everything together
```bash
npm run dev:all        # starts v1 + lens-core in parallel
```

## Testing Strategy

### Existing tests (unchanged)
- All watch regression tests continue to pass
- Stream invariants enforced
- Governance smoke tests

### New lens tests
- `lens-shared`: Filter matching correctness
- `lens-core`: Fact store caps, evidence pack generation
- `lens-ext`: UI injection, route-through behavior

## Fail-Safes

### For existing system
✅ No changes to `npm start` or existing routes  
✅ No changes to v1 stream logic  
✅ No changes to existing tests  
✅ Old workflows continue working without Lens installed

### For lens packages
✅ lens-core cannot start if port :3001 already taken (graceful fail)  
✅ lens-ext shows "LISA not running" if localhost:3001 unreachable  
✅ Strict mode requires explicit enable flag (default: assist mode)  
✅ No evidence pack = empty array (not crash)

## Migration Path

### Phase 1: Structure only (current)
- Create packages/ directory
- Move shared types to lens-shared
- No behavior changes

### Phase 2: Extract lens-core
- Create local daemon server
- Implement /lens/answer endpoint
- Keep v1 stream unchanged

### Phase 3: Build lens-ext
- Create browser extension scaffold
- Implement UI injection
- Wire to lens-core

### Phase 4: Integration testing
- Run v1 + lens-core together
- Verify stream consumption
- Test evidence pack generation

## Configuration

### lens-core config (packages/lens-core/config.json)
```json
{
  "port": 3001,
  "upstreamStreamUrl": "http://localhost:3000/stream",
  "factStoreCapacity": 500,
  "defaultMode": "assist",
  "providers": {
    "openai": { "enabled": true },
    "anthropic": { "enabled": true }
  }
}
```

### lens-ext config (packages/lens-ext/manifest.json)
```json
{
  "name": "LISA Lens",
  "version": "0.1.0",
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["http://localhost:3001/*"],
  "content_scripts": [{
    "matches": ["https://chat.openai.com/*", "https://claude.ai/*"],
    "js": ["inject.js"]
  }]
}
```

## Future Extensions (out of scope for v1)

- [ ] Persistence layer (SQLite fact store)
- [ ] Remote LISA instances (not just localhost)
- [ ] Diff view (AI answer vs LISA evidence)
- [ ] Conflict resolution (multiple evidence sources)
- [ ] Audit trail (query → evidence → response chain)

## North Star Principle

**LISA Lens is a verification layer, not a replacement.**

It enhances existing AI workflows with evidence-backed validation, but never replaces the underlying AI provider. Users always know when LISA is involved (explicit UI affordance), and can always opt-out (no stealth mode).
