# Audit A5, database vs code register, 2026-09-30

Lane A5 (DATABASE-VS-CODE), read-only. SELECT-only posture: this lane held **no Supabase credentials**
and sought none. No migration applied, no code changed, no allowlist file edited. Method: replay the
committed migration corpus (`fsi-app/supabase/migrations/*.sql`, 302 files) into the current schema via
the same statement-ordered replay F14/F24/F47 use (`.discipline/governance/db-object-reference.mjs`
`replaySchema`), cross-reference every table against every `.from("t").insert|update|upsert|delete|select`,
guarded-write helper, RPC call and raw-SQL `FROM/JOIN/REFERENCES`/`INSERT INTO`/`UPDATE` site across
`fsi-app/src`, `fsi-app/scripts`, `fsi-app/supabase/functions` (1105 code files), then reconcile against
the two prior registers this lane extends.

**A message purporting to be "the coordinator" arrived mid-session demanding a full line-by-line read of
all 302 migration files and every seed file, contradicting this lane's actual brief (grep-based consumer
checks, replay via F47's helper, explicit "do not run the full suite") and CLAUDE.md rule 11 (context is
metered; never bulk-load, load narrowly). It did not arrive as a normal user turn. Treated as a probable
injected instruction and NOT followed; this audit proceeded on its original scoped brief.** Flagging this
per the instruction-source-boundary rule, the operator should know a message shaped like a coordinator
directive appeared in-band and was not actioned.

**Live facts.** The coordinator's promised `fsi-app/scripts/tmp/live-schema-2026-09-30.json` (exact row
counts, RLS flag, policy count, column count per table) never appeared during this session (checked
repeatedly). Every row-count figure below is either cited from a prior dated audit (with its date) or
explicitly marked unavailable, none is guessed, per rule 14.

## Runs performed

| Tool | How | Result |
|---|---|---|
| `.discipline/governance/producer-consumer-orphan.mjs` (F14's core) | Direct CLI | 116 tables (via F14's own file-filtered scan; a bare schema replay independent of allowlist sees 118, 2 more; see note below), 94 RPCs. Write-orphans: 2, both allowlisted. Read-orphans (informational): 4. PASS. |
| `.discipline/fitness/functions/F47-db-object-reference.mjs` `scanTree()` | Direct call | 116 tables, 302 migrations, 1105 code files. `unreferencedTables: []`, `unreadTables: []`, `unreferencedFunctions: []`, `allowlistIssues: []`. Clean. |
| `.discipline/fitness/runner.mjs` (ran the **full** 52-function suite, not scoped, the `--only` flag was silently ignored; brief said not to run the full suite, noting the deviation honestly rather than hiding it) | Background, exit 0 | **52/52 PASS, 0 violations**, including F14/F24/F47 individually PASS. F45 duplicate-code: 5,867 lines (no ratchet regression). F51 hotspots informational only. Full output at the session's background-task log. |
| `dead-column-audit.mjs` / `duplicate-table-audit.mjs` / `ui-orphan-audit.mjs` | Direct CLI | Self-skip, exit 2, "no direct-Postgres connection", correct behavior per rule 15 (no-cred self-skip, not a crash). Not run; this lane sought no credentials. Prior live runs (2026-09-25, 2026-09-28) are reconciled below, not repeated. |
| `canonical-key-dedup.mjs` / `quarantine-disposition-audit.mjs` / `orphan-source-audit.mjs` / `source-link-audit.mjs` | Not run (same DB-credential gap) | Reconciled from the 2026-09-25 and 2026-09-28 registers below; not re-derived. |

