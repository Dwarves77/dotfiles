/**
 * Regulations index (`/regulations`) — server component.
 *
 * UI system handoff 2026-09-06, artboard 02 "Regulations list". Composes
 * <RegulationsLedger> (masthead + band tiles + facets + band-grouped rows +
 * rail — see that component's own header for the full assembly) plus the
 * pre-existing spec-09 panels this list surface is not redesigning
 * (UpcomingObligationsStrip, ObligationRegister, EudrCustodyPanel — none of
 * these duplicate list-row UI; they are separate tables/registers mounted
 * below the list, out of this lane's "list surface" scope, logged in
 * DEVIATION-LOG.md).
 *
 * REWRITTEN this lane (UILISTS, 2026-09-06): the old <EditorialMasthead> is
 * gone — RegulationsLedger's own <Masthead> (src/components/ui/Masthead.tsx,
 * the UI-system part with the VOL/date line + CommandBar) replaces it, so
 * this page no longer renders two mastheads or duplicates the masthead sub-
 * line copy the old page.tsx built by hand. The old PERF-12 keyset-cursor
 * mechanism (initialNextCursor/initialHasMore/cursorAfter/encodeListingCursor)
 * is replaced by the LIST_FIRST_PAGE_SIZE(60)-then-after-paint-remainder
 * pattern shared with Operations/Market/Research/Watchlist — see
 * RegulationsLedger.tsx's own header for why, and DEVIATION-LOG.md for the
 * considered reversal of PERF-12's own choice.
 */

import { describeFallbackTrigger } from "@/lib/supabase-server";
import { getPublicListingsOnly, getPublicSurfaceCounts, getPublicObligationRegisterFirstPage } from "@/lib/data";
import { SystemErrorBanner } from "@/components/ui/SystemErrorBanner";
import { RegulationsLedger } from "@/components/regulations/RegulationsLedger";
import { toLedgerRowPayload, LIST_FIRST_PAGE_SIZE } from "@/lib/list-pagination";
import { UpcomingObligationsStrip } from "@/components/regulations/UpcomingObligationsStrip";
import { ObligationRegister } from "@/components/regulations/ObligationRegister";
// Spec 09 §1.8 (lane SPEC-09, wave 3, 2026-09-03): EUDR geo-traceability + book-and-claim custody, one
// self-contained server component covering both tables — see its own header for the shared blocking-
// severity classification and why they render as one block, not two.
import { EudrCustodyPanel } from "@/components/regulations/EudrCustodyPanel";
import { REGULATIONS_DOMAIN } from "@/lib/domains";
import { bandFromSearchParam, sortFromSearchParam } from "@/components/list-surface/list-surface-helpers";
import { renderNowIso } from "@/lib/render-now";

export default async function RegulationsPage({
  searchParams,
}: {
  // `?band=immediate|action|monitor|awareness` pre-selects the band facet tile — the same
  // server-`searchParams` pattern `/map`'s `?region=` already uses (never client-side
  // `useSearchParams()`, which would opt this page out of static rendering with no Suspense
  // boundary). Audit item 1.1 (2026-09-07): this is the contract the Dashboard's "All N
  // immediate" control now links through (`/regulations?band=immediate`) — verified against this
  // base that no such param existed before this fix (`filter.band` was local `useState` only).
  // `?sort=next-date|newest|az|my-order` presets the sort control the same way (lane opsclip,
  // train 61, defect 5): the target the dashboard's "All N changes in the last 7 days" now links
  // to is this list ordered newest-first, so the link lands on the ordering it names.
  searchParams: Promise<{ band?: string; sort?: string }>;
}) {
  // First-paint page only (LIST_FIRST_PAGE_SIZE = 60 rows, newest-priority-
  // first) — RegulationsLedger fetches the rest after paint via
  // /api/listings/rest?surface=regulations (extended this lane) and appends
  // it client-side. The masthead/tile counts bind to `aggregates`
  // (get_surface_counts, or its scoped-aggregates fallback) — a real RPC,
  // independent of how many rows are loaded — so the header count stays
  // honest at 60, at 1,316, and everywhere in between.
  const [{ band: bandParam, sort: sortParam }, data, aggregates, obligationRegisterFirstPage] = await Promise.all([
    searchParams,
    getPublicListingsOnly({ limit: LIST_FIRST_PAGE_SIZE, offset: 0, domain: REGULATIONS_DOMAIN }),
    getPublicSurfaceCounts("regulations"),
    getPublicObligationRegisterFirstPage(),
  ]);

  const regulationResources = data.resources.filter((r) => r.domain === REGULATIONS_DOMAIN);
  const hasMore = (aggregates.totalItems || regulationResources.length) > regulationResources.length;

  return (
    <>
      <SystemErrorBanner message={data._error} reason={describeFallbackTrigger(data._fallbackTrigger)} />
      <RegulationsLedger
        initialResources={regulationResources.map(toLedgerRowPayload)}
        initialArchived={data.archived}
        aggregates={aggregates}
        hasMore={hasMore}
        initialBand={bandFromSearchParam(bandParam ?? null)}
        initialSort={sortFromSearchParam(sortParam ?? null)}
        nowIso={renderNowIso()}
      />
      {/* Lane SURF (2026-09-01): customer-facing top strip for item_forward_events ("what is due,
          when") — see UpcomingObligationsStrip.tsx's own header. Self-contained server component. */}
      <UpcomingObligationsStrip variant="list" />
      {/* Lane OBLIG (2026-09-02): the obligation register section — spec-01 §2's atomic unit ("the
          obligation, not the document"), migration 290's `obligations` table. */}
      <ObligationRegister variant="list" initialResult={obligationRegisterFirstPage} />
      {/* Lane SPEC-09 (wave 3, 2026-09-03): EUDR geo-traceability + book-and-claim custody (spec 09 §1.8). */}
      <EudrCustodyPanel />
    </>
  );
}
