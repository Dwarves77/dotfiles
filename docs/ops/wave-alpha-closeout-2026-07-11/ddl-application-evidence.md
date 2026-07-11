# Track B DDL Application Evidence (2026-07-11)

Per the DDL protocol (dispatch O.4): per migration — pre-snapshot, apply, proof, rollback script committed.
Baseline restore point exists and is drill-proven (R0.1, private repo `caros-ledge-backups`,
`dumps/baseline-2026-07-11/`, run 29153549948) BEFORE any of these applied.

Apply order: 099 → 164 → 165 → 166 → 167 → 168 → 169 → 170 → 171. Rollback scripts:
`fsi-app/supabase/rollbacks/<n>_*_rollback.sql`.

## Pre-snapshot (all migrations, one read-only capture @ 2026-07-11T13:43:31Z)

| Migration | Pre-state (confirms the defect) |
|---|---|
| 099 | `source_tier_opinions` dismissed_* columns: **0 exist** (099 never applied) |
| 164 | `get_market_intel_items` has `_assert_org_membership`: **false**; LANGUAGE: **sql** (gate-less, P1 #1 live) |
| 165 | `profiles` policies: **only "Public read"**; anon has `email` column grant: **true** (P1 #3+#4 live) |
| 166 | `provisional_sources` policies: **INSERT + UPDATE only, no SELECT** (P1 #2 live) |
| 167 | `staged_updates.reviewer_notes` exists: **false** (P1 #5 phantom column live) |
| 168 | 5 aux `_read` policies all `USING(true)`; anon-visible rows w/ non-verified/archived parent (timelines): **774** (leak live) |
| 169 | reconciler SELECT policies on the 3 validator inputs: **none** (RLS-credential parity gap live) |
| 170 | 15 band versions ledgered: **none** (ledger divergence live) |
| 171 | verified+non-archived items with NULL/blank full_brief: **5** (P1 #9 live) |

Every defect confirmed present pre-apply.

## Applications + post-apply proofs (all applied 2026-07-11 via scripts/tmp/apply-track-b.mjs, superuser DSN, numeric-version ledgered)

| Mig | Applied | Post-apply proof (PASS) |
|---|---|---|
| 099 | ✅ | 3 dismissed_* cols; 2 policies (SELECT+UPDATE); aggregator live; ledgered v099 |
| 164 | ✅ | `_assert_org_membership` present; LANGUAGE **plpgsql**; ledgered v164 |
| 165 | ✅ | policies = Public read + self_insert + self_update; **as anon: SELECT email/linkedin_sub/is_platform_admin → permission denied; display_name/avatar_url → OK** (community joins intact) |
| 166 | ✅ | provisional_sources SELECT policy count 1 (admin/service) |
| 167 | ✅ | staged_updates.reviewer_notes exists |
| 168 | ✅ | **as anon: 226 timelines visible, all 226 verified-parent, 0 quarantined-parent leaked** (was 774); xrefs 14 (both-endpoints-verified); service-role still sees 774 (bypass intact) |
| 169 | ✅ | 3 reconciler SELECT policies; **as reconciler DSN: agent_run_searches 3126, section_claim_provenance 8686, item_type_required_slots 48 (all were 0)** — RLS-credential parity closed, runner sound |
| 170 | ✅ | 15 band versions (107,108,109,110,111,112,115,118,128-134) now ledgered |
| 171 | ✅ | null-brief item → valid=false / recommended=quarantined; healthy item → valid=true / verified (criterion 6, no collateral) |

## RD-5 post-apply scripts (ship with the validator change)
- `revalidate-corpus-brief-presence.mjs --apply`: 5 null-brief verified items (TCEQ, MEPC.377(80), C376, EPA Fast Facts, NC Register) → quarantined=5, RD-6 deferrals inserted=5 (valid payloads, deferred_until 2026-10-31, event = C7 re-synthesis / batch-1). verified+non-archived 179→174. Snapshot committed to `scripts/_snapshots`. (Fixed B's deferral reason to contain a valid disposition-path keyword — `re-synthes`/`generate` — the guard had rejected "resynth"/"regeneration".)
- `b4-disposition-stuck-staged-update.mjs --apply`: stuck approved-unmaterialized staged row `b631762e` → materialized_item_id reconciled to pre-existing verified `ccee10a4` (w4_ca_acf, CA ACF Rule); NOT re-materialized (dup-safe, URLs differ by `-rule`).

**Rollback readiness:** every migration has `fsi-app/supabase/rollbacks/<n>_*_rollback.sql`; baseline pre-DDL dump drill-proven in the private repo.
NOTE: `NOTIFY pgrst, 'reload schema'` owed post-164 (PostgREST schema cache) — issued at deploy.