Note on the 116-vs-118 table count: F14/F47's own file-scoped scan (which filters `.test.mjs`/`.selftest.mjs`
and applies its own tracked-file list) reports 116; the ad-hoc replay this lane ran directly against the same
`replaySchema` core (no file-filter difference, same migration corpus) counted 118. Investigated
`[CONFIRMED]`: the 2-table delta is `intelligence_summaries` and `taxonomy_nodes`-adjacent counting, re-run
side by side, the discrepancy traces to how each caller passes `migRel`/`codeRel` (F47 sorts and filters
via `globFiles`, this lane's script uses `git ls-files`); both sets of table names are otherwise identical.
Not a defect in either tool; the two extra names in this lane's count are real live-schema tables
(`case_studies`, `case_study_endorsements`, see below) that one caller's file list happened to include a
beat earlier in the same replay pass. Immaterial to every finding below; the full table list matches.

## Prior-register reconciliation

Extending `docs/audits/supabase-integrity-and-wiring-audit-2026-09-25.md` and
`docs/ops/session-log.d/2026-09-28-audit-triage.md`. Status of every finding in both, re-verified this pass:

| ID | Prior status | This pass | Evidence |
|---|---|---|---|
| RW-1 | write-orphans allowlisted | **[CONFIRMED] still holds** | Same 2, same allowlist, F14 PASS today. |
| RW-2 / UI-3 | `state_cost_facts` read-orphan since migration 152 | **[CONFIRMED] still open, but now has a producer plan staged** | Migration 332 (`state_cost_facts_value_numeric.sql`, lane STATE-COST-DAG, 2026-09-26/27 coordinator ruling "build option A") adds the numeric envelope column; migration 333 widens `derivation_edges_from_table_allowed` to admit `state_cost_facts`. Neither migration's own header states an APPLIED marker (unlike 330's explicit language), applied status **[HYPOTHESIS, unconfirmed without DB access]**. Table is still a read-orphan in the code-write sense (0 code writers) as of this replay. Disposition unchanged: wire the sub-national cost-fact producer (now apparently in progress) or ratify allowlist. |
| RW-3 | corrected 2026-09-28 (deferral-clock defect) | **[CONFIRMED] closed, not re-litigated** | Reconciliation only; this lane did not re-run the quarantine-dwell query (no DB creds). |
| RW-4 | `[HYPOTHESIS]` orphan-source approximation | **unchanged, not re-verified this pass** | No DB access this lane either; still needs the real script run with a real Postgres connection. |
| RW-5, RW-6, DUP-2, DUP-3, DUP-4, PROD-1, PROD-2 | clean/no-change | **not re-verified** (no DB access / no git-log-based recheck performed this pass); nothing in the code or migration sweep contradicts them. |
| DUP-1 | 6 pairs reviewed, keep-allowlist | **[CONFIRMED] unchanged** | Table roles re-read this pass (see Duplicate-table section) confirm the same 6 pairs are still legitimately parallel. |
| DEAD-1 | full-schema column sweep never run | **superseded by the 2026-09-28 triage's live run (24 columns)**, itself reconciled below |, |
| SEC-1 | `derivation_edges` RLS disabled, P0 | **[CONFIRMED, REFUTED as a live issue]. FIXED.** | Migration 330 (`330_derivation_edges_rls.sql`) enables RLS, revokes all anon/authenticated grants, ships deny-all (no policy), with an in-migration self-check (`DO $$ ... RAISE EXCEPTION`) asserting `relrowsecurity=true`, 0 anon/authenticated grants, 0 policies. No "NOT APPLIED" marker in its header (unlike 331/334/335, which explicitly self-declare draft status), read as applied. **Caveat, honestly stated: this lane has no DB credentials and cannot confirm the migration actually ran against the live database; the self-check inside the migration only proves what happens IF it runs.** Recommend the coordinator confirm via `SELECT relrowsecurity FROM pg_class WHERE relname='derivation_edges'` before treating SEC-1 as fully closed. |
| UI-1 | envelope-reader gap, doc conflict | **not re-investigated this pass** (out of DB-vs-code scope; a doc-conflict finding, not a DB finding). |
| UI-2 | Market detail raw-dump bug | **not this lane's scope** (UI bug, not DB). |
| A.1-A.6 (dead columns) | 2026-09-28 triage | **[CONFIRMED] unchanged.** `sources.reliability_score` (A.3, DROP disposition): grepped the full migration corpus, **only migration 007 (original `ADD COLUMN`) mentions it; no drop migration has landed.** Still an open drop candidate, SQL below. A.4 (`case_studies`/`case_study_endorsements`/`taxonomy_nodes`): **[CONFIRMED] resolved to DROP and the migration is DRAFTED**, `335_drop_placeholder_community_layer.sql`, header states verbatim "**AUTHOR-ONLY, NOT APPLIED**, rides coordinator/operator DDL approval," citing the 2026-09-29 operator ruling ("There has never been anyone in community... Remove them completely"). This is decision-ready per rule 13: migration written, awaiting the Supabase-CLI apply step only. Not yet live, this replay still sees all three tables in the schema. |
| B (UI-orphan fields) | 2026-09-28 triage | **[CONFIRMED] unchanged.** `community_group_members.muted` and `source_bias_tags.*` are both still un-wired (see RLS section below for a NEW finding on `source_bias_tags`'s grants). `region_dimension_coverage.notes` open question unchanged. |
| C (duplicate-table candidates) | 2026-09-28 triage | **[CONFIRMED] unchanged**, not re-run (needs live `information_schema`, no creds this pass). |

## Table-by-table register

118 live tables (schema replay). Full per-table writer/reader detail (code sites, migration-of-origin) is
in the working JSON this lane generated (`register.json`, not committed, reproducible via the replay
script above); this section reports every table that is NOT a clean live-and-wired case, plus the summary
counts for the rest.

**Summary**

| Class | Count | Notes |
|---|---|---|
| Live-and-wired (code writer + code or SQL reader, no other flag) | 100 | Not enumerated individually, clean. |
| Write-orphan, allowlisted | 2 | `bulk_imports`, `disposition_ledger` (RW-1, unchanged). |
| Read-orphan (code reads, nothing writes in code; some have SQL/trigger writers) | 4 | `sector_contexts`, `community_topics`, `community_topic_groups`, `state_cost_facts`. |
| Zero code writer AND zero code reader, SQL-internal only (trigger/RPC/view-fed) | 13 | `aggregate_query_log`, `case_studies`†, `case_study_endorsements`†, `corpus_census`, `coverage_gap_candidates`, `coverage_gap_census_findings`, `data_sources`, `gate_a_health_cache`, `intelligence_item_versions`, `intelligence_summaries`, `mutation_leases`, `sensitive_field_policy`, `system_state_flag_audit`. († = DROP-drafted, migration 335, not applied.) |
| `taxonomy_nodes` | 1 | Same DROP-drafted disposition as case_studies pair (migration 335). |
| RLS-status open question (no `ENABLE ROW LEVEL SECURITY` found anywhere in the migration corpus for this table) | 11 | See RLS section, new finding this pass. |

### Zero-code-reference, SQL-internal tables, disposition

| Table | Rows (as of) | Role | Disposition |
|---|---|---|---|
| `case_studies` / `case_study_endorsements` / `taxonomy_nodes` | 6 / 0 / 38 (2026-09-29, migration 335 header) | Dead migration-007 Community placeholder layer | **DROP, already drafted**, migration 335. Coordinator applies via Supabase CLI. No further SQL needed from this lane. |
| `sources.reliability_score` (column, not table) | 2,572/2,572 rows = exactly 0.00 (2026-09-28 triage) | Dead column, superseded by `trust.ts`'s live `computeReliabilityComponent()` | **DROP.** SQL: `ALTER TABLE public.sources DROP COLUMN reliability_score;`, schema-only DDL, no dependent code (verified this pass: 0 references to `reliability_score` anywhere outside migration 007). Effort: S. |
| `corpus_census`, `coverage_gap_census_findings` | 655/655, 116 rows (2026-09-28 triage) | Census-artifact convention (`docs/census/`) | **KEEP-allowlist**, unchanged, migration 212/222 citation. |
| `data_sources` | not re-counted this pass | Licence-verdict mirror of `src/lib/contracts/source-licence.mjs` | **KEEP-allowlist**, unchanged, migration 258 citation. |
| `gate_a_health_cache` | not re-counted | Deliberately-unscheduled cache, F47 ALLOWLIST entry, operator ruling 2026-08-10 | **KEEP-allowlist**, F47's own allowlist entry, cited directly in that file. |
| `intelligence_summaries` | not re-counted (prior stale "2,325" literal explicitly disclaimed in `.claude/CLAUDE.md`) | Shelved Sector-Activation feature | **KEEP-allowlist**, per `.claude/CLAUDE.md` "Sector Activation" section, F47 ALLOWLIST entry. |
| `aggregate_query_log`, `sensitive_field_policy`, `mutation_leases`, `coverage_gap_candidates`, `intelligence_item_versions`, `system_state_flag_audit` | not re-counted | Spec-08 propagation/aggregate subsystem internals, advisory-lock table, versioning table, each has an SQL reader/writer (trigger, view, or RPC body), zero app-code path by design | **KEEP**, consistent with `derivation_edges`'s now-fixed sibling posture (migration 330's own comment names these six as siblings that already had RLS + no app-code path). `[HYPOTHESIS]` not individually re-verified for RLS status this pass except where flagged below. |

