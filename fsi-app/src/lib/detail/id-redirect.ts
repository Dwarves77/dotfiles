/** Where a detail URL addressed by an item's UUID should go: the ONE decision all four `[slug]` routes
 *  (/regulations, /market, /operations, /research) share. Lane REG-REDIRECT, 2026-09-24.
 *
 *  THE DEFECT THIS REPLACES [CONFIRMED by the coordinator, Playwright, 2026-09-24]: each page read the row's
 *  `legacy_id` with the service role and 307-redirected to `/<own surface>/<legacy_id>` whenever one existed.
 *  Nothing asked whether the target would render. loadDetail admits an item only when it is
 *  `provenance_status='verified'` AND its canonical surface is the requested one, so a quarantined or
 *  unverified item (80 rows carry a legacy_id without being verified, SELECT 2026-09-24), or a verified item
 *  requested on the wrong surface, was bounced from its uuid URL into a slug URL that answered "This page
 *  doesn't exist". The live case: d2da85da (quarantined regulation) ->
 *  /regulations/uae-national-net-zero-by-2050-transport-sector-roadmap -> 404.
 *
 *  THE RULE: a uuid URL redirects only to a URL that renders.
 *    - not a uuid                                   -> render (the URL is a slug already)
 *    - lookup failed / no row                        -> render (loadDetail keeps the final say, fail-closed)
 *    - row admissible on no surface (not verified)   -> not-found HERE, at the uuid URL; never a dead slug
 *    - admissible on this surface, has a legacy_id   -> redirect to this surface's slug
 *    - admissible on this surface, no legacy_id      -> render by uuid (never a self-redirect)
 *    - admissible on ANOTHER surface                 -> redirect to that surface's slug (or its uuid URL)
 *
 *  ONE PREDICATE, NOT A SECOND ONE: `admittedSurfaceFor` is loadDetail's own admission, stated once for a raw
 *  row: fetchIntelligenceItemUncached's `provenance_status='verified'` read gate (supabase-server.ts) plus
 *  loadDetailCore's `canonicalSurface === surface` check, where canonicalSurface is canonicalSurfaceForItem
 *  (item-links.ts, the single classifier links and route guards already share). The redirect href is
 *  itemDetailHref, the same builder every list row uses. id-redirect.test.mjs's drift guard fails if either
 *  half of the mirrored predicate changes shape in its home file.
 *
 *  PURE AND node-TESTABLE: the only import is item-links.ts (itself importing only surface-of.mjs), so this
 *  module loads under plain `node --test` and from scripts/verify/id-redirect-target-audit.mjs. The DB lookup
 *  and next/navigation's redirect()/notFound() are bound in load-detail.ts (`applyIdRedirect`), the existing
 *  thin composition layer for these four routes. */

import { canonicalSurfaceForItem, itemDetailHref, type DetailSurface } from "../item-links.ts";

/** Postgres uuid text shape. The four routes' own copies of this regex were folded into this one. */
export const ITEM_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isItemUuid(value: string): boolean {
  return ITEM_UUID_RE.test(value);
}

/** The columns the decision needs, and nothing else (the PostgREST select list for the lookup). */
export const ID_REDIRECT_COLUMNS = "id, legacy_id, item_type, domain, provenance_status";

export interface IdRedirectRow {
  id: string;
  legacy_id: string | null;
  item_type: string | null;
  domain: number | null;
  provenance_status: string | null;
}

export type IdRedirectDecision =
  | { kind: "render" }
  | { kind: "redirect"; to: string }
  | { kind: "not-found" };

const DETAIL_SURFACES: readonly DetailSurface[] = ["regulations", "market", "operations", "research"];

/** The one surface whose `[slug]` route renders this row, or null when no route admits it. Pass the RAW
 *  item_type/domain (see canonicalSurfaceForItem's own warning about coalesced domains). */
export function admittedSurfaceFor(row: IdRedirectRow): DetailSurface | null {
  if (row.provenance_status !== "verified") return null;
  return canonicalSurfaceForItem({ type: row.item_type, domain: row.domain });
}

/** Decide what `/<surface>/<row.id>` does. Pure. `row === null` means the lookup found nothing. */
export function decideIdRedirect(surface: DetailSurface, row: IdRedirectRow | null): IdRedirectDecision {
  if (!row) return { kind: "render" };
  const home = admittedSurfaceFor(row);
  if (!home) return { kind: "not-found" };
  if (home === surface && !row.legacy_id) return { kind: "render" };
  return {
    kind: "redirect",
    to: itemDetailHref({ id: row.legacy_id || row.id, type: row.item_type, domain: row.domain }),
  };
}

