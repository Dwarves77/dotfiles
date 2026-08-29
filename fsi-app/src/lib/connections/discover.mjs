// discover.mjs — CONNECTION DISCOVERY core (Pillar A1). PURE, no DB, no LLM.
//
// The differentiator: each surface educated by the others. The entity linker (link-items.ts) already finds
// ONE connection signal — this item's text names another item's entity. This adds the signals text alone
// can't give: two items connected because they SHARE PROVENANCE — the same source, a shared operational
// scenario, a shared compliance object, or the same jurisdiction+topic. Same graph
// (item_cross_references), same moat, complementary discovery. It is source-growth applied to connections:
// discover what items SHARE, then the connection is grounded in that shared basis.
//
// GROUNDING GUARANTEE (non-negotiable, same moat as FACT spans): every connection carries its BASIS — the
// real shared attribute(s) that justify it. A connection with no basis is never emitted. No invented links.
//
// Inputs: two item "provenance signatures":
//   { id, item_type, source_id?, compliance_object_tags?, operational_scenario_tags?,
//     jurisdictions?, jurisdiction_iso?, topic_tags? }
// Optional surfaceOf(item_type) -> surface string; default compares item_type (a proxy for "different page").
// Optional freqMap (ADR-019) -> { freq: Map<tag,count>, refFreq: number }, from computeTagFrequencies() over
//   the SAME corpus the caller already loaded — see computeTagFrequencies() below. Absent freqMap ⇒ every
//   shared-scenario tag scores at full flat weight (exact pre-ADR-019 behavior); this is the back-compat path.
// Output: { score: 0..1, basis: [{ signal, detail, weight }], crossSurface: boolean, relationship: string }
//   relationship = the strongest signal's name (stored on the edge); basis = the full grounded reason list.

const arr = (x) => (Array.isArray(x) ? x.filter((v) => typeof v === "string" && v.trim()) : []);
const lc = (s) => String(s || "").toLowerCase().trim();
const overlap = (a, b) => {
  const B = new Set(arr(b).map(lc));
  return [...new Set(arr(a).map(lc))].filter((x) => B.has(x));
};
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ADR-019 (inverse-frequency scenario weighting). A shared operational_scenario_tag is a stronger signal
// the rarer it is corpus-wide — a tag every third item carries (e.g. emissions-reporting-Scope3, 22% of
// the tagged corpus) says less about two items belonging together than a tag two items share alone.
//
// idf(tag) = clamp( 1 - 0.25 * log2( freq(tag) / REF_FREQ ), 0.25, 1.0 )
//   freq(tag)  = count of non-archived corpus items carrying tag (computed by computeTagFrequencies()).
//   REF_FREQ   = median frequency among tags occurring >= 2 times (even count: mean of the two middles).
//   At freq == REF_FREQ (median tag): idf = 1.0 (full weight). At freq == 8x REF_FREQ: idf = 0.25 (floor).
//   Rarer-than-median tags clamp at the 1.0 ceiling — never penalized, only ubiquitous tags are discounted.
//
// [DEVIATION from the plan-stated form 1/(1+log2(freq/REF_FREQ))]: that reciprocal form has a pole at
// freq == REF_FREQ/2 (denominator 1+log2(0.5) = 0 -> division by zero) and inverts sign for any tag rarer
// than half the median, clamping those RARE tags to the 0.25 FLOOR instead of the 1.0 ceiling the plan
// itself specifies ("rarer-than-median clamps at 1.0"). Verified against the live corpus 2026-08-21:
// REF_FREQ = 9, and 23 of 79 frequency-eligible tags (29%) sit below REF_FREQ/2 = 4.5 — disproportionately
// WO-7's newly introduced specialized tags, i.e. exactly the population this weighting exists to reward.
// This linear-in-log form hits the same two anchor points the plan names (median -> 1.0; 8x median -> 0.25)
// with no pole and monotonic behavior across the whole domain. Operator-authorized 2026-08-21 (in-session
// ruling) after the defect was verified against live data, in place of the literal reciprocal form.
function idf(tag, freqMap) {
  if (!freqMap) return 1;
  const refFreq = freqMap.refFreq;
  if (!refFreq) return 1; // no tag occurs >=2x in this corpus snapshot -> nothing to reference against
  const freq = freqMap.freq.get(tag) || 1; // tag absent from the map (shouldn't happen) -> treat as rarest
  return clamp(1 - 0.25 * Math.log2(Math.max(1, freq) / refFreq), 0.25, 1);
}

