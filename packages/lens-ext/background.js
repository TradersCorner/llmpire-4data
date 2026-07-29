const LENS_URL = "http://localhost:3001";

async function getToken() {
  const { LENS_TOKEN, lensToken } = await chrome.storage.local.get(["LENS_TOKEN", "lensToken"]);
  return (LENS_TOKEN || lensToken || null);
}

async function setToken(token) {
  if (token) await chrome.storage.local.set({ lensToken: token, LENS_TOKEN: token });
}

async function callLens(path, body, token) {
  const resp = await fetch(`${LENS_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  const data = await resp.json().catch(() => ({}));
  return { status: resp.status, data };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "lens-set-token") {
    setToken(msg.token).then(() => sendResponse({ ok: true })).catch(err => sendResponse({ ok: false, error: err?.message }));
    return true;
  }

  if (msg.type === "lens-send" || msg.type === "lens-verify") {
    (async () => {
      const token = msg.token || (await getToken());
      if (!token) return sendResponse({ ok: false, error: "Missing LENS token" });

      const path = msg.type === "lens-send" ? "/lens/answer" : "/lens/verify";
      const body = msg.payload || {};

      try {
        const { status, data } = await callLens(path, body, token);
        sendResponse({ ok: status >= 200 && status < 300, status, data });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "fetch failed" });
      }
    })();
    return true;
  }
});

// ===== LISA Lens: Header-auth SSE stream (MV3 safe) =====

const DEFAULT_LENS_BASE = "http://localhost:3001";

// Keep one stream per tab
const tabStreams = new Map(); // tabId -> { abort, running }

async function getLensBase() {
  const { LENS_BASE } = await chrome.storage.local.get(["LENS_BASE"]);
  return (LENS_BASE || DEFAULT_LENS_BASE).trim();
}

function parseSseChunk(state, chunkText) {
  // state: { buffer: string }
  state.buffer += chunkText;

  const events = [];
  let idx;
  while ((idx = state.buffer.indexOf("\n\n")) !== -1) {
    const raw = state.buffer.slice(0, idx);
    state.buffer = state.buffer.slice(idx + 2);

    let event = "message";
    const dataLines = [];

    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }

    const dataStr = dataLines.join("\n");
    let data = dataStr;
    try { data = JSON.parse(dataStr); } catch {}

    events.push({ event, data });
  }
  return events;
}

async function startStreamForTab(tabId) {
  // Stop existing
  await stopStreamForTab(tabId);

  const token = await getToken();
  if (!token) throw new Error("Missing LENS_TOKEN. Click extension UI and set token.");

  const lensBase = await getLensBase();
  const url = `${lensBase.replace(/\/$/, "")}/lens/stream`;

  const controller = new AbortController();
  tabStreams.set(tabId, { abort: () => controller.abort(), running: true });

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "text/event-stream"
    },
    signal: controller.signal
  });

  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new Error(`Lens SSE failed: ${res.status} ${t}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  const state = { buffer: "" };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    const events = parseSseChunk(state, text);

    for (const evt of events) {
      chrome.tabs.sendMessage(tabId, {
        type: "LENS_SSE_EVENT",
        event: evt.event,
        data: evt.data
      });
    }
  }

  // Stream ended naturally
  tabStreams.delete(tabId);
  chrome.tabs.sendMessage(tabId, { type: "LENS_SSE_ERROR", error: "Lens stream ended." });
}

async function stopStreamForTab(tabId) {
  const s = tabStreams.get(tabId);
  if (s?.abort) {
    try { s.abort(); } catch {}
  }
  tabStreams.delete(tabId);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender?.tab?.id;
  if (!tabId) return;

  if (msg?.type === "LENS_START_STREAM") {
    startStreamForTab(tabId)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => {
        chrome.tabs.sendMessage(tabId, { type: "LENS_SSE_ERROR", error: String(e?.message || e) });
        sendResponse({ ok: false, error: String(e?.message || e) });
      });
    return true; // async
  }

  if (msg?.type === "LENS_STOP_STREAM") {
    stopStreamForTab(tabId)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
});

// Auto-stop when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  stopStreamForTab(tabId);
});
