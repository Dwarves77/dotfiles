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
