// discover.mjs — CONNECTION DISCOVERY core (Pillar A1). PURE, no DB, no LLM.
//
// The differentiator: each surface educated by the others. The entity linker (link-items.ts) already finds
// ONE connection signal — this item's text names another item's entity. This adds the signals text alone
// can't give: two items connected because they SHARE PROVENANCE — the same legal instrument, the same
// source, the same compliance object or operational scenario, or the same jurisdiction+topic. Same graph
// (item_cross_references), same moat, complementary discovery. It is source-growth applied to connections:
// discover what items SHARE, then the connection is grounded in that shared basis.
//
// GROUNDING GUARANTEE (non-negotiable, same moat as FACT spans): every connection carries its BASIS — the
// real shared attribute(s) that justify it. A connection with no basis is never emitted. No invented links.
//
// Inputs: two item "provenance signatures":
//   { id, item_type, canonical_instrument_key?, source_id?, compliance_object_tags?, operational_scenario_tags?,
//     jurisdictions?, jurisdiction_iso?, topic_tags? }
// Optional surfaceOf(item_type) -> surface string; default compares item_type (a proxy for "different page").
// Output: { score: 0..1, basis: [{ signal, detail, weight }], crossSurface: boolean, relationship: string }
//   relationship = the strongest signal's name (stored on the edge); basis = the full grounded reason list.

const arr = (x) => (Array.isArray(x) ? x.filter((v) => typeof v === "string" && v.trim()) : []);
const lc = (s) => String(s || "").toLowerCase().trim();
const overlap = (a, b) => {
  const B = new Set(arr(b).map(lc));
  return [...new Set(arr(a).map(lc))].filter((x) => B.has(x));
};

// Signal weights (tuned against the live corpus 2026-08-09). Same-instrument dominates (two framings of
// ONE instrument across surfaces is the canonical cross-surface link). operational_scenario_tags are the
// SUBSTANTIVE signal (emissions-reporting-Scope3, dangerous-goods-transport-road) — a single shared one is
// a real connection. shared source is strong. jurisdiction+topic is weakest and needs BOTH.
const W = { same_instrument: 0.9, shared_source: 0.4, shared_scenario: 0.3, shared_compliance_object: 0.18, shared_jurisdiction_topic: 0.2 };
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

/** Score the connection between two items from shared provenance. Returns score+basis; empty basis => 0. */
export function scoreConnection(a = {}, b = {}, surfaceOf) {
  if (!a || !b || !a.id || !b.id || a.id === b.id) return { score: 0, basis: [], crossSurface: false, relationship: "none" };
  const basis = [];

  // 1. Same canonical instrument (both present, equal) — the strongest, cross-surface-defining signal.
  if (a.canonical_instrument_key && b.canonical_instrument_key && lc(a.canonical_instrument_key) === lc(b.canonical_instrument_key)) {
    basis.push({ signal: "same_instrument", detail: `both concern instrument ${a.canonical_instrument_key}`, weight: W.same_instrument });
  }
  // 2. Same source.
  if (a.source_id && b.source_id && a.source_id === b.source_id) {
    basis.push({ signal: "shared_source", detail: "grounded in the same source", weight: W.shared_source });
  }
  // 3. Shared operational scenarios — the SUBSTANTIVE signal.
  const sc = overlap(a.operational_scenario_tags, b.operational_scenario_tags).slice(0, PER_TAG_CAP);
  for (const t of sc) basis.push({ signal: "shared_scenario", detail: `both touch ${t}`, weight: W.shared_scenario });
  // 4. Shared compliance objects — NON-role only (role tags are near-universal identity, not a signal).
  const co = overlap(a.compliance_object_tags, b.compliance_object_tags).filter((t) => !ROLE_TAGS.has(t)).slice(0, PER_TAG_CAP);
  for (const t of co) basis.push({ signal: "shared_compliance_object", detail: `both address ${t}`, weight: W.shared_compliance_object });
  // 5. Shared jurisdiction AND topic (requires BOTH to overlap — either alone is too broad worldwide).
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
 * @param {{threshold?: number, limit?: number, surfaceOf?: (itemType: string) => (string|null|undefined)}} [opts]
 *   surfaceOf is untyped-JS-inferred without this annotation (TS sees only the destructured defaults,
 *   not the no-default `surfaceOf` binding) — first surfaced when mint-item.ts (U4) became this
 *   function's first typed (.ts) consumer. Explicit here so the shape is correct for every consumer,
 *   not patched with a cast at each call site.
 */
export function discoverConnections(item, candidates, { threshold = 0.3, limit = 12, surfaceOf } = {}) {
  const out = [];
  for (const c of Array.isArray(candidates) ? candidates : []) {
    const r = scoreConnection(item, c, surfaceOf);
    if (r.score >= threshold) out.push({ target: c.id, ...r });
  }
  out.sort((x, y) => {
    if (y.crossSurface !== x.crossSurface) return y.crossSurface ? 1 : -1; // surface the cross-surface links first — the differentiator
    return y.score - x.score;
  });
  return out.slice(0, limit);
}
