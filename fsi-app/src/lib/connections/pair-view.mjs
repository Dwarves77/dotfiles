// pair-view.mjs — pure pair-assembly for the admin intersections reader (flywheel U3 supersession).
// PURE, no DB, no LLM. Same discipline as cluster.mjs / theme-stats.mjs: plain ESM, zero
// dependencies, deterministic, execution-wired proof in pair-view.test.mjs (rule 15 — the route
// stays thin glue; the one piece of real computation lives here where `node --test` runs it).
//
// WHAT THIS REPLACES: the detect_intersections RPC (migration 023) re-scored item pairs in SQL from
// operational_scenario_tags / compliance_object_tags — a SECOND scoring home, parallel to
// discover.mjs. The flywheel build plan (U3) ratified retiring that scoring and re-pointing the
// reader at the persisted graph: item_cross_references rows carry the one scoring home's output
// (score + grounded basis), so the reader ASSEMBLES pairs, it never re-scores them.
//
// DIRECTIONALITY (ADR-018): storage keeps BOTH directions — (A,B) and (B,A) — because source-filtered
// readers require both (write-edges.mjs directionality note). THIS reader canonicalizes to one
// undirected pair per (min(id),max(id)), merging basis entries (deduped by signal+detail) and taking
// the max score. Canonicalize-at-reader, both-directions-at-rest is the decided shape.
//
// EXPLICIT LINKS: an edge whose origin is NOT 'provenance_discovery' (manual, entity_extraction) is
// operator/extractor-curated. Pairs carried ONLY by such edges have no engine score (score=null) and
// are always included regardless of minScore — curation outranks a threshold. Scored pairs filter on
// minScore as usual.
//
// SCORE BANDS (documented heuristic, not an invented magic number — same posture as theme-stats'
// convergence bands): discover.mjs weights are same_instrument 0.9, shared_source 0.4,
// shared_scenario 0.3/tag, shared_compliance_object 0.18/tag, shared_jurisdiction_topic 0.2.
//   strong  >= 0.9  — same-instrument-dominated or several substantive signals stacked
//   medium  >= 0.5  — multiple substantive signals (e.g. source + scenario)
//   weak    <  0.5  — a single substantive signal near the 0.3 discovery threshold
export const BANDS = { strong: 0.9, medium: 0.5 };

const canonKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Band name for a score (null score = 'explicit' — curated pair with no engine score). */
export function bandOf(score) {
  if (score == null || !Number.isFinite(score)) return "explicit";
  if (score >= BANDS.strong) return "strong";
  if (score >= BANDS.medium) return "medium";
  return "weak";
}

/**
 * Collapse directed edge rows into canonical undirected pairs.
 * @param {Array<{source_item_id:string, target_item_id:string, origin?:string, basis?:Array<{signal:string, detail?:string, weight?:number}>, score?:number|null}>} edgeRows
 * @returns {Map<string, {a:string, b:string, score:number|null, basis:Array<{signal:string, detail?:string, weight?:number}>, explicitly_linked:boolean}>}
 */
export function collapsePairs(edgeRows) {
  const pairs = new Map();
  for (const e of Array.isArray(edgeRows) ? edgeRows : []) {
    const s = e?.source_item_id, t = e?.target_item_id;
    if (!s || !t || s === t) continue;
    const key = canonKey(s, t);
    const [a, b] = s < t ? [s, t] : [t, s];
    let p = pairs.get(key);
    if (!p) { p = { a, b, score: null, basis: [], explicitly_linked: false }; pairs.set(key, p); }
    if (e.origin === "provenance_discovery") {
      const sc = typeof e.score === "number" && Number.isFinite(e.score) ? e.score : null;
      if (sc != null) p.score = p.score == null ? sc : Math.max(p.score, sc);
    } else {
      p.explicitly_linked = true;
    }
    for (const bs of Array.isArray(e.basis) ? e.basis : []) {
      if (bs && bs.signal && !p.basis.some((x) => x.signal === bs.signal && x.detail === bs.detail)) {
        p.basis.push(bs);
      }
    }
  }
  // Deterministic basis order within a pair: weight desc, then signal, then detail.
  for (const p of pairs.values()) {
    p.basis.sort((x, y) => (y.weight ?? 0) - (x.weight ?? 0) || String(x.signal).localeCompare(String(y.signal)) || String(x.detail ?? "").localeCompare(String(y.detail ?? "")));
  }
  return pairs;
}

/**
 * Assemble the intersections response rows from edge rows + an item lookup.
 * Pairs where either item is missing from itemsById (archived / deleted / not fetched) are dropped —
 * a pair the reader cannot title is not renderable, and the graph's population is the live verified
 * corpus by construction.
 * @param {Array} edgeRows directed rows from item_cross_references (any origin)
 * @param {Map<string, {id:string, title?:string, legacy_id?:string|null, priority?:string, intersection_summary?:string|null, item_type?:string}>} itemsById
 * @param {{minScore?: number, limit?: number}} [opts]
 * @returns {{pairs: Array, stats: {total:number, explicit_count:number, by_band:{strong:number, medium:number, weak:number, explicit:number}}}}
 */
export function assemblePairs(edgeRows, itemsById, { minScore = 0.3, limit = 100 } = {}) {
  const collapsed = collapsePairs(edgeRows);
  const out = [];
  for (const p of collapsed.values()) {
    const A = itemsById.get(p.a), B = itemsById.get(p.b);
    if (!A || !B) continue;
    const scored = p.score != null;
    if (scored && p.score < minScore && !p.explicitly_linked) continue;
    if (!scored && !p.explicitly_linked) continue; // no score and no curation: nothing grounds this pair
    out.push({
      item_a_id: p.a,
      item_a_title: A.title ?? null,
      item_a_legacy_id: A.legacy_id ?? null,
      item_a_priority: A.priority ?? null,
      item_a_intersection_summary: A.intersection_summary ?? null,
      item_b_id: p.b,
      item_b_title: B.title ?? null,
      item_b_legacy_id: B.legacy_id ?? null,
      item_b_priority: B.priority ?? null,
      item_b_intersection_summary: B.intersection_summary ?? null,
      basis: p.basis,
      explicitly_linked: p.explicitly_linked,
      score: p.score,
      band: bandOf(p.score),
    });
  }
  // Rank: scored pairs by score desc; explicit-only pairs after scored ones; id tie-breaks keep the
  // order deterministic under equal scores.
  out.sort((x, y) => {
    const xs = x.score ?? -1, ys = y.score ?? -1;
    return ys - xs || x.item_a_id.localeCompare(y.item_a_id) || x.item_b_id.localeCompare(y.item_b_id);
  });
  const limited = out.slice(0, Math.max(1, limit));
  const stats = {
    total: limited.length,
    explicit_count: limited.filter((r) => r.explicitly_linked).length,
    by_band: {
      strong: limited.filter((r) => r.band === "strong").length,
      medium: limited.filter((r) => r.band === "medium").length,
      weak: limited.filter((r) => r.band === "weak").length,
      explicit: limited.filter((r) => r.band === "explicit").length,
    },
  };
  return { pairs: limited, stats };
}
