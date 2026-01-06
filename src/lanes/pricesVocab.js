// Canonical vocab and validators for prices lane
// Purpose: keep signals/product enums closed and validate ingress

export const PRICE_PRODUCT = "regional_prices_signal";
export const PRICE_PRODUCT_VERSION = "v1";
export const PRICE_SIGNALS = new Set(["price_up", "price_down"]);
export const PRICE_NET_STATES = new Set(["rising", "falling", "flat"]);
export const PRICE_VOLATILITY_LEVELS = new Set(["low", "moderate", "high"]);

export const MAX_CHANGE_PCT = 50; // guardrail for ambiguous spikes
export const MAX_CHANGE_VALUE = 1_000_000; // absolute currency guardrail

export function normalizeCurrency(code) {
  if (typeof code !== "string") return null;
  const trimmed = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(trimmed)) return null;
  return trimmed;
}

export function validatePriceEvent(event) {
  if (!event || !PRICE_SIGNALS.has(event.signal)) {
    return { ok: false, reason: "Invalid price signal" };
  }

  const normalized = { ...event };

  if (event.currency !== undefined) {
    const currency = normalizeCurrency(event.currency);
    if (!currency) return { ok: false, reason: "Invalid currency code" };
    normalized.currency = currency;
  }

  if (event.change_pct !== undefined) {
    if (typeof event.change_pct !== "number" || !Number.isFinite(event.change_pct)) {
      return { ok: false, reason: "change_pct must be finite number" };
    }
    if (Math.abs(event.change_pct) > MAX_CHANGE_PCT) {
      return { ok: false, reason: "change_pct out of bounds" };
    }
    if (event.signal === "price_up" && event.change_pct < 0) {
      return { ok: false, reason: "Ambiguous direction vs change_pct" };
    }
    if (event.signal === "price_down" && event.change_pct > 0) {
      return { ok: false, reason: "Ambiguous direction vs change_pct" };
    }
  }

  if (event.change_value !== undefined) {
    if (typeof event.change_value !== "number" || !Number.isFinite(event.change_value)) {
      return { ok: false, reason: "change_value must be finite number" };
    }
    if (Math.abs(event.change_value) > MAX_CHANGE_VALUE) {
      return { ok: false, reason: "change_value out of bounds" };
    }
  }

  if (event.unit !== undefined) {
    if (typeof event.unit !== "string" || !event.unit.trim()) {
      return { ok: false, reason: "Invalid unit" };
    }
  }

  return { ok: true, normalized };
}

export function validatePriceProduct(product) {
  if (!product) return { ok: false, reason: "Missing product" };
  if (product.product && product.product !== PRICE_PRODUCT) {
    return { ok: false, reason: "Unsupported price product" };
  }
  if (product.version && product.version !== PRICE_PRODUCT_VERSION) {
    return { ok: false, reason: "Unsupported product version" };
  }
  if (!PRICE_NET_STATES.has(product.net_state)) {
    return { ok: false, reason: "Invalid net_state" };
  }
  if (!PRICE_VOLATILITY_LEVELS.has(product.volatility)) {
    return { ok: false, reason: "Invalid volatility" };
  }
  if (typeof product.confidence !== "number" || !Number.isFinite(product.confidence)) {
    return { ok: false, reason: "Confidence must be numeric" };
  }
  if (product.confidence < 0 || product.confidence > 1) {
    return { ok: false, reason: "Confidence out of bounds" };
  }

  const counts = product.counts || {};
  const up = counts.price_up ?? 0;
  const down = counts.price_down ?? 0;
  if (!Number.isInteger(up) || up < 0) return { ok: false, reason: "Invalid price_up count" };
  if (!Number.isInteger(down) || down < 0) return { ok: false, reason: "Invalid price_down count" };

  return { ok: true };
}
