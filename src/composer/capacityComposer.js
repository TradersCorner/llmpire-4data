// Capacity Composer v1
// Purpose: Transform capacity signals → natural language (3-line format)
// Laws: No invented facts, explicit uncertainty, silence is valid, no directives

export function composeCapacity(snapshot, product = null) {
  // Validate input
  if (!snapshot || snapshot.lane !== "capacity") {
    return {
      error: "Invalid input: snapshot must have lane='capacity'",
      composed: null
    };
  }

  const window = snapshot.window || "unknown";
  const eventCount = snapshot.events?.length || 0;
  const decay = snapshot.decay || null;

  // Case 1: No signals (silence is valid)
  if (eventCount === 0 && !product) {
    return {
      composed: {
        now: "No live capacity changes detected in this window.",
        meaning: "Unable to assess current state from available signals.",
        confidence: "None (no recent activity)."
      },
      metadata: {
        lane: "capacity",
        window,
        signalCount: 0,
        confidenceScore: 0,
        composedAt: new Date().toISOString()
      }
    };
  }

  // Case 2: No product available (raw signals only)
  if (!product) {
    return {
      composed: {
        now: "Raw capacity signals detected (no aggregate available).",
        meaning: "Unable to derive net state from current data.",
        confidence: "None (aggregation unavailable)."
      },
      metadata: {
        lane: "capacity",
        window,
        signalCount: eventCount,
        confidenceScore: 0,
        composedAt: new Date().toISOString()
      }
    };
  }

  // Extract product fields
  const netState = product.net_state; // "tightening" | "opening" | "flat"
  const volatility = product.volatility; // "low" | "moderate" | "high"
  const confidence = product.confidence; // 0-1
  const counts = product.counts || { tightening: 0, opening: 0 };
  const totalSignals = counts.tightening + counts.opening;

  // Build "Now" line
  const now = buildNowLine(netState, volatility);

  // Build "Meaning" line
  const meaning = buildMeaningLine(netState, decay, totalSignals);

  // Build "Confidence" line
  const confidenceLine = buildConfidenceLine(confidence, totalSignals, window, decay);

  return {
    composed: {
      now,
      meaning,
      confidence: confidenceLine
    },
    metadata: {
      lane: "capacity",
      window,
      signalCount: totalSignals,
      confidenceScore: confidence,
      netState,
      volatility,
      composedAt: new Date().toISOString()
    }
  };
}

// Build "Now" line based on net_state and volatility
function buildNowLine(netState, volatility) {
  const isRapid = volatility === "high";
  const isSparse = volatility === "low";

  if (netState === "tightening") {
    if (isRapid) return "Capacity signals show sustained tightening activity.";
    if (isSparse) return "Limited capacity tightening signals detected.";
    return "Capacity signals show tightening activity.";
  }

  if (netState === "opening") {
    if (isRapid) return "Capacity signals show sustained opening activity.";
    if (isSparse) return "Limited capacity opening signals detected.";
    return "Capacity signals show opening activity.";
  }

  // flat or mixed
  if (isSparse) return "Limited capacity activity detected.";
  return "Capacity signals show mixed activity.";
}

// Build "Meaning" line based on net_state and decay pressure
function buildMeaningLine(netState, decay, totalSignals) {
  const hasPressure = decay && decay.pressure > 0.4;
  const pressureDirection = decay?.lastSignal === "capacity_tightening" ? "tightening" : "opening";

  if (netState === "tightening") {
    if (hasPressure && pressureDirection === "opening") {
      return "Activity appears to be tightening, but recent opening pressure persists.";
    }
    return "Recent changes suggest availability may be decreasing.";
  }

  if (netState === "opening") {
    if (hasPressure && pressureDirection === "tightening") {
      return "Activity appears to be easing, but recent tightening pressure persists.";
    }
    return "Recent changes suggest availability may be increasing.";
  }

  // flat
  if (totalSignals < 3) {
    return "Signals suggest stable conditions, but data is sparse.";
  }
  return "Activity appears balanced between opening and tightening.";
}

// Build "Confidence" line based on confidence score, signal count, and decay
function buildConfidenceLine(confidence, totalSignals, window, decay) {
  const hasPressureBoost = decay && decay.pressure > 0.4;

  // High confidence (≥ 0.7)
  if (confidence >= 0.7) {
    if (hasPressureBoost) {
      return `High (${totalSignals} signals, sustained pressure over ${window}).`;
    }
    return `High (${totalSignals} signals in ${window} window).`;
  }

  // Moderate confidence (0.4 - 0.7)
  if (confidence >= 0.4) {
    if (hasPressureBoost) {
      return `Moderate (${totalSignals} signals, pressure boost from decay cache).`;
    }
    return `Moderate (${totalSignals} signals in ${window} window).`;
  }

  // Low confidence (< 0.4)
  if (totalSignals < 3) {
    return `Low (sparse data, limited visibility).`;
  }
  return `Low (${totalSignals} signals in ${window} window).`;
}
