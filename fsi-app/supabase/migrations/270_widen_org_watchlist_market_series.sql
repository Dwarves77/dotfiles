-- subject: Migration 270 (WO-23, `org_watchlist.item_type` admits `market_series`, 2026-08-30). Widens `org_watchlist_item_type_check` from `ARRAY['source','reg','signal','research','operations']` to the same five plus `market_series`. **TEAM SCOPE ONLY: `user_watchlist_item_type_check` is deliberately NOT widened**, and that is now the strictly safer state rather than merely the specced one, the master plan's premise was that both watchlist tables were empty, and `user_watchlist` has since gained a live row (`org_watchlist` is still 0). THERE IS NO 'DDL WINDOW' HERE, and the phrase was retired from the plan on measurement: `org_watchlist` is 0 rows, so `ADD CONSTRAINT` runs no validation scan and holds ACCESS EXCLUSIVE for microseconds against zero tuples; a window implies a scan or a rewrite and neither occurs. **APPLIED LIVE 2026-08-30** by the coordinator under two-track policy (CLAUDE.md standing rule 3), BEFORE the dependent code merged. Post-apply verified by reading `pg_get_constraintdef()` on BOTH tables, not just the changed one, the negative half is the half that matters here: `org_watchlist_item_type_check` → six values including `market_series`; `user_watchlist_item_type_check` → five values, unchanged. THE CODE HALF IS FOUR FILES, NOT THE ONE 'gains a value' implies, and the master plan's '5 readers' checklist named none of them: (1) `api/watchlist/route.ts`'s `ITEM_TYPES` Set is SHARED across personal and team scope with no conditional, widening it flatly would let a personal `market_series` write reach the un-widened `user_watchlist` CHECK and surface as a raw Postgres 500 instead of the route's own clean 400, so a scope-conditional branch (`TEAM_ONLY_TYPES` / `isTeamOnlyScopeViolation`, since moved to `src/lib/watchlist-scope.ts` so the client button and the server route share ONE home) was required; (2) `supabase-server.ts`'s `WatchlistItemType` union plus the exhaustive `SOURCE_FALLBACK` record; (3) `fetchWatchlist`'s resolution branch, which fell through to a bare `type: "signal"` literal and would have SILENTLY MISLABELLED every watched series as a Signal, the exact defect that file's own doc comment records happening once before, which is why a real `market_series` branch resolving by `id` against the table was written rather than an addition to `ITEM_BACKED_TYPES`; (4) `watchlist-links.ts`'s exhaustive `WATCHLIST_TYPE_LABEL` record and `watchlistHref` switch, where `market_series` returns `null` like `source` because no per-series detail route exists, an honest null, not an invented route that 404s. AND THE MOUNT, which the first pass left out and the operator correctly refused to accept: a type watchable in the database and unwatchable in the product is broken, not deferred. `WatchButton` carried a hardcoded 5-value COPY of `WatchlistItemType` that had already drifted; it now `import type`s the real home (erased at compile time, so no server code enters the client bundle) and renders TEAM-ONLY for team-only types, because a control offering an action the API will reject is itself a defect. `MarketSeriesBoard` threads `market_series.id` through `buildSeriesBoard` and mounts a per-series control. Reversible EXACTLY: re-run this file with `'market_series'` removed from the ARRAY, while the table holds no such row, the narrow form is byte-for-byte the prior constraint.
-- 270_widen_org_watchlist_market_series.sql
-- WO-23: widen org_watchlist.item_type to admit 'market_series' (team scope only).
--
-- SCOPE: org_watchlist ONLY. user_watchlist is deliberately NOT widened — market_series
-- watching is a team-scope feature, and user_watchlist now carries 1 live row, so leaving
-- its CHECK narrow is the safer of the two states, not merely the specced one.
--
-- SAFETY: org_watchlist is 0 rows at apply time, so ADD CONSTRAINT performs no validation
-- scan and the ACCESS EXCLUSIVE lock is held for microseconds against zero tuples. There is
-- no "DDL window" to schedule; the phrase implies a scan or rewrite and neither occurs.
--
-- REVERSAL (exact): re-run this file with 'market_series' removed from the ARRAY. While the
-- table holds no market_series row, the narrow form is byte-for-byte the prior constraint.
--
-- NOTE FOR THE CODE HALF: the application-level ITEM_TYPES Set in
-- src/app/api/watchlist/route.ts is SHARED across personal and team scope. Widening it
-- flatly would let a personal market_series watch reach the (still narrow) user_watchlist
-- CHECK and surface as a raw Postgres 500 instead of the route's clean 400. The route needs
-- a scope-conditional branch, not a one-line Set edit.
--
-- APPLIED to project kwrsbpiseruzbfwjpvsp on 2026-08-30 by the coordinator, two-track policy
-- (DDL lands before dependent code merges). Verified post-apply:
--   org_watchlist_item_type_check  → ARRAY[source, reg, signal, research, operations, market_series]
--   user_watchlist_item_type_check → ARRAY[source, reg, signal, research, operations]  (unchanged)

ALTER TABLE public.org_watchlist
  DROP CONSTRAINT IF EXISTS org_watchlist_item_type_check;

ALTER TABLE public.org_watchlist
  ADD CONSTRAINT org_watchlist_item_type_check
  CHECK (item_type = ANY (ARRAY['source'::text, 'reg'::text, 'signal'::text, 'research'::text, 'operations'::text, 'market_series'::text]));
