# Wave-α Deletions Log — 2026-07-11

Durable record of every DROP / erase authored in the Wave-α correction dispatch, per the
erase-migration discipline (each deletion names its evidence, its reversibility, and where the
data can be recovered from).

## Track D (Agent A4, Community pre-adoption)

### D-1 — Forum layer (mig-007) dropped as a dead parallel implementation

- **Migration**: `fsi-app/supabase/migrations/192_drop_forum_layer.sql` (AUTHOR-ONLY; applies in the operator DDL window).
- **Rollback**: `fsi-app/supabase/rollbacks/192_drop_forum_layer_rollback.sql` (recreates schema + RLS + triggers + the `case_studies.linked_thread_id` column; DATA restores separately, see below).
- **What is dropped**:
  - Tables: `forum_replies`, `forum_threads`, `forum_sections` (+ their RLS policies, triggers, indexes — ride the table drops).
  - Column: `case_studies.linked_thread_id` (the one inbound FK; `case_studies` itself STAYS — it is Track D d5 scope).
  - Trigger functions: `update_thread_reply_count`, `update_section_thread_count` (orphaned by the table drops).
- **Ruling**: DROP. Decision rule (dispatch): zero code paths + zero usage → delete via gate.
- **Evidence (re-verified fresh 2026-07-11, not inherited from the audit)**:
  - `grep -rn "forum_sections|forum_threads|forum_replies" src scripts` → ZERO hits. The only references anywhere are the mig-007 DDL (`007_community_layer.sql`, `007_rls_community.sql`), one comment line in `075_profiles_consolidation_phase1.sql`, and the `supabase/seed/seed-community.sql` INSERT blocks (removed in the same commit).
  - Live data (read-only MCP, project kwrsbpiseruzbfwjpvsp): `forum_sections` 17 rows (all seeded 2026-04-05 by seed-community.sql, `thread_count` 0 on all 17), `forum_threads` 0 rows, `forum_replies` 0 rows.
  - The shipped Community surface is built entirely on the mig-028+ conversation layer (`community_groups` / `community_group_members` / `community_posts`). The forum_* layer is a dead parallel implementation, carrying embedded vocab fractures (`primary_region_tag='HONG_KONG'` vs `community_groups` CHECK `'HK'`; `threads_read` expects `membership_tier IN ('member','contributor','verified','premium')`, values that do not exist in live data).
  - `intelligence_items.linked_forum_thread_ids` is a plain `uuid[]` column echoed through RPC row-types (mig 073/077/117) — NOT a FK to the forum tables; unaffected by this drop.
- **Data loss (named honestly)**: the 17 seeded `forum_sections` rows are erased. They are operator-authored seed content, ZERO customer exposure (never rendered anywhere — no reader has ever existed), fully reproducible from the git history of `supabase/seed/seed-community.sql` at its pre-this-commit revision (the removed INSERT blocks: 8 regional + 9 topical sections). `forum_threads` / `forum_replies` had 0 rows, so no row data is lost there.
- **Recovery**: re-run migration 192's rollback to restore the schema, then re-run the forum INSERT block from `seed-community.sql` at the pre-Wave-α git revision to restore the 17 rows.