/**
 * Compute per-tag frequency and REF_FREQ from a corpus of item provenance signatures (ADR-019).
 * Pure, deterministic, no I/O — the caller supplies the same non-archived corpus it already loaded for
 * discoverConnections(); this performs no new query and reads no new data source (plan rule 2).
 * @param {*[]} corpus - item signatures (only .operational_scenario_tags is read)
 * @returns {{freq: Map<string, number>, refFreq: number}}
 */
export function computeTagFrequencies(corpus) {
  const freq = new Map();
  for (const item of Array.isArray(corpus) ? corpus : []) {
    for (const t of new Set(arr(item?.operational_scenario_tags).map(lc))) {
      freq.set(t, (freq.get(t) || 0) + 1);
    }
  }
  const eligible = [...freq.values()].filter((n) => n >= 2).sort((x, y) => x - y);
  let refFreq = 0;
  if (eligible.length) {
    const mid = Math.floor(eligible.length / 2);
    refFreq = eligible.length % 2 === 1 ? eligible[mid] : (eligible[mid - 1] + eligible[mid]) / 2;
  }
  return { freq, refFreq };
}

// Signal weights (tuned against the live corpus 2026-08-09). operational_scenario_tags are the
// SUBSTANTIVE signal (emissions-reporting-Scope3, dangerous-goods-transport-road) — a single shared one is
// a real connection. shared source is strong. jurisdiction+topic is weakest and needs BOTH.
const W = { shared_source: 0.4, shared_scenario: 0.3, shared_compliance_object: 0.18, shared_jurisdiction_topic: 0.2 };
const PER_TAG_CAP = 3; // cap repeated-tag contributions so one noisy tag can't manufacture a connection

// ROLE tags are near-universal identity ("who it affects"), not a connection signal — almost every freight
// item is tagged freight-forwarder/shipper/carrier-*. Overlap on these is noise, so they are EXCLUDED from
// the compliance-object signal (confirmed against the live corpus: compliance_object_tags are dominated by
// these). A genuine non-role compliance object still counts.
const ROLE_TAGS = new Set([
  "freight-forwarder", "shipper", "importer", "exporter", "manufacturer-producer", "consignee", "consignor",
  "carrier-road", "carrier-ocean", "carrier-air", "carrier-rail", "carrier-inland-waterway",
  "vessel-operator", "road-fleet-operator", "carrier",
]);

/**
 * Score the connection between two items from shared provenance. Returns score+basis; empty basis => 0.
 * @param {*} a
 * @param {*} b
 * @param {(itemType: string) => (string|null|undefined)} [surfaceOf]
 * @param {{freq: Map<string,number>, refFreq: number}} [freqMap] - ADR-019; from computeTagFrequencies().
 *   Absent => every shared_scenario tag scores at the flat W.shared_scenario weight (pre-ADR-019, exact).
 */
