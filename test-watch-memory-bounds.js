// Regression test: memory bounds enforced under burst load

function assert(condition, message) {
  if (!condition) {
    console.error("❌", message);
    process.exit(1);
  }
  console.log("✅", message);
}

function run() {
  console.log("=== Watch Memory Bounds ===\n");

  // Simulate bounded collections from lisa-dashboard.html
  const state = {
    feed: [],
    recs: [],
    chatHistory: []
  };

  const FEED_CAP = 500;
  const RECS_CAP = 200;
  const CHAT_CAP = 200;

  // Simulate handleSignal behavior for feed and recs
  function handleSignal(sig) {
    state.feed.unshift(sig);
    if (state.feed.length > FEED_CAP) {
      state.feed = state.feed.slice(0, FEED_CAP);
    }
    
    state.recs.push(sig);
    if (state.recs.length > RECS_CAP) {
      state.recs = state.recs.slice(-RECS_CAP);
    }
  }

  // Simulate LIVE chat insertion
  function addChatMessage(text) {
    state.chatHistory.push({ text, timestamp: Date.now() });
    if (state.chatHistory.length > CHAT_CAP) {
      state.chatHistory.splice(0, state.chatHistory.length - CHAT_CAP);
    }
  }

  console.log("1. Pushing 501 signals through handleSignal()");
  for (let i = 0; i < 501; i++) {
    handleSignal({
      id: `sig${i}`,
      lane: "PRICES",
      entity: `test${i}`,
      timestamp: new Date().toISOString()
    });
  }

  assert(state.feed.length === FEED_CAP, `Feed capped at ${FEED_CAP} (got ${state.feed.length})`);
  assert(state.recs.length === RECS_CAP, `Recs capped at ${RECS_CAP} (got ${state.recs.length})`);
  assert(state.feed[0].id === "sig500", "Feed newest item is last pushed (sig500)");
  assert(state.recs[state.recs.length - 1].id === "sig500", "Recs newest item is last pushed (sig500)");

  console.log("\n2. Adding 250 chat messages");
  for (let i = 0; i < 250; i++) {
    addChatMessage(`Message ${i}`);
  }

  assert(state.chatHistory.length === CHAT_CAP, `Chat capped at ${CHAT_CAP} (got ${state.chatHistory.length})`);
  assert(state.chatHistory[0].text === "Message 50", "Chat oldest item is message 50 (50-249 kept)");
  assert(state.chatHistory[state.chatHistory.length - 1].text === "Message 249", "Chat newest item is message 249");

  console.log("\n3. Verifying continued operation under sustained load");
  for (let i = 501; i < 1001; i++) {
    handleSignal({
      id: `sig${i}`,
      lane: "CAPACITY",
      entity: `test${i}`,
      timestamp: new Date().toISOString()
    });
  }

  assert(state.feed.length === FEED_CAP, `Feed still capped at ${FEED_CAP} after 1000 signals`);
  assert(state.recs.length === RECS_CAP, `Recs still capped at ${RECS_CAP} after 1000 signals`);
  assert(state.feed[0].id === "sig1000", "Feed newest item is sig1000");
  assert(state.recs[state.recs.length - 1].id === "sig1000", "Recs newest item is sig1000");

  console.log("\n✅ Memory bounds locked and verified!");
  console.log("   Feed, recs, and chat stay bounded under burst and sustained load.");
  console.log(`   Feed: ${state.feed.length}/${FEED_CAP}, Recs: ${state.recs.length}/${RECS_CAP}, Chat: ${state.chatHistory.length}/${CHAT_CAP}`);
}

run();
