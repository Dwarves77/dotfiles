// connection-view-model.mjs — flywheel U9 (D1). PURE, no DB, no LLM.
//
// Turns raw item_cross_references rows (as widened by fetchIntelligenceItem in supabase-server.ts) into
// display-ready rows for the connections card on an item's detail page. One home for this mapping so
// Regulations/Market/Operations/Research render the SAME relationship labels and basis summaries —
// the drift class this file exists to prevent (see surface-of.mjs's own header for the precedent).
//
// GROUNDING GUARANTEE (same moat as discover.mjs): a row's basisSummary is read verbatim from the DB
// column written by discover.mjs/write-edges.mjs — never invented, never re-derived here.

import { isIntersectionEntry } from "./intersections.mjs";
import { labelForScenario, labelForComplianceObject, joinLabels } from "./tag-labels.mjs";

/** @type {Record<string, string>} Explicit relationship types (rare — agent_semantic/entity_extraction/
 *  manual origin). 'related' (the flywheel discovery default) is NOT here — it falls through to the
 *  direction-based label below, since "related" alone carries no directional grammar of its own. */
export const RELATIONSHIP_LABEL = {
  supersedes: "Supersedes",
  implements: "Implements",
  conflicts: "Conflicts with",
  amends: "Amends",
  depends_on: "Depends on",
};

/**
 * @param {string} relationship
 * @param {"outgoing"|"incoming"} direction
 * @returns {string}
 */
export function labelForConnection(relationship, direction) {
  const explicit = RELATIONSHIP_LABEL[relationship];
  if (explicit) return explicit;
  return direction === "outgoing" ? "References" : "Referenced by";
}

const SURFACE_PATH = {
  regulations: "/regulations",
  market: "/market",
  operations: "/operations",
  research: "/research",
};

/**
 * @param {Array<{id: string, direction: "outgoing"|"incoming", relationship: string, origin: string,
 *   basis: Array<{signal: string, detail: string, weight: number}> | null, score: number | null,
 *   surface: string}>} connections
 * @param {Record<string, {id: string, title: string, priority: string}>} resourceLookup gated title
 *   lookup (customer read gate already applied by the caller — an id absent here is treated as
 *   not-yet-verified/unavailable and the row is dropped, never rendered with a raw id as a fake title).
 * @returns {Array<{id: string, title: string, priority: string, label: string, surface: string,
 *   href: string | null, origin: string, discovered: boolean,
 *   basisSummary: Array<{signal: string, weight: number}>, score: number | null}>}
 *   Sorted: discovered (provenance_discovery, has a real basis) rows first by score desc, then the
 *   rest in their original order — surfaces the flywheel's new signal without burying the pre-existing
 *   manual/entity/semantic links.
 */
export function buildConnectionRows(connections, resourceLookup) {
  const list = Array.isArray(connections) ? connections : [];
  const lookup = resourceLookup && typeof resourceLookup === "object" ? resourceLookup : {};
  const seen = new Set();
  const rows = [];
  for (const c of list) {
    if (!c || !c.id || seen.has(c.id)) continue;
    const ref = lookup[c.id];
    if (!ref) continue; // unverified/unavailable target — never render a bare id as a fake title
    seen.add(c.id);
    const origin = c.origin || "manual";
    const basis = Array.isArray(c.basis) ? c.basis : [];
    const discovered = origin === "provenance_discovery" && basis.length > 0;
    const surface = c.surface || "uncategorized";
    rows.push({
      id: c.id,
      title: ref.title,
      priority: ref.priority,
      label: labelForConnection(c.relationship, c.direction),
      surface,
      href: SURFACE_PATH[surface] ? `${SURFACE_PATH[surface]}/${encodeURIComponent(c.id)}` : null,
      origin,
      discovered,
      basisSummary: basis.slice(0, 3).map((b) => ({ signal: b.signal, weight: b.weight })),
      score: typeof c.score === "number" ? c.score : null,
    });
  }
  rows.sort((a, b) => {
    if (a.discovered !== b.discovered) return a.discovered ? -1 : 1;
    if (a.discovered && b.discovered) return (b.score ?? 0) - (a.score ?? 0);
    return 0;
  });
  return rows;
}

