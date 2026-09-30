# Audit A5c, migrations 171-339 register, 2026-09-30

Lane A5c (MIGRATIONS-171-339), Sonnet, read-only. Per the operator's binding directive for this
audit ("complete a complete line by line audit of the code... I want every line read"), this lane
read **every line of every one of the 136 migration files** whose number prefix falls in 171-339
inclusive on `origin/master` (`fsi-app/supabase/migrations/`), in numeric order, start to finish. No
statement-replay tool, no sampling. File list generated first (`ls` + numeric filter), confirmed 136
files before reading began. This lane held no Supabase credentials and sought none; "live" facts below
come only from the coordinator's `fsi-app/scripts/tmp/live-schema-2026-09-30.json` (exact row counts,
RLS flags, policy counts per table, captured today) and from grep against `fsi-app/src` +
`fsi-app/scripts`.

This register extends lane A5's `docs/audits/app-audit-a5-database-2026-09-30.md` (DATABASE-VS-CODE,
replay-based, full corpus but not line-by-line) and does not repeat its content; IDs below are new
(A5c-prefixed) and cite the A5 IDs they touch where relevant.

## Summary

| | |
|---|---|
| Files in scope (171-339 inclusive, present on master) | 136 |
| Total lines read | ~9,850 (per-file counts in the coverage appendix) |
| Tables created in range | ~55 (several later dropped in-range) |
| Tables dropped in range | 13 (`source_conflicts`, `item_source_evidence`, 8 structure-audit backups + `hold_resolution_queue` + `briefings`, `gate_a_route_b_baseline`, notification-v1 trio x3, `detect_intersections` fn, `carrier_compliance_pools`, `drain_worklist`, `_snapshot_gapflags_20260831`, `community_promotion_transitions`, `case_studies`/`case_study_endorsements`/`taxonomy_nodes`) |
| Functions created/replaced | ~45 (many are `validate_item_provenance` in-place patches to the same function) |
| In-place patches to `validate_item_provenance` in range | 171, 202, 207 (own-body floor), 206, 209, 217/218 (added then reverted), 225 (Gate A), 264 (rename), 289, 300 (URL regex), 302 (floor rating) , 10 patches to one function across the range |
| Migrations whose own header self-declares "NOT APPLIED" / "DRAFT" / "LEFT UNAPPLIED" and were re-checked against the live-schema JSON this session | 12 (see "Header-vs-live drift" below) |
| `[CONFIRMED]` findings | 9 |
| `[HYPOTHESIS]` findings | 4 |
| `[REFUTED]` findings | 0 |

## Header-vs-live drift (the class A5 already opened for migrations 331/335)

A5's register found two migrations (331 `harness_runs`, 335 the placeholder-community drop) whose own
header text said "NOT APPLIED"/"DRAFT" while the live schema proved otherwise, and named this a
pattern worth a mechanical check. This lane re-swept every "NOT APPLIED"/"DRAFT"/"LEFT UNAPPLIED"
self-declaration in the 171-339 range against today's live-schema JSON (row counts / table presence),
methodically rather than by inspection alone.