export function scoreConnection(a = {}, b = {}, surfaceOf, freqMap) {
  if (!a || !b || !a.id || !b.id || a.id === b.id) return { score: 0, basis: [], crossSurface: false, relationship: "none" };
  const basis = [];

  // same_instrument REMOVED (WO-27, 2026-08-29): canonical_instrument_key is UNIQUE across the discovery
  // corpus by construction — the partial unique index uq_intelligence_items_canonical_key_verified_live
  // (migration 200) plus invariant EP-11 forbid two verified+live items sharing a key, so this signal can
  // never fire (0 of 1,863 live edges carried it). The column is instrument IDENTITY (the twin-defect
  // guard), not grouping. Do not re-add a key-equality signal here; instrument FAMILY/lineage relationships
  // are WO-28's typed entity_extraction edges, not a scorer signal. See ADR-021.

  // 1. Same source.
  if (a.source_id && b.source_id && a.source_id === b.source_id) {
    basis.push({ signal: "shared_source", detail: "grounded in the same source", weight: W.shared_source });
  }
  // 2. Shared operational scenarios — the SUBSTANTIVE signal. Per-tag weight = W.shared_scenario * idf(tag)
  //    (ADR-019); the PER_TAG_CAP now keeps the 3 HIGHEST-weighted tags, not the first 3 in overlap order —
  //    sort by weight desc (tag name asc as a deterministic tiebreak) before capping.
  const scRanked = overlap(a.operational_scenario_tags, b.operational_scenario_tags)
    .map((t) => ({ t, weight: W.shared_scenario * idf(t, freqMap) }))
    .sort((x, y) => (y.weight - x.weight) || (x.t < y.t ? -1 : x.t > y.t ? 1 : 0))
    .slice(0, PER_TAG_CAP);
  for (const { t, weight } of scRanked) basis.push({ signal: "shared_scenario", detail: `both touch ${t}`, weight });
  // 3. Shared compliance objects — NON-role only (role tags are near-universal identity, not a signal).
  const co = overlap(a.compliance_object_tags, b.compliance_object_tags).filter((t) => !ROLE_TAGS.has(t)).slice(0, PER_TAG_CAP);
  for (const t of co) basis.push({ signal: "shared_compliance_object", detail: `both address ${t}`, weight: W.shared_compliance_object });
  // 4. Shared jurisdiction AND topic (requires BOTH to overlap — either alone is too broad worldwide).
  const jOverlap = overlap([...arr(a.jurisdictions), ...arr(a.jurisdiction_iso)], [...arr(b.jurisdictions), ...arr(b.jurisdiction_iso)]);
  const tOverlap = overlap(a.topic_tags, b.topic_tags);
  if (jOverlap.length && tOverlap.length) {
    basis.push({ signal: "shared_jurisdiction_topic", detail: `both in ${jOverlap.slice(0, 2).join("/")} on ${tOverlap.slice(0, 2).join("/")}`, weight: W.shared_jurisdiction_topic });
  }

  if (!basis.length) return { score: 0, basis: [], crossSurface: false, relationship: "none" };

  const score = Math.min(1, basis.reduce((s, x) => s + x.weight, 0));
  // strongest signal names the edge relationship
  const relationship = basis.slice().sort((x, y) => y.weight - x.weight)[0].signal;
  const surfA = surfaceOf ? surfaceOf(a.item_type) : a.item_type;
  const surfB = surfaceOf ? surfaceOf(b.item_type) : b.item_type;
  const crossSurface = Boolean(surfA && surfB && lc(surfA) !== lc(surfB));
  return { score, basis, crossSurface, relationship };
}

/**
 * Rank an item's connections against a candidate set. Returns material connections (score >= threshold),
 * strongest first, each with its grounded basis. This is what the backfill (A2) and mint-time discovery
 * (U4) write as edges.
 * @param {*} item
 * @param {*[]} candidates
 * @param {{threshold?: number, limit?: number, surfaceOf?: (itemType: string) => (string|null|undefined), freqMap?: {freq: Map<string,number>, refFreq: number}}} [opts]
 *   surfaceOf is untyped-JS-inferred without this annotation (TS sees only the destructured defaults,
 *   not the no-default `surfaceOf` binding) — first surfaced when mint-item.ts (U4) became this
 *   function's first typed (.ts) consumer. Explicit here so the shape is correct for every consumer,
 *   not patched with a cast at each call site.
 *   freqMap (ADR-019, optional): pass computeTagFrequencies(corpus) to enable inverse-frequency scenario
 *   weighting; omit for the exact pre-ADR-019 flat-weight behavior.
 */
export function discoverConnections(item, candidates, { threshold = 0.3, limit = 12, surfaceOf, freqMap } = {}) {
  const out = [];
  for (const c of Array.isArray(candidates) ? candidates : []) {
    const r = scoreConnection(item, c, surfaceOf, freqMap);
    if (r.score >= threshold) out.push({ target: c.id, ...r });
  }
  out.sort((x, y) => {
    if (y.crossSurface !== x.crossSurface) return y.crossSurface ? 1 : -1; // surface the cross-surface links first — the differentiator
    return y.score - x.score;
  });
  return out.slice(0, limit);
}
