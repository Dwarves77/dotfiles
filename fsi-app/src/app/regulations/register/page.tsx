/**
 * Obligation register (`/regulations/register`) — server component.
 *
 * UI fix round 2026-09-08, item D2: the register moved off /regulations (it sat below artboard 02's
 * last card) onto its own page in the standard frame. NO ARTBOARD exists for this route yet
 * (coordinator note N4) — see ObligationRegisterPageView.tsx's header for what it is assembled from,
 * and DEVIATION-LOG.md for the "awaiting an artboard" entry.
 *
 * Data path is unchanged and reused, not rebuilt: getPublicObligationRegisterFirstPage() seeds the
 * unfiltered first page exactly as it did for the /regulations mount, so this page's first paint costs
 * the same one read it always did. The register's own facet changes and "Load more" still go through
 * GET /api/obligations/register.
 */

import { Suspense } from "react";
import { getPublicObligationRegisterFirstPage } from "@/lib/data";
import { ObligationRegisterPageView } from "@/components/regulations/ObligationRegisterPageView";
import { formatLocaleDate } from "@/lib/format";
import { renderNowIso } from "@/lib/render-now";

export default async function ObligationRegisterPage() {
  const initialResult = await getPublicObligationRegisterFirstPage();
  // HYDRATION-59: one server instant, UTC-pinned, threaded into <Masthead/> so its VOL week number is
  // computed from the SAME instant this label is, never from the browser's clock during hydration.
  const nowIso = renderNowIso();
  const dateLabel = formatLocaleDate(new Date(nowIso), {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <Suspense fallback={null}>
      <ObligationRegisterPageView initialResult={initialResult} dateLabel={dateLabel} nowIso={nowIso} />
    </Suspense>
  );
}