/**
 * Supersessions (item_supersessions — a distinct table from item_cross_references; a strict subtype of
 * cross-reference with regulatory semantic meaning: "this regulation replaces that regulation"). Kept as
 * a SEPARATE pure function (distinct data source, distinct table) rather than folded into
 * buildConnectionRows — merged by the caller (buildAllConnectionRows) so supersessions render first,
 * matching the prior LinkedItemsCard's proven ordering ("strongest semantic relationships" first).
 *
 * Href is hardcoded to /regulations/ (never surface-routed like buildConnectionRows' rows): supersession
 * is a regulation-domain concept in this schema (item_supersessions has no domain/item_type embed, and
 * none of the four surfaces' data ever populates it for a non-regulation pair) — widening that embed for
 * a relationship that in practice never crosses surfaces would be speculative, not a real need.
 *
 * Unlike buildConnectionRows, a missing resourceLookup entry does NOT drop the row — it falls back to
 * the raw id (matching the prior LinkedItemsCard behavior exactly, since a supersession's existence is
 * itself the material fact even if the target's title can't be resolved).
 * @param {Array<{old: string, new: string, oldTitle?: string, newTitle?: string}>} supersessions
 * @param {string} selfId
 * @param {Record<string, {id: string, title: string, priority: string}>} resourceLookup
 */
export function buildSupersessionRows(supersessions, selfId, resourceLookup) {
  const list = Array.isArray(supersessions) ? supersessions : [];
  const lookup = resourceLookup && typeof resourceLookup === "object" ? resourceLookup : {};
  const seen = new Set();
  const rows = [];
  for (const s of list) {
    if (!s) continue;
    if (s.old === selfId && s.new && !seen.has(s.new)) {
      const ref = lookup[s.new];
      rows.push({
        id: s.new, title: ref?.title || s.newTitle || s.new, priority: ref?.priority ?? "MODERATE",
        label: "Superseded by", surface: "regulations", href: `/regulations/${encodeURIComponent(s.new)}`,
        origin: "manual", discovered: false, basisSummary: [], score: null,
      });
      seen.add(s.new);
    } else if (s.new === selfId && s.old && !seen.has(s.old)) {
      const ref = lookup[s.old];
      rows.push({
        id: s.old, title: ref?.title || s.oldTitle || s.old, priority: ref?.priority ?? "MODERATE",
        label: "Supersedes", surface: "regulations", href: `/regulations/${encodeURIComponent(s.old)}`,
        origin: "manual", discovered: false, basisSummary: [], score: null,
      });
      seen.add(s.old);
    }
  }
  return rows;
}

/**
 * The single call a detail page's connections card makes: supersessions first (strongest semantic
 * relationship), then the discovered/other cross-reference rows from buildConnectionRows.
 * @param {Array<{old: string, new: string, oldTitle?: string, newTitle?: string}>} supersessions
 * @param {string} selfId
 * @param {Array} connections
 * @param {Record<string, {id: string, title: string, priority: string}>} resourceLookup
 */
export function buildAllConnectionRows(supersessions, selfId, connections, resourceLookup) {
  return [
    ...buildSupersessionRows(supersessions, selfId, resourceLookup),
    ...buildConnectionRows(connections, resourceLookup),
  ];
}

// ── Intersections on every detail page (lane S3-B) ──────────────────────────────────────────────────
// The intersection entry on a pair's edge (intersections.mjs, written by lane S3-A) says WHICH scenarios
// and compliance objects two items share and how strongly. This is the read side for a customer: it
// groups the item's intersecting neighbours by the page they live on, in plain words, with human labels.
// The strength is used only to ORDER items and to choose inline versus collapsed; it is never exposed
// (no score reaches a customer, and no raw tag slug either).

/** The four intelligence pages' customer-facing names. Drift-tested against the theme-briefs heading map. */
export const SURFACE_LABELS = Object.freeze({
  regulations: "Regulations",
  market: "Market Intel",
  research: "Research",
  operations: "Operations",
});

/** Page order for grouped lists. */
export const SURFACE_ORDER = Object.freeze(["regulations", "market", "research", "operations"]);

/**
 * One sentence naming what two items share, from an intersection entry's detail.
 * @param {{scenarios?: string[], objects?: string[]}|null|undefined} detail
 * @returns {string} "" when the detail names nothing
 */
