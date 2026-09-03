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
 * entity — none of it org-dependent) in parallel with the viewer-scoped
 * bundle (the workspace note, and the related-signals pool — see below for
 * why the related pool is viewer-scoped even though it reads no per-org
 * override field a human would call "personal").
 *
 * getMarketIntelItems() (src/lib/data.ts) resolves the viewer's orgId from
 * cookies INTERNALLY (its own resolveOrgIdFromCookies() call) before
 * querying — the same shape getViewerRelevanceForItem uses. Next forbids
 * calling cookies() inside unstable_cache, so it cannot run inside the
 * item-scoped cached bundle regardless of whether its RPC output happens to
 * be org-invariant in practice; it runs in loadViewerScoped instead,
 * uncached, alongside the note lookup.
 *
 * Related signals (same signal-band) are sourced from the workspace-wide
 * Market Intel set via getMarketIntelItems, with the current item excluded.
 * The same band-assignment + severity-derivation helpers used in
 * MarketPage.tsx are re-implemented here (MarketPage's helpers are not
 * exported) — when migration 102 populates `signal_band` and `severity`
 * on the items themselves, both surfaces flow through the same column
 * reads and the regex fallback retires.
 */

import { formatDate } from "@/lib/format";
import { notFound, redirect } from "next/navigation";
import { loadDetail } from "@/lib/detail/load-detail";
import { getMarketIntelItems } from "@/lib/data";
import { resolveServerBootstrap } from "@/lib/api/server-bootstrap";
import { fetchWatchMembership, lookupWatchMembership } from "@/lib/watchlist/membership";
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
}

interface ViewerScoped {
  initialNote: string;
  relatedPool: Awaited<ReturnType<typeof getMarketIntelItems>>["resources"];
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

  // PERF-4 (2026-09-03, docs/audits/perf-load-times-2026-09-03.md dispatch item (2)): the viewer's
  // watch membership for THIS item shares no data dependency with loadDetail — id (already resolved
  // above, and provably equal to the eventual result.resource.id — see the same note in
  // regulations/[slug]/page.tsx) is all it needs, plus the viewer's userId/orgId.
  // resolveServerBootstrap() is React.cache()-scoped, reusing the root layout's own request-scoped
  // result (no second Supabase round trip) — same precedent as src/app/market/page.tsx (the index
  // page)'s existing MarketSeriesBoard watch-membership read.
  const watchMembershipPromise = (async () => {
    const bootstrap = await resolveServerBootstrap();
    const membership = await fetchWatchMembership(getServiceSupabase(), {
      userId: bootstrap.user?.id ?? null,
      orgId: bootstrap.orgId,
      itemType: "signal",
      itemIds: [id],
    });
    return lookupWatchMembership(membership, id);
  })();

  const [result, watchEntry] = await Promise.all([
    loadDetail<ItemScoped, ViewerScoped>({
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

        const [resourceLookup, peersEntityId, convergence, priceBoard, carbonFactors] = await Promise.all([
          buildResourceLookup(supabase, relatedIds),
          itemUuid ? fetchInstrumentEntityId(supabase, itemUuid) : Promise.resolve(null),
          convergencePromise,
          priceBoardPromise,
          carbonFactorsPromise,
        ]);

        return { resourceLookup, peersEntityId, convergence, priceBoard, carbonFactors };
      },
      // Viewer-scoped, per-org: the workspace note (workspace_item_overrides),
      // and the related-signals pool (getMarketIntelItems resolves orgId from
      // cookies internally — see module header for why it lives here, not in
      // loadItemScoped). Uncached — every request.
      loadViewerScoped: async ({ supabase, orgId, resource }) => {
        let initialNote = "";
        if (orgId) {
          const itemUuid = await resolveItemUuid(supabase, resource.id);
          if (itemUuid) {
            const { data: noteRow, error: noteErr } = await supabase
              .from("workspace_item_overrides")
              .select("notes")
              .eq("org_id", orgId)
              .eq("item_id", itemUuid)
              .maybeSingle();
            if (noteErr) console.warn(`[market/${resource.id}] note read failed: ${noteErr.message}`);
            initialNote = noteRow?.notes ?? "";
          }
        }
        const marketIntel = await getMarketIntelItems().catch(() => ({ resources: [], total: 0 }));
        return { initialNote, relatedPool: marketIntel.resources };
      },
    }),
    watchMembershipPromise,
  ]);

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
  const initialNote = result.viewerScoped?.initialNote ?? "";
  const relatedPool = result.viewerScoped?.relatedPool ?? [];

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
        convergence={convergence}
        priceBoard={priceBoard}
        carbonFactors={carbonFactors}
        deck={deck}
        initialNote={initialNote}
        supersessions={supersessions}
        connections={connections}
        relevance={relevance}
        resourceLookup={resourceLookup}
        initialWatched={watchEntry.watched}
        initialTeamWatched={watchEntry.teamWatched}
        initialTeamAvailable={watchEntry.teamAvailable}
      />
      <PeersDiscussingStrip entityId={peersEntityId} />
    </>
  );
}
