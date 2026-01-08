// @lisa/lens-shared - Shared types and matchers for LISA Lens

/**
 * Signal type definitions
 */
export const LaneTypes = ["PRICES", "CAPACITY", "INVENTORY", "REGIONAL"];
export const TagTypes = ["prices:energy", "prices:metals", "capacity:logistics"];

/**
 * Filter matching logic (pure functions from lisa-dashboard.html)
 */
export function norm(s) {
  return String(s || "").toLowerCase().trim();
}

export function passesPanelFilter(sig, pf) {
  if (pf.activeLanes?.length > 0 && !pf.activeLanes.includes(sig.lane)) return false;
  if (pf.activeTags?.length > 0) {
    const tags = sig.tags || [];
    if (!tags.some(t => pf.activeTags.includes(t))) return false;
  }
  if (pf.assetFilter) {
    const assetNorm = norm(pf.assetFilter);
    const entityNorm = norm(sig.entity || "");
    const assetValNorm = norm(sig.asset || "");
    const symbolNorm = norm(sig.symbol || "");
    if (!entityNorm.includes(assetNorm) && !assetValNorm.includes(assetNorm) && !symbolNorm.includes(assetNorm)) {
      return false;
    }
  }
  return true;
}

export function matchesWatchFilter(sig, wf) {
  if (!wf.kind || wf.kind === "off") return false;
  if (wf.kind === "any") return true;
  
  const val = norm(wf.value);
  if (!val) return false;
  
  let targets = [];
  if (wf.kind === "entity") {
    targets = [norm(sig.entity || ""), norm(sig.asset || ""), norm(sig.symbol || "")];
  } else if (wf.kind === "lane") {
    targets = [norm(sig.lane || "")];
  }
  
  for (const t of targets) {
    if (wf.mode === "exact" && t === val) return true;
    if (wf.mode === "startsWith" && t.startsWith(val)) return true;
    if (wf.mode === "contains" && t.includes(val)) return true;
  }
  return false;
}

/**
 * Evidence pack schema
 */
export function buildEvidencePack(signals, query) {
  return {
    query,
    timestamp: new Date().toISOString(),
    signals: signals.map(sig => ({
      lane: sig.lane,
      entity: sig.entity || sig.asset,
      delta: sig.delta,
      timestamp: sig.timestamp,
      source: sig.source || "4data-v1"
    })),
    verificationTag: signals.length > 0 ? "verified" : "no-evidence"
  };
}

/**
 * Claim tagging
 */
export function tagClaim(claim, evidencePack) {
  if (evidencePack.signals.length === 0) return { claim, tag: "unverified", reason: "no matching evidence" };
  
  // Simple keyword matching (placeholder for smarter logic)
  const claimLower = claim.toLowerCase();
  const hasMatch = evidencePack.signals.some(sig => 
    claimLower.includes((sig.entity || "").toLowerCase())
  );
  
  return {
    claim,
    tag: hasMatch ? "verified" : "partial",
    reason: hasMatch ? `matched ${evidencePack.signals.length} signals` : "weak evidence"
  };
}