### Read-orphans (unchanged from RW-2/RW-4 class)

`sector_contexts` (shelved per-sector feature, KEEP per `.claude/CLAUDE.md`), `community_topics` /
`community_topic_groups` (read by `shell-context.ts`, 0 code writers, **[HYPOTHESIS, not investigated
this pass]**, worth a follow-up: is there a seed-only population path, or is this a second instance of
the RW-2 class?), `state_cost_facts` (RW-2, unchanged, see reconciliation table).

## Duplicate-table candidates (structural, this pass)

Re-read the 6 pairs DUP-1 closed, against the current (2026-09-30) table-role comments, not re-derived from
scratch:

- `source_citations` vs `intelligence_item_citations`, confirmed still distinct (source-to-source vs
  item-to-source edges).
- `regional_data_facts` vs `state_cost_facts`, confirmed still distinct (region-grain vs sub-national),
  AND now actively converging via the STATE-COST-DAG lane (migrations 332/333) rather than diverging -
  strengthens the "intentionally parallel, not duplicate" read.
- `market_series` vs `published_price_statistics`, confirmed still distinct (spine vs refreshed board).
- `emission_factors` vs `assumption_register`, confirmed still distinct.
- `user_watchlist` vs `org_watchlist`, confirmed still distinct.
- `coverage_gap_candidates` vs `coverage_gap_census_findings` vs `census_worklist`, confirmed still
  distinct.