export function couplingText(detail) {
  const scn = (Array.isArray(detail?.scenarios) ? detail.scenarios : []).map(labelForScenario).filter(Boolean);
  const obj = (Array.isArray(detail?.objects) ? detail.objects : []).map(labelForComplianceObject).filter(Boolean);
  if (!scn.length && !obj.length) return "";
  const parts = [];
  if (scn.length) parts.push(`the operational ${scn.length === 1 ? "scenario" : "scenarios"} ${joinLabels(scn)}`);
  if (obj.length) parts.push(`the compliance ${obj.length === 1 ? "object" : "objects"} ${joinLabels(obj)}`);
  return `Connected through ${parts.join(", and ")}.`;
}

/**
 * The intersection block's view-model for one item.
 * Strong and medium intersections are inline, grouped by page (other pages first in page order, this
 * page last); weak ones are returned apart as `possible`, for a collapsed "Possible connections" group
 * (docs/specs/00-foundation-the-spine.md section 6: below-threshold edges are a labelled tray, never
 * inline). A connection with no intersection entry, no gated title (resourceLookup, the customer read
 * gate) or no classifiable page is not shown: a bare id is never a title and an unclassified item has
 * no page to link to. Both directed rows of a pair collapse to one item (the stronger entry wins).
 * @param {Array<{id:string, basis?:Array<object>|null, surface?:string}>} connections
 * @param {Record<string, {id:string, title:string}>} resourceLookup
 * @param {{currentSurface: string, summary?: string|null}} opts
 * @returns {null | {summary: string|null,
 *   groups: Array<{surface:string,label:string,samePage:boolean,items:Array<{id:string,title:string,href:string,coupling:string}>}>,
 *   possible: Array<{surface:string,label:string,samePage:boolean,items:Array<{id:string,title:string,href:string,coupling:string}>}>,
 *   possibleCount: number}} null when there is nothing at all to show
 */
export function buildIntersectionView(connections, resourceLookup, { currentSurface, summary = null } = {}) {
  const lookup = resourceLookup && typeof resourceLookup === "object" ? resourceLookup : {};
  const best = new Map(); // id -> { detail, strength, surface }
  for (const c of Array.isArray(connections) ? connections : []) {
    if (!c || !c.id || !lookup[c.id] || !SURFACE_LABELS[c.surface]) continue;
    for (const b of Array.isArray(c.basis) ? c.basis : []) {
      if (!isIntersectionEntry(b) || !b.detail || typeof b.detail !== "object") continue;
      const strength = Number.isFinite(b.detail.strength) ? b.detail.strength : 0;
      const prior = best.get(c.id);
      if (!prior || strength > prior.strength) best.set(c.id, { detail: b.detail, strength, surface: c.surface });
    }
  }
  const strongOrMedium = [];
  const weak = [];
  for (const [id, e] of best) {
    const row = { id, title: lookup[id].title, href: `/${e.surface}/${encodeURIComponent(id)}`, coupling: couplingText(e.detail), strength: e.strength, surface: e.surface };
    (e.detail.tier === "weak" ? weak : strongOrMedium).push(row);
  }
  const group = (rows) => {
    const bySurface = new Map();
    for (const r of rows) {
      if (!bySurface.has(r.surface)) bySurface.set(r.surface, []);
      bySurface.get(r.surface).push(r);
    }
    const order = [...SURFACE_ORDER.filter((s) => s !== currentSurface), ...SURFACE_ORDER.filter((s) => s === currentSurface)];
    return order
      .filter((s) => bySurface.has(s))
      .map((s) => ({
        surface: s,
        label: SURFACE_LABELS[s],
        samePage: s === currentSurface,
        items: bySurface
          .get(s)
          .sort((a, b) => b.strength - a.strength || a.title.localeCompare(b.title))
          .map(({ id, title, href, coupling }) => ({ id, title, href, coupling })),
      }));
  };
  const stated = typeof summary === "string" && summary.trim() ? summary.trim() : null;
  const groups = group(strongOrMedium);
  const possible = group(weak);
  if (!stated && !groups.length && !possible.length) return null;
  return { summary: stated, groups, possible, possibleCount: weak.length };
}
