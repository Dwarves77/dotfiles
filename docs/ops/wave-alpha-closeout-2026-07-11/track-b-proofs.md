# Wave-α Track B — Tenancy & Credential Integrity — proof specs (authored, apply via DDL protocol)

Baseline: master `71bcbd4` + audit branch `42a4479`. DB `kwrsbpiseruzbfwjpvsp`.
Author: Agent B (author-only for DDL). **Nothing here has been applied or run** — the orchestrator applies
each migration under snapshot → apply → proof → rollback. All live reads below were READ-ONLY introspection.

## Dependency order for application

The eight migrations are largely independent. Recommended apply order (numeric is safe):

1. **099** (`099_tier_opinion_review_state.sql`, pre-existing on disk) — the B7 ruling: APPLY. Ledgers as 099.
2. **164** `164_market_intel_org_gate.sql` — depends on `_assert_org_membership` (already live from 077).
3. **165** `165_profiles_self_write_and_anon_pii.sql` — independent.
4. **166** `166_provisional_sources_admin_select.sql` — pairs with the code half (already committed).
5. **167** `167_staged_updates_reviewer_notes.sql` — apply BEFORE running the B4 disposition script.
6. **168** `168_aux_table_parent_gates.sql` — independent.
7. **169** `169_reconciler_rls_repair.sql` — completes the 163 half; enables the B6 runner proof.
8. **170** `170_ledger_repair_107_134.sql` — ledger-only; independent.
9. **171** `171_validate_provenance_brief_presence.sql` — recreates the gate; RUN the B9 revalidation
   script (`scripts/_wave-alpha/revalidate-corpus-brief-presence.mjs --apply`) IMMEDIATELY AFTER (RD-5).

Post-run scripts (after their migration): B4 disposition (after 167), B9 revalidation (after 171).

Every migration is reversible via `fsi-app/supabase/rollbacks/<n>_<slug>_rollback.sql`.

---

## B1 — get_market_intel_items org gate (migration 164)

