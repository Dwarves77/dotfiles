// slugify.mjs, the one shared lower-case/hyphen slug helper for market_series producers that derive a
// series_key segment from a free-text label (a product code's display name, a sector name, …).
// Extracted 2026-10-03 (lane L11) from eia-v2-petroleum-spot-producer.mjs's own local copy, reused by
// sbti-target-dashboard-producer.mjs rather than a second hand-written duplicate (F45/prior-art).
// See the lane-common-contract section 6: search before building a second copy of something the repo already has.
// Pure, zero dependencies.

/** @param {unknown} raw @returns {string} lower-case, alphanumeric segments joined by single hyphens */
export function slugify(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