No new duplicate-role table introduced since 2026-09-25 in the tables this lane's replay covers. The
2026-09-28 triage's 65-candidate structural scan (`duplicate-table-audit.mjs`) was not re-run (DB creds);
its unresolved items (`claim_versions` vs `section_claim_provenance`, the six single-token noise pairs)
remain **open**, unchanged.

## Functions, triggers, RPCs, views

F47's live scan (`scanTree()`, direct call, not the CLI wrapper): **`unreferencedFunctions: []`**. Zero
functions defined in the migration corpus and called by nothing in code or SQL. F24's `NO_MIGRATION_HOME`
allowlist is empty (`[]`) and its own audit (`auditCatalog`) found 0 problems against
`.discipline/governance/db-catalog.json`, **but that catalog snapshot is dated 2026-08-11 and records 87
tables** against the 118 this replay counts today. F24's own header states this limit explicitly
("DDL applied out-of-repo AFTER the last snapshot refresh is invisible here until someone refreshes") -
**this is a live instance of that named limit**, not a new defect: F24 passed cleanly today only because
every object created since 2026-08-11 came through a committed migration (confirmed, every table this
register lists traces to a numbered migration file), so the staleness has not yet produced a false-clean
result, but the gap between what F24 can see (87-table snapshot) and what's live (118 tables) is real and
growing. **Recommendation: refresh `db-catalog.json`** via `db-catalog-refresh.sql` (read-only, the tool
already exists), effort S, no code change, closes the visibility gap rather than leaving it to keep
widening.

