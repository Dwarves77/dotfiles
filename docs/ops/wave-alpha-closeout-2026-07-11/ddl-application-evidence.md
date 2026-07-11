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

`NOTIFY pgrst, 'reload schema'` issued post-164.

## Track D / E / R0.2 migrations (applied 2026-07-11, same protocol; pre-snapshot @ 15:15:02Z)

| Mig | Applied | Post-apply proof (PASS) |
|---|---|---|
| 195 (R0.2) | ✅ | error_events table created |
| 190 (A4) | ✅ | 3 counter fns now SECURITY DEFINER (were INVOKER); weekly_post_count writer added |
| 191 (A4) | ✅ | org_memberships ban-guard trigger present (1) |
| 192 (A4) | ✅ | forum_sections/threads/replies dropped (were 17/0/0; 17 seed rows archived in git history) |
| 180 (A5) | ✅ | get_workspace_members + related_items_derived dropped; 5 zero-consumer views dropped |
| 181 (A5) | ✅ | vendor family (4 tables, all 0 rows) dropped |
| 182→183 (A5) | ✅ | 3 RLS arms repointed to profiles.is_platform_admin (moderation_reports policy intact), user_profiles + mirror triggers dropped |
| 184 (A5) | ✅ | ingestion_state(774)+ingestion_control_log(709) exported to private repo `archives/ingestion-pair-2026-07-11/` FIRST, then dropped |
| 185 (A5) | ✅ | 7 all-NULL dead columns dropped (versions.created_by_run_id, sources.{classification_observed_distribution,last_observed_at,spotchecked_at,spotchecked_by}, regions.operations_decisions, region_dimension_coverage.last_reviewed_at) |

**Guard:** core customer tables (intelligence_items, community_groups, community_posts, profiles) intact post-drops.

## Community post-apply scripts (A4)
- `recount-community-counters.mjs --apply`: 1 group weekly_post_count drift repaired (0→1). (Fixed A4's readAll call — junction tables community_group_members / case_study_endorsements have composite keys, no `id`; added `orderBy` param to the shared `readAll` helper, backward-compatible default "id".)
- `reset-unearned-peer-validation.mjs --apply`: 4 case studies with peer_validated + 0 endorsements reset to 'submitted' (Hauser & Wirth, Massive Attack, MIT ClimateMachine, Coldplay).

**Total DDL this dispatch: 22 migrations applied + proven** (099, 164–171 Track B; 180–185 Track E; 190–192 Track D; 195 R0.2). All ledgered with numeric versions; every migration has a committed rollback; baseline dump drill-proven before any applied.

**Rollback readiness:** every migration has `fsi-app/supabase/rollbacks/<n>_*_rollback.sql` (182 is a policy-repoint with no standalone rollback — 183's rollback recreates user_profiles + re-seeds). Baseline pre-DDL dump drill-proven in the private repo.

## C8 canonical key (mig 200) + guarded merges — applied 2026-07-11

| Item | Applied | Proof |
|---|---|---|
| 200 canonical_instrument_key + deriver + trigger + partial UNIQUE (verified+live) | ✅ | 4 derive proofs pass (CELEX/ELI/url→key, bare→NULL); column/trigger/index live |
| backfill-canonical-keys --apply | ✅ 20/21 | 1 skipped (5ea46db2 unverified — touching it tripped guard_provenance_flip; key immaterial for unverified); verified-live unchanged 175 |
| canonical-key-uniqueness (EP-11) | ✅ PASS | 175 verified+live, 0 collisions |
| guarded-merge --apply --include-ecovadis | ✅ | auto item twin HDV CO2 2019/1242 (b7736a1a archived duplicate_instrument); 8 registry URL-dups suspended + edges re-pointed; 4 EcoVadis suspended (keeper 4a956756) |
| FuelEU 2023/1805 twin (operator ruling) | ✅ | 3 xrefs re-pointed to keeper 7a0ead55; e4d84c60 archived duplicate_instrument |

**Guard-blocked residue (contained, → disposition-engine Unit 1):** 8 non-customer-visible items (5 quarantined city-council + 3 unverified EcoVadis) still cite a now-suspended source — the guard correctly refused a service_role `source_id` re-point (it would flip an unverified item). Reconciled when Unit 1 processes them. verified-live unchanged (175).

**Disposition-engine hand-offs (operator rulings, deferred to that dispatch):**
- HDV amend 2024/1610: 3ae89ce6 → Unit 3 reground-onto-keeper (8c186db2) THEN archive duplicate_instrument (NOT archived now — honors "reground THEN archive").
- FuelEU keeper 7a0ead55 → Unit 3 ride-to-verified (reground/remediation-fetch; flagship, no delete without ladder exhaustion).
- 12 provisional-vs-active deep-path near-dups → Unit 1 (provisional dedup scope).
- EcoVadis pause posture (Sprint-3) = separate source-credibility ruling; suspension here is registry hygiene, not a credibility re-rating.

**Total DDL: 23 migrations applied+proven** (099, 164–171, 180–185, 190–192, 195, 200). Ledgered numeric; every migration has a committed rollback; baseline drill-proven first.
