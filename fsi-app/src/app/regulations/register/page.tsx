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