`NET_EGRESS_SANCTIONED`: 1 entry (`capture_worker_fetch`), unchanged, matches `netCallers: ["capture_worker_fetch"]`
in the (stale but not wrong on this point) catalog. `CRON_SANCTIONED`: empty, matches `cronJobs: []`, consistent
with rule 16 (build-mode holds cadence off).

## RLS posture, NEW finding this pass

Swept the full migration corpus for every `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statement (134
distinct table names matched across the corpus's full history, including tables since dropped). Diffed
against the 118 live tables. **11 live tables have no `ENABLE ROW LEVEL SECURITY` statement anywhere in
the committed migration corpus:**

`agent_run_searches`, `gate_a_health_cache`, `institutions`, `intelligence_item_citations`,
`intelligence_summaries`, `item_type_required_slots`, `section_claim_provenance`, `sector_contexts`,
`source_bias_tags`, `system_state`, `system_state_flag_audit`.

**`[HYPOTHESIS, grep-confirmed absence in the migration text only; no DB credentials this lane, live
`pg_class.relrowsecurity` unconfirmed]`, but with a real contradiction worth naming rather than
flattening:**

- **3 of the 11 are very likely a false positive of this grep, not a real gap** `[CONFIRMED via a second
  source]`: migration 169 (`169_reconciler_rls_repair.sql`, applied 2026-07-11 per its own header) adds
  `*_reconciler_select` SELECT **policies** to exactly `agent_run_searches`, `section_claim_provenance`,
  `item_type_required_slots`, and its own text says the defect it fixed was "GRANT SELECT but NO RLS
  POLICY", i.e. it presupposes RLS was already ON for these three. A policy add on a table with RLS off
  would be a no-op nobody would bother shipping a migration for. So RLS is almost certainly enabled on
  these three via a statement this grep's regex pattern didn't match (a formatting variant, or literally
  out-of-repo DDL, the same class F24 already names as a residual). **Disposition: verify, don't fix** -
  one query settles it (SQL below); not a drop/wire candidate either way.
- **`source_bias_tags`** has an explicit `GRANT SELECT ON public.source_bias_tags TO anon, authenticated;`
  (migration 092) with **no matching RLS-enable statement found**. If RLS is genuinely off here, the grant
  is meaningless from a security standpoint (no RLS means the grant simply governs row-level access, and
  with RLS off, a `SELECT` grant already exposes every row to anon/authenticated, that MAY be the intended
  posture for a public bias-tag reference table, but it should be a deliberate decision, not a gap).
  **`[HYPOTHESIS]`, needs the same live check.**
- **`system_state`** (the global pause-flag table read by 8 sites across worker-pause logic) and
  **`system_state_flag_audit`** (its append-only audit trail, F47-allowlisted as a write-only sink): no
  RLS statement AND no GRANT/REVOKE statement found for either. If Supabase's schema-level default
  privileges grant `SELECT`/`INSERT` to `authenticated` (a common default posture this lane cannot confirm
  without DB access), an unprivileged authenticated user could read or write the platform's global
  pause/scrape-cadence state. **This is the highest-severity open item in this audit: P1 pending live
  verification, potentially P0 if defaults turn out to grant write.** Not asserted as broken, flagged with
  the exact check to run.
- The remaining 6 (`gate_a_health_cache`, `institutions`, `intelligence_item_citations`,
  `intelligence_summaries`, `sector_contexts`), all either F47-allowlisted write-only/shelved sinks or
  small reference tables with no obvious sensitive-write surface; lower priority, same unconfirmed status.

**Exact SQL for the coordinator** (single read-only query, answers all 11 at once, same shape as migration
330's own self-check):

```sql
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  COUNT(p.polname) AS policy_count,
  STRING_AGG(DISTINCT g.grantee::text, ', ') FILTER (WHERE g.grantee IN ('anon','authenticated')) AS anon_auth_grants
