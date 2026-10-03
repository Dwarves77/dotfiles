-- subject: Migration 343 (lane R12-13, 2026-10-01, coordinator ruling, operator standard "fixed, not worked around"). Drops `user_list_order` (migration 237, personal drag ordering for the regulations/market/research/operations ledgers plus the watchlist rail), retiring the whole personal-list-order feature as never-shipped dead infrastructure. Evidence: `grep -rln "useListOrder" fsi-app/src` before this lane's fix found exactly one production importer, `src/components/home/DashboardTopPriority.tsx` (itself deleted this same lane, CF-DEAD-2, dead code for a dashboard redesign superseded by the operator's 2026-05-24 "stays as-is" ruling); `grep -rln "DndContext\|dnd-kit\|SortableContext" fsi-app/src --include="*.tsx"` found zero live mounts anywhere in the app, confirming no ledger's drag UI and no watchlist drag UI was ever built (migration 237's own header named the @dnd-kit sortable rail in DashboardWatchlist as a consumer "not yet built"); the live-schema snapshot (`fsi-app/scripts/tmp/live-schema-2026-09-30.json`) confirms 0 rows. The one READ-side consumer that did exist, `fetchWatchlist`'s `readListOrderRanks` (`src/lib/supabase-server.ts`), always degraded to the natural order on every call (0 rows to read), so removing it is no observable behaviour change. All code references removed in the same commit: `src/lib/hooks/useListOrder.ts`, `src/app/api/user/list-order/{route,logic}.ts`, `src/lib/list-order.ts`, `src/lib/watchlist-order.ts`, and the `listOrders`/`loadListOrders` field in `src/app/api/workspace/bootstrap/{route,logic}.ts` + `src/lib/hooks/useWorkspaceBootstrap.ts`. Pre-check DO block ABORTS if the table now holds any row (the "0 rows" premise must still hold at apply time). Bare `DROP TABLE IF EXISTS` with no CASCADE so an unexpected real dependent fails loudly instead of being silently destroyed. RLS policies (`user_list_order_select/insert/update/delete`) are owned by the table and drop with it; no separate DROP POLICY needed. Post-check confirms the table is gone. **APPLIED (confirmed live 2026-10-03, list_migrations + to_regclass null), the coordinator applied this via the Supabase management API (two-track policy, standing rule 3); this lane does not and cannot run it (no DB credentials in the worktree).**

DO $$
DECLARE
  row_count bigint;
BEGIN
  IF to_regclass('public.user_list_order') IS NULL THEN
    RAISE NOTICE 'user_list_order already absent, nothing to drop';
    RETURN;
  END IF;

  -- GATE: the "0 rows, never used" premise must still hold at apply time. A row appearing since the
  -- 2026-09-30 live-schema snapshot means something started writing to a table this migration
  -- assumes is provably dead, and dropping it would then destroy real data rather than an empty
  -- shell. Stop and re-audit rather than drop live data.
  SELECT count(*) INTO row_count FROM public.user_list_order;
  IF row_count > 0 THEN
    RAISE EXCEPTION 'ABORT: user_list_order holds % row(s), the zero-rows premise no longer holds, re-audit before dropping', row_count;
  END IF;
END $$;

-- No CASCADE: the table's own RLS policies (user_list_order_select/insert/update/delete, migration
-- 237) are owned by the table and are dropped automatically with it. If any OTHER object (a view, a
-- function body with a hard dependency, a foreign key from another table) unexpectedly depends on
-- user_list_order, this bare DROP fails loudly with a dependency error instead of silently
-- cascading into and destroying that dependent object.
DROP TABLE IF EXISTS public.user_list_order;

DO $$
BEGIN
  IF to_regclass('public.user_list_order') IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: user_list_order still exists after DROP TABLE';
  END IF;
  RAISE NOTICE 'migration 343 OK: user_list_order dropped (personal list-order feature retired, zero live rows, zero live callers after lane R12-13 code removal)';
END $$;
