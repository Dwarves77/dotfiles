# 2026-10-11 DB-2 (db2-schema-subtract): the schema loses what nothing uses, within the write set

Lane DB-2, branch lane/db2-schema-subtract, cut from origin/master 52489e63d. Executor lane. Facts only; each one was confirmed by the method named. No database access; the register is a static replay and the row counts are the 2026-09-30 export it cites.

## Accomplished

- Migration 388 `388_drop_dead_objects.sql` (NOT APPLIED header; REG-1b takes 389): drops function `get_workspace_intelligence_aggregates_scoped(uuid, jsonb)`, function `reorder_user_list_item(uuid, text, text, text, text, text[])` and view `census_rollup_by_surface`. Plain DROP, no CASCADE, one transaction, a pre-check that aborts if any other function body or view definition names a dropped object, a self-check that the three are gone and the held neighbours remain. Register rows: DB-1 section 2 (both functions, DEAD) and section 3 (the view, NO-READER).
- Static test `388_drop_dead_objects.test.mjs` (7 tests): header via the shared `headerProblems`, the exact drop list, a negative test that no held object is dropped, the pre-check and self-check text, a self-test of the reference scanner, and the no-reference gate over `fsi-app/src` and `fsi-app/scripts` code (comments masked; test files and `fixtures/` excluded). Red-then-green: with the migration file absent the file failed at `readFileSync` (ENOENT); with it present 7 of 7 pass. The scanner self-test proves a code reference (`rpc("...")`, a SQL template) is found and a comment or prose mention is not.
- Step 3 decided: all nine no-op migration files are KEPT (reason below). Step 4 table and step 5 SQL below.

## Read and reused

- Read: COMMON.md and the DB-2 brief; the DB-1 register (summary, sections 1 to 3, section 6, the rows named); migrations 349, 368, 387 (header and structure), 256 (gate_a_health trio), 358 (data move), 284 (outbox view), 238, 377, 212, 061; ADR-042; `rls-view-function-attacks.mjs` header and constants; `aggregate-safeguards.mjs`, `antitrust.mjs`; `replay-migrations.mjs` header; `_lib/applied-status.mjs` header; the 387 migration and test (template).
- Reused: the 387 drop-migration shape and its test skeleton, `headerProblems` from `_lib/applied-status.mjs`. No new helper was built.

## Decisions (held objects, each a register row marked [WORK: db2-schema-subtract] that this lane did not drop)

1. Tables with rows are reported, not dropped (brief rule; the 2026-09-30 export): `coverage_gap_candidates` 109, `coverage_gap_census_findings` 116, `sensitive_field_policy` 5. The register's rows for these remain open.
2. `publish_aggregate`, `bucket_value`, `bucket_width_multiplier` and table `aggregate_query_log` (0 rows) are HELD. Dropping them breaks `fsi-app/scripts/verify/attacks/rls-view-function-attacks.mjs:37-38` (SYSTEM_ONLY_FUNCTIONS lists `publish_aggregate`; its test line 82 asserts five functions; the stack run reads `pg_proc` for all five) and leaves `fsi-app/scripts/lib/table-primary-keys.mjs:29` naming a dropped table. Both files are outside the write set. Also outside the write set and naming the dropped identifiers: `scripts/verify/attacks/rls-view-function-attacks.test.mjs`, comments in `src/lib/propagation/aggregate-safeguards.mjs` and its test.
3. `antitrust.mjs` is NOT deleted, contrary to the brief's write set line. `src/app/api/community/posts/route.ts:60-61` imports `evaluateAntitrustGuard` and `SENSITIVE_FIELDS` from it and line 363 calls `evaluateAntitrustGuard`; `src/lib/community/index.mjs:23` re-exports it. Deleting it breaks the posts route. Step 2 confirmation: the k-floor logic in `aggregate-safeguards.mjs` (`computeDominanceShare`) has a runtime caller by this chain: `posts/route.ts:363` calls `evaluateAntitrustGuard` (`antitrust.mjs:155`), which calls `dominanceCap` (`antitrust.mjs:173`), which calls `computeDominanceShare` (`antitrust.mjs:98`, import line 25). The SQL-side mirrors (`bucketValue`, `bucketWidthMultiplier`) have no importer outside the test. The ADR-042 amendment is therefore NOT written: it follows the `publish_aggregate` drop, which is held.
4. `derived_values_admissible` is HELD: RD-56 (`invariants.d/RD-56-derived-values-gate.mjs`), F31 (`F31-derived-values-gate.mjs:4-85`) and attack RLS-VF-VIEWS-READ (`rls-view-function-attacks.mjs:36`, GUARDED_VIEWS, with a control that both guarded views exist) name it as the sanctioned read path of the pollution barrier. Dropping it rewrites a governance invariant and a live attack: a coordinator ruling and files outside the write set. The register says NO-READER because the barrier is a gate, not a reader.
5. `propagation_queue_depth` is HELD: spec 08 section 2.2 and migration 284 name it as the visible flywheel tension; `fsi-app/scripts/harness-runs/propagation/FAMILY.md:20` documents it as a metric surface. Dropping it needs a FAMILY.md edit (outside the write set) and a ruling that the drain's own exact count replaces it.
6. `gate_a_health_compute` and `gate_a_health_refresh` are HELD: they are the writer path of `gate_a_health_cache`, which `gate_a_health()` serves to `src/app/api/health/surfaces/route.ts:173` (live). Migration 256 item 3 records the refresh as "Deliberately UNSCHEDULED (operator ruling 2026-08-10)"; `src/lib/health/gate-a-gauges.mjs:15-16` states `not_computed` is the expected build-mode state. The register's DEAD verdict is a scanner-visibility result for an operator-run function; dropping the pair removes the only writer of a cache a live route reads. [REFUTED as dead: live consumer chain gate_a_health_cache <- gate_a_health() <- /api/health/surfaces; writer is held by ruling and by rule 16].
7. `move_override_notes_to_item_notes` is HELD: migration 358 stages it as a one-time data move to run once after the consumer code merges; whether it has run is a live read (step 5 SQL). Dropping before it runs loses the move.
8. Step 3, the nine no-op migration files (007, 023, 058, 116, 133, 134, 216, 231, 237) are KEPT. Evidence: every one is named in `APPLIED-MAP.json` (007 as `outside:007_rls_community.sql`, outside-ledger; 023, 058, 116, 133, 134, 216, 231, 237 as ledger rows with class identical, statements-null or code-differs) and `replay-migrations.mjs` (header lines 24-39) applies ledger-row files in ledger order and errors on "a map entry whose file is missing". Deleting a file would make the replay refuse, and `APPLIED-MAP.json` is outside the write set. The replay does not treat them as no-ops; it applies them.

