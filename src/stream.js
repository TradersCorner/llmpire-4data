let currentState = null;

// SSE subscribers (in-memory only)
const subscribers = new Set();

export function publish(delta) {
  currentState = delta;

  // Broadcast ONLY current state (no history)
  broadcast("state_update", currentState);
}

// Used when the state expires
function expireIfNeeded() {
  if (currentState && currentState.expiresAt < Date.now()) {
    currentState = null;
    broadcast("state_expired", { expiredAt: Date.now() });
  }
}

// Broadcast helper (SSE format)
function broadcast(eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subscribers) {
    res.write(payload);
  }
}

// Called by the HTTP server when a client connects
export function addSubscriber(res) {
  subscribers.add(res);

  // Send the current state ONCE upon connect (still not history—just "now")
  res.write(`event: hello\ndata: ${JSON.stringify({ connectedAt: Date.now() })}\n\n`);
  if (currentState) {
    res.write(`event: state_update\ndata: ${JSON.stringify(currentState)}\n\n`);
  }

  // Remove subscriber on disconnect
  res.on("close", () => {
    subscribers.delete(res);
  });
}

// Check expiration periodically (in-memory only)
setInterval(expireIfNeeded, 1000);
