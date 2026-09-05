/**
 * Market signal detail (`/market/[slug]`) — server component.
 *
 * Mirrors `/regulations/[slug]/page.tsx`: loads the intelligence_items row
 * via loadDetail (src/lib/detail/load-detail.ts), handles UUID→slug
 * redirect, and renders MarketSignalDetailSurface.
 *
 * PERF lane (2026-09-03, docs/audits/perf-load-times-2026-09-03.md): this
 * page used to run 8 sequential Supabase-touching stages per render, most
 * opening their own createClient(). It now runs one cached, item-scoped
 * bundle (resourceLookup, convergence, price board, carbon factors, peers
 * entity, related-signals pool — none of it org-dependent as of PERF-10, see
 * below).
 *
 * PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up): three more cookie reads used to run
 * during this page's own server render, forcing `ƒ` (Dynamic) independent of every other cause —
 * loadViewerScoped's `orgId` (itself sourced from cookies inside loadDetailCore, feeding the note
 * lookup AND getMarketIntelItems' internal resolveOrgIdFromCookies() call), and
 * watchMembershipPromise's resolveViewerIdentityFromCookies(). Fixed the same way as
 * regulations/[slug] (see that file's PERF-10 header for the full mechanism):
 *   - related signals: getPublicMarketIntelItems() (src/lib/data.ts, unstable_cache-wrapped, no
 *     cookies — the `_public` RPC sibling added this lane, migration 306) replaces getMarketIntelItems(),
 *     moving from loadViewerScoped into the cached loadItemScoped bundle. Same platform-wide-not-
 *     per-org-override trade-off already accepted for /market, /operations, /research's own list
 *     pages this lane — a related-signals rail is not the surface an org's own archive/priority
 *     override needs to be authoritative on.
 *   - workspace note: no longer read server-side at all. NotesField now falls back to
 *     useResourceStore's client-hydrated override (src/lib/hooks/useWorkspaceOverridesHydration.ts,
 *     already the global bootstrap-fed store — see its own header), same pattern OwnerTeamCard and
 *     WatchButton already established, syncing in once if the field is still untouched when the
 *     override arrives (never clobbering an in-progress edit).
 *   - watch membership: initialWatched/initialTeamWatched/initialTeamAvailable no longer passed;
 *     WatchButton's pre-existing client fallback (getClientWatchMembership) takes over, same as
 *     regulations/[slug].
 *
 * Related signals (same signal-band) are sourced from the platform-wide public Market Intel set via
 * getPublicMarketIntelItems, with the current item excluded. The same band-assignment + severity-
 * derivation helpers used in MarketPage.tsx are re-implemented here (MarketPage's helpers are not
 * exported) — when migration 102 populates `signal_band` and `severity` on the items themselves,
 * both surfaces flow through the same column reads and the regex fallback retires.
 */

import { formatDate } from "@/lib/format";
import { notFound, redirect } from "next/navigation";
import { loadDetail } from "@/lib/detail/load-detail";
import { fetchClaimTierMap } from "@/lib/detail/load-detail-core";
import type { ClaimTierMap } from "@/lib/agent/parse-record-sections";
import { getPublicMarketIntelItems, getPublicSurfaceSlugs } from "@/lib/data";
import {
  buildResourceLookup,
  resolveItemUuid,
  fetchInstrumentEntityId,
} from "@/lib/connections/resource-lookup";
import { getServiceSupabase } from "@/lib/supabase-service";
import {
  MarketSignalDetailSurface,
  type PriceStat,
  type EmissionFactorRow,
} from "@/components/pages/MarketSignalDetailSurface";
import { PeersDiscussingStrip } from "@/components/shared/PeersDiscussingStrip";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ItemScoped {
  resourceLookup: Awaited<ReturnType<typeof buildResourceLookup>>;
  peersEntityId: string | null;
  convergence: { independent_citers: number; confirmation_count: number } | null;
  priceBoard: PriceStat[];
  carbonFactors: EmissionFactorRow[];
  /** TIER-CHIP lane (2026-09-04): a record-grade item's FACT claims' ratings — see
   *  load-detail-core.ts's fetchClaimTierMap header. Item-scoped, read unconditionally (a brief-grade
   *  item's query legitimately returns no rows, resolving to {} at zero extra cost). */
  claimTiers: ClaimTierMap;
  /** PERF-10 (2026-09-04): moved here from loadViewerScoped — see this file's header. Platform-wide,
   *  not per-org-override-adjusted; genuinely item-scoped, cacheable. */
  relatedPool: Awaited<ReturnType<typeof getPublicMarketIntelItems>>["resources"];
}

// PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up): the remaining reason this route still
// built `ƒ` after every Dynamic API call was removed from its render tree — a dynamic segment
// (`[slug]`) with no `generateStaticParams` is unconditionally server-rendered per request under
// classical (non-PPR) rendering, independent of Dynamic API usage. See
// regulations/[slug]/page.tsx's identical-shape comment for the full explanation of why `[]` (not a
// full slug enumeration) is the correct return value here: an unbounded, continuously-growing corpus,
// with `dynamicParams` at its default `true` so every slug is rendered on first request and served
// from the Full Route Cache thereafter.
//
// PERF-13 (2026-09-04, ADR-027 §1): SUPERSEDES the decision above (kept verbatim, not deleted, per
// CLAUDE.md rule 14 — correcting findings in place, not erasing the prior lane's reasoning) — see
// regulations/[slug]/page.tsx's own generateStaticParams comment for the full measurement (live
// Chrome, corpus size, doc citations) this correction is based on. This surface's own corpus is 55
// verified, non-archived items (Supabase MCP, `get_market_intel_items_public()` row count,
// 2026-09-04) — small, not "unbounded" — enumerated at build time via
// `getPublicSurfaceSlugs("market")` (src/lib/data.ts, the SAME function every `[slug]` route now
// calls, reading through this surface's own existing `getPublicMarketIntelItems()` path — no new
// query). `dynamicParams` stays `true` for an item minted after the last build; the deploy-time warm
// step (docs/runbooks/warm-static-detail-routes.md) closes that gap before a real viewer's first click.
export async function generateStaticParams() {
  const slugs = await getPublicSurfaceSlugs("market");
  return slugs.map((slug) => ({ slug }));
}

