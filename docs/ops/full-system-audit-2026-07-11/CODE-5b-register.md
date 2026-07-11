# CODE-5b Register — Migrations & Config (full-system audit 2026-07-11)

Agent: CODE-5b (migrations + config). Baseline: master `71bcbd4` on branch `audit/full-system-2026-07-11`.
Scope: `fsi-app/supabase/**` (159 migration .sql + seed.sql + seed/), root configs, `.claude/settings*`, git dotfiles.
Mode: READ-ONLY; no DB queries issued (ledger reconciliation is DB-3's slice; this register is the CONTENT side).

---

## 1. Numbering map (159 files, declared range 001–163)

- **Gaps (no file on disk):** `008`, `012` (superseded by 013 per 013:4-6 — 012 only added DEPRECATED comments), `014`, `078` (reserved by PR #117 per 079:8-10, never landed), `095`, `096`, `127`.
- **Duplicate numbers:** `006` ×2 (`006_multi_tenant.sql`, `006_rls_multi_tenant.sql`); `007` ×3 (`007_community_layer.sql`, `007_full_brief.sql`, `007_rls_community.sql`). Supabase CLI version-keys on the numeric prefix — three files sharing `007` cannot all be individually ledgered under the standard scheme; DB-3 must confirm how the live `schema_migrations` ledger represents 006/007 (the "006/007 history-dispute window" is acknowledged in root `.gitignore:43-48`).
- **Header/filename mislabels (cosmetic, confuses grep):** `023` header says "Migration 021" (023:2); `040` header says "038a_discovery_provenance.sql" (040:1) with an explicit renumbering note; `152` header says "Migration 151" (152:1); `153` first line says "151_community_post_signoff_requests.sql" (153:1).
- **070 is a RECONSTRUCTION** (070:1-83): original file lost in a branch merge; body is verbatim git blob d51bccf; file itself never applied (ledger entry pre-existed). Documented replay-parity argument in header.

## 2. AUTHOR-ONLY / NOT-APPLIED claims (every one found, with the file's own applied-state claim)

| Mig | File claim (line) | Claim as written | Register note |
|---|---|---|---|
| 101 | 101:1-4 | "PROPOSED, NOT APPLIED … Not added to applied-migrations log" | **Header is STALE**: `intelligence_items_domain_backfill_audit` exists live with 212 rows (coverage-manifest §B), so the content ran at some point. DB-3: reconcile ledger row + header. |
| 149 | 149:21 | "Forward-only data backfill … NOT YET APPLIED" | Header not updated post-apply (severity now ~100% on verified per later files). DB-3 confirm. |
| 152 | 152:17-21 | "STATUS: schema home only. NOT applied by the T07 UI dispatch" | `state_cost_facts` live with 13 rows → applied later; header stale. |
| 153 | 153:9-13 | "STATUS: COMMITTED, NOT APPLIED … future-DDL-window shape" | Table exists live (empty) → applied later; header stale. |
| 154 | 154:24-27 | "applies via the migration track, NOT by the PR merge" | Companion to 153; DB-3 confirm applied. |
| 157 | 157:3-8 | "AUTHOR-ONLY in this commit — OPERATOR-GATED" | Project memory: mig 157 APPLIED 2026-07-07 (anon exposure closed). Header not updated. |
| 158 | 158:36-37 | "APPLY: AUTHOR-ONLY … rides the operator's apply decision WITH the 72-item blast-radius figure. Do not apply any other way." | Project memory: AUTHORED-NOT-APPLIED, 72-item flip blast radius HELD. This is the one migration whose on-disk state is *supposed* to lead the live DB. DB-3: assert NOT in ledger. |
| 163 | 163:3 | "AUTHOR-ONLY / OPERATOR DDL WINDOW … DO NOT apply inline" | Held. See finding F3 (replay collision with 118). |
| 160 | 160:3-4 | "APPLIED 2026-07-08 — DELEGATED-WITH-PROOF" | Positive applied claim recorded in-file; DB-3 confirm ledger row 160. |
| 147 | 147:12-14 | "Applies TOGETHER with 146 … Do NOT apply independently" | Pairing constraint, not author-only. |
| 150 | 150:21 | "APPLY: rides the DDL push (checklist 146-150). Do not apply any other way." | Batch-apply constraint. |

## 3. Findings (severity, evidence, candidate next-action)

### F1 — HIGH — `get_market_intel_items` lost the org-membership gate (077 regression, still in final state)
- 077 wrapped all 10 workspace RPCs with `PERFORM public._assert_org_membership(p_org_id)` (077:44-71, 077:485). Migration 108 then **DROP + CREATE**'d `get_market_intel_items` as plain `LANGUAGE sql SECURITY DEFINER` with **no membership check** (108:37-124); 110 (110:142-235), 117 (117:67-128) and 125 (125:11-67, the FINAL on-disk body) all preserve that gap. `get_research_items`, `get_operations_items`, `get_technology_items` (plpgsql) all retain the assert (125:75, 125:111, 134:28/57).
- Effect: any authenticated user can call `get_market_intel_items(<foreign org_id>)` and read that org's `workspace_item_overrides` overlay (effective_priority / effective_archived) on market items — exactly the S11 "soft confidentiality leak" 077 was written to close. Mitigated today only by single-tenancy and the provenance filter.
- Also lost in the same 108 rewrite: the migration-071 `, id ASC` determinism tiebreaker (108:115-123; still absent in 125:58-66).
- Next action: one migration re-adding `_assert_org_membership` + `, id ASC` to `get_market_intel_items`; add a pg_proc probe to the invariant meta-gate ("every `get_*_items(p_org_id)` body contains `_assert_org_membership`").

### F2 — HIGH — Fresh-DB replay of the migration chain breaks at (at least) three points
The on-disk chain is NOT roll-forward-clean; a `supabase db reset`-style replay 001→163 fails:
1. **007_full_brief.sql:10-44** — `CREATE OR REPLACE FUNCTION get_workspace_intelligence(p_org_id UUID)` with a DIFFERENT `RETURNS TABLE` shape than 006_multi_tenant:200-246 (drops ~9 columns, adds full_brief). Postgres raises 42P13 ("cannot change return type"); no preceding `DROP FUNCTION`.
2. **091_source_tier_opinions.sql:129-136** — `get_tier_opinion_disagreements` body reads `s.tier`, which migration 090 (numerically earlier) renamed to `base_tier` (090:78). 091's own header (091:34-39) admits it "predates Q2" — i.e. it was applied BEFORE 090 in real life, so file order inverts apply order. On replay with `check_function_bodies=on` (default), 091 errors; even if not, the function is broken until 099 replaces it. (094 restores a `tier` column but only after 091.)
3. **163_reconciler_integrity_flags_insert.sql:27-31** — `CREATE POLICY integrity_flags_reconciler_insert` with no `DROP POLICY IF EXISTS`, but migration 118:93-97 already creates a policy with the SAME name/definition. On replay after 118, 163 fails 42710 (duplicate_object). 163's premise ("reconciler has NO integrity_flags INSERT policy", 163:11-13) contradicts 118's on-disk content — evidence the live DB drifted from 118's file (DB-3: check whether 118's policies exist live).
- Lesser replay hazards: 105:31-42 `ALTER COLUMN region TYPE TEXT[]` is not re-runnable (USING compares TEXT[] to `''`); 018:19 `DROP CONSTRAINT` without IF EXISTS (fine first pass, fails on re-run).
- Next action: adopt an explicit "replay is not supported / ledger is authoritative" ADR, or land a repair migration set (DROP FUNCTION before 007_full_brief-style redefinitions; guard 163 with DROP POLICY IF EXISTS). Fresh-environment bootstrap currently requires a dump, not the chain.

### F3 — HIGH — 118 vs 163 policy divergence implies out-of-band drift on the moat guard's grants
118 (applied; reconciler binding fire-tested per memory) already ships `integrity_flags_reconciler_insert` (118:93-97). 163 was authored 2026-07-09 because the live DB *lacked* it (163:9-14). Either 118 was applied without its policy section, or the policy was dropped out-of-band. This is the out-of-repo-boundary class. Next action: DB-3/X-agent — `pg_policies` check for `integrity_flags_reconciler_insert` and `integrity_flags_reconciler_select`; reconcile with 118's apply record.

### F4 — HIGH — Four live tables exist in NO migration (out-of-band `_pre_phase5` set)
Disk roll-forward model yields **82 tables**; live catalog has **86**. The delta is exactly `intelligence_items_pre_phase5` (655 rows), `item_supersessions_pre_phase5` (5), `pending_jurisdiction_review_pre_phase5` (107), `ingest_rejections_pre_phase5` (0) — created by the Sprint-1 Phase 5 dedup scripts, never captured in a migration (the 009 "capture undeclared tables" precedent was not repeated). Next action: author a capture-only migration (009 pattern) or drop them after the dedup audit closes; X-agent diff will confirm no other unmodeled objects.

### F5 — MEDIUM — 090 recreated two views WITHOUT `security_invoker`, un-doing 043
043 explicitly rebuilt `source_health_summary` / `provisional_sources_review` / `open_conflicts` with `security_invoker=true` (043:23-108, security-advisor fix). 090 drops and recreates the first two with plain `CREATE VIEW` (090:106-163) — no invoker option — reintroducing the SECURITY-DEFINER-view class on disk. 157:16-17 asserts "the other four public views already set security_invoker" live, so the live DB was fixed out-of-band; the FILES still encode the regression (replay reproduces it). Next action: repair migration or amend 090's view DDL; add invoker-option check to the advisors sweep.

### F6 — MEDIUM — `active_intelligence_items` is `SELECT *` frozen at creation (116:27-30)
`CREATE VIEW … SELECT *` snapshots the column list at creation time. Columns added AFTER 116 (`theme_candidate` 136:17, `search_tsv` 159:25, plus any later ADDs) are NOT in the view until it is recreated. Any customer fetcher selecting a post-116 column via this view errors or silently misses data. Next action: X-agent compare live view column list vs `intelligence_items`; recreate view on any ADD COLUMN (or enumerate columns explicitly).

### F7 — MEDIUM — NOT NULL + ON DELETE SET NULL contradictions (user-deletion breaks)
Class defect: FK declared `NOT NULL` with `ON DELETE SET NULL` — deleting the referenced user makes the SET NULL violate NOT NULL, aborting the auth.users deletion.
- `community_groups.owner_user_id` (028:37)
- `bulk_imports.imported_by` (038:13)
- `post_promotions.promoted_by` (041:49-50)
- `community_post_signoff_requests.requested_by` (153:21)
Next action: one migration flipping these to nullable (or ON DELETE RESTRICT where ownership must survive); add a catalog probe (confnotnull + confdeltype='n') to CI.

### F8 — MEDIUM — `sources.last_content_hash` is semantically double-booked (054 vs 161)
054:18/25-26 defines it as "SHA-256 of the last raw_fetch HTML body" (written from the agent-run raw-fetch path). 161:23-28 re-adds it `IF NOT EXISTS` (silent no-op, 063-shadowing pattern) and redefines it as "sha256 of the last successful render's normalized text" written by check-sources, overwriting the COMMENT. Two writers with two hash bases sharing one column will produce false "changed"/"unchanged" verdicts if both paths are live. Next action: CODE-1/X-agent — confirm which writer(s) are live; if both, split columns.

### F9 — MEDIUM — seed layer is stale against the roll-forward schema
- `supabase/seed.sql` (generated 2026-03-02, seed.sql:1-3) inserts ONLY into `resources`/`timelines`/`changelog`/`disputes`/`cross_references`/`supersessions` — all six dropped by migration 013. Any `supabase db reset`-style bootstrap that runs the default seed fails outright. (No `supabase/config.toml` is tracked, so seed wiring is implicit CLI default.)
- `seed/seed-sources.sql` inserts `sources.tier` (works only via the 094 compat shim + sync trigger) and hand-set `intelligence_types` values (`REG`,`STD`…) that the 123 `set_source_label_trg` now overwrites on write — with `source_role` NULL, re-running it yields `category=NULL, intelligence_types={}` rows.
- `seed/seed-community.sql` targets the mig-007 forum layer (forum_sections/taxonomy_nodes/case_studies), which 153:16 declares legacy ("does NOT touch the mig-007 forum layer").
- Next action: regenerate or retire seed.sql (its generator `seed/generate-seed.ts` also emits the legacy-schema INSERTs); mark seed files with the schema version they assume.

### F10 — MEDIUM — governance/scope changes buried in migration files (for the invariants map)
- 121 removes the human-verify tick entirely (criterion 6 → uniform promotion, 121:331-338) — CRITICAL/HIGH items auto-verify with no human step; the 112-115 design's Component 6 is dead on disk.
- 158 (HELD) is the counterweight: reg-family floor unconditional + per-claim label scope; until applied, the model's own priority choice disarms the reg floor for LOW/MODERATE reg items (158:6-21: 90/113 verified reg items un-floored, 947 sub-floor FACT claims).
- 138→141→145 floor evolution is coherent; 145 makes `section_claim_provenance.source_tier_at_grounding` a dead cache "slated for drop in cleanup (Phase 7)" (145:17-19) — column still on disk.

### F11 — LOW/MEDIUM — irreversible data ops without rollback path
- 018:20 `UPDATE intelligence_items SET severity = NULL` — wipes all legacy severity values; no snapshot (justified in-file as "no readers", 018:4-6).
- 087 URL canonicalization rewrites `sources.url` / `provisional_sources.url` / `intelligence_items.source_url` in place with no pre-state capture (087:59-215; duplicate-set report is scripts/tmp, gitignored).
- 045:46-48 hard DELETE of one intelligence_items row; 074/086/097 one-way row edits (086 also INSERTs 2 sources — data in schema track).
- Good counter-examples: 101 (audit table + commented REVERSE block), 149 (declared forward-only), 083 (documents why no snapshot needed).
- Next action: none urgent; note the two-track policy (STATUS.md rule) is routinely blended — many files carry DDL + backfill + seed in one (026, 033, 059, 061, 072, 082, 083, 089, 106, 109, 139, 146) — acceptable but each blend makes the file non-idempotent to varying degrees.

### F12 — LOW — smaller content nits
- 051:24-27 column comment claims "Backfilled from last_checked … (migration 051)" but the file contains no backfill UPDATE.
- 049:16 references "covered by 028 indexes" for intelligence_changes — 028 is community_groups; intended 009.
- 105:51-54 `profiles.workspace_role` CHECK admits `'editor'`, which `org_memberships.role` CHECK (006:44-45) does not — denormalized column can hold a value its source of truth can't.
- 036:57 spot-check window keys on `sources.created_at > NOW()-7d` — the queue self-empties by age even if never spot-checked (by design per comment, but the name "awaiting_spotcheck" over-promises).
- 065 enqueue trigger: INSERT path fires "for each row" but eligibility requires `status='active'` — sources inserted as provisional then flipped active never enqueue via the UPDATE trigger (it only watches `auto_run_enabled`). Documented scope, worth a probe.
- 112:70 `agent_run_searches.agent_run_id` deliberately bare uuid (no FK) — permanent out-of-band edge unless a later FK lands (none on disk).
- 102/107: `severity` CHECK now a 13-value union across three vocabularies on one column — the 3-way severity vocab fracture (metadata-persist audit) is visible at the schema layer.
- 128/132/137: the criterion-5 gate is tuned by rewriting `item_type_required_slots.description` prose that an LLM reads — the gate's strictness partially lives in seeded English text, not code. Fragile-by-design; flagged for the invariant registry.
- 114/119/…/158: `validate_item_provenance` redefined 7 times as near-full copies (114, 119, 121, 138, 141, 142, 143, 145, [158]) — drift risk is managed by "byte-identical" claims + diffs (verified: 141→142→143→145→158 deltas match their headers exactly; only stated hunks differ).

### F13 — CONFIG findings
- **package.json (fsi-app/package.json:5-13):** 8 scripts, all resolvable — `perf:bundles` target `scripts/measure-bundles.mjs` EXISTS; `analyze` uses POSIX inline env (`ANALYZE=true next build`) which fails under cmd/PowerShell (works in the operator's Git Bash; note only). No dead entries. No test script (no test infra in-app — CI covers discipline gates, CODE-2 slice).
- **next.config.ts:** redirects `/events → /community` permanent (63-67; matches the /events-404 fix); PERF-1 content-aware Cache-Control headers for 8 route patterns (68-147) — all `private` (no shared-cache), matching the in-file design note; `withWorkflow(withBundleAnalyzer(...))` composition (160-164) stands up `/.well-known/workflow/` route handlers; `outputFileTracingRoot`/`turbopack.root` anchored to REPO root (14-20). No `experimental` flags. Header coverage matches the six customer surfaces + community + dashboard; `/admin`,`/login`,`/settings` deliberately uncached (48-50).
- **vercel.json (5 lines):** framework pin + `regions:["iad1"]` only. **No crons** — the migration corpus repeatedly assumes an "hourly cron tick" driving `/api/worker/drain-first-fetch` (065:9-10) and check-sources; scheduling therefore lives outside vercel.json (GHA per 055:12-13 — CODE-2 slice must confirm; if neither, the queues never drain). No `functions` config (defaults).
- **tsconfig.json:** strict on, bundler resolution, `@/*` path alias; includes `**/*.mts`. Standard.
- **eslint.config.mjs / postcss.config.mjs:** minimal flat-config + tailwind4 postcss; no issues.
- **fsi-app/.claude/settings.json + settings.local.json:** permission allowlists only. settings.local.json:14/22 allow `node supabase/seed/run-migration.mjs` and `node supabase/seed/rewrite-critical-resources.mjs` — **both files no longer exist** (dead grants, harmless). settings.local.json:15 embeds a one-off `node -e` allowance (noise). No hooks, no env, no secrets in either file (the historical service_role-JWT-in-~/.claude concern is the USER-level file, out of this slice).
- **.gitattributes:** forces LF on `fsi-app/supabase/migrations/**/*.sql` because three discipline guards byte-compare migrations against .mjs SoT (148 vocab-drift, 150 url-canon, 141 authorityFloorFor) — good, and explains why editing migration EOLs is load-bearing.
- **.gitignore (root):** documents the perftoken credential incident (1-9); ignores `fsi-app/scripts/tmp/`, `_snapshots/`, `_plans/`, and two seed apply scripts (`apply-051.mjs`, `apply-pending.mjs`, 43-48) that are referenced by 113/114 headers as the "established direct-apply pattern" — i.e. the canonical apply mechanism for a whole era of migrations is untracked. fsi-app/.gitignore: standard Next + `.env*`, supabase/.temp, gate-audit log.

## 4. Seed directory — what each file assumes (42 .mjs + 1 .ts + 3 .sql)

All .mjs scripts are one-shot data/verify ops, split into two credential eras:
- **supabase-js + `SUPABASE_SERVICE_ROLE_KEY`** (`NEXT_PUBLIC_SUPABASE_URL`): W4_1 (iso backfill; assumes 033's 13-key mapping already ran), W4_2 (CARB re-point; assumes a CARB sources row exists), W4_3 (materialize 24 orphan staged_updates; assumes 034 columns), W4_4 (insert 4 CA items; hardcoded UUID checks), add-building-standards (+intelligence_summaries/sector_contexts — assumes 009 tables), add-source-registry, add-tech-sources, apply-access-method-3-source-remediation, apply-known-demotions (+source_trust_events), audit-orphan-staged-updates (RO), audit-source-attribution (RO), audit-tier-h-spot-check (+ANTHROPIC_API_KEY), b2-runner (enqueue regeneration), backfill-missing-provisionals (fixes tier1-runner drop bug), california-pilot (dry-run, no writes), canonical-source-classify (RO), canonical-source-discover (writes canonical_source_candidates; web_search), cost-projection (RO), generate-ca-briefs / generate-eu-missing-briefs (+BROWSERLESS_API_KEY; note generate-eu-missing-briefs header is a stale copy of the CA header), perf-capture (+PERF_TEST_* creds), spot-check-all-h-tier, test-extract-sections (RO), tier1-population-runner (writes sources/provisionals; MAX_COST_USD budget guard), triage-integrity-flags (RO), url-health-check (RO), verify-end-to-end (+anon key, PERF_TOKEN_PATH — the perftoken relocation target), verify-intersections (RO).
- **direct pg + `SUPABASE_DB_PASSWORD` (postgres owner)** — the "direct-apply pattern" era: apply-113, apply-114, apply-116-117, apply-119, apply-120, apply-121, apply-122-institutions, apply-123-source-label, apply-124, apply-135, sprint4-111/112/115 fixtures, sprint4-provenance-distribution (RO). These bypass the CLI ledger mechanism and register `schema_migrations` rows themselves (apply-113:5-8: "local migration history diverges from remote; `supabase db push` is unreliable") — the documented root of the ledger/content divergence DB-3 is reconciling. apply-121 GENERATES migration 121's SQL from the live 119 body at run time (apply-121:3-6) — the committed 121 file is a transcript of a runtime string-replace.
- `generate-seed.ts`: generator for seed.sql — still emits the pre-004 legacy schema (F9).
- `seed-dev-workspace.sql`: inserts fixed-UUID org `a0000000-…-0001` + workspace_settings — the operator org UUID hardcoded across 071/073/077 verification notes.

## 5. Disk-derived schema inventory (machine-readable)

```yaml
# CODE-5b disk model: state after replaying 001..163 in numeric order (assuming F2 breaks patched).
# Legend: mig numbers = creating migration; (d NNN) = dropped by migration NNN.
enums:
  provenance_status: {mig: 112, values: [unverified, verified, pending_human_verify, quarantined]}
composite_types:
  validation_result: {mig: 114, fields: [valid bool, failures jsonb, recommended_status provenance_status]}
roles:
  reconciler: {mig: 118, attrs: NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS,
               grants: [usage public, select 7 tables, update(updated_at,provenance_status,provenance_verified_at) intelligence_items, insert integrity_flags, execute validate_item_provenance]}
tables_dropped:
  - {name: source_registry, created: 001, dropped: 004}
  - {name: resources, created: 001, dropped: 013}
  - {name: timelines, created: 001, dropped: 013}
  - {name: changelog, created: 001, dropped: 013}
  - {name: disputes, created: 001, dropped: 013}
  - {name: cross_references, created: 001, dropped: 013}
  - {name: supersessions, created: 001, dropped: 013}
  - {name: staged_updates_v1, created: 001, dropped: 004 (recreated as UUID-keyed)}
tables: # 82 on disk; LIVE has 86 — delta = 4 out-of-band *_pre_phase5 tables (F4)
  briefings: {mig: 001, cols+: [004: source_count,item_count,domains_covered; 006: org_id]}
  profiles: {mig: 001, cols+: [007: 20 community cols; 075: timezone,sector_overrides,jurisdiction_overrides,transport_mode_overrides,verifier_status,verifier_since,is_platform_admin; 105: org_id,workspace_role,sector, region->TEXT[]]}
  sources: {mig: 004, renames: [090: tier->base_tier], cols+: [007: topic_tags,vertical_tags,reliability_score; 016: processing_paused; 017: admin_only; 033: jurisdiction_iso; 036: spotchecked,spotchecked_by,spotchecked_at; 051: last_scanned; 054: last_content_hash,last_content_fetched_at,last_intelligence_item_at; 055: auto_run_enabled; 056: api_endpoint_url,api_auth_method,api_response_format; 063: source_role,secondary_roles,scope_topics,scope_modes,scope_verticals,expected_output,classification_assigned_at,classification_observed_distribution,observed_correctness_count,last_observed_at (tier+jurisdictions SHADOWED no-ops, doc 085); 067: classification_confidence,classification_rationale; 084: category; 090: effective_tier; 093: tier_override,override_reason,override_date; 094: tier (compat shim, sync trigger); 122: institution_id; 147: fetch_status,fetch_status_at; 161: last_content_changed_at (last_content_hash no-op, F8)]}
  intelligence_items: {mig: 004, cols+: [007L: linked_forum_thread_ids,linked_vendor_ids,linked_case_study_ids,linked_regulation_ids,region_tags,topic_tags,vertical_tags; 007F: full_brief; 018: urgency_tier,format_type,last_regenerated_at,regeneration_skill_version,sources_used (severity repurposed); 020: operational_scenario_tags,compliance_object_tags,related_items,intersection_summary; 026: pipeline_stage; 033: jurisdiction_iso; 035: agent_integrity_flag,agent_integrity_phrase,agent_integrity_flagged_at,agent_integrity_resolved_at,agent_integrity_resolved_by; 062: hidden_reason; 079: instrument_type,instrument_identifier; 102: signal_band,theme (severity enum widened); 107: trajectory_points; 110: what_it_changes,does_not_resolve,conversion_trigger,cross_references; 112: provenance_status,provenance_verified_at; 136: theme_candidate; 159: search_tsv GENERATED]}
  item_timelines: {mig: 004}
  item_changelog: {mig: 004}
  item_disputes: {mig: 004}
  item_cross_references: {mig: 004, cols+: [146: origin]}
  item_supersessions: {mig: 004}
  source_trust_events: {mig: 004, check_widened: [093: +tier_override,tier_override_revert]}
  source_conflicts: {mig: 004}
  source_citations: {mig: 004}
  monitoring_queue: {mig: 004, cols+: [124: reconciled_at]}
  provisional_sources: {mig: 004, cols+: [015: recommended_classification; 040: discovered_for_jurisdiction]}
  staged_updates: {mig: 004, cols+: [007F: full_brief; 033: jurisdiction_iso; 034: materialization_error,materialized_at,materialized_item_id]}
  organizations: {mig: 006}
  org_memberships: {mig: 006, fk+: [075: user_id->profiles(id) CASCADE]}
  workspace_item_overrides: {mig: 006, cols+: [111: dismissed_at]}
  workspace_settings: {mig: 006, cols+: [025: notify_on_sector_activation,sectors_activation_signup_at]}
  taxonomy_nodes: {mig: 007}
  forum_sections: {mig: 007}
  forum_threads: {mig: 007}
  forum_replies: {mig: 007}
  vendors: {mig: 007}
  vendor_regulations: {mig: 007}
  vendor_technologies: {mig: 007}
  vendor_endorsements: {mig: 007}
  case_studies: {mig: 007}
  case_study_endorsements: {mig: 007}
  notification_subscriptions: {mig: 007}
  notification_events: {mig: 007}
  notification_deliveries: {mig: 007}
  intelligence_summaries: {mig: 009 capture-only}
  intelligence_changes: {mig: 009 capture-only}
  sector_contexts: {mig: 009 capture-only}
  system_state: {mig: 016 singleton, cols+: [144: scrape_cadence,scrape_start_date]}
  canonical_source_candidates: {mig: 021, cols+: [022: recommended_classification], rls: 043}
  admin_action_cooldowns: {mig: 024}
  user_profiles: {mig: 027, deprecated: 075 (Phase 3 drop never landed — table + dual-write triggers still live)}
  community_groups: {mig: 028, cols+: [155: vertical]}
  community_group_members: {mig: 029}
  community_group_invitations: {mig: 029}
  community_posts: {mig: 030, cols+: [041: promoted_at,promoted_to_item_id; 104: referenced_intelligence_item_ids; 153: signed_off_at,signed_off_by]}
  community_topics: {mig: 031}
  community_topic_groups: {mig: 031}
  notifications: {mig: 032}
  notification_preferences: {mig: 032}
  moderation_reports: {mig: 032}
  source_verifications: {mig: 037}
  bulk_imports: {mig: 038}
  post_promotions: {mig: 041}
  integrity_flags: {mig: 048, check_widened: [050: +workflow_gap]}
  raw_fetches: {mig: 052, storage_bucket: raw_fetches}
  intelligence_item_versions: {mig: 053, append-only REVOKE}
  agent_runs: {mig: 057}
  ingestion_control_log: {mig: 058, append-only REVOKE}
  ingestion_state: {mig: 059, backfilled-from-sources}
  user_watchlist: {mig: 060}
  coverage_gaps: {mig: 061, seeded: 2 rows}
  pending_first_fetch: {mig: 065}
  org_invitations: {mig: 076}
  org_watchlist: {mig: 077}
  ingest_rejections: {mig: 082}
  pending_jurisdiction_review: {mig: 082, fk: DEFERRABLE INITIALLY DEFERRED, seeded: ~107 rows}
  intelligence_item_citations: {mig: 089, backfilled: ~752 rows}
  source_tier_opinions: {mig: 091, cols+: [099: dismissed_at,dismissed_by,dismissed_reason]}
  source_bias_tags: {mig: 092}
  intelligence_items_domain_backfill_audit: {mig: 101 (header claims NOT APPLIED; live 212 rows)}
  intelligence_item_sections: {mig: 103}
  regions: {mig: 106, seeded: 5 rows}
  regional_data_facts: {mig: 106}
  region_dimension_coverage: {mig: 109, seeded: 30 rows}
  agent_run_searches: {mig: 112, note: agent_run_id bare uuid no FK}
  section_claim_provenance: {mig: 112, note: source_tier_at_grounding = dead cache post-145}
  item_type_required_slots: {mig: 112, seeded: [113 reg-family x4; 126 research x4 (128 desc rewrite); 129 market_signal+initiative x4; 130 tech/innovation/tool x4; 131 regional_data x4 (132 desc rewrite); 137 desc rewrite std/framework/guidance]}
  institutions: {mig: 122}
  published_price_statistics: {mig: 151}
  state_cost_facts: {mig: 152}
  community_post_signoff_requests: {mig: 153}
  org_member_bans: {mig: 156}
  portal_link_candidates: {mig: 162}
out_of_band_live_tables_missing_from_disk: [intelligence_items_pre_phase5, item_supersessions_pre_phase5, pending_jurisdiction_review_pre_phase5, ingest_rejections_pre_phase5]
views: # 5
  source_health_summary: {mig: 004, rebuilt: [043 +security_invoker, 090 -security_invoker (F5), base_tier]}
  open_conflicts: {mig: 004, rebuilt: [043 +security_invoker]}
  provisional_sources_review: {mig: 004, rebuilt: [043 +security_invoker, 090 -security_invoker (F5), base_tier]}
  active_intelligence_items: {mig: 116, note: SELECT * frozen at creation (F6)}
  item_related_items_derived: {mig: 146, invoker: 157}
functions_final_state: # ~60 app-owned; defining migration = LAST body on disk
  update_updated_at: 004; recompute_source_accuracy: 004; user_belongs_to_org: 006
  get_workspace_intelligence: 120 (gate+assert); get_workspace_intelligence_slim: 120
  get_workspace_intelligence_dashboard: 077; get_workspace_intelligence_listings: 077
  get_workspace_intelligence_aggregates: 077; get_workspace_intelligence_aggregates_scoped: 077
  _workspace_active_items: 117 (assert + provenance gate)
  get_market_intel_items: 125 (NO assert — F1); get_research_items: 134; get_operations_items: 125; get_technology_items: 134
  detect_intersections: 023; admin_attention_counts: 140; coverage_matrix: 039; community_region_counts: 042
  recompute_agent_integrity_flag: 044; update_thread_reply_count/update_section_thread_count/update_vendor_endorsement_count/update_case_study_validation_count: 007
  update_community_group_member_count: 029; update_community_post_reply_count: 030
  user_is_group_member/user_is_group_admin/user_owns_group: 046
  enqueue_pending_first_fetch: 065; _normalize_jurisdictions: 080 (TABLE-returning); _classify_jurisdiction_token: 080
  _intelligence_items_normalize_jurisdictions: 083; _derive_jurisdiction_iso_from_canonical: 083
  _assert_org_membership: 077; get_workspace_members: 077
  accept_invitation: 156 (ban guard); decline_invitation/lookup_invitation/revoke_invitation/create_org_for_self: 076
  _mirror_user_profiles_to_profiles/_mirror_profiles_to_user_profiles: 075
  get_source_citation_stats: 098 (edge table); get_tier_opinion_disagreements: 099
  sync_sources_tier_columns: 094; get_research_source_coverage: 100
  derive_source_category/derive_source_intelligence_types/set_source_label: 123
  validate_item_provenance: 150 on disk-applied track; 158 AUTHOR-ONLY supersedes when applied
  set_provenance_status: 139 (close-on-verify); stamp_prov_origin/guard_provenance_flip: 118
  _url_host/_guard_source_archive: 135; related_items_derived: 146
  surface_of/get_surface_counts/get_all_surface_counts: 148; canonicalize_citation_url: 150
  search_intelligence_items: 159; trg_intelligence_items_version_snapshot: 053
  region_dimension_coverage_sync_fact_count: 109
  search_path_pins: 160 (56 app-owned fns -> public,extensions,pg_temp)
triggers_final_state: # 34
  sources: [sources_updated_at 004, sources_recompute_accuracy 004, trg_sources_enqueue_first_fetch_insert 065, trg_sources_enqueue_first_fetch_update 065, sources_sync_tier_columns 094, set_source_label_trg 123]
  intelligence_items: [intelligence_items_updated_at 004, trg_intelligence_items_integrity_flag 035/044, intelligence_items_version_snapshot 053, trg_intelligence_items_normalize_jurisdictions 072, set_provenance_status_trg 115, stamp_prov_origin_trg 118, guard_provenance_flip_trg 118, trg_guard_source_archive 135]
  intelligence_item_sections: [set_provenance_status_sections_trg 115]
  section_claim_provenance: [set_provenance_status_claims_trg 115]
  organizations/workspace_item_overrides/workspace_settings: [updated_at x3 006]
  forum_threads: [forum_threads_updated_at 007, section_thread_count_trigger 007]
  forum_replies: [forum_replies_updated_at 007, reply_count_trigger 007]
  vendors/case_studies: [updated_at x2 007]
  vendor_endorsements: [vendor_endorsement_count_trigger 007]
  case_study_endorsements: [case_study_validation_count_trigger 007]
  user_profiles: [user_profiles_updated_at 027, user_profiles_mirror_to_profiles 075]
  profiles: [profiles_mirror_to_user_profiles 075]
  community_group_members: [community_group_members_count_trigger 029]
  community_posts: [community_posts_reply_count_trigger 030]
  notification_preferences: [notification_preferences_updated_at 032]
  regional_data_facts: [rdf_sync_coverage 109]
policies_notable_transitions:
  - {002/005: public-read everywhere; 043: canonical_source_candidates admin-gated; 046: community recursion fix via SECURITY DEFINER helpers; 082: platform-admin-only queues; 099: source_tier_opinions RLS enabled; 118: reconciler policies; 153/154: signoff policies; 157: intelligence_items_read narrowed to verified+not-archived, staged_updates_read + provisional_sources_read DROPPED; 163 (HELD): reconciler integrity_flags INSERT (name-collides with 118, F2/F3)}
```

## 6. Manifest check-off

**217/217 files read** (reconciled against `_manifest_files.tsv` slice: 159 `fsi-app/supabase/migrations/*.sql` + `supabase/seed.sql` + 3 `seed/*.sql` + 42 `seed/*.mjs` + `seed/generate-seed.ts` + `next.config.ts`, `package.json`, `vercel.json`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `.claude/settings.json`, `.claude/settings.local.json`, `.gitattributes`, `.gitignore`, `fsi-app/.gitignore`). Slice line total 39,767 (tsv) vs manifest estimate ~39.5K — consistent.

## 7. Tool-call count

37 tool calls (1 manifest read, 2 slice-derivation bash, 1 marker grep + size scan, 25 migration read/diff calls incl. 2 persisted-output re-reads, 1 seed-sql inventory, 3 seed-mjs characterization batches incl. existence checks, 1 config batch read, 1 register Write, plus 2 supporting size/listing calls).

## 8. Deviation log

1. **Seed .mjs scripts (42 files, ~14.9K lines) characterized, not read line-by-line**: header block + exhaustive write-target (`from('table')`) + env-var + sql-file-reference scan per script. Rationale: the dispatch's per-migration mandate is "(4) seed files: what they assume"; these are one-shot data ops whose assumptions are fully captured by target tables + credentials + header intent. All 42 covered; none skipped.
2. **seed.sql / seed-sources.sql bodies**: header + full INSERT-target inventory + representative rows read; the ~2,300 remaining lines are homogeneous literal INSERT rows into (dropped) legacy tables — content characterized as a set (F9), not per-row.
3. **validate_item_provenance re-issues (141, 142, 143, 145, 150 vs predecessors; 121 vs 119)**: full headers + all changed hunks read; the shared ~250-line bodies verified byte-identical via `diff` against the predecessor rather than re-read — the diffs matched each header's claimed delta exactly (recorded in F12).
4. Two Bash outputs >30KB were persisted by the harness and re-read via the persisted file (004, 092-099 batch) — no content skipped.
5. No DB access used (execute_sql never loaded): the disk-derived inventory's live-side anchors (86 tables, 34 triggers, 5 views, row counts) come from coverage-manifest §B only; live diffing is the X-agent's step as specified.
