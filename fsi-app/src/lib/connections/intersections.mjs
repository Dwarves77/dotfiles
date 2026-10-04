// intersections.mjs: INTERSECTION DETECTION as code (lane S3-A). PURE, no DB, no LLM.
//
// The environmental-policy-and-innovation skill calls intersection detection the platform's headline
// capability: two items intersect when they share at least one operational scenario tag AND at least one
// compliance object tag, and neither is archived. That rule lived only in the SQL function
// detect_intersections (migration 023), dropped by migration 265; nothing implemented it afterwards, and
// discover.mjs scores an OR of weighted signals instead. This module is the AND rule, in code, over items
// of ANY item type on ANY of the four intelligence surfaces.
//
// ROLE TAGS DO NOT CONNECT (ADR-021, "identity is not grouping"): ROLE_TAGS (imported from discover.mjs,
// never copied) are near-universal identity, so they never count toward the compliance-object side, for
// either the gate or the strength.
//
// STRENGTH, per the skill: +3 per shared scenario, +2 per shared non-role compliance object, +5 if either
// item lists the other in related_items, +2 if both are priority CRITICAL or HIGH. Tiers: strong >= 12,
// medium 8 to 11, weak < 8. Pairs are canonical (a.id < b.id, ADR-018 collapses at the reader).
//
// STORED SHAPE (one graph, no second table): the result rides on the pair's existing item_cross_references
// row as one basis entry { signal: "intersection", detail: { scenarios, objects, strength, tier }, weight }
// (write-edges.mjs writeIntersectionEdges). weight is the strength mapped onto the 0..1 edge scale by
// strengthToScore below; cross_surface is NOT stored, the reader derives it from item_type and domain.
//
// COMPLEXITY. Candidate pairs come from a scenario-tag index: for each item, only items sharing one of its
// scenario tags are visited, so the pass costs the sum over tags t of f(t)^2 (f = items carrying t), never
// n^2. A tag carried by 20 percent of a 1,000 item corpus costs about 40,000 visits; a pass over all
// tags of a realistic corpus is a few hundred thousand set lookups. Memory is O(n) per item (candidates are
// scored and discarded item by item).
import { ROLE_TAGS } from "./discover.mjs";
import { surfaceOf } from "../surface-of.mjs";

export const INTERSECTION_SIGNAL = "intersection";
export const POINTS = Object.freeze({ scenario: 3, object: 2, explicit: 5, priority: 2 });
export const TIER_MIN = Object.freeze({ strong: 12, medium: 8 });
const HIGH_PRIORITY = new Set(["CRITICAL", "HIGH"]);

const lc = (s) => String(s || "").toLowerCase().trim();
const tags = (x) => [...new Set((Array.isArray(x) ? x : []).filter((v) => typeof v === "string" && v.trim()).map(lc))].sort();
const round4 = (x) => Math.round(x * 1e4) / 1e4;

/** @param {number} strength @returns {"strong"|"medium"|"weak"} */
export function tierOf(strength) {
  if (strength >= TIER_MIN.strong) return "strong";
  if (strength >= TIER_MIN.medium) return "medium";
  return "weak";
}

/**
 * Map intersection strength onto the 0..1 edge score scale. Piecewise linear, chosen so each tier lands in
 * the pair-view band of the same name (weak < 0.5, medium 0.5 to 0.9, strong >= 0.9) and the smallest real
 * pair (1 scenario + 1 object = 5) sits on the 0.3 discovery floor:
 *   strength < 8   : 0.3 + (max(s, 5) - 5) / 15          (5 -> 0.3, 7 -> 0.4333, 8 -> 0.5)
 *   8 to 11        : 0.5 + (s - 8) * 0.1                  (11 -> 0.8)
 *   12 and above   : 0.9 + (s - 12) * 0.025, capped at 1  (16 -> 1)
 * @param {number} strength
 */
export function strengthToScore(strength) {
  const s = Number(strength);
  if (!Number.isFinite(s)) return 0.3;
  let v;
  if (s < TIER_MIN.medium) v = 0.3 + (Math.max(s, 5) - 5) / 15;
  else if (s < TIER_MIN.strong) v = 0.5 + (s - TIER_MIN.medium) * 0.1;
  else v = 0.9 + (s - TIER_MIN.strong) * 0.025;
  return round4(Math.min(1, v));
}

