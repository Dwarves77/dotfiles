/**
 * Regulation detail (`/regulations/[slug]`) — server component.
 *
 * The route segment is `[slug]` for back-compat with the existing
 * placeholder file. Functionally this serves the `[id]` route described
 * in the design handoff (TASKS.C); the param key is the only difference.
 * If the route segment is renamed to `[id]` in a follow-up, only this
 * file's destructure needs to change.
 *
 * Layout matches design_handoff_2026-04/preview/regulation-detail.html:
 *   - Editorial masthead with eyebrow ("Regulations · {jurisdiction}"),
 *     Anton title (the regulation name), and meta line (id · effective ·
 *     reviewed)
 *   - Hero card, 4-stat strip, tab bar, layout grid (handled by the
 *     RegulationDetailSurface client component)
 *
 * Data source: fetchIntelligenceItem(id) server-side, via loadDetail
 * (src/lib/detail/load-detail.ts) — see that module's header for why the
 * data load is shaped the way it is below (item-scoped/cached vs.
 * viewer-scoped/uncached, run in parallel).
 *
 * PERF lane (2026-09-03, docs/audits/perf-load-times-2026-09-03.md): this
 * page used to run 6 sequential Supabase round trips per render (UUID
 * redirect lookup, fetchIntelligenceItem, relevance, sections, related-items
 * lookup, owner lookup — each opening its own createClient()). It now runs
 * the item-scoped related-items + peers-entity reads behind ONE cached
 * bundle (shared with every other viewer of this item) and the org-scoped
 * owner lookup uncached, in parallel with sections + relevance, via
 * loadDetail. related-items lookup now calls the shared buildResourceLookup
 * (src/lib/connections/resource-lookup.ts) instead of a hand-mirrored inline
 * copy — see that file's PERF-lane header note.
 *
 * PERF-2 lane (2026-09-03, docs/audits/perf-load-times-2026-09-03.md §8
 * "(A)"): even after the PERF lane's fix above, this page stayed slower
 * than /market, /operations, /research because it alone rendered TWO MORE
 * async Server Components (<ObligationRegister>, <UpcomingObligationsStrip
 * variant="detail">) that ran strictly AFTER `await loadDetail(...)`
 * resolved. loadRegulationDetailObligations
 * (src/lib/detail/regulation-obligations.ts) used to replace those two
 * component calls with their underlying reads, run via Promise.all
 * ALONGSIDE loadDetail — since removed, see PERF-10 note below.
 *
 * PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up): this route built
 * `ƒ` (Dynamic) at build time even after PERF/PERF-2, because THREE cookie
 * reads still ran during this page's own server render: (1)
 * loadRegulationDetailObligations(id) → createSupabaseServerClient()
 * (cookie-bound, RLS-gated per read-upcoming.mjs/read-register.mjs's own
 * explicit "never service-role" prohibition — respected, not reversed); (2)
 * watchMembershipPromise → resolveViewerIdentityFromCookies(); (3)
 * loadDetail's loadViewerScoped owner lookup → orgId, itself sourced from
 * cookies inside loadDetailCore. Under classical (non-PPR) Next.js
 * rendering, ANY Dynamic API call anywhere in the render tree forces the
 * WHOLE route dynamic — one call is as fatal as ten.
 *
 * All three are now resolved CLIENT-SIDE after first paint instead:
 *   - obligations: <UpcomingObligationsStrip variant="detail"> and
 *     <ObligationRegister variant="detail"> (both converted to client
 *     components this lane) fetch GET /api/obligations/upcoming and
 *     GET /api/obligations/register — Route Handlers running the SAME
 *     request-scoped calls this page used to make inline. A Route
 *     Handler's own Dynamic-API dependency does not propagate to a page
 *     that merely fetch()s it client-side.
 *   - watch membership: initialWatched/initialTeamWatched/initialTeamAvailable
 *     are no longer passed to RegulationDetailSurface → WatchButton; WatchButton
 *     already falls back to a client-side getClientWatchMembership() call when
 *     these are omitted (src/components/ui/WatchButton.tsx, pre-existing
 *     contract, `hasServerState = initialWatched !== undefined`).
 *   - owner: initialOwner is no longer passed; OwnerTeamCard already falls back
 *     to `useResourceStore(s => s.overrides.get(r.id))` when omitted
 *     (src/components/regulations/OwnerTeamCard.tsx, pre-existing contract).
 *     loadDetail's loadViewerScoped callback is dropped entirely — this route
 *     no longer needs an org-scoped server read at all.
 *
 * UX-LAWS COMPLIANCE: each of the three now shows an explicit, honest loading
 * state (or a well-established "matches the eventual empty state" soft-omission,
 * for the small rail pieces) rather than ever rendering empty-as-if-final or
 * wrong for a logged-in viewer — see each component's own PERF-10 header for
 * the specific contract. Nothing here silently renders someone else's org data:
 * the removed owner lookup was the ONLY per-org read on this page, and it now
 * runs entirely client-side, request-scoped, same as before.
 */

