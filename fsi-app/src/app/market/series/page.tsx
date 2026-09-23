/**
 * /market/series, the Series board route (lane W10-NavCard, 2026-09-23, bundle ruling 6: "`/market/series`
 * is a new route with the same frame and masthead, 'Market / Series board' eyebrow; the inline board
 * comes off `/market`; the header link 'Series board' points to it"). The 2026-09-20 measurement found
 * this route 404ing; parts-brief 2.15 PAGE SCOPE independently names the same move ("/market ...
 * Series board → /market/series").
 *
 * Server component. Same AppShell frame every other route gets; the page-local content is the Masthead
 * part (title "Market / Series board", size="list") followed by the real `MarketSeriesBoard` part
 * unmodified (F49: no board markup retyped here), the SAME component `/market` used to mount inline at
 * `#market-series-board`, now living at its own route instead of an anchor. No new data path: reuses
 * `fetchMarketSeriesBoard()` (src/lib/supabase-server.ts), the identical fetch `/market/page.tsx` already
 * made for this section.
 */

import { Masthead } from "@/components/ui/Masthead";
import { MarketSeriesBoard } from "@/components/market/MarketSeriesBoard";
import { fetchMarketSeriesBoard } from "@/lib/supabase-server";
import { renderNowIso, nowFrom } from "@/lib/render-now";
import { formatLocaleDate } from "@/lib/format";

export default async function MarketSeriesPage() {
  const nowIso = renderNowIso();
  const seriesBoard = await fetchMarketSeriesBoard();

  return (
    <>
      <Masthead
        title="Market / Series board"
        size="list"
        dateLabel={formatLocaleDate(nowFrom(nowIso), { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
        nowIso={nowIso}
        dek="Every registered market_series producer, dated numeric observations grouped by producer, not signal cards."
      />
      <MarketSeriesBoard board={seriesBoard} watchMembership={null} nowIso={nowIso} />
    </>
  );
}
