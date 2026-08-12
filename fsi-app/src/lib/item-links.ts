/** Which SURFACE owns an intelligence item, answered once for both directions:
 *  where the item's row links TO, and which `[slug]` route may render it.
 *  One definition, derived from the one classification source-of-truth.
 *
 *  CLIENT-SAFE BY CONSTRUCTION. The only import is `surfaceOf` from
 *  src/lib/surface-of.mjs, which is plain dependency-free ESM, so client
 *  components can consume this without dragging a server module into the
 *  bundle.
 *
 *  WHY THIS IS ITS OWN MODULE (misroute contract, 2026-08-08). The dashboard
 *  cards (DashboardTopPriority, DashboardByOwner, WhatChanged) each
 *  hand-typed `/regulations/${id}` for every row, but the dashboard payload
 *  (migration 064 RPC) is the LIMIT-50 priority slice of the WHOLE corpus —
 *  no item_type filter — so a critical market_signal or research_finding
 *  rendered on the dashboard linked into the Regulations frame. The
 *  five-surface model routes each item_type to exactly one surface
 *  (caros-ledge-platform-intent; `surfaceOf` is the ratified JS/SQL
 *  single home for that mapping), so the href must derive from the same
 *  classifier, not from a per-component literal.
 *
 *  BOTH DIRECTIONS, ONE ANSWER (2026-08-11). This module originally answered
 *  only the OUTBOUND question. The INBOUND question — may this route render
 *  this item? — was answered NOWHERE: fetchIntelligenceItemUncached gated on
 *  `provenance_status='verified'` and nothing else, and all four `[slug]`
 *  pages called it and only 404'd on null. So every verified item was
 *  reachable at four URLs under four contradictory framings, and each detail
 *  surface RELABELLED the item's stored sections with its own heading map
 *  while silently dropping out-of-range keys (a 15-section regulation opened
 *  at /operations/<slug> rendered keys 1-8 under Operations headings and
 *  dropped 9-15). The platform knew which surface an item belonged to when it
 *  wrote a link OUT, and never checked when a request came IN.
 *  `canonicalSurfaceForItem` is now the single answer both directions consume,
 *  so an href and a route guard cannot disagree by construction: if a link is
 *  emitted to a surface, that surface renders it; if it is not, that surface
 *  404s it.
 *
 *  Sibling, NOT a duplicate: src/lib/watchlist-links.ts routes WATCHLIST rows,
 *  which are keyed by the WatchlistItemType vocabulary (reg/signal/research/
 *  operations/source) rather than by (item_type, domain); the two modules
 *  answer the same question for two different row vocabularies.
 */

// RELATIVE, not `@/lib/...`, deliberately: this module is imported by a
// node --test proof (src/__tests__/surface-admission.test.mjs) via Node 24
// type-stripping, which resolves relative specifiers but not the tsconfig
// `@/` alias. Same rule glob-portability.test.mjs enforces on discipline
// globs. Next resolves relative and aliased specifiers identically.
import { surfaceOf } from "./surface-of.mjs";

/** The four surfaces that own a `[slug]` detail route. */
export type DetailSurface = "regulations" | "market" | "operations" | "research";

/**
 * The ONE canonical surface for an item, for both link emission and route
 * admission. Derived from `surfaceOf`, the ratified (item_type, domain)
 * classifier that also codegens migration 148's SQL.
 *
 * `uncategorized` — surfaceOf's defect-signal answer for an unmatched
 * (item_type, domain) pair, and its answer when a caller has neither field —
 * resolves to `regulations`. That is deliberately the SAME fallback the
 * outbound href has always used: the defect population stays navigable at one
 * honest address rather than 404ing, and stays visible to
 * surface-visibility-audit.mjs, which is what remediates it. Narrowing this
 * fallback is a data-layer decision about the null-domain population, not a
 * routing one, and belongs with that remediation rather than here.
 *
 * IMPORTANT — pass the RAW `intelligence_items.item_type` / `.domain`. Several
 * row mappers coalesce a null domain to 1 (`row.domain || 1`), which makes an
 * unclassified row of ANY item_type answer "regulations" via the domain rule.
 * Classifying off a coalesced value launders a defect into a verdict.
 */
export function canonicalSurfaceForItem(item: {
  type?: string | null;
  domain?: number | null;
}): DetailSurface {
  switch (surfaceOf(item.type ?? null, item.domain ?? null)) {
    case "market":
      return "market";
    case "research":
      return "research";
    case "operations":
      return "operations";
    case "regulations":
    default:
      return "regulations";
  }
}

/**
 * The detail-page href for an intelligence item, routed to its canonical
 * surface. Every surface's `[slug]` route resolves the same UI id
 * (legacy_id || uuid) via fetchIntelligenceItem, so the id needs no
 * per-surface translation.
 */
export function itemDetailHref(item: {
  id: string;
  type?: string | null;
  domain?: number | null;
}): string {
  return `/${canonicalSurfaceForItem(item)}/${encodeURIComponent(item.id)}`;
}