export default async function MarketSignalDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const id = decodeURIComponent(slug);

  // UUID → slug redirect (mirrors /regulations/[slug] pattern). Must resolve
  // (or fall through) BEFORE fetchIntelligenceItem — cannot join loadDetail's
  // parallel bundle.
  let redirectTo: string | null = null;
  if (UUID_RE.test(id)) {
    try {
      const supabase = getServiceSupabase();
      const { data: byId } = await supabase
        .from("intelligence_items")
        .select("legacy_id")
        .eq("id", id)
        .maybeSingle();
      if (byId?.legacy_id) {
        redirectTo = `/market/${encodeURIComponent(byId.legacy_id)}`;
      }
    } catch {
      // Soft-fail; fetchIntelligenceItem still tries by uuid.
    }
  }
  if (redirectTo) redirect(redirectTo);

  // PERF-10 (2026-09-04): watch membership and the note lookup both used to run here, cookie-
  // dependent, on every server render — see this file's header. Both now resolve client-side
  // (WatchButton / NotesField's fallback contracts), so this page makes no per-viewer Supabase read.
  const result = await loadDetail<ItemScoped>({
    surface: "market",
    id,
      // Item-scoped, org-independent: connections/supersessions titles, the
      // source-growth convergence stats, the published price board, the
      // carbon-overlay modal-default factors, and the peers-strip entity.
      // Cached — shared across every org that views this item.
      loadItemScoped: async ({ supabase, resource, connections, supersessions }) => {
        const itemUuid = await resolveItemUuid(supabase, resource.id);

        const convergencePromise: Promise<ItemScoped["convergence"]> = resource.sourceId
          ? Promise.resolve(
              supabase
                .from("sources")
                .select("independent_citers, confirmation_count")
                .eq("id", resource.sourceId)
                .maybeSingle()
            )
              .then(({ data: srcRow }) => {
                if (
                  srcRow &&
                  typeof srcRow.independent_citers === "number" &&
                  srcRow.independent_citers > 0
                ) {
                  return {
                    independent_citers: srcRow.independent_citers,
                    confirmation_count: srcRow.confirmation_count ?? srcRow.independent_citers,
                  };
                }
                return null;
              })
              .catch(() => null)
          : Promise.resolve(null);

        // DEFECT FIXED 2026-08-30 (found by the WO-13 lane, verified against live
        // data): published_price_statistics.item_id is a uuid FK; resource.id may
        // be a legacy_id. Resolve to uuid FIRST (itemUuid above) or the lookup
        // silently 22P02s.
        const priceBoardPromise: Promise<PriceStat[]> = Promise.resolve(
          itemUuid
            ? supabase
                .from("published_price_statistics")
                .select(
                  "label, value_display, unit, context_line, severity_tone, source_tier, released_at, next_release_at, next_release_label, sort_order"
                )
                .eq("item_id", itemUuid)
                .order("sort_order", { ascending: true })
            : { data: null, error: null }
        )
          .then(({ data: priceRows, error: priceErr }) => {
            if (priceErr) console.error("[market/[slug]] price-board fetch failed", priceErr);
            return Array.isArray(priceRows)
              ? priceRows.map((p) => ({
                  label: p.label,
                  valueDisplay: p.value_display,
                  unit: p.unit,
                  contextLine: p.context_line,
                  severityTone: p.severity_tone,
                  sourceTier: p.source_tier,
                  releasedAt: p.released_at,
                  nextReleaseAt: p.next_release_at,
                  nextReleaseLabel: p.next_release_label,
                }))
              : [];
          })
          .catch(() => [] as PriceStat[]);

        // WO-24: carbon overlay — the whole modal_default tier (small, 2 rows
        // today). Selection (which row applies to THIS signal's jurisdiction)
        // happens client-side via selectModalFactor/buildCarbonOverlayView.
        const carbonFactorsPromise: Promise<EmissionFactorRow[]> = Promise.resolve(
          supabase
            .from("emission_factors")
            .select(
              "factor_id, mode, vehicle_class, jurisdiction, quantity_basis, ttw_co2e, wtt_co2e, wtw_co2e, source_key, tier, scope_kind"
            )
            .eq("tier", "modal_default")
            .is("superseded_by", null)
        )
          .then(({ data: factorRows, error: factorErr }) => {
            if (factorErr) console.error("[market/[slug]] carbon-overlay factor fetch failed", factorErr);
            return Array.isArray(factorRows) ? factorRows : [];
          })
          .catch(() => [] as EmissionFactorRow[]);

        const relatedIds = Array.from(
          new Set<string>([
            ...connections.map((c) => c.id),
            ...supersessions.flatMap((s) => [s.old, s.new]),
          ])
        ).filter(Boolean);

        // PERF-10 (2026-09-04): moved from loadViewerScoped — see this file's header. Public/cached,
        // org-independent (getPublicMarketIntelItems carries no cookies() call), so it belongs in this
        // cached item-scoped bundle rather than an uncached per-request read.
        const relatedPoolPromise = getPublicMarketIntelItems()
          .then((pub) => pub.resources)
          .catch(() => [] as Awaited<ReturnType<typeof getPublicMarketIntelItems>>["resources"]);

        const [resourceLookup, peersEntityId, convergence, priceBoard, carbonFactors, claimTiers, relatedPool] =
          await Promise.all([
            buildResourceLookup(supabase, relatedIds),
            itemUuid ? fetchInstrumentEntityId(supabase, itemUuid) : Promise.resolve(null),
            convergencePromise,
            priceBoardPromise,
            carbonFactorsPromise,
            itemUuid ? fetchClaimTierMap(supabase, itemUuid) : Promise.resolve({}),
            relatedPoolPromise,
          ]);

        return { resourceLookup, peersEntityId, convergence, priceBoard, carbonFactors, claimTiers, relatedPool };
      },
    });

  // SURFACE ADMISSION GUARD (Phase 0.1, 2026-08-11) — see regulations/[slug]
  // for the full rationale; checked inside loadDetail via canonicalSurface.
  if (result.notFound) {
    notFound();
  }

  const { resource: r, supersessions, connections, sections, relevance } = result;
  const resourceLookup = result.itemScoped?.resourceLookup ?? {};
  const peersEntityId = result.itemScoped?.peersEntityId ?? null;
  const convergence = result.itemScoped?.convergence ?? null;
  const priceBoard = result.itemScoped?.priceBoard ?? [];
  const carbonFactors = result.itemScoped?.carbonFactors ?? [];
  const claimTiers = result.itemScoped?.claimTiers ?? {};
  const relatedPool = result.itemScoped?.relatedPool ?? [];

  console.log(`[perf] /market/${id} data ${result.elapsedMs}ms`);

  // Redesign T05: the hero (breadcrumb + title + deck + actions + tabs) now
  // lives inside MarketSignalDetailSurface per the approved mock (Pages - 05
  // Signal Detail), mirroring the T03 detail archetype. Compute the breadcrumb
  // middle segment ("B1 · Price signals · United States") and the deck sub-line
  // server-side from real fields. The prior EditorialMasthead + separate
  // back-link are replaced by the in-hero breadcrumb (DESIGN-DEVIATIONS D3/T05).
  const publisher = r.sourceName || r.enforcementBody || null;
  const published = r.added ? `published ${formatDate(r.added)}` : null;
  const deck = [publisher, published].filter(Boolean).join(" · ") || undefined;

  return (
    <>
      <MarketSignalDetailSurface
        resource={r}
        relatedPool={relatedPool}
        sections={sections}
        claimTiers={claimTiers}
        convergence={convergence}
        priceBoard={priceBoard}
        carbonFactors={carbonFactors}
        deck={deck}
        supersessions={supersessions}
        connections={connections}
        relevance={relevance}
        resourceLookup={resourceLookup}
      />
      <PeersDiscussingStrip entityId={peersEntityId} />
    </>
  );
}