/**
 * Do two items sit on different customer surfaces? Uses the same surfaceOf call the page routers use, with
 * domain passed. null when either item carries no item_type (unknown, never guessed); false when either
 * classifies to "uncategorized" (a defect signal, not a surface).
 */
export function isCrossSurface(a, b) {
  if (!a?.item_type || !b?.item_type) return null;
  const sa = surfaceOf(a.item_type, a.domain);
  const sb = surfaceOf(b.item_type, b.domain);
  if (sa === "uncategorized" || sb === "uncategorized") return false;
  return sa !== sb;
}

/** @param {*} b a basis entry */
export function isIntersectionEntry(b) {
  return Boolean(b) && typeof b === "object" && b.signal === INTERSECTION_SIGNAL;
}

/** The basis entry stored on the pair's edge for one detected pair. */
export function buildIntersectionEntry(pair) {
  return {
    signal: INTERSECTION_SIGNAL,
    detail: { scenarios: pair.shared_scenarios, objects: pair.shared_objects, strength: pair.strength, tier: pair.tier },
    weight: strengthToScore(pair.strength),
  };
}

/**
 * Detect intersections over verified, non-archived items.
 * @param {Array<{id:string, item_type?:string, domain?:number|null, priority?:string,
 *   operational_scenario_tags?:string[], compliance_object_tags?:string[], related_items?:string[],
 *   is_archived?:boolean, provenance_status?:string}>} items
 * @returns {Array<{a:string, b:string, shared_scenarios:string[], shared_objects:string[], strength:number,
 *   tier:"strong"|"medium"|"weak", cross_surface:boolean|null}>} strongest first, then ids
 */
export function detectIntersections(items) {
  const seen = new Set();
  const live = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it.id !== "string" || !it.id || seen.has(it.id)) continue;
    if (it.is_archived) continue;
    if (it.provenance_status !== undefined && it.provenance_status !== null && it.provenance_status !== "verified") continue;
    seen.add(it.id);
    const objects = tags(it.compliance_object_tags).filter((t) => !ROLE_TAGS.has(t));
    live.push({
      raw: it,
      id: it.id,
      scenarios: tags(it.operational_scenario_tags),
      objects,
      objectSet: new Set(objects),
      related: new Set(Array.isArray(it.related_items) ? it.related_items : []),
      high: HIGH_PRIORITY.has(String(it.priority || "").toUpperCase()),
    });
  }
  live.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));

  // scenario tag -> positions (ascending, because live is id-sorted)
  const index = new Map();
  live.forEach((it, pos) => {
    if (!it.objects.length) return; // no non-role object: can never intersect, keep it out of the index
    for (const t of it.scenarios) {
      if (!index.has(t)) index.set(t, []);
      index.get(t).push(pos);
    }
  });

  const out = [];
  for (let i = 0; i < live.length; i++) {
    const A = live[i];
    if (!A.objects.length) continue;
    const cand = new Map(); // j -> shared scenarios
    for (const t of A.scenarios) {
      for (const j of index.get(t) ?? []) {
        if (j <= i) continue;
        if (!cand.has(j)) cand.set(j, []);
        cand.get(j).push(t);
      }
    }
    for (const [j, scn] of cand) {
      const B = live[j];
      const objs = A.objects.filter((o) => B.objectSet.has(o));
      if (!objs.length) continue;
      const strength =
        POINTS.scenario * scn.length +
        POINTS.object * objs.length +
        (A.related.has(B.id) || B.related.has(A.id) ? POINTS.explicit : 0) +
        (A.high && B.high ? POINTS.priority : 0);
      out.push({
        a: A.id,
        b: B.id,
        shared_scenarios: scn.slice().sort(),
        shared_objects: objs,
        strength,
        tier: tierOf(strength),
        cross_surface: isCrossSurface(A.raw, B.raw),
      });
    }
  }
  out.sort((x, y) => y.strength - x.strength || (x.a < y.a ? -1 : x.a > y.a ? 1 : 0) || (x.b < y.b ? -1 : x.b > y.b ? 1 : 0));
  return out;
}
