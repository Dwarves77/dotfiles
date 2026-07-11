# X Register — Wave-2 Cross-Wiring (Full-System Audit 2026-07-11)

Agent: X. Branch `audit/full-system-2026-07-11`, baseline master `71bcbd4`. READ-ONLY throughout:
live DB via MCP `execute_sql` (SELECT / information_schema / pg_catalog only), zero fetches, zero writes,
no scripts executed. Inputs: all 11 Wave-1 registers + coverage-manifest. Every cross-claim below was
re-verified with fresh evidence (query or file:line) — Wave-1 assertions are cited as `[AGENT §/F]`,
fresh evidence as `[X: …]`. Severity: **P1** live customer/operator-visible defect · **P2** latent
defect / doctrine break · **P3** hygiene/observation.

## Headline adjudications (the ones the dispatch named)

1. **CODE-5b F1 CONFIRMED LIVE — `get_market_intel_items` has NO org-membership gate.**
   [X: `pg_get_functiondef(get_market_intel_items)`] — live body is `LANGUAGE sql SECURITY DEFINER`
   (search_path pinned by 160), joins `workspace_item_overrides wo ON wo.org_id = p_org_id` with **no
   `PERFORM public._assert_org_membership(p_org_id)`** and **no `, id ASC` tiebreaker**. The Sprint-4
   verified gate IS present (`provenance_status='verified'`). Any authenticated user can call it with a
   foreign org_id and read that org's priority/archive overlay — the S11 leak 077 closed, reopened by 108
   and still open in final state. Sibling check [X: fn census]: `_assert_org_membership` is referenced by
   the other workspace RPCs; only this one lost it. **P1 (single-tenant today = mitigated, structurally
   top-severity). Next action: one migration re-adding the assert + `, id ASC`; add the pg_proc probe
   invariant (X.5 backlog #3).**

2. **NEW — migration 158 IS APPLIED AND LEDGERED; the "AUTHOR-ONLY / HELD" state is STALE.**
   [X: `schema_migrations` contains version `158`; live `validate_item_provenance` prosrc contains
   `floor_basis` and `item_type_unconditional` (both 158-only markers) and its COMMENT says
   "migration 158 revision"; prosrc length 10,718]. This contradicts CODE-5b §2 ("AUTHOR-ONLY … DB-3:
   assert NOT in ledger") and project memory ("mig-158 apply HELD"). DB-3's own ledger listing
   ("versions 001–162" with gaps) is consistent with mine — DB-3 simply never called out that 158 was
   present. Consequences now LIVE: reg-family authority floor is UNCONDITIONAL (the model's priority
   choice can no longer disarm it) and the criterion-4 ANALYSIS label check is PER-CLAIM. The 158 header's
   probed blast radius (72 verified reg items / 947 sub-floor FACT claims flip to quarantined **at next
   re-validation**) is armed. **P2 (deliberate apply, stale records). Next action: update CODE-5b F10's
   framing, the migrations inventory, and project memory; schedule the 72-item disposition pass BEFORE the
   next corpus-wide re-validation runs it implicitly.**

3. **NEW P1 — the /admin provisional-review queue is silently EMPTY since mig 157 (2026-07-07).**
   Chain, each link verified fresh:
   - mig 157 dropped `provisional_sources_read` [CODE-5b policies_notable_transitions; X: live
     `pg_policies` on provisional_sources = `provisional_sources_admin_update` (UPDATE) +
     `provisional_sources_admin_write` (INSERT) — **no SELECT policy**].
   - `fetchProvisionalSources()` reads `provisional_sources` with the **anon-key client**
     [X: `src/lib/supabase-server.ts:27-31` (`getSupabase()` = NEXT_PUBLIC_SUPABASE_ANON_KEY), :344-350]
     and **drops `error`** (`const { data: rows }`) → RLS deny-all returns `[]` silently.
   - Consumer: `/app/admin/page.tsx:55` `fetchSourceData(true)` → AdminDashboard/sourceStore →
     ProvisionalReviewCard. Result: **489 pending_review + 2 needs_more_data rows [DB-2 §2] render as an
     empty queue** on the operator's only review surface for them.
   - Adjudication vs DB-2 §2's "RLS: SELECT open (via view usage pattern)" — DB-2's claim is WRONG as of
     157; fresh pg_policies is authoritative. CODE-3 F-15 predicted exactly this failure shape.
   - `fetchAwaitingReview` is NOT affected (uses `getServiceSupabase()` [X: supabase-server.ts:2642]).
   **Next action: switch fetchProvisionalSources (and the F-15 anon-read cluster) to the service client
   for the admin surface, or re-add a platform-admin-scoped SELECT policy; capture `error` in all F-15
   readers. This is the proof-case for backlog invariant #1 (X.5).**

---

## X.1 Column wiring

### (b) Code referencing columns that do NOT exist live — the complete diff

Method: every (table, column) named in CODE-3's select-map §4, plus the columns CODE-1/CODE-4b page code
reads, was checked against `information_schema.columns` in one LATERAL-unnest query (~350 pairs over
52 tables). [X: query in audit transcript]. **Result: exactly 4 missing pairs. Everything else in the
select-map exists live** — including `sources.tier` (mig-094 shim, so CODE-3 F-06's route works) and BOTH
`sources.api_endpoint` and `sources.api_endpoint_url` (CODE-3 F-07's split is real but neither read
errors — see (b3)).

| # | Missing column | Code write/read site | Live consequence | Sev |
|---|---|---|---|---|
| 1 | `source_tier_opinions.dismissed_at` / `dismissed_by` / `dismissed_reason` (mig 099 never applied — X.3b) | `api/admin/sources/tier-opinions/route.ts:197-206` UPDATE + `.is("dismissed_at", null)` filter | The dismiss action **always returns 500** (error IS checked, :208-213 → column-does-not-exist surfaces as 500). TierOpinionDisagreementsView's dismiss affordance is dead-broken. Masked only because source_tier_opinions has 0 rows. | P2 (broken affordance; becomes operator-visible the day tier opinions flow) |
| 2 | `staged_updates.reviewer_notes` — **never existed in any migration** [X: grep `reviewer_notes` over migrations → only provisional_sources (004:454), canonical_source_candidates (021:38), views 043/090] | `api/staged-updates/route.ts:170` (reject) and `:208` (approve), spread **conditionally** — only when the admin supplies notes | With notes on reject → 500 (checked, :174). With notes on **approve** → worse: `applyUpdate` **materializes the item FIRST** (:201), then the status persist fails (:212-229, surfaced honestly) → row stays `status='pending'` with a live materialized item; the :144 idempotency guard (`approved && materialized_at`) does NOT fire on retry → **re-approve re-materializes = duplicate item mint**. Latent (all 24 historic approvals passed no notes [DB-3 staged dump]). | **P1-latent** (one admin note away from a dup mint + inconsistent state) |

Next actions: (1) apply-or-archive mig 099 (DB-3 F2's decision row) and until then hide/disable the
dismiss affordance; (2) either add `reviewer_notes` to staged_updates by migration or delete the two
spreads; move the notes write BEFORE materialization or into the same guarded transaction.

### (b2) Class note
Both hits are the Wave-1a `last_scanned` post-mortem class (code references a column no migration
created). Hand-rolled TS types (not generated from the live schema) are why it recurs — see X.5
backlog #2.

### (b3) api_endpoint vs api_endpoint_url (CODE-3 F-07) — adjudicated
Both columns exist [X: information_schema]. The defect is a split-brain, not a missing column:
`fetch-now/route.ts:88` keys the API transport on `api_endpoint` (28 rows populated [DB-2 §1]);
`drain-first-fetch/route.ts:456` keys on `api_endpoint_url` + `api_auth_method` + `api_response_format`
(**all-NULL** [DB-2 §1]). So the drain worker's API leg can never fire while fetch-now's can — the 56
`access_method='api'` sources degrade silently on the drain path. P2. Next action: pick one column
(api_endpoint has the data), migrate, drop the trio or backfill it.

### (a) Consolidated dead-column register (DB-1/2/3 lists × code writer/reader greps)

Verdicts: **dead** = no writer + no reader anywhere in src/ (scripts one-shots ignored) ·
**read-no-writer** = UI/RPC reads it, nothing populates it · **write-wired-dormant** = writer exists,
never fired (hold/feature-dormant) · **seed/shelved** = ruled table. Greps: [X: per-column file-count
loop over src/ + scripts/ (tmp/_diag excluded)].

| Table.column | Live state [source] | Verdict | Note / next-action |
|---|---|---|---|
| intelligence_items.replaced_by, version_history, linked_forum_thread_ids, linked_vendor_ids, linked_case_study_ids, linked_regulation_ids, region_tags | all-NULL/'[]' ×653 [DB-1 ITM-6] | **dead** (src refs = type decls only, 0-1 files) | drop in one hygiene migration with the vendor/forum family decision (DB-4 F6/F11) |
| intelligence_items.compliance_deadline, next_review_date, last_verified | all-NULL [DB-1 ITM-6] | **read-via-RPC-only** — returned by get_market_intel_items et al. [X: functiondef returns them] | populate or drop from RPC payloads (payload weight for nothing) |
| intelligence_items.theme | 0 rows despite CHECK [DB-1 ITM-6] | write-wired-always-NULL — `toDbTheme()` nulls every value (vocab disjoint) [CODE-1 F-10] | Emergence-Capture follow-on owns it; until then /research theme routing is inert by construction |
| intelligence_items.trajectory_points | 0 rows [DB-1 ITM-6] | **read-no-writer** — TrajectoryBars + market RPC read it (src=3) | Sprint-3 trajectory ingestion never wired [memory]; wire or the UI belt stays empty |
| intelligence_items.operational_impact / open_questions / reasoning | ''/{} on ~647 [DB-1] | written-as-empty by pipeline, read by full RPC | per-column drop-or-populate at next contract rev |
| intelligence_item_sections.source_ids | '{}' ×3,379 [DB-1 SEC-1] | **read-no-writer** (in CODE-3 select-map, never populated) | drop + remove from selects; attribution lives in section_claim_provenance |
| intelligence_item_versions.created_by_run_id | NULL ×1,328 [DB-1 VER-1] | **dead** (src=0, scripts=0) | wire run-id into snapshot trigger or drop |
| section_claim_provenance.verified_by / verified_at | NULL ×8,686 [DB-1 CLM-2] | **dead** | reserve explicitly for pending_human_verify or drop |
| agent_run_searches.agent_run_id | NULL ×3,126, no FK [DB-1 ARS-1] | **dead** (src=1 = the insert that never stamps it) | stamp at write or rename table to item search pool |
| intelligence_summaries.urgency_score | NULL all [DB-1 SUM-2] | **seed/shelved** (SectorSynopsis SHELVE ruling) | fold into activation redesign |
| regions.operations_decisions | '{}' ×5 [DB-1 RGN-1] | **dead** (src=0) | drop or populate with Operations decisions |
| region_dimension_coverage.notes / last_reviewed_at | NULL all [DB-1 RDC-1] | **dead** (src=0) | drop |
| sources.cited_by, classification_observed_distribution, last_observed_at | all-NULL [DB-2 F6] | **dead** (src=0) | column-retirement list |
| sources.spotchecked_at / spotchecked_by | all-NULL [DB-2 F6] | **dead** (src=0; only `spotchecked` bool is read) | retire pair |
| sources.last_substantive_change | all-NULL [DB-2 F6] | read-in-spec-only — the demotion-trigger spec keys on it, no writer → **stale-demotion machinery can never fire** (status 'stale' = 0 rows) | wire the writer or delete stale from the spec |
| sources.api_endpoint_url / api_auth_method / api_response_format | all-NULL [DB-2 F6] | **read-no-writer** (drain route reads — see b3) | resolve with the b3 split |
| sources.fetch_status / fetch_status_at | all-NULL | **write-wired-dormant** — `recordSourceFetchStatus` behind mig 147 (147 IS ledgered [X]) + scrape hold | none; expected to move on hold-lift |
| sources.last_content_changed_at | all-NULL | **write-wired-dormant** (check-sources, mig 161; hold on) | none — but resolve CODE-5b F8's double-booked last_content_hash first |
| sources.tier_override / override_reason / override_date | all-NULL [DB-2 (c)] | **write-wired-dormant** (tier-override route live, never used) | none |
| sources trust columns (avg_lead_time_days, lead_time_samples, conflict_count/total, self_citation_count, reliability_score, trust_score_accuracy/timeliness/reliability frozen) | single-value [DB-2 F6] | wired-starved (trust.ts math consumes them; no upstream events) | revisit when conflict/lead-time detection ships |
| provisional_sources.domain | all-NULL [DB-2 §2] | **read-no-writer** (supabase-server.ts:356 maps it) | drop or derive |
| provisional_sources.promoted_to_source_id | all-NULL [DB-2 §2] | write-wired-never-completed (promote route writes it; 6 'confirmed' rows lack it = half-finished promote legs [DB-2 F8]) | finish/annul the 6 |
| provisional_sources.accessibility_verified / publishes_structured_content / entity_identified | all-false [DB-2 §2] | dead assessment booleans | retire or wire to verification |
| monitoring_queue.item_id | NULL ×580 [DB-3] | **dead in practice** | drop |
| monitoring_queue.reconciled_at | NULL all [DB-3] | write-wired-dormant (reconcile stamps only change_detected rows; none ever) | none |
| agent_runs.intelligence_item_version_id | NULL ×1,653 [DB-3 F6] | **dead** (src=0, scripts=1 ref) | drop or wire at run-close |
| agent_runs.duration_ms | 17/1,653 [DB-3 F6] | **dead app-side** (src=0) | drop or wire |
| source_citations.context | single value 'brief-citation' ×696 [DB-2 §7] | constant column | drop at next hygiene migration |
| taxonomy_nodes.* (description, parent_id + whole table) | 38 seeded rows, ZERO consumers [DB-2 F13; X: fn/view census confirms nothing touches it] | **seed-only, whole-table dead** | retire-or-wire ruling |

### (c) Type mismatches, schema-vs-code (corpus-wide sample of CODE-4b's class)

1. **severity** — CONFIRMED 3-layer: live CHECK is the migration-102 per-surface union and matches
   `metadata-vocab.ts` exactly [DB-1 §1.9]; `types/intelligence.ts:91` still declares the retired
   4-value union [CODE-4b F4]; live data holds 6 legacy-vocab rows + 13 NULL [DB-1 ITM-4, CODE-4b F4].
   The type is the lie; consumers guard via `toDisplaySeverity` fallback. Next: regenerate unions from
   metadata-vocab (the declared SoT); backfill the 6+13.
2. **archive_reason (items)** — no CHECK; 14 live values across 3 vocab regimes vs `constants.ts`
   ARCHIVE_REASONS which matches almost nothing [DB-1 ITM-3]. Confirmed no CHECK in catalog dump.
   Also note workspace_item_overrides.archive_reason is a deliberately DIFFERENT free-text vocab
   [DB-4 §1.6] — don't blind-unify.
3. **source_role** — no CHECK; 3 live values outside the 10-value code enum [DB-2 F7]. `update_frequency`
   — no CHECK; 4 out-of-contract values ×104 rows [DB-2 (d)]. `classification_confidence` UPPERCASE vs
   csc.confidence lowercase-CHECKed [DB-2 (d)].
4. **TS IntelligenceType enum** (`REG|STD|…` in types/source.ts) matches NOTHING in the live
   `intelligence_types` vocabulary (mig-123 label chain) — dead enum [DB-2 (d)].
5. **item_type 'law'** — accepted by operations routing + mig-101 CASE, absent from the TS ItemType
   union; 0 live rows (latent) [CODE-4b F4].
6. **Nullability the code doesn't guard** — `effective_tier` NULL on 326 sources is guarded everywhere
   live by `?? base_tier` [DB-2 (c)]; `severity` NULL ×13 falls through toDisplaySeverity; no unguarded
   NULL crash sites found in the sampled read paths (CODE-4a's live-surface sweep concurs).
7. **CHECK-vs-TS drift, benign direction** — `access_method` CHECK allows html_scrape/gazette (never
   used); SourceStatus stale/inaccessible 0 rows; ProvisionalSource.discovered_via missing manual_add
   [DB-2 F7]. Latent vocab, no consumer break.

---

## X.2 RPC wiring

Live census [X: pg_proc excluding extension-dependent]: **63 app-owned functions** (matches manifest
"≈60"). Disk model (CODE-5b functions_final_state) vs live: **zero out-of-band functions, zero missing**
— every live function traces to a migration, every disk-modeled function exists.

### (a) Functions with NO caller

Classification of all 63: 19 trigger-implementations (wired via the 34 triggers — [X: pg_trigger census
matches CODE-5b's trigger model exactly, 0 drift]); 13 SQL-internal helpers (each verified referenced:
`_assert_org_membership` ← 9 workspace RPCs (NOT get_market_intel_items — headline 1);
`_workspace_active_items` ← category RPCs; `surface_of` ← get_surface_counts/get_all_surface_counts;
`canonicalize_citation_url` ← validate_item_provenance; `_url_host` ← _guard_source_archive;
jurisdiction trio ← normalize trigger; `user_belongs_to_org` + 3 group helpers ← RLS policies
[X: prosrc cross-reference query + pg_policies quals]); 29 RPC-called from src (the CODE-3 map §3 +
`community_region_counts` (3 community pages), `get_all_surface_counts` (surface-coverage.ts:131),
`validate_item_provenance` (canonical-pipeline.ts:1327) [X: repo-wide `.rpc(` grep]).

**True orphans — 2:**

| Function | Origin | Evidence | Verdict / next action |
|---|---|---|---|
| `get_workspace_members(p_org_id)` | 077 | [X: prosrc cross-ref = no DB caller; repo grep = only recon-stage JSON artifacts] — members UI uses the org_memberships table route instead | dead RPC; drop or adopt in MembersPanel |
| `related_items_derived(p_item)` | 146 | [X: no DB caller; view `item_related_items_derived` is its own GROUP BY, does not call it; src refs = comments only (canonical-pipeline.ts:677-678)] | dead function (the view was Option A; the fn rode along); drop |

Dormant-not-orphan: the 6 forum/vendor trigger functions fire only on 0-row dead-family tables
(DB-4 F6/F11 decision bundles them); `get_tier_opinion_disagreements` is wired (tier-opinions:81) but
its feed table is empty and still the 091 body (X.3b).

### (b) Code `.rpc()` calls to nonexistent / drifted functions

- **src/: ZERO nonexistent targets.** All 29 called names exist live; spot-checked signatures match
  (search_intelligence_items(q,max_rows); get_tier_opinion_disagreements(window_days);
  `community_region_counts(p_privacy text DEFAULT null)` [X: 042:28] so the two no-arg page calls are
  legal). The dynamic `rpc(rpcName)` sites (supabase-server 494/619/694/1138) resolve to the workspace/
  category/aggregates families — all present live.
- **scripts/: 2 broken callers, both gitignored strays** — `audit-data-sufficiency.mjs` calls
  `exec_sql_text`, `jurisdiction-audit-2026-05-11.mjs` calls `exec_sql`; neither function exists live
  [X: fn census]. Cross-ref CODE-5a F-5a-14 (these exact files are gitignored-but-referenced by
  coverage-report.json). P3 — they'd fail on invocation; fold into the F-5a-14 track-or-repoint fix.
- `_diag/reconcile-worker-verify.mjs` calls `.rpc("noop")` deliberately (error-path probe) — by design.

### (c) The 5 views' consumers — adjudication widens DB-2 F12

[X: repo-wide grep for each view name over src/ + scripts/]:

| View | Consumers | Verdict |
|---|---|---|
| open_conflicts | none (sourceStore reads base table source_conflicts [supabase-server:377-383]) | dead |
| provisional_sources_review | none (admin routes read base table) | dead |
| source_health_summary | comment-only (SourceHealthDashboard.tsx:26 re-aggregates in TS) | dead |
| **active_intelligence_items** | **none** — pages go through the gated RPCs; the customer gate is the 157 RLS policy + RPC predicates, not this view | **dead — NEW: DB-3 §Views called it "the customer-gate view"; it gates nothing** |
| item_related_items_derived | comment-only (canonical-pipeline.ts:677) — related_items reads item_cross_references directly | dead |

All five views are consumer-less. CODE-5b F6 (SELECT * frozen at 116) therefore downgrades from MEDIUM
to P3 (a stale column list on a dead view). Next action: one decision row — wire SourceHealthDashboard
to source_health_summary and the related rail to item_related_items_derived, or drop all five.

---

## X.3 Migration drift (both directions)

### (a) The unledgered-applied band — verified

[X: fresh `schema_migrations` read] Ledger = 001–162 minus {008, 012, 014, 078, 095, 096, 127}
(never-existed numbers) minus **{099, 107, 108, 109, 110, 111, 112, 115, 118, 128, 129, 130, 131, 132,
133, 134}**, plus timestamped `20260711032524` (= mig 163, the ledgered out-of-band precedent). Note
**158 IS present** (headline 2). Per-object existence of the 15 applied-unledgered migrations,
independently re-verified this audit:
107 (`trajectory_points` exists [X: column diff — not missing]) · 108 (`get_market_intel_items` exists
[X: fn census]) · 109 (region_dimension_coverage live, 30 rows [DB-1 §11]) · 110 (what_it_changes etc.
exist [X: column diff]) · 111 (`workspace_item_overrides.dismissed_at` exists [X]) · 112
(`provenance_status` + enum live [X]) · 115 (all 3 `set_provenance_status_*` triggers live [X: trigger
census]) · 118 (`stamp_prov_origin_trg`, `guard_provenance_flip_trg`, `intelligence_items_reconciler_update`,
`integrity_flags_reconciler_select` all live [X: trigger + policy census]) · 128/132 (slot-description
text matches — accepted from DB-3's literal-match method; slot substrate confirmed 48 rows [DB-1 §10]) ·
129/130/131 (48 = 12×4 slot rows [DB-1]) · 133/134 (`get_technology_items`, `get_research_items` live [X]).
**DB-3 F1 CONFIRMED: 15 applied-but-unledgered.** Next action stands (batch ledger repair mirroring the
136–157 repair — note that repair window evidently also ledgered 158 when it was applied).

### (b) mig 099 — CONFIRMED never applied
[X: source_tier_opinions has 7 columns, none dismissed_*; `get_tier_opinion_disagreements` prosrc does
NOT contain 'dismissed'] — and 099 is also where the two `source_tier_opinions_*_platform_admin`
policies live [X: grep → 099 only], which explains the table's zero-policy state (DB-2 F10's "third
instance" is 099-unapplied fallout, not a separate defect). Live blast radius = X.1(b) row 1 (dismiss
action 500s). DB-3 F2's apply-or-archive decision now carries three consequences, not one.

### (c) The 4 `_pre_phase5` tables — confirmed, and they are the ONLY out-of-band tables
[X: zero-policy census lists all 4 live; CODE-5b disk model yields 82 tables; manifest live = 86;
delta = exactly intelligence_items_pre_phase5, item_supersessions_pre_phase5,
pending_jurisdiction_review_pre_phase5, ingest_rejections_pre_phase5]. CODE-5b F4 + DB-3 F17 stand
(capture-migration or drop; rollback window effectively closed).

### (d) — adjudicated as headline 1 (org gate ABSENT live).

### (e) 090 security_invoker regression — live is CLEAN, disk still encodes the regression
[X: pg_class.reloptions] all 5 views carry `security_invoker=true/on`. So the live DB was repaired
out-of-band (consistent with 157:16-17's assertion); CODE-5b F5's REPLAY hazard stands unchanged (a
fresh replay of 090 reintroduces definer views). Next action: repair migration amending 090's view DDL
(or the replay-unsupported ADR from CODE-5b F2).

### (f) Complete out-of-band census (live objects absent from the disk model)

| Object class | Out-of-band live objects | Evidence |
|---|---|---|
| Tables | exactly the 4 `_pre_phase5` (above) | [X] |
| Functions | **none** (63/63 trace to migrations) | [X: fn census vs CODE-5b model] |
| Triggers | **none** (34/34 match the disk model exactly) | [X: pg_trigger census] |
| Views | none (5/5 from migrations; invoker options repaired out-of-band per (e)) | [X] |
| Policies | **7 out-of-band**: `summaries_read_authenticated`, `summaries_update_service`, `summaries_write_service` (intelligence_summaries); `changes_read_authenticated`, `changes_write_service` (intelligence_changes); `sector_contexts_read_authenticated`, `sector_contexts_write_service` (sector_contexts) — the three mig-009 capture-only tables. RLS was enabled + policied on them by direct SQL that no migration records. | [X: live pg_policies vs `CREATE POLICY` grep over all 165 migration files — these 7 names appear in no file] |
| Policies, reverse (in-file, absent live, unexplained) | none unexplained: `source_tier_opinions_select/update_platform_admin` = 099 unapplied (b); `staged_updates_read`, `provisional_sources_read` = dropped by 157 (documented); `community_posts_select_member` = superseded by `_select_inherits_group` (046 era) | [X] |
| Enum/roles | provenance_status + reconciler both migration-modeled; reconciler policies live incl. the 163-ledgered insert | [X: policy census] |

Adjudication of CODE-5b F3 (118-vs-163 divergence): live now holds BOTH `integrity_flags_reconciler_select`
(118) and `integrity_flags_reconciler_insert` (ledgered 20260711032524 = 163). Since 118's SELECT policy
is present while 163 was authored because INSERT was missing, the evidence supports **118 applied
partially or its INSERT policy was dropped out-of-band** at some point before 2026-07-09 — the
out-of-repo-boundary class instance CODE-5b named. Unresolvable further from current state (no policy
history); record as the standing precedent, closed by 163.

Also confirmed in-band: mig 157's three changes are all live exactly as written
(`intelligence_items_read` qual = `provenance_status='verified' AND is_archived IS NOT TRUE` [X: qual
dump]; the two read policies dropped). 147 ledgered ✓ (CODE-1 F-13's open question).

---

## X.4 RLS vs credential usage — the mismatch register

Grants are Supabase defaults (policies are the sole guard [DB-4 §1]); RLS enabled on all tables; 14
tables have RLS enabled + ZERO policies [X: census]: agent_run_searches, section_claim_provenance,
institutions, source_bias_tags, source_tier_opinions, intelligence_item_citations,
item_type_required_slots, intelligence_items_domain_backfill_audit, portal_link_candidates,
system_state, + the 4 pre_phase5 — all service-role-only by construction (deny-all to anon/authed).

### Silent no-op / silent-empty class — (table, operation, credential) with NO enabling policy

| # | Table + op | Credential / site | Live policy state [X: pg_policies] | Consequence | Sev |
|---|---|---|---|---|---|
| 1 | provisional_sources SELECT | anon (supabase-server.ts:344) → /admin queue | no SELECT policy (157 drop) | **headline 3 — admin provisional queue empty since 2026-07-07** | **P1** |
| 2 | profiles UPDATE | browser anon+JWT (UserProfilePage.tsx:142, OnboardingWizard.tsx:196) | only `"Public read"` SELECT USING(true); no INSERT/UPDATE ever existed | profile self-edit silently writes nothing (DB-4 F1 **CONFIRMED live**); masked by the still-working user_profiles mirror for the one pre-075 user | P1 (DB-4's severity stands) |
| 3 | workspace_settings UPDATE | browser anon+JWT (settingsStore:52-79, OnboardingWizard.persistSectors) | `settings_update_admin` = owner/admin-only [X: qual] | works today (sole writer is the owner); a plain `member`'s settings toggles silently never persist + settingsStore swallows the result entirely (CODE-3 F-14 **adjudicated: policy exists but narrower than the writer population**) | P2-latent |
| 4 | source_bias_tags SELECT | anon (CODE-3 F-15 cluster, supabase-server credibility reads) | ZERO policies | bias-tag credibility chips silently empty on any anon-path render; service-role paths unaffected | P2 |
| 5 | institutions / section_claim_provenance / agent_run_searches SELECT | any future client-side read | ZERO policies | PostgREST-silent-empty class (DB-1 §0b, DB-2 F10 confirmed); no live consumer breaks today | P3 (guard-rail) |
| 6 | forum_sections UPDATE (thread_count trigger) | invoker of any future thread insert | no UPDATE policy | moot (dead layer) but the DB-4 F10 invoker-trigger counter-drift class is real on the LIVE community layer: member_count/reply_count trigger fns are SECURITY INVOKER — an RLS-path post insert (community_posts_insert_member exists, inviting user-JWT writes) updates parents with 0 rows matched, drifting counters silently | P2 (DB-4 F10 confirmed) |
| 7 | community_group_members INSERT | user JWT self-join | insert policy = existing group admin only (self-referential); join route deliberately escalates to service after privacy check | consistent-by-design; recorded so nobody "fixes" the route to RLS and breaks joins | P3 |

Adjudications that CLEARED: `search_intelligence_items` internally enforces verified + not-archived
[X: functiondef] → CODE-3 F-09's leak does NOT exist today (belt on the re-fetch still cheap insurance).
`org_invitations` admin INSERT policy present ✓ (CODE-3 §7 row holds). Community policy set
(028/029/030/032/046/153/154/156) fully present live [X: policy census]. `fetchAwaitingReview` = service ✓.

### Over-broad / anon-exposure class (quals verified live)

| Surface | Live qual | Exposure | Sev |
|---|---|---|---|
| profiles SELECT | `true` | emails, linkedin ids, org_id, is_platform_admin to the anon key (DB-4 F2 **confirmed**; 157-era work did not cover profiles) | P1-doctrine (PII) |
| item_timelines / item_changelog / item_cross_references / item_disputes / item_supersessions SELECT | `true` each [X] | anon can enumerate rows naming quarantined/archived items the items-RLS hides (689 timeline rows + xrefs [DB-1 RLS-1 confirmed]) | P2 |
| sources SELECT | `true` | full 1,197-row registry incl. `notes` (which carry audit annotations) to anon | P3/P2 |
| monitoring_queue SELECT | `true` | ops telemetry to anon (DB-3 F19 confirmed) | P3 |
| notification_events SELECT | `true` | empty today (dead trio) | P3 |
| briefings SELECT | `org_id IS NULL OR member OR service` | org-NULL rows anon-readable (empty today) | P3 |
| bulk_imports SELECT | `authenticated` | any logged-in user reads raw_input import payloads (DB-4 F14 confirmed) | P3 |
| case_studies / forum_sections / forum_replies / vendors-family SELECT | `true` | seeded content incl. the 4 unearned `peer_validated` labels (DB-4 F7) anon-readable | P3 (latent doctrine) |
| intelligence_item_sections SELECT | EXISTS(parent) checking `is_archived=false` ONLY [X: qual] | the verified-gate is NOT in this qual; it holds **transitively** because the EXISTS subquery on intelligence_items is itself RLS-filtered by `intelligence_items_read` for anon callers. Correct today, but the gate's correctness now depends on the items policy — if anyone widens items read, sections follow silently. Recommend adding `provenance_status='verified'` explicitly (belt). | P3→P2 |

Reconciler credential: `intelligence_items_reconciler_update` + both integrity_flags reconciler policies
live [X] — the Phase-2 binding chain is intact; worker/reconcile's deliberate no-flip posture (CODE-3 §7)
remains consistent.

---

## X.5 Invariant coverage map (finding classes × CODE-2's 53-invariant registry)

CODE-2's headline holds (no named-but-missing enforcer). The cross-wiring question is the inverse:
which Wave-1 FINDING CLASSES have no invariant at all, or one that provably missed.

### Wired and it worked (no action)
- Moat base-tier-only (SC-9/F12), claims-tier (SC-7), one-tier-per-host (SC-6), floor mechanics
  (SC-10/11/12), mint chokepoint (EP-9/F13), spend chokepoint (RD-10/F15 — modulo CODE-1 F-05's
  unledgered legacy sites already tracked by the F15 shrink list), migration file ordering (SF-2/F6),
  admin route gating (SF-3/F2), vocab-sync (lane) — this audit found no new breaks in any of them.

### Wired but MISSED (detector narrower than the invariant's claim)

| Class (finding) | Invariant | Why it missed | Fix shape |
|---|---|---|---|
| Scrape-hold transport holes (CODE-1 F-02: direct/API/RSS fetch paths un-gated) | RD-11 / F16 + fetch-hold.test | F16 proves the Browserless PRIMITIVE carries `assertFetchAllowed`; it never asserts that all fetch transports route through a gated entry — the claim "every fetch is gated" is wider than the detector | add assertFetchAllowed to directFetchClean/apiFetchForHost/rssFetch/apiFetch and extend F16 to grep for raw `fetch(` in the transport modules |
| Expired-open deferrals (DB-3 F3: 47 expired 07-02, never renewed; renewal pass caught only 40) | RD-6 + quarantine-disposition-audit (lane HARD) | the audit validates deferrals **per currently-quarantined item**; expired deferral flags whose subject items were deleted/re-homed (DB-3 F10: 56 open flags on deleted subjects, 5 of them deferrals) fall outside its join — flag-side expiry is unchecked | audit the integrity_flags deferral rows directly (payload `deferred_until < now()` AND status=open ⇒ RED), not only via the item join |
| Prompt/validator ANALYSIS-label mismatch (CODE-1 F-01 crit-4: system-prompt authorizes 4 labels, validator/relabel/kept-filter accept 3) | mig-143 regex is "the runtime authority"; **158 now live makes the check per-claim** [X: headline 2] — the 4th-label drop is more consequential today | no drift guard ties system-prompt.ts labels ↔ ANALYSIS_LABELS ↔ the SQL `c_label_re`; vocab-sync-audit covers metadata vocab only | a 3-home label drift test (same pattern as url-canon.test.mjs, which already proves SQL↔JS mirroring is cheap) |
| Error-swallow-with-write (CODE-3 F-04 auto-resolve-on-read-error; F-17/F-18 unchecked audit writes; CODE-1 F-09 mint probes fail-open) | error-drop-probe (bug-class-guard) | SOFT job, `\|\| true`, report-only; the write-consequence subclass is not distinguished from benign drops | execute the documented promotion path (diff-gate on NEW instances); tag write-consequence sites as HARD |
| NULL-brief verified items (DB-1 ITM-1: 5 verified-live, full_brief NULL) | RD-5/EP-8 substrate-agreement (lane HARD) | the lane compares stored status to `validate_item_provenance`, and the validator does not treat NULL full_brief as a failure — criterion gap, not detector gap | add a full_brief-presence criterion (or explicit format_type exemption) to the validator; the 5 items re-quarantine or regenerate |
| Ledger honesty (DB-3 F1 15-band) | SF-2/F6 is file-numbering only | nothing reconciles disk ↔ schema_migrations ↔ live catalog | see backlog #5 |

### NO invariant — the next-invariants backlog, ranked

| Rank | Class (proof instances from this audit) | Proposed invariant / mechanism |
|---|---|---|
| 1 | **RLS-credential parity** — code performs (table, op) under a credential with no enabling policy, failing SILENTLY (provisional queue P1, profiles self-edit P1, settings member-writes, bias-tag reads; the entire CODE-3 §7 register) | new SC/SF invariant: a machine-readable (table, op, credential) map for non-service code paths, audited against pg_policies in the nightly lane; any unmatched pair = RED. The CODE-3 select-map is 80% of the input already |
| 2 | **Column-existence parity** — code references columns no migration created (dismissed_* trio, staged_updates.reviewer_notes; historic last_scanned post-mortem) | generate DB types (`supabase gen types`) + tsc gate, or lane audit diffing the select-map against information_schema. Caught 2 live defects in this audit alone |
| 3 | **Workspace-RPC org gate** (CODE-5b F1, live) | pg_proc probe in the lane: every `get_*_items(p_org_id)`/`get_workspace_*` body must contain `_assert_org_membership` — CODE-5b's own suggestion; rides the fix migration |
| 4 | **Customer verified-gate predicate** on raw service-role item reads in page/route code (CODE-4b F1 related-rails leak; CODE-3 F-10 metadata route) | grep-class fitness: service-role `.from("intelligence_items").select` outside the RPC/gated-helper allowlist must carry a provenance predicate; plus lane-wire `surface-visibility-audit` (F-5a-7, same family) |
| 5 | **Ledger parity** (15 unledgered applied; 158's silent-but-ledgered apply shows the repair loop works when used) | lane audit: disk files ↔ schema_migrations ↔ live objects; RED on any unledgered-applied or ledgered-missing entry |
| 6 | **Cross-format instrument identity** (DB-2 F3: 6 same-instrument twin pairs, 2 both-verified PPWR rows) | canonical CELEX-derived key + normalizing trigger + lane uniqueness audit; unblocks the dedup-before-grounding gate |
| 7 | **Surface-honesty literals** (CODE-4b F5 hardcoded verticals, F10 `\|\| 5`; CODE-4a F-03 re-mount hazard) | extend bug-class-guard SOFT lexicon: literal workspace-fact strings/numeric fallbacks in page mastheads; delete the domains/* trio |
| 8 | **Bare-invocation prod writers** (F-5a-4/11: ~45 executed one-shots + 3 reconstruction tests re-run raw) | directory-level interlock convention (`executed/` + assertExecutedDataOp), `--live` flag on the 3 lib acceptance tests |
| 9 | **Async-contract drift between internal routes** (CODE-3 F-02 stale 202 callers) | type the /api/agent/run response and import the type in callers (F9/tsc then catches it); no new runtime gate needed |
| 10 | **UI dead affordances** (CODE-4a F-02 discover no-op; dismiss-500 above) | lowest value as an invariant; fold into review checklist — the instances are cheap point fixes |

Also for the registry bookkeeping (CODE-2 F-5a-8 cross-ref): ledger-onepass, unregistered-span-host and
vocab-sync audits are lane-wired but have no invariants.mjs entries; surface-visibility-audit has
neither. Registering them closes the meta-gate's blind spot on exactly the mechanisms this backlog leans on.

---

## Adjudication summary (where Wave-1 registers disagreed or asked)

| Question | Verdict | Evidence |
|---|---|---|
| CODE-5b F1: does get_market_intel_items lack the org gate live? | **YES — gate absent, leak live** (verified-gate present as mitigation) | [X: functiondef] |
| CODE-5b §2 / memory: is 158 held-unapplied? | **NO — applied AND ledgered; records stale; 72-item flip armed** | [X: ledger + prosrc markers + COMMENT] |
| DB-2 §2 "provisional_sources SELECT open" vs live | **WRONG since 157 — no SELECT policy; /admin queue silently empty (P1)** | [X: pg_policies + supabase-server.ts:27/344 + admin/page.tsx:55] |
| CODE-3 F-06/F-07: do sources.tier / api_endpoint(_url) exist? | tier YES (shim live, lockstep CHECK holds); BOTH api columns exist — defect is the drain/fetch-now split-brain, api_endpoint_url all-NULL | [X: column diff; DB-2 (c)] |
| CODE-3 F-09: does search_intelligence_items gate internally? | **YES — verified + not-archived enforced in the function** | [X: functiondef] |
| CODE-3 F-14: workspace_settings member UPDATE policy? | Policy exists but owner/admin-only → member writes silent no-op (latent) | [X: qual] |
| DB-4 F1: profiles UPDATE policy? | **Confirmed absent — self-edit no-op is live** | [X: pg_policies] |
| CODE-5b F3: 118 vs 163 reconciler policies | Both live now; 118's SELECT survived while INSERT was missing pre-163 → partial-apply/out-of-band-drop precedent, closed by ledgered 163 | [X: policy census + 118:82-97] |
| CODE-5b F5: 090 view invoker regression live? | Live clean (all 5 invoker); disk replay hazard stands | [X: reloptions] |
| DB-3 "active_intelligence_items = the customer-gate view" | It gates nothing — zero consumers; the gate is 157 RLS + RPC predicates | [X: grep] |
| CODE-1 F-13: did mig 147 land? | Yes — 147 in ledger | [X] |
| CODE-4b F9 → CODE-2: does CI run src/__tests__? | Confirmed no (CODE-2 F-13 job inventory has no such step; no test runner installed) | [CODE-2 F-13; CODE-4b F9] |

## Tool-call count

**43** total: 12 execute_sql (all SELECT/catalog) · 14 Read (11 register reads incl. paginated, 3 code
reads) · 5 Grep · 10 Bash (read-only grep/sed/ls loops) · 1 ToolSearch · 1 Write (this register).

## Deviation log

1. CODE-5a's Appendix B tail (~330 per-file classification rows, lines 380-768) was skimmed via its §1-§13
   body + Appendix A rather than read row-by-row — the appendix duplicates the body's classification and
   carried no cross-wiring input. `pool-coverage-62.md` (DB-1 sub-deliverable) not read — out of scope.
2. The X.1 column diff covers every column named in CODE-3's select-map plus the CODE-1/CODE-4b-cited
   columns (~350 pairs / 52 tables); `select("*")` wildcard sites are schema-tolerant by construction and
   not enumerable per-column.
3. The intelligence_item_sections transitive-gate claim (X.4 last row) is reasoned from PostgreSQL RLS
   semantics (policies apply to tables referenced inside policy subqueries for a non-owner caller), not
   exercised with an impersonated anon session — read-only constraint; flagged as belt-recommended
   regardless.
4. Slot-description applied-state for migs 128/132 accepted from DB-3's literal-text-match method (data
   migrations leave no catalog object); all other members of the 15-band re-verified against live objects
   directly.
5. No DB writes, no fetches, no script executions, no existing file modified; this register is the only
   file written.
