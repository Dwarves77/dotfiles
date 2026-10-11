import { Suspense } from "react";
import { describeFallbackTrigger } from "@/lib/supabase-server";
import { getPublicListingsOnly, getPublicSurfaceCounts } from "@/lib/data";
import { SystemErrorBanner } from "@/components/ui/SystemErrorBanner";
import { RegulationsLedger } from "@/components/regulations/RegulationsLedger";
import { ThemeStrip } from "@/components/shell/ThemeStrip";
import { CoverageDenominatorLine } from "@/components/coverage/CoverageDenominatorLine";
import { toLedgerRowPayload, LIST_FIRST_PAGE_SIZE } from "@/lib/list-pagination";
// Spec 09 §1.8 (lane SPEC-09, wave 3, 2026-09-03): EUDR geo-traceability + book-and-claim custody, one
// self-contained server component covering both tables — see its own header for the shared blocking-
// severity classification and why they render as one block, not two.
import { REGULATIONS_DOMAIN } from "@/lib/domains";
import { sortFromSearchParam } from "@/components/list-surface/list-surface-helpers";
import { renderNowIso } from "@/lib/render-now";

export default async function RegulationsPage({
  searchParams,
}: {
  // COUNTS-61 (2026-09-08): every FACET round-trips through the URL, not just `?band=`, and the
  // filter state is read CLIENT-side by useListSurfaceFilter (one contract for all of them) rather
  // than resolved here and handed down for the band alone. `?band=immediate|action|monitor|
  // awareness` therefore still works, and is still the contract the Dashboard's "All N immediate"
  // control links through; it is simply read by the hook now. Reading `searchParams` here at all is
  // what already made this route dynamic; the <Suspense> boundary below is what keeps
  // `useSearchParams()` legal inside the ledger regardless.
  //
  // `?sort=next-date|newest|az|my-order` is resolved HERE and not by that hook (lane opsclip, train
  // 61, defect 5), because sort is ORDERING rather than a facet: the dashboard's "All N changes in
  // the last 7 days" links to this list ordered newest-first, so the link lands on the ordering it
  // names on the FIRST paint, before any client hook has run.
  searchParams: Promise<{ band?: string; sort?: string }>;
}) {
  // First-paint page only (LIST_FIRST_PAGE_SIZE = 60 rows, newest-priority-
  // first) — RegulationsLedger fetches the rest after paint via
  // /api/listings/rest?surface=regulations (extended this lane) and appends
  // it client-side. The masthead/tile counts bind to `aggregates`
  // (get_surface_counts, or its scoped-aggregates fallback) — a real RPC,
  // independent of how many rows are loaded — so the header count stays
  // honest at 60, at 1,316, and everywhere in between.
  const [{ sort: sortParam }, data, aggregates] = await Promise.all([
    searchParams,
    getPublicListingsOnly({ limit: LIST_FIRST_PAGE_SIZE, offset: 0, domain: REGULATIONS_DOMAIN }),
    getPublicSurfaceCounts("regulations"),
  ]);

  const regulationResources = data.resources.filter((r) => r.domain === REGULATIONS_DOMAIN);
  const hasMore = (aggregates.totalItems || regulationResources.length) > regulationResources.length;

  return (
    <>
      <SystemErrorBanner message={data._error} reason={describeFallbackTrigger(data._fallbackTrigger)} />
      {/* useSearchParams() inside the ledger needs a Suspense boundary (Next's own rule), so the
          surface streams rather than opting the whole route into client rendering. */}
      <Suspense fallback={null}>
        <RegulationsLedger
          initialResources={regulationResources.map(toLedgerRowPayload)}
          initialArchived={data.archived}
          aggregates={aggregates}
          hasMore={hasMore}
          initialSort={sortFromSearchParam(sortParam ?? null)}
          nowIso={renderNowIso()}
          belowRows={
            <>
              <ThemeStrip surface="regulations" />
              <CoverageDenominatorLine surface="regulations" surfacePath="/regulations" />
            </>
          }
        />
      </Suspense>
    </>
  );
}
