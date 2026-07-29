(() => {
  const PANEL_ID = "lens-panel";
  const OVERLAY_ID = "lens-overlay";

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "lens-panel";

    const title = document.createElement("div");
    title.textContent = "LISA Lens";
    title.className = "lens-panel-title";

    const sendBtn = document.createElement("button");
    sendBtn.textContent = "Send through LISA";
    sendBtn.className = "lens-btn";

    const verifyBtn = document.createElement("button");
    verifyBtn.textContent = "Verify this answer";
    verifyBtn.className = "lens-btn secondary";

    const status = document.createElement("div");
    status.className = "lens-status";
    status.textContent = "Ready";

    sendBtn.onclick = () => handleSend(status);
    verifyBtn.onclick = () => handleVerify(status);

    panel.appendChild(title);
    panel.appendChild(sendBtn);
    panel.appendChild(verifyBtn);
    panel.appendChild(status);
    document.body.appendChild(panel);

    // Start SSE stream on load
    try { chrome.runtime.sendMessage({ type: "LENS_START_STREAM" }); } catch {}
  }

  function selectedText() {
    return (window.getSelection()?.toString() || "").trim();
  }

  async function ensureToken() {
    let { lensToken } = await chrome.storage.local.get("lensToken");
    if (!lensToken) {
      lensToken = window.prompt("Enter LENS token (from lens-core .env):");
      if (lensToken) await chrome.storage.local.set({ lensToken });
    }
    return lensToken;
  }

  function appendTextElement(parent, tagName, text) {
    const element = document.createElement(tagName);
    element.textContent = String(text ?? "");
    parent.appendChild(element);
    return element;
  }

  function showOverlay(renderContent) {
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.className = "lens-overlay";
      document.body.appendChild(overlay);
    }
    overlay.replaceChildren();

    const box = document.createElement("div");
    box.className = "lens-overlay-box";

    const close = document.createElement("button");
    close.textContent = "×";
    close.className = "lens-close";
    close.onclick = () => {
      overlay.remove();
      try { chrome.runtime.sendMessage({ type: "LENS_STOP_STREAM" }); } catch {}
    };

    const body = document.createElement("div");
    body.className = "lens-overlay-body";
    renderContent(body);

    box.appendChild(close);
    box.appendChild(body);
    overlay.appendChild(box);
  }

  async function handleSend(statusEl) {
    const token = await ensureToken();
    if (!token) return (statusEl.textContent = "Token required");

    const input = selectedText() || window.prompt("Prompt to send through LISA:");
    if (!input) return;

    statusEl.textContent = "Sending...";
    chrome.runtime.sendMessage(
      { type: "lens-send", token, payload: { input, mode: "assist", upstream: "openai" } },
      resp => {
        if (!resp?.ok) {
          statusEl.textContent = "Error";
          showOverlay(body => {
            appendTextElement(body, "h3", "Error");
            appendTextElement(body, "pre", resp?.error || JSON.stringify(resp));
          });
          return;
        }
        statusEl.textContent = "Done";
        const data = resp.data;
        const evidenceFacts = (data?.evidence?.facts || []).length;
        const changes = data?.evidence?.changes?.items?.length || 0;
        showOverlay(body => {
          appendTextElement(body, "h3", "LISA Answer");
          appendTextElement(body, "p", data?.answer || "(no answer)");
          appendTextElement(body, "h4", "Evidence");
          appendTextElement(body, "p", `Facts: ${evidenceFacts} | Changes: ${changes}`);
          const evidenceWindow = appendTextElement(
            body,
            "p",
            `Evidence window used: last ${evidenceFacts} facts + ${changes} changes`
          );
          evidenceWindow.className = "lens-evidence-window";
          appendTextElement(body, "pre", JSON.stringify(data?.evidence, null, 2));
        });
      }
    );
  }

  async function handleVerify(statusEl) {
    const token = await ensureToken();
    if (!token) return (statusEl.textContent = "Token required");

    const text = selectedText() || window.prompt("Paste the assistant answer to verify:");
    if (!text) return;

    statusEl.textContent = "Verifying...";
    chrome.runtime.sendMessage(
      { type: "lens-verify", token, payload: { text, mode: "assist" } },
      resp => {
        if (!resp?.ok) {
          statusEl.textContent = "Error";
          showOverlay(body => {
            appendTextElement(body, "h3", "Error");
            appendTextElement(body, "pre", resp?.error || JSON.stringify(resp));
          });
          return;
        }
        statusEl.textContent = "Done";
        const data = resp.data;
        const supported = data?.supportedClaims || [];
        const unsupported = data?.unsupportedClaims || [];
        const evidenceFacts = (data?.evidence?.facts || []).length;
        const changes = data?.evidence?.changes?.items?.length || 0;
        showOverlay(body => {
          appendTextElement(body, "h3", "Verification");
          appendTextElement(body, "p", `Supported: ${supported.length} | Unsupported: ${unsupported.length}`);
          appendTextElement(body, "h4", "Rewritten");
          appendTextElement(body, "p", data?.rewrittenAnswer || "(no rewrite)");
          appendTextElement(body, "h4", "Supported Claims");
          if (supported.length === 0) {
            appendTextElement(body, "p", "(none)");
          } else {
            const list = document.createElement("ul");
            for (const item of supported) {
              appendTextElement(list, "li", `${item.claim} → factIds: ${(item.factIds || []).join(", ")}`);
            }
            body.appendChild(list);
          }
          appendTextElement(body, "h4", "Unsupported Claims");
          if (unsupported.length === 0) {
            appendTextElement(body, "p", "(none)");
          } else {
            const list = document.createElement("ul");
            for (const item of unsupported) appendTextElement(list, "li", item);
            body.appendChild(list);
          }
          appendTextElement(body, "h4", "Evidence");
          const evidenceWindow = appendTextElement(
            body,
            "p",
            `Evidence window used: last ${evidenceFacts} facts + ${changes} changes`
          );
          evidenceWindow.className = "lens-evidence-window";
          appendTextElement(body, "pre", JSON.stringify(data?.evidence, null, 2));
        });
      }
    );
  }

  createPanel();

  // ===== LISA Lens: receive SSE events from background =====
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "LENS_SSE_EVENT") {
      try {
        window.__LISA_LENS_ON_SSE_EVENT?.(msg.event, msg.data);
      } catch {}
    }
    if (msg?.type === "LENS_SSE_ERROR") {
      try {
        window.__LISA_LENS_ON_SSE_ERROR?.(msg.error);
      } catch {}
    }
  });

  // Minimal handlers that update the status panel and append simple notices
  window.updateLensStatus = (data) => {
    const el = document.querySelector('.lens-status');
    if (!el) return;
    const connected = data?.connected ? 'connected' : 'disconnected';
    const received = Number(data?.received || 0);
    const last = data?.lastSignalAt || 'n/a';
    el.textContent = `Status: ${connected} · received: ${received} · last: ${last}`;
  };

  window.onLensFact = (event, data) => {
    // For now, just append a small line in the overlay if present
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const body = overlay.querySelector('.lens-overlay-body');
    if (!body) return;
    const p = document.createElement('p');
    p.textContent = `${event}: ${typeof data === 'string' ? data : JSON.stringify(data)}`;
    body.appendChild(p);
  };

  window.__LISA_LENS_ON_SSE_EVENT = (event, data) => {
    if (event === 'status') {
      window.updateLensStatus?.(data);
    } else {
      window.onLensFact?.(event, data);
    }
  };

  window.__LISA_LENS_ON_SSE_ERROR = (err) => {
    const el = document.querySelector('.lens-status');
    if (el) el.textContent = `Error: ${err}`;
  };
})();