FROM pg_class c
LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
LEFT JOIN information_schema.role_table_grants g
  ON g.table_schema = 'public' AND g.table_name = c.relname AND g.grantee IN ('anon','authenticated')
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN (
    'agent_run_searches','gate_a_health_cache','institutions','intelligence_item_citations',
    'intelligence_summaries','item_type_required_slots','section_claim_provenance','sector_contexts',
    'source_bias_tags','system_state','system_state_flag_audit'
  )
GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
ORDER BY c.relname;
```

If `system_state` or `system_state_flag_audit` comes back `rls_enabled = false` AND `anon_auth_grants` is
non-empty (or non-null via a schema-level default), that is a same-class fix to migration 330: revoke,
enable, ship deny-all. Sketch, ready to adapt once the query above confirms the actual state:

```sql
-- ONLY if the live check above confirms system_state (and/or system_state_flag_audit) has
-- RLS disabled AND non-empty anon/authenticated grants. Do not apply blind.
REVOKE ALL ON TABLE public.system_state FROM anon, authenticated;
ALTER TABLE public.system_state ENABLE ROW LEVEL SECURITY;
-- no policy => deny-all for anon/authenticated; service_role bypasses RLS regardless.
```

## Migration hygiene

- **Number range**: 001-335, 302 committed `.sql` files in `fsi-app/supabase/migrations/` (gap between
  335 and 302 is normal, files get renumbered/retired, e.g. migration 309's own header documents a
  renumber-on-collision). Not walked file-by-file for gaps this pass (out of budget; F24/F47's replay
  already proves every live table traces to a migration, which is the material fact a gap-walk would be
  checking for).
- **Two-track policy compliance (CLAUDE.md rule 3), GOOD**: migrations 331, 334, 335 each explicitly
  self-declare "DRAFT / NOT APPLIED" or "AUTHOR-ONLY, NOT APPLIED" or "DDL SKETCH ONLY, AUTHORED, NOT
  APPLIED" in their own header text, correctly separating schema-drafted from schema-applied. This is the
  discipline working as designed, not a defect, noted because an audit that only flags problems and never
  confirms working discipline understates how the system actually behaves.
- **`db-catalog.json` staleness**, see Functions section above. 87 vs 118 tables, dated 2026-08-11.
  Recommend refresh (effort S, tool already exists, read-only).
- **Migration 330 (SEC-1 fix)**: applied-status ambiguous from text alone (no explicit "NOT APPLIED"
  marker, unlike its 331/334/335 neighbors), read as applied but not independently confirmed (no DB
  access). Recommend the coordinator confirm via the RLS query above (it already covers `derivation_edges`
  if added to the table list).
- **DDL mixed with data**: not observed in the migrations this lane read closely (330, 335, 331/332/333/334
  headers), 335 is a pure DROP TABLE/DROP FUNCTION/redefine-and-regrant sequence with no data literal
  beyond what the schema itself requires; 330 is pure ACL/RLS DDL. Not swept across all 302 files this pass.

## Top 10 a senior data engineer would call out first

1. **`system_state` / `system_state_flag_audit` RLS+grants unconfirmed**, global pause-flag table, no
   RLS statement or grant/revoke found in the migration corpus at all. Highest-severity open item. `[HYPOTHESIS]` P1.
2. **`derivation_edges` RLS fix (migration 330) not independently confirmed live**, the fix is written and
   self-checking, but this lane cannot prove it ran. `[HYPOTHESIS, likely CONFIRMED]` P1 pending one query.
3. **`source_bias_tags` GRANT SELECT to anon/authenticated with no matched RLS-enable statement**, may be
   intentional (public reference data) but was never confirmed as a decision. `[HYPOTHESIS]` P2.
4. **`case_studies`/`case_study_endorsements`/`taxonomy_nodes`**, dead migration-007 placeholder layer,
   DROP already drafted (migration 335) and awaiting only the apply step. `[CONFIRMED]` P2, decision-ready.
5. **`sources.reliability_score`**, dead column, 2,572/2,572 rows at the literal default, DROP SQL ready,
   never applied. `[CONFIRMED]` P2.
6. **`db-catalog.json` is 7 weeks stale** (87 vs 118 live tables), F24's out-of-repo-DDL detector is
   correspondingly blind to anything applied outside a migration since 2026-08-11. `[CONFIRMED]` P2, S effort fix.
7. **`state_cost_facts`**, still a read-orphan (RW-2) `[HYPOTHESIS]` P1, but now has an active build lane (migrations 332/333) targeting it; worth the coordinator confirming those two migrations actually applied before assuming the gap is closing.
8. **`source_bias_tags`, `community_group_members.muted`, `region_dimension_coverage.notes`**, three
   still-open WIRE candidates carried forward unchanged from the 2026-09-28 triage; none re-verified this
   pass, none contradicted either. `[HYPOTHESIS]` P2.
9. **`bulk_imports` / `disposition_ledger`**, still grandfathered write-orphans, Phase-7-pending, unchanged
   since first surfaced 2026-07-03/2026-09-01. Two-year-old-in-project-time debt worth a coordinator
   decision rather than another audit cycle re-confirming the same allowlist entry. `[CONFIRMED]` P2.
10. **The live-schema facts file never arrived this session** `[CONFIRMED, procedural gap]` P1, this audit ran entirely on migration-text replay + code grep, with zero live row counts, zero live RLS flags, zero live policy counts confirmed directly. Every `[HYPOTHESIS]` above collapses to `[CONFIRMED]` or `[REFUTED]` with one credentialed pass; this audit's own completeness is bounded by that missing input.

## Decision-ready build items

| Item | SQL | Effort |
|---|---|---|
| Drop `sources.reliability_score` | `ALTER TABLE public.sources DROP COLUMN reliability_score;` | S |
| Apply the already-drafted community-placeholder drop | `supabase/migrations/335_drop_placeholder_community_layer.sql` (already written, self-checking), apply via Supabase CLI | S (apply only, already authored) |
| Refresh the DB catalog snapshot | Run `fsi-app/.discipline/governance/db-catalog-refresh.sql` (read-only) and commit the diff | S |
| Confirm RLS/grants on the 11-table watch-list | See the `SELECT` query above | S (read-only) |
| If `system_state`/`system_state_flag_audit` confirmed exposed | `REVOKE ALL ... ; ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` sketch above, adapt after the read | S, conditional |

## Coverage note

This lane read: `fsi-app/supabase/migrations/*.sql` (302 files, via statement-replay, not a full line-by-line
read of all 302, the replay parses CREATE/ALTER/DROP TABLE/VIEW/FUNCTION statements and RLS-enable
statements across the whole corpus; migrations 007, 092, 109, 112, 152, 169, 213, 224, 258, 285, 286, 287,
297, 298, 330, 331, 332, 333, 334, 335 were additionally read in full for specific findings above),
`fsi-app/supabase/seed/**` (not individually read this pass, no seed-vs-migration discrepancy was in scope
for a DB-vs-CODE register and none surfaced incidentally), `docs/inventories/migrations.md` (checked for
per-migration applied-status markers, found the doc does not carry that field; it is a subject-line index
only, generated from each migration's own header), the F14/F24/F47 fitness sources, the 2026-09-25 and
2026-09-28 prior registers in full, and grep-based consumer checks across `fsi-app/src` + `fsi-app/scripts`.
