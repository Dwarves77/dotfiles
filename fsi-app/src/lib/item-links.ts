/** Where an intelligence item's row GOES when clicked, on any surface that
 *  renders a mixed-type item list (the dashboard cards are the first
 *  consumers). One definition, derived from the one classification
 *  source-of-truth.
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
 *  Sibling, NOT a duplicate: src/lib/watchlist-links.ts routes WATCHLIST rows,
 *  which are keyed by the WatchlistItemType vocabulary (reg/signal/research/
 *  operations/source) rather than by (item_type, domain); the two modules
 *  answer the same question for two different row vocabularies.
 */

import { surfaceOf } from "@/lib/surface-of.mjs";

/**
 * The detail-page href for an intelligence item, routed to its canonical
 * surface. Every surface's `[slug]` route resolves the same UI id
 * (legacy_id || uuid) via fetchIntelligenceItem, so the id needs no
 * per-surface translation.
 *
 * `uncategorized` (surfaceOf's defect-signal answer for an unmatched
 * (item_type, domain) pair, and the result when a caller has neither field)
 * falls back to `/regulations/{id}` — the pre-fix behavior for every row,
 * and a route that renders any item rather than 404ing. That keeps the
 * fallback honest-but-navigable while the defect population is remediated
 * at the data layer.
 */
export function itemDetailHref(item: {
  id: string;
  type?: string | null;
  domain?: number | null;
}): string {
  const id = encodeURIComponent(item.id);
  switch (surfaceOf(item.type ?? null, item.domain ?? null)) {
    case "market":
      return `/market/${id}`;
    case "research":
      return `/research/${id}`;
    case "operations":
      return `/operations/${id}`;
    case "regulations":
    default:
      return `/regulations/${id}`;
  }
}