**Purpose.** Restore the `_assert_org_membership(p_org_id)` gate that migration 108 silently dropped, plus a
deterministic `, id ASC` tie-break. Live `pg_get_functiondef` confirmed: gate absent (P1 #1).

**Pre-snapshot query.**
```sql
SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='get_market_intel_items';   -- capture the gate-less body
```
**Post-apply proofs (expected).**
```sql
-- (a) definition now carries the assert + plpgsql + id ASC
SELECT pg_get_functiondef(p.oid) ~ 'PERFORM public._assert_org_membership'
   AND pg_get_functiondef(p.oid) ~ 'LANGUAGE plpgsql'
   AND pg_get_functiondef(p.oid) ~ 'ii.id ASC'
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='get_market_intel_items';   -- expect: t
```
Behavioural (run via the appropriate DSNs):
- As the Jason auth user vs home org `a0000000-0000-0000-0000-000000000001` → rows returned.
- As the Jason auth user vs `00000000-0000-0000-0000-000000000999` → **ERROR 42501 'Not a member of org …'**.
- As service_role vs the fake org → 0 rows, NO exception (bypass).
Then `NOTIFY pgrst, 'reload schema';`

**Rollback.** `rollbacks/164_market_intel_org_gate_rollback.sql` (restores the live gate-less SQL body).

---

## B2 — profiles self-write + anon PII (migration 165)

**Purpose.** Add self INSERT/UPDATE policies (`auth.uid() = id`) so profile self-edit + onboarding persist
(P1 #3); restrict the anon role's column SELECT so `email`, `linkedin_sub`, `is_platform_admin` are not
anon-readable (P1 #4). Mechanism: REVOKE table-wide anon SELECT, GRANT SELECT on the 34 non-PII columns.

**Pre-snapshot query.**
```sql
SELECT policyname, cmd FROM pg_policies WHERE tablename='profiles';   -- expect only "Public read" SELECT
SELECT grantee, privilege_type FROM information_schema.role_column_grants
WHERE table_name='profiles' AND grantee='anon' AND column_name IN ('email','linkedin_sub','is_platform_admin');
```
**Post-apply proofs (expected).**
- Owner (authenticated as the profile's id): `UPDATE profiles SET headline='x' WHERE id=auth.uid()` → 1 row; value round-trips on re-select.
- Authenticated for a different id: `UPDATE profiles SET headline='x' WHERE id='<other>'` → 0 rows (self-only).
- Anon: `SELECT email FROM profiles LIMIT 1` → **permission denied for column email** (and linkedin_sub, is_platform_admin).
- Anon: `SELECT display_name, avatar_url FROM profiles LIMIT 1` → succeeds (community join intact).

**Rollback.** `rollbacks/165_profiles_self_write_and_anon_pii_rollback.sql` (drops policies; restores table-wide anon SELECT).

---

## B3 — provisional_sources admin SELECT + code fix (migration 166)

**Purpose.** Migration 157 left provisional_sources with no SELECT policy → the /admin queue read (anon
client, error dropped) returned 0 rows → empty queue since 2026-07-07 (P1 #2). Fix = admin-scoped SELECT
policy (defense-in-depth) + **the operative code half** (already committed): `fetchProvisionalSources()` now
reads with the SERVICE client and captures `error` (`src/lib/supabase-server.ts`).

**Pre-snapshot query.**
```sql
SELECT policyname, cmd FROM pg_policies WHERE tablename='provisional_sources';  -- only _admin_write/_admin_update
```
**Post-apply proofs (expected).**
- `pg_policies` shows `provisional_sources_admin_read` (SELECT).
- As a platform-admin authenticated session: `SELECT count(*) FROM provisional_sources WHERE status IN ('pending_review','needs_more_data')` = the service-role count (queue no longer empty; ~489+2).
- As anon: same count → 0.
- Code: the /admin Sources tab renders the pending provisional queue (service-client read).

**Rollback.** `rollbacks/166_provisional_sources_admin_select_rollback.sql` (the code half is independent, stays).

---

## B4 — staged_updates.reviewer_notes + idempotency + stuck-row disposition (migration 167)

**Purpose.** Add the phantom `reviewer_notes` column the approve/reject route already writes (P1 #5:
approve-with-notes materializes then 500s → orphan → retry re-mints). Paired code: idempotency hardening in
`src/app/api/staged-updates/route.ts` (guard keys on materialized_at OR materialized_item_id; on a
notes-write failure the item pointer is backfilled so a retry no-ops). Plus the one-off disposition of the
single stuck row.

**Pre-snapshot query.**
```sql
SELECT column_name FROM information_schema.columns WHERE table_name='staged_updates' AND column_name='reviewer_notes';  -- expect: 0 rows
SELECT id,status,materialized_at,materialized_item_id,materialization_error FROM staged_updates WHERE status='approved' AND materialized_item_id IS NULL;
```
**Post-apply proofs (expected).**
- `information_schema.columns` shows `staged_updates.reviewer_notes` text, is_nullable YES.
- A staged approve-with-notes against a test row persists reviewer_notes + materialized_at without a 500 (exercise in staging).

**Stuck-row disposition (investigated read-only, decision from evidence).**
Row `b631762e-c0af-4542-83d4-ae694813cebf`: update_type=new_item, status=approved, materialized_at SET
(2026-05-05), materialized_item_id **NULL**, error NULL. proposed_changes.source_url =
`…/advanced-clean-fleets-rule` ("California Advanced Clean Fleets Rule"). **No item at that URL.** BUT the
same regulation already exists, verified, as `ccee10a4-da4a-4a65-810e-51142ec3b753` (legacy_id `w4_ca_acf`,
source_url `…/advanced-clean-fleets` — no "-rule"), minted by the PR-A1 work.
**Decision: RECONCILE, not re-materialize.** The intent is already fulfilled; re-materializing would risk a
DUPLICATE (mint dedups by exact URL/legacy_id, and the URLs differ by the "-rule" suffix). The disposition
script (`scripts/_wave-alpha/b4-disposition-stuck-staged-update.mjs`, dry-run default) backfills
materialized_item_id → ccee10a4 and records a reconciliation note; re-verifies both rows before writing.

**Rollback.** `rollbacks/167_staged_updates_reviewer_notes_rollback.sql` (DROP COLUMN — reverse only with the code revert).

---

## B5 — aux-table parent gates (migration 168)

**Purpose.** Parent-gate the five aux tables (item_timelines / item_cross_references / item_disputes /
item_supersessions / item_changelog) so anon can't read rows naming a quarantined/archived item (689
timeline rows leaked; P2 provenance). Mirrors `intelligence_items_read` (verified AND non-archived);
two-FK tables require BOTH endpoints.

**Pre-snapshot query.**
```sql
SELECT tablename, policyname, qual FROM pg_policies
WHERE tablename IN ('item_timelines','item_cross_references','item_disputes','item_supersessions','item_changelog')
  AND cmd='SELECT';   -- expect USING(true) on each _read
```
**Post-apply proof (expected: 0 leaked rows to anon).** For each table, as the ANON client:
```sql
-- item_timelines example — expect 0
SELECT count(*) FROM item_timelines t
WHERE NOT EXISTS (SELECT 1 FROM intelligence_items i
                  WHERE i.id=t.item_id AND i.provenance_status='verified' AND i.is_archived IS NOT TRUE);
```
Run the analogous count for disputes/changelog (item_id), cross_references (source_item_id AND target_item_id),
supersessions (old_item_id AND new_item_id). Each MUST be 0. Service-role counts of the same tables UNCHANGED.

**Rollback.** `rollbacks/168_aux_table_parent_gates_rollback.sql` (restores USING(true)).

---

## B6 — reconciler RLS repair (migration 169)

**Root cause (finding).** The re-validation runner touches `intelligence_items.updated_at` as the bound
`reconciler`; the AFTER-UPDATE trigger `set_provenance_status` (SECURITY INVOKER) calls
`validate_item_provenance` (STABLE, SECURITY INVOKER) — both run with the RECONCILER's privileges. The
reconciler HAS table GRANT SELECT on `agent_run_searches`, `section_claim_provenance`,
`item_type_required_slots` but RLS is enabled and **no policy admits it** → 0 rows → the validator
mis-recommends `quarantined` for valid items (RLS-credential parity class: grant present, policy absent).
The separate "WITH CHECK even same-value" symptom was the trigger's quarantine-branch `INSERT integrity_flags`
as the reconciler — **already fixed by migration 163** (`integrity_flags_reconciler_insert`, ledgered
`20260711032524`). With 163 + 169 both halves close and the runner is sound.

**Pre-snapshot query.**
```sql
SELECT tablename, policyname, roles FROM pg_policies
WHERE tablename IN ('agent_run_searches','section_claim_provenance','item_type_required_slots');  -- no reconciler SELECT
```
**Post-apply proofs (expected).**
- `pg_policies` shows `*_reconciler_select` (SELECT, roles={reconciler}) on all three tables.
- As the reconciler DSN: `SELECT count(*)` on each of the three > 0 (was 0).
- **End-to-end (orchestrator runs):** `node scripts/_reground/reconcile-revalidate.mjs --only=<a known-valid
  verified item>` (dry-run) → the trigger recomputes `verified` (no spurious quarantine); validator now sees
  the inputs and recommends correctly.

**Rollback.** `rollbacks/169_reconciler_rls_repair_rollback.sql` (DROP the 3 policies).

---

## B7 — mig-099 ruling: **APPLY** (see the ruling section below)

## B8 — ledger repair 107–134 (migration 170) + records-truth docs

**Purpose.** Ledger the 15 applied-but-unledgered migrations (107–134 band) into
`supabase_migrations.schema_migrations`, mirroring the 136–157 repair (insert version+name, statements NULL,
guarded idempotent DO block). Records truth; runs NO DDL.

**The exact 15 (read-only diff of schema_migrations vs disk, 2026-07-11):**
`107, 108, 109, 110, 111, 112, 115, 118, 128, 129, 130, 131, 132, 133, 134`
(disk 107–134 excl. 127-never-existed, minus the already-ledgered 113/114/116/117/119/120/121/122/123/124/125/126).

**Pre-snapshot query.**
```sql
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN ('107','108','109','110','111','112','115','118','128','129','130','131','132','133','134')
ORDER BY version;   -- expect: 0 rows before apply
```
**Post-apply proof.** Same query → all 15 present. Re-running the migration is a no-op (idempotent).

**Rollback.** `rollbacks/170_ledger_repair_107_134_rollback.sql` (deletes exactly the 15 statements-NULL rows).

**B8(ii) out-of-band registration** → `docs/inventories/out-of-band-objects.md` (4 `_pre_phase5` tables + 7
mig-009 capture-table policies). **B8(iii) stale headers** → corrected in `docs/inventories/migrations.md`
(101/149/152/153 rows re-stated as APPLIED; the FILE header comments are stale-but-frozen — applied
migrations are immutable, so the authoritative status is the inventory + ledger, not the file comment).

---

## B9 — brief-presence criterion (migration 171) + corpus revalidation

**Purpose.** Add criterion 6 (`missing_full_brief`) to `validate_item_provenance` so a verified item with a
NULL/empty `full_brief` fails the gate (P1 #9: 5 verified-live items render an empty detail page). Authored
from the LIVE function body (mig-158 def), preserving criteria 1–5 + search_path exactly. Column confirmed:
`intelligence_items.full_brief` (text). Ships WITH the corpus revalidation (RD-5).

**Pre-snapshot query.**
```sql
SELECT count(*) FROM intelligence_items
WHERE provenance_status='verified' AND is_archived IS NOT TRUE AND (full_brief IS NULL OR btrim(full_brief)='');
-- expect: 5 (TCEQ, MEPC.377(80), C376, EPA Fast Facts, NC Register)
```
**Post-apply proofs (expected).**
- `validate_item_provenance(<a NULL-brief verified item>)` → valid=false, a failure with criterion=6 /
  reason='missing_full_brief', recommended_status='quarantined'.
- `validate_item_provenance(<a healthy verified item>)` → UNCHANGED (valid=true).
- **Revalidation (orchestrator runs after apply):** `node scripts/_wave-alpha/revalidate-corpus-brief-presence.mjs --apply`
  → quarantines exactly the 5, each with a valid RD-6 deferral (reason names missing-brief + C7 regeneration
  path; deferred_until 2026-10-31; owner operator; resolution_event = C7/batch-1 hold-lift). The script
  surfaces (does NOT flip) any item invalid for OTHER reasons.

**Rollback.** `rollbacks/171_validate_provenance_brief_presence_rollback.sql` (restores the criteria 1–5 body).

---

## B7 ruling — mig-099: **APPLY** (evidence)

**Decision: apply 099** (`099_tier_opinion_review_state.sql`) — it joins the apply queue as version 099; no
code change, no archive.

**Evidence.**
- 099 is on disk, **never applied** (absent from `schema_migrations`; live `get_tier_opinion_disagreements`
  is still the 091 version — does not reference `dismissed`; `source_tier_opinions.dismissed_at/_by/_reason`
  do not exist — confirmed live).
- The dismiss affordance in `TierOpinionDisagreementsView.tsx` → `POST /api/admin/sources/tier-opinions`
  UPDATEs `dismissed_at/dismissed_by/dismissed_reason` and **checks** the error (route.ts:197-213) →
  currently a hard **500** ("column does not exist"). The UI already codes against 099's contract.
- 099 is coherent and additive: it adds the 3 columns, upgrades the aggregator to skip dismissed opinions,
  adds a partial index, and adds the TWO platform-admin policies (`source_tier_opinions_select/update_platform_admin`)
  — which is ALSO the fix for `source_tier_opinions`' **zero-policy** state (DB-2 F10 "third instance" is
  099-unapplied fallout, not a separate defect). `ADD COLUMN IF NOT EXISTS` + `DROP FUNCTION IF EXISTS` make
  it re-runnable.

**Why apply over archive.** Archiving means deleting live-coded, coherent functionality for a feature that is
merely dormant (`source_tier_opinions` has 0 rows today) — not wrong. Applying restores the dismiss
affordance AND closes a real zero-policy RLS gap on `source_tier_opinions`. The tier-opinion review surface
is legitimate future functionality; the honest state is applied, not archived.

**Post-apply proof (in the window).**
```sql
-- columns present
SELECT count(*) FROM information_schema.columns
WHERE table_name='source_tier_opinions' AND column_name IN ('dismissed_at','dismissed_by','dismissed_reason');  -- 3
-- policies present
SELECT policyname FROM pg_policies WHERE tablename='source_tier_opinions';  -- select_/update_platform_admin
-- aggregator upgraded
SELECT pg_get_functiondef(oid) ~ 'dismissed_at' FROM pg_proc
WHERE proname='get_tier_opinion_disagreements';  -- t
```
Then the /admin dismiss affordance returns 200 (no 500). Reversible via 099's own inverse (drop 3 columns +
2 policies + restore the 091 aggregator) if ever needed — record a rollback in the window if applied.