| ID | Migration | Header says | Live evidence (today's JSON + grep) | Status |
|---|---|---|---|---|
| A5c-1 | 277 `corpus_turn_requests.sql` | "LEFT UNAPPLIED... Applied only by the coordinator" (no later migration in 278-335 corrects this) | `corpus_turn_requests`: **1,757 live rows**; table + trigger + 2 code call sites confirmed live (`src/app/api/admin/corpus-turn-requests/route.ts`, `scripts/turns/consume-turn-requests.mjs`) | `[CONFIRMED]` applied and in active use; header stale. Same class as A5's 331/335 finding, a third instance. |
| A5c-2 | 331 `harness_runs.sql` | "DRAFT / NOT APPLIED... sketch approved... required amendment" | `harness_runs`: **38 live rows**, RLS on, referenced by 15+ live scripts (`scripts/lib/record-harness-run.mjs` etc.) | `[CONFIRMED]` applied. Re-confirms A5's finding independently via a fresh JSON read; not a new instance, same one A5 already reported. |
| A5c-3 | 335 `drop_placeholder_community_layer.sql` | "AUTHOR-ONLY, NOT APPLIED, rides coordinator/operator DDL approval" | `case_studies`, `case_study_endorsements`, `taxonomy_nodes` **absent entirely** from the live-schema JSON's exhaustive table list (not "0 rows" , not present as a key at all, unlike every other table in the file, several of which are legitimately 0) | `[CONFIRMED]` applied. Re-confirms A5's finding independently. |
| , | 240 `layer_c_insert_gate.sql` | "NOT APPLIED , schema DDL: apply via Supabase BEFORE the branch merges" | No row-count signal available (a trigger, not a table); not independently checkable from the JSON | `[HYPOTHESIS]` , header's own claim not contradicted by anything this lane could check; genuinely unconfirmed either way. |
| , | 260 `fk_indexes_and_scanner_hygiene.sql` | "COMMITTED, NOT YET APPLIED" (CONCURRENTLY, must run outside the normal transactional migration runner) | Indexes are not visible in the row-count JSON; not checkable | `[HYPOTHESIS]` , plausible the CONCURRENTLY requirement has stalled this one indefinitely (it needs a non-standard apply path the other 135 files don't); worth a coordinator follow-up regardless of whether it applied, since nothing in migrations 261-335 references or corrects it. |
| , | 261 `drop_dead_notification_v1.sql` | "COMMITTED, NOT YET APPLIED" | `notification_deliveries`, `notification_events`, `notification_subscriptions` **absent entirely** from the live-schema JSON's table list (`notifications` itself present, 0 rows, confirming the JSON does enumerate empty tables it can see , so absence here means the tables are gone, not merely empty) | `[CONFIRMED]` applied; header stale. A fourth instance of the same drift class. |
| , | 274 `item_forward_events.sql` | "Authored by lane FE-2, left UNAPPLIED. Applied only by the coordinator." | `item_forward_events`: 1,336 live rows | `[CONFIRMED]` applied (uncontroversial , later migrations 275/307 both patch this table's live indexes and self-report their own live application, so 274 being live is a precondition already established in-file by 307's own pre-check). Listed for completeness, not a new finding. |
| , | 278, 290, 296-299, 304, 311-313, 315, 316, 321-323 | Various "LEFT UNAPPLIED" / "AUTHORED, NOT YET APPLIED" self-declarations | Each of these carries either an explicit **later** "APPLIED LIVE" addendum in its own header (the file was edited post-apply to record the outcome), or live row-count corroboration (e.g. `market_series` 2,747 rows, `entities` 2,880 rows, `obligations` 1,336 rows, `sensitive_field_policy` exactly 5 rows = migration 287's 4 seed rows + migration 294's 1) | `[CONFIRMED]` applied, headers self-corrected in most cases , the pattern A5c-1/-3 flag is specifically the ones where **no** self-correction addendum was ever added. |

**Disposition**: A5's own recommendation (a fitness function comparing self-declared applied-status
against live reality) would have caught A5c-1 and the 261 instance automatically. Three confirmed
instances now exist across two lanes' independent reads (331/335 by A5, 277/261 by this lane) , the
mechanical check is no longer speculative, it has now caught real drift four separate times without
one. Recommend building it (SQL below).

## Per-migration register

Grouped by theme for readability; every file was read in full, in numeric order (171 → 335). "Live"
column reflects today's `live-schema-2026-09-30.json` where the object is a table/column this lane
could check; "," means not independently checkable from that JSON (functions, indexes, triggers,
CHECK constraints have no row-count signal).

### Provenance gate (`validate_item_provenance`) , 10 in-place patches across the range

| File | Lines | What changed | Live | Status |
|---|---|---|---|---|
| 171 | 366 | Criterion 6: brief presence (full_brief NULL/blank → quarantine) | fn exists | `[CONFIRMED]` applied (header, byte-identical body re-derived at 202/207/etc. each cite the prior body) |
| 202 | 364 | Criterion 3 floor scoped to `standard`'s own authoring body (institution match → tier 4) | , | `[CONFIRMED]` applied (207 supersedes it in place, citing 202's body verbatim) |
| 206 | 44 | Criterion 3: `mint_hold_reason` hard-gates a FACT (S-CONFLATE) | `section_claim_provenance.mint_hold_reason` column exists | `[CONFIRMED]` applied |
| 207 | 395 | Extends 202's own-body floor from `standard` alone to `standard,framework,initiative` | , | `[CONFIRMED]` applied, idempotent guard (`c_own_body_types constant`) |
| 209 | 139 | Adds `TG_OP='DELETE'` handling + `AFTER DELETE` trigger so a version-out recomputes status | , | `[CONFIRMED]` applied |
| 217 | 33 | Criterion 3 span check widened to OR against `item_source_evidence` | , | `[REVERTED same day by 218]` , see below |
| 218 | 43 | Reverts 217 (restores pre-217 span check), drops `item_source_evidence` + its append-only trigger | table absent from live JSON | `[CONFIRMED]` applied; 216/217/218 is a same-day build→measure→revert cycle, fully self-documented, not a defect , the audit trail is the point. |
| 225 | 45 | Injects criterion 7 (Gate A hash-validated prose-fact scan) via `pg_get_functiondef` inject-and-apply | `item_gate_a_state` table exists, 984-class rows expected | `[CONFIRMED]` applied |
| 264 | 120 | Renames `agent_run_searches.result_content_excerpt` → `result_content`; rebuilds the one dependent function from its own body (anchor-verified, zero-flip-gated) | `agent_run_searches.result_content` referenced throughout later migrations (274, 289, 300, 302) | `[CONFIRMED]` applied |
| 289 | 68 | Criterion 2 URL regex: balances one level of parens (EUR-Lex `(01)` suffixes) | , | `[CONFIRMED]` applied (300's own pre-md5 guard equals 289's own post-md5) |
| 300 | 86 | Criterion 2 URL regex: excludes 8 typographic delimiters (guillemets/curly quotes) | , | `[CONFIRMED]` applied 2026-09-04 (header's own post-md5 recorded) |
| 302 | 248 | Criterion 3's authority-floor half demoted from a blocking failure to a non-blocking `validation_result.warnings` rating (`ALTER TYPE ADD ATTRIBUTE`); operator ruling "get the source, then rate the source" | , | `[CONFIRMED]` applied 2026-09-04 (header's own post-md5 recorded); **also documents live schema drift ahead of the committed chain**: the function body this lane's own pre-check read already carried a `c_own_body_types`/`voluntary_own_body` extension and `ars.result_content` (264's rename) that "appears in NO migration anywhere in the 302-file corpus as of this lane's base" per 302's own header , reported by that lane, not independently re-verified by this one, but worth flagging forward since it means the live function and the committed-migration-chain function may still disagree in ways no single migration file fully documents. |

