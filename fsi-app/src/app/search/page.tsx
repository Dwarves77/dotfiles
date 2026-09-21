/**
 * Search results page (`/search?q=<text>`), lane W10-CommandBar, 2026-09-21, undrawn-cases ruling
 * 2 of 2026-09-20: "Enter opens the results page" needed a route to open, since `src/app/search/`
 * did not exist (premise [CONFIRMED] by the coordinator on b1dd38e4: `src/app/api/search/route.ts`
 * / `logic.ts` exist, the page did not).
 *
 * SERVER-SIDE READ, not a second client fetch of GET /api/search: this route calls `runSearch`
 * (src/app/api/search/logic.ts) directly against a cookie-scoped Supabase client, the same pure
 * retrieval core the API route wraps, "reads the same /api/search logic ... server-side" per the
 * brief. Auth is resolved from cookies the same way every other per-user server page in this app
 * resolves it (see src/app/watchlist/page.tsx's own header): an unauthenticated request reads back
 * an empty result set (RLS-denied), not an error page.
 *
 * BOUNDED (F38/F39): runSearch's own MAX_RESULTS (20) ceiling is unchanged here; this page never
 * raises it, and never paginates past what the RPC returns. If the corpus has more matches than
 * that, the honest statement is "showing the top N", not a second unbounded read.
 *
 * CLOSED BY DEFAULT (F43): nothing on this page opens itself. The empty state and the results list
 * render directly, with no accordion or expandable state.
 *
 * The presentational markup (Masthead + PageFrame + the shared ListRow rows, same frame as every
 * other list surface, README section 0.3) lives in `SearchResultsView.tsx`, a client component this
 * SERVER page delegates to; see that file's own header for why the split exists (smoke-mountability).
 */

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
