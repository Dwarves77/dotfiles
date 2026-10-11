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
 * IMPORTANT — pass the RAW `intelligence_items.item_type` / `.domain`. Row
 * mappers historically coalesced a missing domain to 1 (`row.domain || 1`),
 * which made an unclassified row of ANY item_type answer "regulations" via the
 * domain rule; classifying off a coalesced value launders a defect into a
 * verdict. Fixed 2026-08-18 (WO-4): mappers emit `row.domain ?? undefined`, and
 * domain-laundering.test.mjs locks the pattern out of supabase-server.ts.
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
