// routing.mjs — Phase 2: source-aware item routing (docs/plans/source-classification-framework-
// 2026-05-10.md, "Axis 5: Expected Output / 5a. Source-aware item routing", and the "Source-aware item
// routing summary" pseudocode at the end of that document). REC-2-plans.md §9 confirms this algorithm
// was UNBUILT ("grep for axis5|axis_5|source_role.*routing returns nothing") — this module is that
// build. Also implements 5b (drift detection) and 5c (anomaly flagging), the two primitives the
// framework defines alongside routing.
//
// Deliberately scoped: this module does NOT re-implement "the five item rules drafted separately"
// (i.e. it does not decide whether an item's TEXT passes the Regulatory/Research/Market Intel/
// Operations rule — that rule-testing lives wherever item classification already happens, e.g. the
// domain-routing case expressions in migrations 084/101 and mint-time classification). Per the
// framework's own pseudocode, routeItemBySourceAxis5 takes AS INPUT the set of categories whose rule
// already passed for a given item, and does ONLY step 3 onward: order by descending source-expected
// probability, tie-break, out-of-scope fallback, and anomaly check. That is the part the framework
// names as net-new ("Order item categories by descending expected probability for S").

import { AXIS5_CATEGORIES, AXIS5_OUT_OF_SCOPE } from "./vocab.mjs";
import { surfaceOf } from "../surface-of.mjs";

const CANDIDATE_CATEGORIES = AXIS5_CATEGORIES.filter((c) => c !== AXIS5_OUT_OF_SCOPE);

/**
 * Framework §5a steps 3-6: given the categories whose item-rule already passed for one item, and the
 * source's Axis-5 expected-output distribution, resolve the final category. Pure, deterministic.
 * @param {{ candidateCategories: string[], expectedOutput: Record<string, number>|null }} args
 * @param {number} [anomalyThreshold=0.05] - framework's default anomaly threshold (open question 3)
 * @returns {{ category: string, ambiguous: boolean, anomaly: boolean, reason: string }}
 */
export function routeItemBySourceAxis5({ candidateCategories, expectedOutput }, anomalyThreshold = 0.05) {
  const candidates = [...new Set(candidateCategories || [])].filter((c) => CANDIDATE_CATEGORIES.includes(c));

  if (candidates.length === 0) {
    return { category: AXIS5_OUT_OF_SCOPE, ambiguous: false, anomaly: false, reason: "no rule passed under source-aware routing" };
  }

  // Step 3: order by descending expected probability for S (missing/unknown distribution -> stable
  // input order, i.e. no tie-break preference — the caller should not have called this without a
  // distribution, but a null expectedOutput must never crash the router).
  const ordered = candidates
    .slice()
    .sort((a, b) => (expectedOutput?.[b] ?? 0) - (expectedOutput?.[a] ?? 0));
  const category = ordered[0];
  const ambiguous = candidates.length > 1;

  // Step 6: anomaly check on the RESOLVED category.
  const anomaly = isAnomalousCategory(category, expectedOutput, anomalyThreshold);

  return {
    category,
    ambiguous,
    anomaly,
    reason: ambiguous
      ? `${candidates.length} rules passed ambiguously; tie-broken to "${category}" by descending source-expected probability`
      : `single rule passed ("${category}")`,
  };
}

/**
 * Framework §5c: "An item ... landing in [a category with] less than 5% expected probability per
 * source's Axis 5 distribution" is anomalous. Pure.
 * @param {string} category
 * @param {Record<string, number>|null|undefined} expectedOutput
 * @param {number} [threshold=0.05]
 * @returns {boolean}
 */
export function isAnomalousCategory(category, expectedOutput, threshold = 0.05) {
  if (!expectedOutput) return false; // no distribution to test against -> cannot assert anomaly
  const p = expectedOutput[category] ?? 0;
  return p < threshold;
}

/**
 * Framework §5b: "If observed deviates from expected by more than threshold (default 30 percentage
 * points on any single category), flag for source-scope review." Pure.
 * @param {Record<string, number>|null} observed
 * @param {Record<string, number>|null} expected
 * @param {number} [thresholdPoints=30]
 * @returns {{ drifted: boolean, deltas: Record<string, number> }} deltas are percentage points (0-100)
 */
export function detectDrift(observed, expected, thresholdPoints = 30) {
  const deltas = {};
  if (!observed || !expected) return { drifted: false, deltas };
  let drifted = false;
  for (const c of AXIS5_CATEGORIES) {
    const d = Math.abs((observed[c] ?? 0) - (expected[c] ?? 0)) * 100;
    deltas[c] = d;
    if (d > thresholdPoints) drifted = true;
  }
  return { drifted, deltas };
}

/**
 * Builds an Axis-5 observed distribution from a source's own live intelligence_items, via
 * surfaceOf(item_type, domain) — the single drift-guarded item->surface classifier (src/lib/
 * surface-of.mjs). surfaceOf's "uncategorized" output (matches no customer surface) is treated as this
 * framework's "out_of_scope" bucket: functionally, an item that lands in none of the four customer
 * surfaces has landed out of scope, and the framework's own Axis-5 category set already reserves that
 * name for exactly this case. Pure (no I/O — caller reads the items).
 * @param {Array<{ item_type?: string|null, domain?: number|null }>} items
 * @returns {Record<string, number> | null} distribution over AXIS5_CATEGORIES summing to 1, or null
 *   when `items` is empty (nothing observed yet — distinct from an all-zero distribution).
 */
export function observedDistributionFromItems(items) {
  const counts = Object.fromEntries(AXIS5_CATEGORIES.map((c) => [c, 0]));
  let total = 0;
  for (const it of items || []) {
    const surface = surfaceOf(it?.item_type ?? null, typeof it?.domain === "number" ? it.domain : null);
    const bucket = surface === "uncategorized" ? AXIS5_OUT_OF_SCOPE : surface;
    counts[bucket] = (counts[bucket] ?? 0) + 1;
    total += 1;
  }
  if (total === 0) return null;
  const out = {};
  for (const c of AXIS5_CATEGORIES) out[c] = counts[c] / total;
  return out;
}
