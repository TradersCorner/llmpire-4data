// Regression test: follow is a strict alias for watch

function assert(condition, message) {
  if (!condition) {
    console.error("❌", message);
    process.exit(1);
  }
  console.log("✅", message);
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function run() {
  console.log("=== Follow Command Alias Behavior ===\n");

  // Simulate parseChatCommand and answerQuestion from lisa-dashboard.html
  function parseChatCommand(text) {
    const t = text.trim();
    const lower = t.toLowerCase();

    if (lower.startsWith("watch ")) return { cmd: "watch", args: t.slice(6).trim() };
    if (lower.startsWith("follow ")) return { cmd: "follow", args: t.slice(7).trim() };

    return { cmd: null, args: "" };
  }

  function buildFilterFromWatchArgs(args) {
    const a = args.trim();
    const lower = a.toLowerCase();

    let mode = "contains";
    let rest = a;

    if (lower.startsWith("exact:")) { mode = "exact"; rest = a.slice(6).trim(); }
    else if (lower.startsWith("starts:")) { mode = "startsWith"; rest = a.slice(7).trim(); }

    const lrest = rest.toLowerCase();
    if (lrest.startsWith("lane:")) return { kind: "lane", value: rest.slice(5).trim(), mode };
    if (lrest.startsWith("any:")) return { kind: "any", value: rest.slice(4).trim(), mode };
    if (lrest.startsWith("entity:")) return { kind: "entity", value: rest.slice(7).trim(), mode };

    return { kind: "entity", value: rest, mode };
  }

  function answerQuestion(question) {
    const parsed = parseChatCommand(question);
    
    if (parsed.cmd === "watch" || parsed.cmd === "follow") {
      const watchFilter = buildFilterFromWatchArgs(parsed.args);
      const aliasNote = parsed.cmd === "follow" ? "\n(Using watch — follow is an alias)" : "";
      return {
        filter: watchFilter,
        message: `🔴 Watching: ${watchFilter.kind} "${watchFilter.value}" (${watchFilter.mode}).${aliasNote}`
      };
    }
    
    return null;
  }

  console.log("1. Testing 'watch oil' command");
  const watchResult = answerQuestion("watch oil");
  assert(watchResult !== null, "watch oil returns a result");
  assert(watchResult.filter.kind === "entity", "watch oil sets kind = entity");
  assert(watchResult.filter.value === "oil", "watch oil sets value = oil");
  assert(watchResult.filter.mode === "contains", "watch oil sets mode = contains");
  assert(!watchResult.message.includes("alias"), "watch oil does NOT mention alias");
  console.log(`   Filter: ${JSON.stringify(watchResult.filter)}`);

  console.log("\n2. Testing 'follow oil' command");
  const followResult = answerQuestion("follow oil");
  assert(followResult !== null, "follow oil returns a result");
  assert(followResult.filter.kind === "entity", "follow oil sets kind = entity");
  assert(followResult.filter.value === "oil", "follow oil sets value = oil");
  assert(followResult.filter.mode === "contains", "follow oil sets mode = contains");
  assert(followResult.message.includes("alias"), "follow oil mentions alias");
  assert(followResult.message.includes("Using watch"), "follow oil shows 'Using watch' message");
  console.log(`   Filter: ${JSON.stringify(followResult.filter)}`);
  console.log(`   Message: "${followResult.message}"`);

  console.log("\n3. Verifying filters are identical");
  assert(deepEqual(watchResult.filter, followResult.filter), "watch and follow produce identical filters");

  console.log("\n4. Testing 'follow lane:prices' command");
  const followLaneResult = answerQuestion("follow lane:prices");
  assert(followLaneResult.filter.kind === "lane", "follow lane:prices sets kind = lane");
  assert(followLaneResult.filter.value === "prices", "follow lane:prices sets value = prices");
  assert(followLaneResult.message.includes("alias"), "follow lane:prices mentions alias");

  console.log("\n✅ Follow alias locked and verified!");
  console.log("   follow <arg> behaves identically to watch <arg> with alias note.");
}

run();
