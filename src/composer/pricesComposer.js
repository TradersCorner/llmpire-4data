// Prices Composer v1
// Purpose: Transform prices signals → natural language (3-line format)
// Laws: No invented facts, explicit uncertainty, silence is valid, no directives

import { PRICE_NET_STATES, PRICE_VOLATILITY_LEVELS, PRICE_PRODUCT, PRICE_PRODUCT_VERSION, validatePriceProduct } from "../lanes/pricesVocab.js";

export function composePrices(snapshot, product = null) {
  if (!snapshot || snapshot.lane !== "prices") {
    return {
      error: "Invalid input: snapshot must have lane='prices'",
      composed: null
    };
  }

  const window = snapshot.window || "unknown";
  const eventCount = snapshot.events?.length || 0;
  const decay = snapshot.decay || null;

  // Silence
  if (eventCount === 0 && !product) {
    return {
      composed: {
        now: "No live price changes detected in this window.",
        meaning: "Unable to assess price movement from available signals.",
        confidence: "None (no recent activity)."
      },
      metadata: {
        lane: "prices",
        window,
        signalCount: 0,
        confidenceScore: 0,
        composedAt: new Date().toISOString()
      }
    };
  }

  // No product
  if (!product) {
    return {
      composed: {
        now: "Raw price signals detected (no aggregate available).",
        meaning: "Unable to derive net price movement from current data.",
        confidence: "None (aggregation unavailable)."
      },
      metadata: {
        lane: "prices",
        window,
        signalCount: eventCount,
        confidenceScore: 0,
        composedAt: new Date().toISOString()
      }
    };
  }

  const validation = validatePriceProduct(product);
  if (!validation.ok) {
    return { error: validation.reason, composed: null };
  }

  const netState = product.net_state; // rising | falling | flat
  const volatility = product.volatility; // low | moderate | high
  const confidence = product.confidence; // 0-1
  const counts = product.counts || { price_up: 0, price_down: 0 };
  const totalSignals = counts.price_up + counts.price_down;

  const now = buildNowLine(netState, volatility);
  const meaning = buildMeaningLine(netState, decay, totalSignals);
  const confidenceLine = buildConfidenceLine(confidence, totalSignals, window, decay);

  return {
    composed: {
      now,
      meaning,
      confidence: confidenceLine
    },
    metadata: {
      lane: "prices",
      window,
      signalCount: totalSignals,
      confidenceScore: confidence,
      product: product.product || PRICE_PRODUCT,
      version: product.version || PRICE_PRODUCT_VERSION,
      netState,
      volatility,
      composedAt: new Date().toISOString()
    }
  };
}

function buildNowLine(netState, volatility) {
  const isRapid = volatility === "high";
  const isSparse = volatility === "low";

  if (netState === "rising") {
    if (isRapid) return "Price signals show sustained upward movement.";
    if (isSparse) return "Limited upward price signals detected.";
    return "Price signals show upward movement.";
  }

  if (netState === "falling") {
    if (isRapid) return "Price signals show sustained downward movement.";
    if (isSparse) return "Limited downward price signals detected.";
    return "Price signals show downward movement.";
  }

  if (isSparse) return "Limited price activity detected.";
  return "Price signals show mixed movement.";
}

function buildMeaningLine(netState, decay, totalSignals) {
  const hasPressure = decay && decay.pressure > 0.4;
  const pressureDirection = decay?.lastSignal === "price_up" ? "rising" : "falling";

  if (netState === "rising") {
    if (hasPressure && pressureDirection === "falling") {
      return "Prices appear to be rising, but recent downward pressure persists.";
    }
    return "Recent changes suggest price pressure may be increasing.";
  }

  if (netState === "falling") {
    if (hasPressure && pressureDirection === "rising") {
      return "Prices appear to be easing, but recent upward pressure persists.";
    }
    return "Recent changes suggest price pressure may be easing.";
  }

  if (totalSignals < 3) {
    return "Signals suggest stable pricing, but data is sparse.";
  }
  return "Price activity appears balanced between increases and decreases.";
}

function buildConfidenceLine(confidence, totalSignals, window, decay) {
  const hasPressureBoost = decay && decay.pressure > 0.4;

  if (confidence >= 0.7) {
    if (hasPressureBoost) return `High (${totalSignals} signals, sustained pressure over ${window}).`;
    return `High (${totalSignals} signals in ${window} window).`;
  }

  if (confidence >= 0.4) {
    if (hasPressureBoost) return `Moderate (${totalSignals} signals, pressure boost from decay cache).`;
    return `Moderate (${totalSignals} signals in ${window} window).`;
  }

  if (totalSignals < 3) return `Low (sparse data, limited visibility).`;
  return `Low (${totalSignals} signals in ${window} window).`;
}