/** Resolve a detail URL id against a lookup. The lookup may throw (no service client, a PostgREST error):
 *  that soft-fails to render, exactly as the pre-lane pages did, so loadDetail (which fails closed) still
 *  owns the final not-found. */
export async function resolveIdRedirect(
  surface: DetailSurface,
  id: string,
  lookup: (uuid: string) => Promise<IdRedirectRow | null>
): Promise<IdRedirectDecision> {
  if (!isItemUuid(id)) return { kind: "render" };
  let row: IdRedirectRow | null;
  try {
    row = await lookup(id);
  } catch {
    return { kind: "render" };
  }
  return decideIdRedirect(surface, row);
}

// ── The emit check's pure core (scripts/verify/id-redirect-target-audit.mjs) ─────────────────────────

export interface IdRedirectViolation {
  from: string;
  to: string | null;
  decision: IdRedirectDecision["kind"];
  reason: string;
}

/** Would `/<surface>/<urlId>` render, and which row? Re-derived from the detail route's own read, not from
 *  the resolver: fetchIntelligenceItemUncached selects `legacy_id = x OR (x is a uuid AND id = x)` among
 *  VERIFIED rows with maybeSingle (more than one match is an error, i.e. a 404), then loadDetailCore admits
 *  it only when canonicalSurfaceForItem(row) is the requested surface. */
function landing(
  rows: readonly IdRedirectRow[],
  surface: string,
  urlId: string
): { row: IdRedirectRow } | { reason: string } {
  const uuid = isItemUuid(urlId);
  const matches = rows.filter(
    (r) => r.provenance_status === "verified" && (r.legacy_id === urlId || (uuid && r.id === urlId))
  );
  if (matches.length === 0) return { reason: "no verified row resolves at the target" };
  if (matches.length > 1) return { reason: `${matches.length} verified rows resolve at the target` };
  const row = matches[0];
  const canonical = canonicalSurfaceForItem({ type: row.item_type, domain: row.domain });
  if (canonical !== surface) return { reason: `target surface ${surface} but the item's surface is ${canonical}` };
  return { row };
}

function parseDetailHref(href: string): { surface: string; urlId: string } | null {
  const m = /^\/([a-z]+)\/([^/?#]+)$/.exec(href);
  if (!m) return null;
  try {
    return { surface: m[1], urlId: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

/**
 * Every uuid detail URL (each row x each of the four surfaces) must end where the item can be read: on a
 * page that renders THAT item when the item is admissible anywhere, and on not-found when it is admissible
 * nowhere. Returns the violations (empty = the invariant holds). `decide` is injectable so the check itself
 * is proven by attack (id-redirect.test.mjs feeds it the pre-fix rule).
 */
export function findIdRedirectViolations(
  rows: readonly IdRedirectRow[],
  { decide = decideIdRedirect }: { decide?: (surface: DetailSurface, row: IdRedirectRow | null) => IdRedirectDecision } = {}
): IdRedirectViolation[] {
  const out: IdRedirectViolation[] = [];
  for (const row of rows) {
    const admissible = admittedSurfaceFor(row) !== null;
    for (const surface of DETAIL_SURFACES) {
      const from = `/${surface}/${row.id}`;
      const d = decide(surface, row);
      if (d.kind === "not-found") {
        if (admissible) out.push({ from, to: null, decision: d.kind, reason: "not-found for an admissible item" });
        continue;
      }
      const target = d.kind === "redirect" ? parseDetailHref(d.to) : { surface, urlId: row.id };
      const to = d.kind === "redirect" ? d.to : null;
      if (!target) {
        out.push({ from, to, decision: d.kind, reason: "redirect target is not a detail URL" });
        continue;
      }
      const land = landing(rows, target.surface, target.urlId);
      if ("reason" in land) {
        // Rendering a URL that 404s is only honest when the item is admissible nowhere; a redirect that
        // 404s never is (it is the defect this module exists to prevent).
        if (d.kind === "redirect" || admissible) out.push({ from, to, decision: d.kind, reason: land.reason });
      } else if (land.row.id !== row.id) {
        out.push({ from, to, decision: d.kind, reason: `target renders a different item (${land.row.id})` });
      }
    }
  }
  return out;
}
