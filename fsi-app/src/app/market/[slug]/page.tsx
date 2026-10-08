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
 * bundle (resourceLookup, convergence, price board, carbon factors,
 * related-signals pool, none of it org-dependent as of PERF-10, see
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
import { notFound } from "next/navigation";
import { applyIdRedirect, loadDetail } from "@/lib/detail/load-detail";
import { fetchClaimTierMap } from "@/lib/detail/load-detail-core";
import { fetchCrossPageForItem, type CrossPageAnalysis } from "@/lib/supabase-server";
import type { ClaimTierMap } from "@/lib/agent/parse-record-sections";
import { getPublicMarketIntelItems, getPublicSurfaceSlugs } from "@/lib/data";
import { slugsOrEmpty } from "@/lib/perf/static-params-fallback.mjs";
import {
  buildResourceLookup,
  resolveItemUuid,
} from "@/lib/connections/resource-lookup";
import {
  MarketSignalDetailSurface,
  type PriceStat,
  type EmissionFactorRow,
  type CorridorCandidate,
} from "@/components/pages/MarketSignalDetailSurface";
import { candidatesFromCorridorEntities } from "@/lib/market/resolve-item-corridor.mjs";
import { NoticesRail } from "@/components/figures/NoticesRail";
// Figure provenance (spec 02 section 6 rows 10 and 11, lane MKT-1, operator ruling 2026-10-08): the
// methodology and provenance drawer describes the envelope of the figure this page actually shows. The
// price board's six ratified series are attached to their items by SERIES_ITEM_MAP_RAW (the same map the
// refresh producer writes the board from), so the series behind a board is found the way the producer
// found it, and its envelope comes from the market_series row itself.
import { SERIES_ITEM_MAP_RAW } from "@/lib/market/series-item-map.mjs";
import { buildSeriesBoard } from "@/lib/market/series-board-view-model.mjs";
import { producerFor } from "@/lib/market/series-registry.mjs";
import { envelopeFromSeriesRow, type FigureEnvelope, type SourceLicence } from "@/components/market/SeriesProvenance";

interface ItemScoped {
  resourceLookup: Awaited<ReturnType<typeof buildResourceLookup>>;
  /** Lane S3-B: stated intersection summary and theme analysis for the shared "Connected intelligence" section. */
  crossPage: CrossPageAnalysis;
  convergence: { independent_citers: number; confirmation_count: number } | null;
  priceBoard: PriceStat[];
  carbonFactors: EmissionFactorRow[];
  /** Lane L-CORRIDOR (2026-10-03): EVERY active seeded corridor entity, already parsed to
   *  {entityId, origin, dest, mode}. Read once per cached bundle (small, platform-wide, not item-
   *  scoped data, same posture as carbonFactors above) so resolveItemCorridor() never needs a second
   *  fetch pattern on the detail page. */
  corridorCandidates: CorridorCandidate[];
  /** TIER-CHIP lane (2026-09-04): a record-grade item's FACT claims' ratings — see
   *  load-detail-core.ts's fetchClaimTierMap header. Item-scoped, read unconditionally (a brief-grade
   *  item's query legitimately returns no rows, resolving to {} at zero extra cost). */
  claimTiers: ClaimTierMap;
  /** Lane MKT-1: licence and attribution per emission-factor source_key, from the licence gate view. */
  factorLicences: Record<string, SourceLicence>;
  /** Lane MKT-1: the market_series envelope and cadence behind this item's price board, when the item is
   *  one of the ratified series items; null otherwise. Freshness is NOT computed here (this bundle is
   *  cached): the surface judges it against the viewer's clock after mount. */
  seriesFigure: SeriesFigure | null;
  /** PERF-10 (2026-09-04): moved here from loadViewerScoped — see this file's header. Platform-wide,
   *  not per-org-override-adjusted; genuinely item-scoped, cacheable. */
  relatedPool: Awaited<ReturnType<typeof getPublicMarketIntelItems>>["resources"];
}

/** The series behind a price board: its figure envelope plus what the surface needs to judge freshness. */
interface SeriesFigure {
  label: string;
  envelope: FigureEnvelope;
  asAtDate: string | null;
  referencePeriod: string | null;
  cadenceDays: number | null;
}

/** The ratified series key attached to an item uuid, or null (the reverse of SERIES_ITEM_MAP_RAW). */
function seriesKeyForItem(itemUuid: string | null): string | null {
  if (!itemUuid) return null;
  const map = SERIES_ITEM_MAP_RAW as Record<string, { item_id: string | null; status: string }>;
  for (const [key, entry] of Object.entries(map)) {
    if (entry.status === "ratified" && entry.item_id === itemUuid) return key;
  }
  return null;
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
// D32 (defect-fix-plan-2026-09-12.md, lane L21, part (d)): guarded by slugsOrEmpty
// (src/lib/perf/static-params-fallback.mjs) - see regulations/[slug]/page.tsx's own comment for the full
// incident/citation. A rejected or slow (>10s) read falls back to [] with a build warning; the route
// already renders on demand via dynamicParams.
export async function generateStaticParams() {
  const slugs = await slugsOrEmpty(() => getPublicSurfaceSlugs("market"), { route: "/market/[slug]" });
  return slugs.map((slug) => ({ slug }));
}

export default async function MarketSignalDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const id = decodeURIComponent(slug);

  // UUID → slug step (lane REG-REDIRECT, 2026-09-24): redirects only to a URL that renders, 404s an
  // item no surface admits at the uuid URL. See regulations/[slug]/page.tsx and
  // src/lib/detail/id-redirect.ts. Outside any try/catch (redirect()/notFound() throw).
  await applyIdRedirect("market", id);

  // PERF-10 (2026-09-04): watch membership and the note lookup both used to run here, cookie-
  // dependent, on every server render — see this file's header. Both now resolve client-side
  // (WatchButton / NotesField's fallback contracts), so this page makes no per-viewer Supabase read.
  const result = await loadDetail<ItemScoped>({
    surface: "market",
    id,
      // Item-scoped, org-independent: connections/supersessions titles, the
      // source-growth convergence stats, the published price board, the
      // carbon-overlay modal-default factors.
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
              "factor_id, mode, vehicle_class, jurisdiction, quantity_basis, ttw_co2e, wtt_co2e, wtw_co2e, source_key, tier, scope_kind, derivation, origin_class, method_version, n_observations, as_at_date"
            )
            .eq("tier", "modal_default")
            .is("superseded_by", null)
        )
          .then(({ data: factorRows, error: factorErr }) => {
            if (factorErr) console.error("[market/[slug]] carbon-overlay factor fetch failed", factorErr);
            return Array.isArray(factorRows) ? factorRows : [];
          })
          .catch(() => [] as EmissionFactorRow[]);

        // Lane L-CORRIDOR (2026-10-03, coordinator override, rule 17: no half slice). EVERY active
        // seeded corridor entity (kind='corridor'), read in the SAME cached bundle as carbonFactors
        // above, no second fetch pattern. resolve-item-corridor.mjs's candidatesFromCorridorEntities()
        // parses canonical_name ("ORIGIN-DEST:mode") into the {entityId, origin, dest, mode} shape the
        // resolver takes - never re-derives the convention a second time.
        const corridorCandidatesPromise: Promise<CorridorCandidate[]> = Promise.resolve(
          supabase
            .from("entities")
            .select("entity_id, canonical_name")
            .eq("kind", "corridor")
            .eq("status", "active")
        )
          .then(({ data: corridorRows, error: corridorErr }) => {
            if (corridorErr) console.error("[l-corridor] corridor-entities fetch failed, falling back to empty candidate list", corridorErr);
            const { candidates } = candidatesFromCorridorEntities(
              Array.isArray(corridorRows) ? corridorRows : []
            );
            return candidates;
          })
          .catch((err) => {
            console.error("[l-corridor] corridor-entities fetch threw, falling back to empty candidate list", err);
            return [] as CorridorCandidate[];
          });

        // Lane MKT-1: licence and attribution for the factors' sources, through the licence gate view
        // (migration 258's licence_clear_sources, the database half of the licence gate).
        const factorLicencesPromise = carbonFactorsPromise
          .then(async (factorRows) => {
            const keys = Array.from(new Set(factorRows.map((f) => f.source_key).filter(Boolean)));
            if (keys.length === 0) return {} as ItemScoped["factorLicences"];
            const { data: srcRows, error: srcErr } = await supabase
              .from("licence_clear_sources")
              .select("source_key, name, attribution, licence, url")
              // fitness-allow: F39 (keys are the distinct source_keys of the small modal_default factor tier, not a corpus-scale id list)
              .in("source_key", keys);
            if (srcErr) console.error("[market/[slug]] factor licence fetch failed", srcErr);
            const out: ItemScoped["factorLicences"] = {};
            for (const r of srcRows ?? []) out[r.source_key] = { name: r.name, attribution: r.attribution, licence: r.licence, url: r.url };
            return out;
          })
          .catch(() => ({}) as ItemScoped["factorLicences"]);

        // Lane MKT-1: the series behind this item's price board, read the way the producer attached it.
        const seriesKey = seriesKeyForItem(itemUuid);
        const seriesFigurePromise: Promise<SeriesFigure | null> = seriesKey
          ? Promise.resolve(
              supabase
                .from("market_series")
                .select(
                  "id, series_key, label, value_numeric, unit, currency, derivation, origin_class, source_key, source_ref, n_observations, method_version, as_at_date, reference_period"
                )
                .eq("series_key", seriesKey)
                .order("reference_period", { ascending: false })
                .limit(60)
            )
              .then(({ data: seriesRows, error: seriesErr }) => {
                if (seriesErr) console.error("[market/[slug]] series figure fetch failed", seriesErr);
                if (!Array.isArray(seriesRows) || seriesRows.length === 0) return null;
                const board = buildSeriesBoard(seriesRows) as {
                  groups: Array<{ keyPrefix: string; sourceUrl: string; licenceStatus: string; sourceName: string; series: Array<Record<string, unknown>> }>;
                };
                for (const g of board.groups) {
                  const row = g.series.find((x) => x.seriesKey === seriesKey);
                  if (!row) continue;
                  const asRow = row as unknown as Parameters<typeof envelopeFromSeriesRow>[0] & {
                    label: string; asAtDate: string | null; referencePeriod: string | null;
                  };
                  return {
                    label: asRow.label,
                    envelope: { ...envelopeFromSeriesRow(asRow, g), asOf: asRow.asAtDate ?? asRow.referencePeriod },
                    asAtDate: asRow.asAtDate,
                    referencePeriod: asRow.referencePeriod,
                    cadenceDays: producerFor(g.keyPrefix)?.cadenceDays ?? null,
                  };
                }
                return null;
              })
              .catch(() => null)
          : Promise.resolve(null);

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

        const [resourceLookup, crossPage, convergence, priceBoard, carbonFactors, corridorCandidates, claimTiers, relatedPool, factorLicences, seriesFigure] =
          await Promise.all([
            buildResourceLookup(supabase, relatedIds),
            fetchCrossPageForItem(supabase, resource.id, "market"),
            convergencePromise,
            priceBoardPromise,
            carbonFactorsPromise,
            corridorCandidatesPromise,
            itemUuid ? fetchClaimTierMap(supabase, itemUuid) : Promise.resolve({}),
            relatedPoolPromise,
            factorLicencesPromise,
            seriesFigurePromise,
          ]);

        return { resourceLookup, crossPage, convergence, priceBoard, carbonFactors, corridorCandidates, claimTiers, relatedPool, factorLicences, seriesFigure };
      },
    });

  // SURFACE ADMISSION GUARD (Phase 0.1, 2026-08-11) — see regulations/[slug]
  // for the full rationale; checked inside loadDetail via canonicalSurface.
  if (result.notFound) {
    notFound();
  }

  const { resource: r, supersessions, connections, sections, relevance } = result;
  const resourceLookup = result.itemScoped?.resourceLookup ?? {};
  const crossPage = result.itemScoped?.crossPage ?? null;
  const convergence = result.itemScoped?.convergence ?? null;
  const priceBoard = result.itemScoped?.priceBoard ?? [];
  const carbonFactors = result.itemScoped?.carbonFactors ?? [];
  const corridorCandidates = result.itemScoped?.corridorCandidates ?? [];
  const claimTiers = result.itemScoped?.claimTiers ?? {};
  const relatedPool = result.itemScoped?.relatedPool ?? [];
  const factorLicences = result.itemScoped?.factorLicences ?? {};
  const seriesFigure = result.itemScoped?.seriesFigure ?? null;

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
        factorLicences={factorLicences}
        seriesFigure={seriesFigure}
        corridorCandidates={corridorCandidates}
        groupLabel={`Market / ${publisher || jurisLabel(r)}`}
        deck={deck}
        supersessions={supersessions}
        connections={connections}
        relevance={relevance}
        resourceLookup={resourceLookup}
        crossPage={crossPage}
      />
      {/* Recalculation notices (complete-system build plan W4.3, lane NOTICES 2026-09-05): see
          NoticesRail's own header for scope (org-watchlist-wide, not narrowed to this item). */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 var(--cl-detail-pad-x) 28px" }}>
        <NoticesRail />
      </div>
    </>
  );
}

function jurisLabel(r: { jurisdiction?: string | null }): string {
  return r.jurisdiction || "Global";
}
