# @lisa/lens-ext

Browser extension: UI injection + route-through controls for LISA Lens.

## What it does

- Injects "Send through LISA" button on ChatGPT, Claude, and other AI UIs
- Routes queries to `http://localhost:3001/lens/answer` on button click
- Displays verification overlay on response
- Shows "LISA not running" warning if daemon unreachable

## Structure

```
manifest.json       - Extension manifest (Chrome/Firefox)
inject.js           - Content script (UI injection)
background.js       - Service worker (routing logic)
overlay.css         - Verification overlay styles
```

## Installation

1. Build extension: `npm run build`
2. Load unpacked in Chrome: `chrome://extensions` → Load unpacked → select `packages/lens-ext`

## Development

```bash
npm run dev    # watch mode (rebuilds on change)
```

## Supported AI UIs

- ChatGPT (chat.openai.com)
- Claude (claude.ai)
- Perplexity (perplexity.ai) - planned
- Gemini (gemini.google.com) - planned

## Configuration

No config needed. Extension auto-detects `http://localhost:3001` as default Lens daemon.

## Future

- [ ] Settings UI for custom Lens daemon URL
- [ ] Diff view (AI answer vs LISA evidence)
- [ ] Inline evidence citations
- [ ] Conflict highlighting
