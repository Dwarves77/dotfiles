import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { runSearch, MIN_QUERY_LEN, MAX_RESULTS, type SearchSupabaseClient } from "@/app/api/search/logic";
import { SearchResultsView } from "@/components/search/SearchResultsView";
import { formatLocaleDate } from "@/lib/format";
import { renderNowIso } from "@/lib/render-now";

// Per-user (cookie-scoped auth) and per-query-string: never prerenderable. Same reasoning as
// src/app/watchlist/page.tsx's own `dynamic = "force-dynamic"`.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Search",
  description: "Search across the workspace.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();

  const nowIso = renderNowIso();
  const dateStr = formatLocaleDate(new Date(nowIso), {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  let results: Awaited<ReturnType<typeof runSearch>> = [];
  if (q.length >= MIN_QUERY_LEN) {
    const supabase = await createSupabaseServerClient();
    // Cast to the narrow interface logic.ts declares, same rationale as route.ts's own cast (deep
    // structural check against the real client's generated `.rpc()` overloads times out).
    results = await runSearch(supabase as unknown as SearchSupabaseClient, q);
  }

  return <SearchResultsView q={q} results={results} maxResults={MAX_RESULTS} dateLabel={dateStr} nowIso={nowIso} />;
}