import { formatDate } from "@/lib/format";
import { notFound, redirect } from "next/navigation";
import { loadDetail } from "@/lib/detail/load-detail";
import { getPublicSurfaceSlugs } from "@/lib/data";
import { fetchClaimTierMap } from "@/lib/detail/load-detail-core";
import { getServiceSupabase } from "@/lib/supabase-service";
import {
  buildResourceLookup,
  resolveItemUuid,
  fetchInstrumentEntityId,
} from "@/lib/connections/resource-lookup";
import { RegulationDetailSurface } from "@/components/regulations/RegulationDetailSurface";
import type { ClaimTierMap } from "@/lib/agent/parse-record-sections";
import { UpcomingObligationsStrip } from "@/components/regulations/UpcomingObligationsStrip";
import { ObligationRegister } from "@/components/regulations/ObligationRegister";
import { JURISDICTIONS } from "@/lib/constants";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";
import { PeersDiscussingStrip } from "@/components/shared/PeersDiscussingStrip";
import { NoticesRail } from "@/components/figures/NoticesRail";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PERF-13 (2026-09-04, ADR-027 §1, docs/audits/perf-clickthrough-2026-09-04.md §(b)/(c) + this
// lane's own live measurement): SUPERSEDES the PERF-10 "`[]`, not a full enumeration" decision recorded above (kept
// verbatim, not deleted, as the record of the prior lane's reasoning — see CLAUDE.md rule 14 on
// correcting findings in place). The prior lane never measured the actual cost of enumerating the
// corpus; the operator's own live Chrome measurement (coordinator, 2026-09-04 23:10-23:20 UTC) did:
// a never-rendered slug (the `[]` design's steady state for most of the corpus, since real traffic
// only ever warms the items someone happens to click) costs 760-950ms with NOTHING on screen for
// ~900ms of it (a MutationObserver on document.body saw zero mutations until the whole detail
// arrived), because Next's on-demand static generation for a `dynamicParams: true` fallback does
// not stream through the segment's own `loading.tsx` the way a genuinely Dynamic route does — see
// this file's `loading.tsx` sibling for the citation. That is the literal opposite of "every click
// should show items on a page instantly."
//
// This lane measured the corpus instead of assuming it (CLAUDE.md rule 4): 1,312 verified,
// non-archived regulations (Supabase MCP, `get_workspace_intelligence_listings_public(p_domain=>1)`
// row count, 2026-09-04) — small enough that baking every slug into the build is the standard fix,
// not the anti-pattern the PERF-10 comment above worried about. `getPublicSurfaceSlugs("regulations")`
// (src/lib/data.ts, ONE function reused by all four `[slug]` routes — see its own header) reads
// through the exact same public RPC path this page's own index (`/regulations`) already uses, so
// there is no second query shape to maintain. `dynamicParams` stays at its Next.js default (`true`):
// an item minted AFTER the last build still renders on first request and is then served from the
// Full Route Cache — this enumeration does not remove that fallback, it only shrinks the population
// that ever needs it down to "items minted since the last deploy," which the deploy-time warm step
// (docs/runbooks/warm-static-detail-routes.md) closes by requesting every slug once, post-merge, so
// even that population is warmed before a real viewer's first click. Revalidation is unchanged: the
// SAME `PUBLIC_ITEMS_TAG`/`revalidateTag` completion point as the four index pages (ADR-026
// Follow-up) plus `loadDetail`'s own `DETAIL_CACHE_REVALIDATE_SECONDS` window as the time-based
// safety net.
//
// Doc citation: nextjs.org/docs/app/api-reference/functions/generate-static-params
// ("dynamicParams... pages that are not generated at build time will be rendered on-demand and
// added to the cache"); the streaming/loading.tsx interaction for that on-demand path (NOT
// streamed through the route's own Suspense boundary the way a `ƒ` route is — this is Next's
// documented on-demand-ISR-equivalent behavior, not a bug in this app) is what makes closing the
// "not yet generated" population, rather than special-casing the loading state, the standard fix
// here — see nextjs.org/docs/app/building-your-application/rendering/server-components
// (static rendering with `generateStaticParams` producing HTML/RSC payload at build time, cached
// and reused, vs. dynamic rendering generated per-request).
export async function generateStaticParams() {
  const slugs = await getPublicSurfaceSlugs("regulations");
  return slugs.map((slug) => ({ slug }));
}

interface ItemScoped {
  resourceLookup: Awaited<ReturnType<typeof buildResourceLookup>>;
  peersEntityId: string | null;
  /** TIER-CHIP lane (2026-09-04): a record-grade item's FACT claims' ratings — see
   *  load-detail-core.ts's fetchClaimTierMap header for the query/derivation. Item-scoped (no
   *  org/viewer dependency, so it belongs in the SAME cached bundle as resourceLookup/peersEntityId
   *  above), read unconditionally (never gated on item_grade — a brief-grade item's query legitimately
   *  returns no rows, resolving to {} at zero extra cost since fetchClaimTierMap never throws). */
  claimTiers: ClaimTierMap;
}

export default async function RegulationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const id = decodeURIComponent(slug);

  // UUID → slug redirect. When the URL is a raw uuid AND the matching
  // intelligence_items row has a legacy_id, redirect (307) to the
  // human-readable slug URL. If the row has no legacy_id we fall through
  // and render at the uuid URL — graceful degradation. Per the audit:
  // post-migration-045 every active item should have a legacy_id, so
  // the fallback path is a thin safety net for rows materialized after
  // 045 but before the orchestrator's slug-generation step runs.
  //
  // Note: redirect() throws a Next-internal NEXT_REDIRECT error to
  // perform the redirect, so it must be called OUTSIDE the try/catch
  // (otherwise the catch swallows the redirect). This one lookup can't be
  // folded into loadDetail's item-scoped bundle: it must run and resolve
  // (or fall through) BEFORE fetchIntelligenceItem, not in parallel with it.
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
        redirectTo = `/regulations/${encodeURIComponent(byId.legacy_id)}`;
      }
      // No legacy_id — fall through to render-by-uuid below.
    } catch {
      // Soft-fail; fetchIntelligenceItem still tries by uuid.
    }
  }
  if (redirectTo) redirect(redirectTo);

  // PERF-10 (2026-09-04): watch membership and the owner lookup both used to run here,
  // cookie-dependent, on every server render — see this file's header for the full mechanism.
  // Both now resolve client-side (WatchButton / OwnerTeamCard's pre-existing fallback contracts),
  // so this page makes no per-viewer Supabase read of its own at all.
  const result = await loadDetail<ItemScoped>({
    surface: "regulations",
    id,
    // Item-scoped, org-independent: related-item titles for the connections/
    // supersessions rail, and the peers-discussing strip's bound entity.
    // Cached — shared across every org that views this item.
    loadItemScoped: async ({ supabase, resource, connections, supersessions }) => {
      const relatedIds = Array.from(
        new Set<string>([
          ...connections.map((c) => c.id),
          ...supersessions.flatMap((s) => [s.old, s.new]),
        ])
      ).filter(Boolean);
      const itemUuid = await resolveItemUuid(supabase, resource.id);
      const [resourceLookup, peersEntityId, claimTiers] = await Promise.all([
        buildResourceLookup(supabase, relatedIds),
        itemUuid ? fetchInstrumentEntityId(supabase, itemUuid) : Promise.resolve(null),
        itemUuid ? fetchClaimTierMap(supabase, itemUuid) : Promise.resolve({}),
      ]);
      return { resourceLookup, peersEntityId, claimTiers };
    },
  });

  // SURFACE ADMISSION GUARD (Phase 0.1, 2026-08-11). Until now the ONLY gate on
  // this route was fetchIntelligenceItem's `provenance_status='verified'` check,
  // so ANY verified item rendered here under the regulations chrome — and this
  // surface's heading map RELABELLED whatever section rows it found, silently
  // dropping keys outside its own range. canonicalSurface (checked inside
  // loadDetail) is computed from the RAW (item_type, domain) by the same
  // surfaceOf classifier that decides where this item's links point
  // (src/lib/item-links.ts), so a link emitted to this surface always renders
  // and an item belonging elsewhere always 404s.
  if (result.notFound) {
    notFound();
  }

  const { resource: r, changelog, dispute, supersessions, connections, sections, relevance } = result;
  const resourceLookup = result.itemScoped?.resourceLookup ?? {};
  const peersEntityId = result.itemScoped?.peersEntityId ?? null;
  const claimTiers = result.itemScoped?.claimTiers ?? {};

  console.log(`[perf] /regulations/${id} data ${result.elapsedMs}ms`);

  // Eyebrow jurisdiction label — prefer ISO data (e.g. ["US-CA"] →
  // "California, United States") so the masthead matches the detail
  // surface metadata. Fall back to the legacy `jurisdiction` string
  // when ISO data isn't yet populated.
  const jurisLabel =
    r.jurisdictionIso && r.jurisdictionIso.length > 0
      ? r.jurisdictionIso.map(isoToDisplayLabel).join(" · ")
      : JURISDICTIONS.find((j) => j.id === r.jurisdiction)?.label ||
        r.jurisdiction ||
        "Global";

  // Redesign T03: the hero (breadcrumb + title + deck + actions + tabs)
  // now lives inside RegulationDetailSurface per the approved mock
  // (Pages - 03 Regulation Detail). The prior EditorialMasthead + separate
  // back-link are replaced by the in-hero breadcrumb. We compute the
  // breadcrumb middle segment ("Global · IMO") and the deck sub-line here
  // (server-side) from real fields and pass them down.
  const publisher = r.enforcementBody || r.sourceName || null;
  const groupLabel = publisher ? `${jurisLabel} · ${publisher}` : jurisLabel;

  const effective = r.complianceDeadline
    ? `Effective ${formatDate(r.complianceDeadline)}`
    : null;
  const reviewed = r.lastVerifiedDate ? `Reviewed ${formatDate(r.lastVerifiedDate)}` : null;
  const modesLabel =
    r.modes && r.modes.length > 0
      ? r.modes.map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(" · ")
      : null;
  const deck = [
    r.legalInstrument || publisher,
    effective,
    reviewed,
    jurisLabel,
    modesLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <RegulationDetailSurface
        resource={r}
        changelog={changelog}
        dispute={dispute}
        supersessions={supersessions}
        connections={connections}
        relevance={relevance}
        resourceLookup={resourceLookup}
        sections={sections}
        claimTiers={claimTiers}
        groupLabel={groupLabel}
        deck={deck}
        upcomingObligations={<UpcomingObligationsStrip variant="detail" itemId={r.id} />}
      />
      {/* Lane OBLIG (2026-09-02) / PERF-10 (2026-09-04): this item's own obligation-register rows
          (migration 290 `obligations`, denormalized jurisdiction/mode/binding_position) — rendered as
          its own section below the surface, same as before. Now resolved client-side (see
          ObligationRegister.tsx's own PERF-10 header) instead of via loadRegulationDetailObligations —
          honest omission (renders nothing) both while loading and when this item has no register rows,
          matching the component's pre-existing detail-variant contract. */}
      <ObligationRegister variant="detail" itemId={r.id} />
      <PeersDiscussingStrip entityId={peersEntityId} />
      {/* Recalculation notices (complete-system build plan W4.3, lane NOTICES 2026-09-05): see
          NoticesRail's own header for scope (org-watchlist-wide, not narrowed to this item). */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 var(--cl-detail-pad-x) 28px" }}>
        <NoticesRail />
      </div>
    </>
  );
}