## READ-ONLY tables (step 4): 15 rows, no table dropped

| table | reader | owner of the writer | token |
|---|---|---|---|
| item_disputes | src/lib/supabase-server.ts:186, :3916 | none cited in any spec or ADR (created by migration 004; rows from migration 010) | [WORK: owed] writer or drop ruling, no lane named in any plan |
| item_supersessions | src/lib/supabase-server.ts:224, :3932 | none cited (004; rows from 010 and 011) | [WORK: owed] writer or drop ruling, no lane named in any plan |
| sector_contexts | src/lib/supabase-server.ts:2821 | fsi-app/.claude/CLAUDE.md:338 (multi-sector synopsis model) uses it; 15 rows captured out of band by 009, no migration data | [WORK: owed] seed migration or ruling |
| community_topics | src/lib/community/shell-context.ts:76 | migration 031 (private per-user topic bookmarks); docs/runbooks/maintenance.d/01-community-topics-seed.md; remediation-plan-2026-09-30 CF-UNWIRE-3 | [WORK: owed] customer-facing creator route or drop ruling (Community is social only) |
| community_topic_groups | src/lib/community/shell-context.ts:77 | migration 031, same as above | [WORK: owed] same lane as community_topics |
| coverage_gaps | src/lib/supabase-server.ts:4941 | migration 061 header: hand-curated by editors, rows enter through migrations (standing rule 1) | [NOT-WORK: editor-curated reference table by design; writer is a migration] |
| regions | src/app/api/ask/route.ts:248; scripts/producers/regional/run-envelope-producer.mjs:34 and 7 more | migration 106 seeds the 5 rows | [NOT-WORK: reference table written by migration per standing rule 1] |
| item_type_required_slots | src/lib/agent/canonical-pipeline.ts:169, :1781; fn validate_item_provenance | migrations 113, 126 to 131, 299 seed the 48 rows | [NOT-WORK: slot definitions are reference data written by migration; migration 299 is held for the Stage 9 population pass, docs/runbooks/maintenance.d/08-provenance-heal.md:33] |
| state_cost_facts | src/app/api/ask/route.ts:255 | [REFUTED: writer scripts/producers/regional/state-cost-facts-producer.mjs:232 (guardedInsertFn) and :239 (guardedUpdateFn); the scanner misses the guarded helper] | [REFUTED: writer exists; its live run is held by R14, PROGRAM-BOARD #811] |
| corpus_census | scripts/_reground/tombstone-delete.mjs:55 | migration 212 names runner scripts/_reground/census-run.mjs, which is not in the tree; 655 rows are a closed 2026-07-16 census | [NOT-WORK: historic classification record, closed run; no writer is owed] |
| gate_a_health_cache | fn gate_a_health(); src/app/api/health/surfaces/route.ts:173 | gate_a_health_refresh (migration 256 item 3), unscheduled by operator ruling 2026-08-10 | [NOT-WORK: build-mode hold; writer is a Stage 9 runtime (rule 16)] |
| data_sources | view licence_clear_sources; scripts/producers/regional/neso-carbon-intensity-producer.mjs:189 | licence register; rows added by migration (258, 267, 281 ecb pattern; docs/plans/system-completion-plan-2026-09-02.md:115) | [NOT-WORK: licence register written by migration per standing rule 1] |
| estimated_values | fn assert_statutory_purity; propagation_outbox_trg | ADR-024 and migration 286; PROGRAM-BOARD.md:110 open item 35 records no consumer after ADR-043; 0 rows | [WORK: owed] writer or drop ruling, no lane named in any plan |
| obligation_objects | src/lib/workspace/relevance.mjs:237; scripts/obligations/derive-obligations.mjs:274 | [REFUTED: writer is HALF-1, PR 1112, scripts/obligations/derive-obligation-objects.mjs wired into the derive-obligations chain step] | [REFUTED: writer landed in PR 1112; the scanner reads the register as of before the merge] |
| entity_relations | src/lib/entities/resolve.mjs:268; fn entity_relations_refuse_cycle | migration 377 (ALIAS-1, spec 00 section 1.3); no script or route writes it (git grep of scripts and src finds only constants and emitting-table JSON) | [WORK: owed] writer lane (hierarchy assertion) or ruling |

## Live reads for the executor (step 5 and the held objects)

Settle the policy and trigger gaps (register: replay 209 policies vs catalog 214, replay 76 triggers vs catalog 69) by catalog read, one row per table plus totals:

```sql
SELECT c.relname AS table_name,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies,
       (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = c.oid AND NOT t.tgisinternal) AS triggers
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
 ORDER BY c.relname;

SELECT (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') AS policies_total,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND NOT t.tgisinternal) AS triggers_total;
```

Held objects (current counts, so a table with rows is confirmed or cleared):

```sql
SELECT 'coverage_gap_candidates' AS t, count(*) FROM public.coverage_gap_candidates
UNION ALL SELECT 'coverage_gap_census_findings', count(*) FROM public.coverage_gap_census_findings
UNION ALL SELECT 'sensitive_field_policy', count(*) FROM public.sensitive_field_policy
UNION ALL SELECT 'aggregate_query_log', count(*) FROM public.aggregate_query_log
UNION ALL SELECT 'gate_a_health_cache', count(*) FROM public.gate_a_health_cache
UNION ALL SELECT 'obligation_objects', count(*) FROM public.obligation_objects
UNION ALL SELECT 'entity_relations', count(*) FROM public.entity_relations
UNION ALL SELECT 'item_notes_moved', count(*) FROM public.item_notes WHERE legacy_override_id IS NOT NULL
UNION ALL SELECT 'override_notes_eligible', count(*) FROM public.workspace_item_overrides WHERE coalesce(notes, '') <> '' AND length(notes) <= 20000;
```

If `item_notes_moved` equals `override_notes_eligible`, the data move of migration 358 has run and `move_override_notes_to_item_notes` is droppable; if not, it is owed.

## NOT done

- Drop of publish_aggregate, bucket_value, bucket_width_multiplier and table aggregate_query_log, and the ADR-042 amendment that follows it. Needs write-set expansion: scripts/verify/attacks/rls-view-function-attacks.mjs (SYSTEM_ONLY_FUNCTIONS, line 38 and the comment at 18 and 89), scripts/verify/attacks/rls-view-function-attacks.test.mjs (line 82 count), scripts/lib/table-primary-keys.mjs (line 29), comments in src/lib/propagation/aggregate-safeguards.mjs and its test, and src/lib/community/antitrust.mjs comments (edit, not delete). [WORK: owed]
- Drop of derived_values_admissible. Needs a coordinator ruling on RD-56, F31 and attack RLS-VF-VIEWS-READ, then edits to those files. [WORK: owed]
- Drop of propagation_queue_depth. Needs a ruling and a FAMILY.md edit (scripts/harness-runs/propagation/FAMILY.md:20). [WORK: owed]
- Drop of gate_a_health_compute and gate_a_health_refresh. Held by the 2026-08-10 operator ruling and rule 16; the register verdict is refuted as dead above. [NOT-WORK: build-mode hold; refresh is a Stage 9 runtime writer]
- Drop of move_override_notes_to_item_notes. Waits on the step 5 read of whether the move has run. [WORK: owed]
- Drop of coverage_gap_candidates (109 rows), coverage_gap_census_findings (116 rows) and sensitive_field_policy (5 rows). A table with rows is reported, not dropped; live code reads and writes coverage_gap_candidates (scripts/review/apply-coverage-gaps.mjs, scripts/review/lib/coverage-gaps.mjs). [NOT-WORK: tables with rows are reported, never dropped, by brief rule]
- intelligence_summaries (2,040 rows) is not dropped: the 2026-04-30 SHELVE decision in fsi-app/.claude/CLAUDE.md is the operator's call. [NOT-WORK: operator decision, reported only]
- Stale comments naming get_workspace_intelligence_aggregates_scoped as a fallback: src/lib/surface-of.mjs:8 and :89, src/lib/dashboard/surface-coverage.ts:12. The fallback no longer exists in code. Needs write-set expansion for a comment edit in each. [WORK: owed]
- Deleting the nine no-op migration files. [NOT-WORK: the replay applies them as map entries; deleting would make it refuse]

## Open items

- The register's remaining [WORK: db2-schema-subtract] rows (the tables and objects listed under NOT done) need a coordinator disposition at merge; the register should move gate_a_health_compute, gate_a_health_refresh and the nine migration files to a hold or REFUTED reading. [WORK: owed]
