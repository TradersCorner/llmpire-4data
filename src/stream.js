// Ephemeral, in-memory-only stream; no history, no storage.

export function publish(event) {
  // Log only the derived delta event, not raw payload.
  console.log("STATE UPDATE:", event);

  const delay = event.expiresAt - Date.now();
  if (delay <= 0) {
    console.log("STATE EXPIRED");
    return;
  }

  setTimeout(() => {
    console.log("STATE EXPIRED");
  }, delay);
}
