-- 157_security_hardening.sql
--
-- PHASE 0 (DEEP-AUDIT 2026-07-07, P0-3 + P0-4a). AUTHOR-ONLY in this commit —
-- this migration is OPERATOR-GATED: it changes production Row-Level-Security and
-- must be applied deliberately, through the ledger, with the read-back smoke
-- tests below run before AND after. It was authored against the LIVE policies
-- (project kwrsbpiseruzbfwjpvsp), not assumed names, so the DROP/ALTER targets
-- are the real objects.
--
-- WHAT THIS CLOSES (all live-confirmed exposures):
--   * intelligence_items / staged_updates / provisional_sources each carried a
--     `SELECT TO public USING (true)` policy, so the shipped anon key could read
--     128 quarantined + 57 unverified items, every staged update, and 497
--     provisional sources. (DEEP-AUDIT S1-3, §7.)
--   * `public.item_related_items_derived` is a SECURITY DEFINER view (runs as
--     owner, bypassing RLS) — the single ERROR-level security advisor. The other
--     four public views already set security_invoker. (DEEP-AUDIT §7.)
--
-- DELIBERATE NON-CHANGE — `sources`:
--   `sources_read` (SELECT TO public USING(true)) is LEFT AS-IS on purpose. The
--   registry holds public institutions' names / URLs / tiers — low sensitivity —
--   and the customer-facing provenance chips (source name + tier) read it for
--   EVERY displayed item. Tightening it risks blanking the chips for a verified
--   item whose source row is not 'active'. Revisit only with a chip-coupling test.
--
-- NOT IN THIS MIGRATION (flagged as separate Phase-0 operator items):
--   * 165 public functions lack a pinned search_path (advisor
--     `function_search_path_mutable`). A blind ALTER of 165 functions can break
--     any that rely on implicit search_path resolution, so it is NOT bundled into
--     this critical RLS change — it belongs in a reviewed companion migration
--     with its own smoke test.
--   * "Leaked-password protection OFF" is a Supabase Auth dashboard/API setting
--     (Authentication → Providers → Password), NOT SQL — enable it there.
--
-- APPLY (through the ledger, per MASTER-PLAN P0-3/P0-5):
--   npx supabase migration up --linked        # or db push, per repo runbook
-- and record it in docs/inventories/migrations.md.
--
-- SMOKE TEST (run as the ANON key, before/after):
--   -- BEFORE: returns quarantined/unverified rows (the exposure)
--   -- AFTER : returns ONLY provenance_status='verified' AND not archived
--   select provenance_status, count(*) from intelligence_items group by 1;
--   select count(*) from staged_updates;          -- AFTER: 0 rows to anon
--   select count(*) from provisional_sources;      -- AFTER: 0 rows to anon
--   -- Admin surfaces use the SERVICE-ROLE client (bypasses RLS) and must still
--   -- see quarantined items + staged updates unchanged.

begin;

-- (1) intelligence_items: customers/anon may read ONLY verified, non-archived
--     rows. `is_archived IS NOT TRUE` keeps a verified row visible even if the
--     flag is null. Admin reads run as service_role and bypass RLS entirely.
drop policy if exists intelligence_items_read on public.intelligence_items;
create policy intelligence_items_read
  on public.intelligence_items
  for select
  to public
  using (provenance_status = 'verified' and is_archived is not true);

-- (2) staged_updates: no anon/authenticated read at all. The app reads/writes it
--     only via the service-role client (the admin-gated /api/staged-updates
--     route), which bypasses RLS. Drop the public SELECT policy.
drop policy if exists staged_updates_read on public.staged_updates;

-- (3) provisional_sources: admin-only working set ("DO NOT process provisional
--     sources"). No anon/authenticated read; service-role handles review. Drop it.
drop policy if exists provisional_sources_read on public.provisional_sources;

-- (4) The one ERROR-level advisor: make the derived view run with the querying
--     user's privileges instead of the owner's, so RLS on its base tables applies.
alter view public.item_related_items_derived set (security_invoker = on);

commit;