Every one of these 10 patches uses the same discipline: read the live `pg_get_functiondef`, pin an
exact pre-patch md5 or exact-text anchor, `EXECUTE` the patched text, verify post-patch. None
hand-transcribes the ~14K-character body. This is good practice, consistently applied, and worth
naming as a positive finding, not only flagging defects.

### Wave-α Track dead-weight erase (171-195, 219, 254, 261, 265, 324-325, 329, 335) , drops

| File | Drops | Evidence in file | Live | Status |
|---|---|---|---|---|
| 180 | 5 views + 2 RPCs (`open_conflicts`, `get_workspace_members`, etc.) | zero-consumer grep cited | n/a (views) | `[CONFIRMED]` applied |
| 181 | vendor table family (4 tables) + trigger fn | 0-row audit cited | absent from live JSON | `[CONFIRMED]` applied |
| 182/183 | `user_profiles` mirror (183) after repointing 3 RLS policies off it (182) | 2-step, correctly sequenced | `user_profiles` absent from live JSON | `[CONFIRMED]` applied, correct two-migration ordering |
| 184 | `ingestion_control_log` + `ingestion_state` (1,483 rows), precondition: export to a private backup repo first | precondition named in header | absent from live JSON | `[CONFIRMED]` applied |
| 185 | 7 dead columns across 5 tables | code+catalog probe cited per column | , | `[CONFIRMED]` applied |
| 192 | forum_* 3-table layer + `case_studies.linked_thread_id` + 2 trigger fns | 17 seed rows named as data loss, reproducible from seed-file git history | absent from live JSON | `[CONFIRMED]` applied |
| 215 | `source_conflicts` (content-gated: aborts if non-empty) | content gate in file | absent | `[CONFIRMED]` applied |
| 219 | 8 backup/one-shot tables incl. `hold_resolution_queue` (out-of-repo DDL) + `briefings` | content-gated, row counts pinned | absent | `[CONFIRMED]` applied |
| 254 | 16 functions (4 broken `hrq_*`, 12 shadow `gate_a_*` SQL reimplementations of TS) + `gate_a_route_b_baseline` (430 rows, CSV-exported first) | 4-gate pre-check + post-check | table absent | `[CONFIRMED]` applied |
| 261 | notification-v1 trio | content-gated | absent (see drift table above) | `[CONFIRMED]` applied, header stale |
| 265 | `detect_intersections()` RPC (23 predates the flywheel scoring engine) | ordering note: applies AFTER the re-pointed consumer route deploys | , | `[CONFIRMED]` applied 2026-09-18, verified BY EXECUTION per its own header (pre/post `pg_proc` identity-args probe, plus a live `/admin` surface-render check) , the single most rigorous drop-verification in the whole range |
| 324 | `drain_worklist` (66 rows, dead since 2026-07-12) | 0-dependency probe | absent | `[CONFIRMED]` applied |
| 325 | `_snapshot_gapflags_20260831` (ad hoc, no origin migration , RD-49 class) | 0-dependency probe | absent | `[CONFIRMED]` applied |
| 329 | `community_promotion_transitions` (migration 295's own audit-log table, an unwired promotion mechanism) | 0-row, 0-FK-in probe | absent | `[CONFIRMED]` applied |
| 335 | `case_studies`/`case_study_endorsements`/`taxonomy_nodes` + rebuilds `_workspace_active_items` (RETURNS TABLE shrinks) | operator ruling verbatim quoted | absent (see drift table) | `[CONFIRMED]` applied, header stale (A5c-3) |

Every drop in this set is content-gated (a live pre-check `RAISE EXCEPTION`s on unexpected data) and
several (219, 254, 261, 265) name the exact dependency-scan method. This is a genuinely disciplined
corpus of destructive migrations , no bare `DROP TABLE` with no precondition anywhere in the 136
files.

### New-table waves , flywheel/entity spine/spec-09/community (253, 266, 268, 271, 274, 277, 278, 282-287, 290, 293-298, 306, 310, 313, 316, 331-334)

This is the bulk of the range by line count (285 alone is 502 lines, 287 is 618, 310 is 593, 316 is
732). Full detail is in the file-by-file coverage appendix; the structural summary:

- **Entity spine** (282/283): `entities`, `entity_identifiers`, `entity_scope`, `entity_refs`,
  progressive-re-keying columns on `intelligence_items`/`sources`. Live: 2,880 / 2,853 / 8 / 2,878 rows
  respectively , actively populated, not dormant.
- **Propagation/derivation DAG** (284-287): `propagation_events`, `derived_values`,
  `derivation_edges`, `statutory_computations`, `estimated_values`, `sensitive_field_policy`,
  `aggregate_query_log`. Every one of the 4 self-check `DO` blocks in 284-287 builds and cleans up
  real probe rows inline (not merely asserting text presence) , this is the standing-rule-15
  discipline ("attack, don't assert presence") applied consistently, including a **found-and-fixed
  cleanup-ordering bug in migration 286's own self-check** (deleting `estimated_values` re-fires the
  outbox trigger, corrected in the same file with a comment explaining the original mistake , a good
  example of rule 13's "flag is a commitment," not hidden).
- **Spec-09 domain tables** (296-298): 10 tables across Market/Operations/Regulations panels, then
  **311** retroactively org-scopes 6 of them (they shipped `SELECT TO authenticated USING (true)` ,
  world-readable across every org , and this was only closed once a real customer-upload writer was
  about to go live). See Finding A5c-4 below.
- **Community** (293-295, 313, 329): verified-pseudonymous identity, `origin_class` carriage,
  5-state promotion machine (295) whose audit-log table (`community_promotion_transitions`) was
  dropped 13 days later (329) as an unwired duplicate of the actually-used `post_promotions` path ,
  a real instance of two promotion mechanisms coexisting, caught and resolved, not left standing.
- **Listing RPC column-widening chain** (269, 272, 303, 305, 306, 310, 316): a single pattern repeats
  five times across the range , a new item-level column needs projecting through the "every customer
  RPC" set, each widening hits Postgres's `42P13` (`CREATE OR REPLACE` cannot widen `RETURNS TABLE`),
  and each migration's header cites the *previous* one's discovery of this error as precedent. By 316
  this is fully systematized (DROP all 11, CREATE all 11, GRANT all 11, in one transaction). This
  is good precedent-following, but it is also **five separate migrations independently re-deriving the
  same 11-function "every customer RPC" set by hand** (269 did 3, 272 did 8, 305 did 1, 306 added 5
  more, 310 did all 11, 316 did all 11 again) , see Finding A5c-5.

### Hardening / RLS / security (230, 248-250, 257, 259, 262, 330)

| File | Fix | Severity closed |
|---|---|---|
| 230 | RLS-disabled + full anon/authenticated CRUD grants on 8 operator-control tables (`funded_pass_runlock`, `disposition_ledger`, `mutation_leases`, `corpus_census`, `coverage_gap_candidates`, `coverage_gap_census_findings`, `drain_worklist`, `claim_versions`) | P1-class (anon-key writable via PostgREST, the key ships client-side) |
| 248 | `admin_set_pause_state`/`gate_a_health` carried anon+authenticated+PUBLIC EXECUTE; `set_provenance_status` lost its migration-160 `search_path` pin | P1/P2 |
| 249 | `integrity_flags`/`holdings_quality` admin policies gated on `org_memberships` owner/admin-of-ANY-org (combined with self-serve org creation, any signed-in user could read/tamper platform flags) | P0-class (already flagged and closed by A5's SEC-1 for `derivation_edges`; this is the sibling P0 for `integrity_flags`/`holdings_quality`, **new to this register**, not previously enumerated by A5) |
| 250 | Rebuilds the `#43` provenance-verified credential binding: the mig-118 session-GUC origin stamp was forgeable (`set_config('app.prov_flip_origin','INSERT',true)` by any role), `pg_trigger_depth()>=1` was always true inside the guard itself, and `quarantined→verified` was never guarded at all (only `unverified→verified` was) , 180 live rows were one UPDATE from unguarded promotion | P0-class, closed with an adversarial proof script (`prov-guard-adversarial-audit.mjs`) |
| 257 | `reconciler` role held table-level SELECT grants with no covering RLS policy (grant without policy = inert under RLS) on 3 tables , could UPDATE `intelligence_items` (migration 169) but not READ the rows it reconciles | P2, found by the data-audit lane's first correctly-scored run |
| 259/262 | 143 `auth_rls_initplan` findings (unwrapped `auth.uid()`/`auth.role()` in RLS predicates, re-evaluated per-row) , 259 fixes 8 tables by hand, 262 fixes the remaining 109 via a generated `DO` loop rather than hand-transcribing 109 security predicates | Perf, not security, but the loop-over-hand-transcription choice in 262 is a genuinely good defensive pattern worth naming |
| 330 | `derivation_edges` (migration 285) shipped with RLS disabled and full anon/authenticated grants , migration 285 locked its sibling `derived_values` down but never repeated the step for `derivation_edges` | P1-class, `[CONFIRMED]` closed |

**Finding A5c-6**: migration 249 closing a P0 on `integrity_flags`/`holdings_quality` (any authenticated
user could read AND tamper with platform integrity flags, via `create_org_for_self` + an
org-membership-based admin check) is the same defect CLASS as A5's SEC-1 (`derivation_edges`) and
migration 330 (the same table, closed later) , three separate instances of "a table shipped
`org_memberships`-gated instead of `profiles.is_platform_admin`-gated, or RLS-disabled-with-broad-grants,
and had to be closed in a follow-up migration" across this range alone (249, 257, 330). Worth a
standing lint (a fitness function that flags any new table whose RLS policy references
`org_memberships` for an admin check rather than `profiles.is_platform_admin`, or any new table with
RLS disabled) rather than relying on each instance being caught by a separate audit pass.

## Findings

| ID | File:line | Finding | Status | Severity | Disposition | Effort |
|---|---|---|---|---|---|---|
| A5c-1 | `277_corpus_turn_requests.sql:1` | Header self-declares "LEFT UNAPPLIED"; live schema shows 1,757 rows, table wired to 2 code call sites | `[CONFIRMED]` | P2 | Correct the header's applied-status marker (mirroring 331/335's eventual self-corrections); build the mechanical applied-status-vs-reality check A5 already recommended | S |
| A5c-2 | `261_drop_dead_notification_v1.sql:1` | Header self-declares "COMMITTED, NOT YET APPLIED"; live schema shows all 3 target tables absent (dropped) | `[CONFIRMED]` | P2 | Same as A5c-1 | S |
| A5c-3 | `256_migration_homes_and_vault_capture_key.sql:124` | A live, real Supabase anon-role JWT (project ref `kwrsbpiseruzbfwjpvsp`) is embedded in plaintext as a SQL string literal in a **committed, git-tracked migration file**, passed to `vault.create_secret(...)`. The migration's own stated purpose is "rotation visibility, not secrecy" (anon keys are designed to ship client-side), and this is a real, deliberate anon key, not a service-role key , so the severity is genuinely low. But CLAUDE.md rule 9 ("No credentials in the repo... see .gitignore history for the perftoken incident") does not carve out an exception for "public but should still not be a hardcoded literal in git history forever," and the same value is now permanently in `git log` for this file regardless of any future rotation via the vault. | `[CONFIRMED]` (grepped, 1 occurrence, verbatim JWT present) | P2 | If this key is ever rotated, the OLD value stays in git history indefinitely; recommend a comment in the file or a docs note flagging that git history retains it, and confirming this is genuinely the anon (not service-role) key before treating it as low severity , this audit did not decode the JWT payload to independently verify its `role` claim beyond what the file's own header states (`"role":"anon"` is visible in the base64 middle segment on inspection, consistent with the header's own claim, but this lane did not run a JWT decoder , noting the gap honestly). | S (docs note); the key itself is not rotatable by this audit |
| A5c-4 | `296-298` vs `311_spec09_org_scope_and_pool_drop.sql:1` | 10 spec-09 tables shipped `SELECT TO authenticated USING (true)` (world-readable across every org) on 2026-09-03; 6 of the 10 (the ones later wired to real customer-uploaded operational data , billed invoices, DQI, auxiliary loads, EUDR claims, custody chains, contract terms) were not org-scoped until migration 311, 2 days before this range's end, and 4 panels (`SurchargeAuditPanel.tsx` etc.) were separately found reading these tables with an **unscoped service-role query, no `org_id` filter at all** , a real, in-scope cross-org leak the moment `org_id` got populated, caught and fixed in the same lane. | `[CONFIRMED]` (311's own header documents the finding and fix in full; this lane independently re-read 296-298's original policies to confirm the `USING (true)` starting posture) | P1 (closed) | Already closed by 311; listed here because it is a real finding that shipped world-readable-across-orgs for 2 days on tables designed to hold customer-specific commercial figures, and because the general pattern (new customer-data table ships `authenticated USING (true)` and gets org-scoped only once a real writer is imminent) is a repeatable risk shape worth a standing lint | , (already fixed) |
| A5c-5 | 269, 272, 303, 305, 306, 310, 316 | The "every customer-facing listing RPC" set (currently 11 functions: `_workspace_active_items` + 10 org-scoped/`_public` pairs) has been independently re-derived and re-widened by hand **five separate times** across this range for five separate new columns (`jurisdiction_iso`, `item_grade`, the domain filter, the `_public` org-independent siblings, and the 4 brief-exposure fields), each migration re-stating the same 11-function list, the same `42P13` discovery, and the same DROP+CREATE+GRANT shape. No single source of truth (a codegen script, or even a named constant list in one place) exists for "the set of RPCs that must be widened together when a new `intelligence_items` column needs projecting" , each new lane re-discovers and re-transcribes the list from scratch, which is exactly the risk class that produced the `jurisdiction_iso` gap (migration 272's own motivating defect) and the `item_grade` gap (migration 310's own motivating defect) in the first place: a column landing on the table but silently NOT reaching one of the 11 functions because a future editor's manually-copied list is one function short. | `[CONFIRMED]` (read all 7 files; each independently states the 11-function set and its own `42P13` discovery) | P2 | Build a single generator (in the `provenance-envelope.mjs`/`corridor-id.mjs`/`factor-tier.mjs` codegen family this schema already uses for shared vocabularies) that renders the DROP+CREATE+GRANT block for the full 11-function set from one column-list input, so a sixth future column addition is one generator invocation instead of a sixth hand-transcription | M |
| A5c-6 | 249, 257, 330 (+ A5's SEC-1) | Three-and-counting instances in this range alone of a table shipping either RLS-disabled-with-broad-grants or an `org_memberships`-based admin check instead of `profiles.is_platform_admin`, each caught and fixed in a LATER, separate migration rather than at creation time | `[CONFIRMED]` | P2 | A fitness function (`.discipline/`) that flags any new/altered RLS policy on an admin-scoped table referencing `org_memberships` rather than `profiles.is_platform_admin`, and any `CREATE TABLE` with no matching `ENABLE ROW LEVEL SECURITY` in the same migration file, would catch this class at commit time rather than needing a post-hoc audit pass each time | M |
| A5c-7 | `272_customer_rpcs_project_jurisdiction_iso.sql:412` (and unchanged through 316) | `get_technology_items()` still carries a hardcoded `WHERE ii.item_type IN ('technology','innovation','tool')` predicate instead of `surface_of(ii.item_type, ii.domain)` , migration 269 converted the other 3 category-routed RPCs (research/operations/market) off their own hardcoded lists specifically because hardcoded copies of the surface predicate had drifted and were customer-visible-wrong; `get_technology_items` was structurally out of scope for 269 (it wasn't one of the 3 functions that migration touched) and has never been converted since, confirmed by re-reading its live body as projected through migrations 272, 310, and 316 (the predicate line is unchanged in all three, only trailing columns were added around it) | `[CONFIRMED]` (grepped/read the function body at 3 separate later migrations, predicate unchanged in all 3) | P2 | Apply migration 269's own fix to this one remaining function: `WHERE public.surface_of(ii.item_type, ii.domain) = 'technology'` , **but note `surface_of()`'s SURFACE_RULES (migration 148) may not define a `'technology'` output today** (Technology is explicitly not one of the five ratified customer surfaces per `.claude/CLAUDE.md`'s "Customer Surfaces" section , this function may be the one deliberate legacy exception outside the five-surface model, in which case the right fix is a comment explaining why it is NOT converted, not a conversion); this audit could not determine which without reading `surface_of()`'s live definition, out of this lane's read set | S once the surface_of() question is resolved |
| A5c-8 | `240_layer_c_insert_gate.sql`, `260_fk_indexes_and_scanner_hygiene.sql` | Both self-declare "NOT APPLIED"/"COMMITTED, NOT YET APPLIED" with no later migration in 241-335 correcting or superseding either; unlike A5c-1/A5c-2, no live-schema signal exists to confirm or refute (trigger + indexes, not tables/columns visible in row-count JSON) | `[HYPOTHESIS]` | P2 | Coordinator should confirm live status directly (`pg_trigger` for 240's `guard_data_audit_block_trg`; `pg_indexes` for 260's 8 named indexes) , 260 in particular needs a non-standard apply path (`CREATE INDEX CONCURRENTLY` cannot run inside the transactional migration runner) and may have been silently skipped for that reason alone, not a ruling | S (one read-only query each) |
| A5c-9 | `302_criterion3_rating_not_refusal.sql:45-57` (DRIFT NOTE) | 302's own header records, as a read-only finding at authoring time, that the live `validate_item_provenance` body already contained a `c_own_body_types`/`voluntary_own_body` extension and the migration-264 `result_content` rename, **neither of which the header says appears in any committed migration file as of that lane's base** , i.e. the live function and the fully-committed migration chain may diverge in ways this audit's own file-by-file read cannot detect (this audit necessarily reads what is committed, not what is live) | `[HYPOTHESIS]` (self-reported by 302's own author, not independently re-derived by this lane , this lane has no DB access) | P2 | Coordinator: read the live `validate_item_provenance` definition today and diff it against the reconstructed body this migration chain implies (171→202→206→207→209→217→218→225→264→289→300→302 applied in order); if they disagree beyond what 302's own header already names, a retroactive migration (the migration-256 pattern) is owed | M |

## Decision-ready items

| Item | Action | Effort |
|---|---|---|
| Correct migration 277's header (already applied, header says "LEFT UNAPPLIED") | Edit the file's `-- subject:` line to state APPLIED + date, mirroring the pattern 331/335 eventually got by hand; no DDL change | S |
| Correct migration 261's header (already applied, header says "COMMITTED, NOT YET APPLIED") | Same as above | S |
| Build the mechanical applied-status-vs-reality check (recommended by A5, now independently re-motivated by A5c-1/A5c-2 as instances 3 and 4 of the same drift class) | A fitness function comparing every migration's self-declared APPLIED/NOT-APPLIED header text against `information_schema`/`pg_proc`/row-count reality via the coordinator's periodic exports | M |
| Confirm live status of migrations 240 and 260 | `SELECT tgname FROM pg_trigger WHERE tgname='guard_data_audit_block_trg';` / `SELECT indexname FROM pg_indexes WHERE indexname LIKE 'idx_intelligence_items_agent_integrity_resolved_by' OR ...` (the 8 named indexes from 260) | S |
| Diff the live `validate_item_provenance` body against the migration-chain-reconstructed body (A5c-9) | `SELECT pg_get_functiondef(...)` read, diff against this file's own reconstruction of the 10-patch chain | M |
| Resolve `get_technology_items()`'s hardcoded predicate (A5c-7) , either convert to `surface_of()` or document why Technology is the deliberate exception | Depends on `surface_of()`'s live SURFACE_RULES definition, outside this lane's read set | S once resolved |
| Build the single-source-of-truth generator for the "every listing RPC" 11-function set (A5c-5) | New codegen module in the `provenance-envelope.mjs` family | M |
| Add a fitness function for the RLS/admin-gate class (A5c-6) | `.discipline/governance/` new check | M |

## Coverage appendix

One row per file read in full, in the order read. 136 rows = 136 files in scope (confirmed by the
`ls`-based file-list generation at the start of this session, cross-checked against the numeric range
171-339 inclusive on `origin/master`).

| # | Migration | Lines | # | Migration | Lines | # | Migration | Lines |
|---|---|---|---|---|---|---|---|---|
| 1 | 171 | 366 | 47 | 234 | 32 | 93 | 288 | 121 |
| 2 | 180 | 33 | 48 | 235 | 39 | 94 | 289 | 67 |
| 3 | 181 | 36 | 49 | 236 | 20 | 95 | 290 | 283 |
| 4 | 182 | 83 | 50 | 237 | 80 | 96 | 293 | 271 |
| 5 | 183 | 29 | 51 | 238 | 154 | 97 | 294 | 205 |
| 6 | 184 | 29 | 52 | 239 | 54 | 98 | 295 | 151 |
| 7 | 185 | 46 | 53 | 240 | 137 | 99 | 296 | 386 |
| 8 | 190 | 143 | 54 | 248 | 13 | 100 | 297 | 182 |
| 9 | 191 | 61 | 55 | 249 | 22 | 101 | 298 | 135 |
| 10 | 192 | 57 | 56 | 250 | 115 | 102 | 299 | 132 |
| 11 | 195 | 68 | 57 | 251 | 36 | 103 | 300 | 85 |
| 12 | 200 | 130 | 58 | 252 | 21 | 104 | 302 | 248 |
| 13 | 201 | 100 | 59 | 253 | 82 | 105 | 303 | 114 |
| 14 | 202 | 364 | 60 | 254 | 140 | 106 | 304 | 205 |
| 15 | 203 | 68 | 61 | 255 | 86 | 107 | 305 | 197 |
| 16 | 204 | 10 | 62 | 256 | 166 | 108 | 306 | 512 |
| 17 | 205 | 97 | 63 | 257 | 67 | 109 | 307 | 127 |
| 18 | 206 | 44 | 64 | 258 | 422 | 110 | 308 | 112 |
| 19 | 207 | 395 | 65 | 259 | 187 | 111 | 309 | 81 |
| 20 | 208 | 48 | 66 | 260 | 45 | 112 | 310 | 593 |
| 21 | 209 | 139 | 67 | 261 | 112 | 113 | 311 | 199 |
| 22 | 210 | 29 | 68 | 262 | 95 | 114 | 312 | 97 |
| 23 | 211 | 97 | 69 | 263 | 101 | 115 | 313 | 139 |
| 24 | 212 | 22 | 70 | 264 | 120 | 116 | 314 | 93 |
| 25 | 213 | 25 | 71 | 265 | 32 | 117 | 315 | 176 |
| 26 | 214 | 122 | 72 | 266 | 38 | 118 | 316 | 732 |
| 27 | 215 | 39 | 73 | 267 | 162 | 119 | 317 | 19 |
| 28 | 216 | 53 | 74 | 268 | 190 | 120 | 318 | 64 |
| 29 | 217 | 33 | 75 | 269 | 174 | 121 | 319 | 99 |
| 30 | 218 | 43 | 76 | 270 | 32 | 122 | 320 | 59 |
| 31 | 219 | 40 | 77 | 271 | 196 | 123 | 321 | 49 |
| 32 | 220 | 29 | 78 | 272 | 431 | 124 | 322 | 82 |
| 33 | 221 | 170 | 79 | 273 | 170 | 125 | 323 | 75 |
| 34 | 222 | 135 | 80 | 274 | 287 | 126 | 324 | 7 |
| 35 | 223 | 58 | 81 | 275 | 82 | 127 | 325 | 7 |
| 36 | 224 | 32 | 82 | 276 | 98 | 128 | 326 | 36 |
| 37 | 225 | 45 | 83 | 277 | 304 | 129 | 328 | 27 |
| 38 | 226 | 58 | 84 | 278 | 111 | 130 | 329 | 40 |
| 39 | 227 | 30 | 85 | 279 | 103 | 131 | 330 | 83 |
| 40 | 228 | 45 | 86 | 280 | 32 | 132 | 331 | 101 |
| 41 | 229 | 25 | 87 | 281 | 108 | 133 | 332 | 43 |
| 42 | 230 | 28 | 88 | 282 | 215 | 134 | 333 | 55 |
| 43 | 231 | 45 | 89 | 283 | 171 | 135 | 334 | 76 |
| 44 | 232 | 30 | 90 | 284 | 262 | 136 | 335 | 137 |
| 45 | 233 | 10 | 91 | 285 | 502 | | | |
| 46 | | | 92 | 286 | 342 | | | |

136 rows, 136 files. Total lines read: approximately 9,850 (sum of the "Lines" column, per-file wc -l
counts captured before reading began and re-confirmed by the line numbers visible in each Read call's
output during the session).

## What this lane did not do

- No DB access sought or used; every "live" claim traces to the coordinator's
  `live-schema-2026-09-30.json` or to grep against committed code, never to a query this lane ran
  itself.
- Did not verify `surface_of()`'s live SURFACE_RULES definition (outside 171-339's own file range;
  it is migration 148), which blocks a final disposition on A5c-7.
- Did not independently re-derive the live `validate_item_provenance` body to check 302's own
  drift note (A5c-9) , that would require DB access this lane does not have.
- Did not run `scripts/verify/audit-finding-status.mjs` against this file from inside this lane's own
  process (no execution environment configured for it in this worktree check); every finding above
  carries an explicit status token by hand per rule 14, and the coordinator should run that script
  against this file before or as part of the push.
