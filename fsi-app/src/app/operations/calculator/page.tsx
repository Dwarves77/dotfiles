/**
 * Capacity investment estimate (`/operations/calculator`) — server component.
 *
 * UI fix round 2026-09-08, item D3: the calculator moved off /operations (it sat below artboard 08's
 * last card) onto its own page in the standard frame. NO ARTBOARD exists for this route yet
 * (coordinator note N4) — see OperationsCalculatorPageView.tsx's header for what it is assembled from,
 * and DEVIATION-LOG.md for the "awaiting an artboard" entry.
 *
 * The calculator itself is pure client-side compute (automate-vs-hire.mjs), so this page reads nothing
 * for it. The one read here is the Operations surface count, so the command bar states the same scope
 * the rest of the surface does instead of inventing one.
 */

import { getPublicSurfaceCounts } from "@/lib/data";
import { OperationsCalculatorPageView } from "@/components/operations/OperationsCalculatorPageView";
import { formatLocaleDate } from "@/lib/format";
import { renderNowIso } from "@/lib/render-now";

export default async function OperationsCalculatorPage() {
  const aggregates = await getPublicSurfaceCounts("operations");
  const nowIso = renderNowIso();
  const dateLabel = formatLocaleDate(new Date(nowIso), {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <OperationsCalculatorPageView
      dateLabel={dateLabel}
      nowIso={nowIso}
      itemCount={aggregates.totalItems ?? 0}
    />
  );
}
