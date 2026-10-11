import { AXIS5_CATEGORIES, AXIS5_OUT_OF_SCOPE } from "./vocab.mjs";

export { AXIS5_CATEGORIES, AXIS5_OUT_OF_SCOPE };

// Midpoints of each stated range in the framework's table (e.g. "20-30%" -> 25), keyed by
// AXIS5_CATEGORIES names. Rows need not sum to exactly 100 (several are ranges); expectedOutputForRole
// normalizes. `null` = the framework's own "varies" verdict (government_press, Axis 1 §1.10): no fixed
// default exists; the framework requires downstream-attribution to the underlying primary_legal_authority
// source instead, a mechanism the framework itself calls "design pending" (open question 5) and which
// this lane does not attempt to build.
const RAW_MIDPOINTS_BY_ROLE = Object.freeze({
  primary_legal_authority: { regulations: 60, research: 25, market: 5, operations: 5, out_of_scope: 5 },
  intergovernmental_body: { regulations: 5, research: 55, market: 25, operations: 15, out_of_scope: 5 },
  standards_body: { regulations: 25, research: 65, market: 5, operations: 0, out_of_scope: 7.5 },
  academic_research: { regulations: 0, research: 85, market: 7.5, operations: 0, out_of_scope: 5 },
  statistical_data_agency: { regulations: 0, research: 5, market: 25, operations: 75, out_of_scope: 5 },
  industry_data_provider: { regulations: 0, research: 7.5, market: 85, operations: 5, out_of_scope: 5 },
  trade_press: { regulations: 25, research: 7.5, market: 65, operations: 0, out_of_scope: 10 },
  industry_association: { regulations: 0, research: 25, market: 55, operations: 15, out_of_scope: 5 },
  vendor_corporate: { regulations: 0, research: 0, market: 85, operations: 0, out_of_scope: 10 },
  government_press: null,
});

/** Normalize a raw {category: rawPercent} object to a probability distribution over AXIS5_CATEGORIES
 *  that sums to 1 (or to all-zero if the input sums to 0). Missing keys default to 0. Pure. */
export function normalizeDistribution(raw) {
  const total = AXIS5_CATEGORIES.reduce((s, c) => s + (raw?.[c] ?? 0), 0);
  const out = {};
  for (const c of AXIS5_CATEGORIES) out[c] = total > 0 ? (raw?.[c] ?? 0) / total : 0;
  return Object.freeze(out);
}

/**
 * Axis 5 default expected-output distribution for a source's Axis-1 role. Pure lookup + normalize.
 * @param {string|null|undefined} role - sources.source_role value
 * @returns {Record<string, number> | null} a distribution over AXIS5_CATEGORIES summing to 1, or null
 *   when the role is unrecognized OR is government_press (framework: "varies", no fixed default —
 *   never guessed).
 */
export function expectedOutputForRole(role) {
  if (!role || !(role in RAW_MIDPOINTS_BY_ROLE)) return null;
  const raw = RAW_MIDPOINTS_BY_ROLE[role];
  if (raw === null) return null;
  return normalizeDistribution(raw);
}

/** True iff `dist` is a well-shaped Axis-5 distribution: exactly the AXIS5_CATEGORIES keys, each a
 *  finite number in [0,1], summing to 1 within floating-point tolerance. Pure. */
export function isValidDistribution(dist) {
  if (!dist || typeof dist !== "object") return false;
  const keys = Object.keys(dist).sort();
  const expected = [...AXIS5_CATEGORIES].sort();
  if (keys.length !== expected.length || !keys.every((k, i) => k === expected[i])) return false;
  let sum = 0;
  for (const c of AXIS5_CATEGORIES) {
    const v = dist[c];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) return false;
    sum += v;
  }
  return Math.abs(sum - 1) < 1e-9;
}
