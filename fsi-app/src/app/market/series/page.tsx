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
