# Lane R4-5 (MIGRATION-TRUTH-CATALOG-DROPS), 2026-10-01

Size estimate: 4 migration header edits, 2 new migrations, 1 new fitness function plus test (+1
manifest entry, auto-discovered, no hand edit needed), 1 regenerated governance catalog, 1 regenerated
inventory doc, this log. No src/ code touched.

## Part (a): header truth, CF-DATA-1

Corrected the four [CONFIRMED] migrations named in remediation-plan-2026-09-30.md Lane 4 / audit
finding CF-DATA-1, each verified against the coordinator's live-schema export
(`fsi-app/scripts/tmp/live-schema-2026-09-30.json`, 2026-09-30 exact-count snapshot):

- `331_harness_runs.sql`: "DRAFT / NOT APPLIED" -> "APPLIED (confirmed live, 38 rows, 2026-09-30)".
  `harness_runs: 38` in the export.
- `335_drop_placeholder_community_layer.sql`: "AUTHOR-ONLY, NOT APPLIED" -> "APPLIED (confirmed, tables
  absent from live schema, 2026-09-30)". `case_studies`, `case_study_endorsements`, `taxonomy_nodes` do
  not appear in the export's `exact_rows` map.
- `277_corpus_turn_requests.sql`: "NOT YET APPLIED, coordinator applies..." -> "APPLIED (confirmed live,
  1,757 rows, 2026-09-30)". `corpus_turn_requests: 1757` in the export.
- `261_drop_dead_notification_v1.sql`: "COMMITTED, NOT YET APPLIED." -> "APPLIED (confirmed, tables
  absent from live schema, 2026-09-30)." `notification_deliveries`, `notification_events`,
  `notification_subscriptions` absent from `exact_rows`.

Each edit is header-text-only (no DDL change), applied inside the migration's own leading `-- subject:`
comment line so `docs/inventories/migrations.md`'s generator (see Part (b) note below) picks the
corrected text up automatically on regeneration rather than needing a hand-edited table row.

The 261 and 277 lines carry pre-existing em dashes elsewhere in the same single-line header (migration
convention stores the whole header as one `-- subject:` line); since the whole line necessarily
re-diffs when any part of it changes, each now carries the `[glyph:verbatim]` disclosure marker rule
022 (`fsi-app/.discipline/rules/022-no-dash-glyphs.mjs`) names for exactly this case, rather than
rewriting historical prose this lane did not author. 331 and 335 needed no marker; their lines had no
pre-existing banned glyph.

### CF-DATA-2: the seven unverified migrations, left untouched

Per the dispatch, headers for 146-150, 240, 260 are UNTOUCHED pending the coordinator's confirmation.
Read-only SQL for the coordinator to run, one block per migration (`information_schema` / `pg_proc` /
`pg_trigger` / `pg_indexes`, matching what each migration actually creates):

**146** (`item_cross_references.origin` column, `related_items_derived(uuid)` function,
`item_related_items_derived` view):
```sql
SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='item_cross_references' AND column_name='origin';
SELECT proname FROM pg_proc WHERE proname='related_items_derived';
SELECT table_name FROM information_schema.views
  WHERE table_schema='public' AND table_name='item_related_items_derived';
```

**147** (`sources.fetch_status`, `sources.fetch_status_at` columns):
```sql
SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='sources'
  AND column_name IN ('fetch_status','fetch_status_at');
```

**148** (`surface_of`, `get_surface_counts`, `get_all_surface_counts` functions):
```sql
SELECT proname FROM pg_proc
  WHERE proname IN ('surface_of','get_surface_counts','get_all_surface_counts');
```

**149** (data backfill only, no new schema object; checks the stated outcome directly):
```sql
SELECT count(*) AS null_severity_verified_ops_reg
  FROM intelligence_items
  WHERE provenance_status = 'verified' AND severity IS NULL
    AND item_type IN ('regulation','directive','standard','guidance','framework');
-- expect 0 if 149 ran; a positive count means the backfill never applied.
```

**150** (`canonicalize_citation_url` function, and that `validate_item_provenance`'s body actually
calls it on all three criterion-2 compare sides):
```sql
SELECT proname FROM pg_proc WHERE proname='canonicalize_citation_url';
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='validate_item_provenance';
-- inspect the returned body for three canonicalize_citation_url(...) call sites in criterion 2.
```

**240** (`guard_data_audit_block()` function + `guard_data_audit_block_trg` trigger on
`intelligence_items`):
```sql
SELECT proname FROM pg_proc WHERE proname='guard_data_audit_block';
SELECT tgname, tgenabled FROM pg_trigger
  WHERE tgrelid='public.intelligence_items'::regclass AND tgname='guard_data_audit_block_trg';
```

**260** (eight `CREATE INDEX CONCURRENTLY` FK indexes):
```sql
SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN (
  'idx_intelligence_items_agent_integrity_resolved_by',
  'idx_intelligence_items_replaced_by',
  'idx_org_watchlist_added_by_user_id',
  'idx_user_item_state_item_id',
  'idx_user_item_state_org_id',
  'idx_workspace_item_overrides_archived_by',
  'idx_workspace_item_overrides_owner_assigned_by',
  'idx_workspace_item_overrides_owner_user_id'
);
-- exact index names are this lane's best-effort guess from the migration's own stated FK targets;
-- confirm the real names against the migration file's own CREATE INDEX statements before running.
```

## Part (b): standing check, F63

New fitness function `fsi-app/.discipline/fitness/functions/F63-migration-applied-status.mjs` (+
`.test.mjs`, 21 passing tests including attack-shaped CF-DATA-1 reproductions). Auto-registered by the
manifest's filename-convention discovery (`fitness/manifest.mjs`'s `loadAll()`); no manual manifest
edit was needed or made.

Reads each migration's self-declared header status (from its leading `-- subject:`-block only, never
the SQL body) against the coordinator's live-schema row-count export for the tables it CREATEs or
DROPs. Self-skips (PASS, not a violation, not a crash) when no `fsi-app/scripts/tmp/live-schema-*.json`
export is present on disk -- this directory is gitignored scratch (CLAUDE.md rule 5), so it is never in
the git tree and `globFiles()` deliberately excludes it. Proven live during this lane: with the
coordinator's actual 2026-09-30 export copied into the scratch path (then removed again before commit,
confirmed by `git status --porcelain` showing it untracked), F63 reports **zero** violations on the
four migrations fixed in Part (a) and **19** violations elsewhere in the corpus -- genuine
header/live-schema mismatches this standing check surfaces as a byproduct, not yet investigated by any
audit this lane read. Examples: `211_drain_worklist_and_mutation_leases.sql` and
`295_community_promotion_machine.sql`/`296_spec09_market_tables.sql`/`311_...pool_drop.sql` claim table
creates/drops the live export does not match; several are plausibly explained by a LATER migration
dropping a table an EARLIER one created (F63 checks each migration's own claim in isolation and has no
cross-migration "superseded by a later drop" logic), which would make them false positives rather than
new CF-DATA-1 instances, but that is a hypothesis this lane did not verify.

`[HYPOTHESIS]`, unverified, out of this lane's write set (not 331/335/277/261/146-150/240/260): F63's
live run surfaced roughly 19 further header/live-schema mismatches across the migration corpus,
possibly inflated by a known limitation (no cross-migration create-then-later-drop reasoning). Flagging
for a future audit or coordinator pass rather than fixing here, per this lane's explicit write-set
boundary.

## Part (c): db-catalog.json refresh

Regenerated `fsi-app/.discipline/governance/db-catalog.json`'s `tables`/`views`/`rpcFunctions`/
`triggerFunctions` lists by replaying the full committed migration corpus with the existing
`replaySchema()` core (`fsi-app/.discipline/governance/db-object-reference.mjs`, the same module F47
already uses), rather than re-deriving a parallel implementation. Cross-checked the replayed 116-table
result against the coordinator's live-schema export's 117-table `exact_rows` key set: the one
difference is `inference_records` (migration 338, `lane/w2g-learning-loop`, not yet merged to master),
added to the catalog by name per the Lane 5 decision ("KEEP... added here by name so the table count
already reads 117 ahead of the merge"). Catalog now lists 118 tables (117 live + `inference_records`
pending merge), 6 views, 68 rpc functions, 26 trigger functions.

`triggers`/`policies`/`indexes` counts under `counts` are explicitly marked STALE (carried from the
2026-08-11 capture) rather than fabricated: this lane had no live `pg_catalog` introspection access,
only the migration-tree replay and the coordinator's row-count-only export, neither of which states
trigger/policy/index counts. Per CLAUDE.md rule 2, a stated unknown beats a confident guess.

`internalBrokenRefs`/`netCallers`/`cronJobs` carried forward unchanged (no new information this lane
could use to re-verify them).

**Known consequence, explicitly accepted, not fixed by this lane**: adding `inference_records` to the
catalog makes `F24-db-object-migration-home` fail with one violation ("inference_records... no
committed migration creates it") on this branch, because migration 338 lives on
`lane/w2g-learning-loop`, not here. This is exactly what the Lane 5 decision text anticipates
("F24-db-object-migration-home resolves on its own once that lane merges") -- F24 itself is explicitly
OUT of this lane's write set per the dispatch, so no allowlist entry was added to it; the one violation
is reported here as a known, expected, temporary state rather than silently left unexplained. `[CONFIRMED]`
by running `node .discipline/fitness/runner.mjs --function=F24` against the refreshed catalog.

## Part (d): the two drop migrations

`340_drop_sources_reliability_score.sql` and `341_drop_promotion_policy.sql`, both header **APPLIED-PENDING**
naming the coordinator as applier (this lane has no DDL-capable Supabase connection -- the MCP available
to it is Dietl-scoped per the dispatch brief). Both carry a pre-check `DO $$` block that aborts the
migration if live reality has drifted from the audited premise (a non-default `reliability_score` row;
any row in `promotion_policy`), and a post-check `DO $$` block confirming the drop took effect, matching
the project's existing tombstone-migration shape (219/254/261).

- `sources.reliability_score` (NUMERIC(3,2) DEFAULT 0.00, added by migration 007): CF-DATA-4,
  `[CONFIRMED]` per the audit register, 2,572/2,572 live rows at exactly the default, no src/ reader or
  writer, superseded by `src/lib/trust.ts`'s live trust-score computation.
- `promotion_policy` (migration 231): 0 rows ever (confirmed against the live-schema export), RLS
  enabled from birth with zero named policies (deny-all by omission -- present on the export's own
  `tables_with_rls_but_zero_policies` list). No `DROP POLICY` statements needed since none exist; the
  bare `DROP TABLE` removes the entire access surface. The consumer route deletion
  (`/api/admin/promotion-policy`) is explicitly lane R12-13's, not touched here.

## docs/inventories/migrations.md

This doc is GENERATED (`fsi-app/scripts/inventories/generate-migrations-inventory.mjs`), not hand
maintained -- discovered mid-lane after an initial hand-edit attempt was reverted. Regenerated via
`node fsi-app/scripts/inventories/generate-migrations-inventory.mjs --write` after fixing each
migration file's own `-- subject:` line, so rows for 331/335/277/261/340/341 are a direct derivation of
the file headers above, never hand-typed. 336/337/338/339 have no file on this branch (336 and 338/339
live on `lane/w2b-community-identity` and `lane/w2g-learning-loop` respectively; 337 was never claimed
by any file on any branch, confirmed by `git log --all --diff-filter=A -- "*/337_*"`, zero hits) --
recorded as gap-annotation rows (`extractGapRows`'s own documented mechanism, the same one that already
carries migration 307's withdrawal) rather than invented file rows, each explicitly noting "not yet
merged" so a future regeneration after the real merge replaces the gap row with the real one
automatically. C3 (`migrations.md reality`) verified clean against the regenerated doc (0 drift).

## Rule 022 (no em/en dash or section-sign glyph in added prose)

Every added line across every touched/new file in this lane's write set was swept for U+2014/U+2013/
U+00A7 and found clean (0 of 624 added lines) before commit. Two pre-existing single-line migration
headers (261, 277) needed the `[glyph:verbatim]` disclosure marker rather than a rewrite, since editing
one clause of a whole-line header necessarily re-diffs the entire line including its pre-existing,
not-authored-by-this-lane dashes.

## Tests run (touched-only, per the coordinator's standing rule -- no full suite, no pre-push)

- `node --test .discipline/fitness/functions/F63-migration-applied-status.test.mjs` -- 21/21 pass.
- `node --test .discipline/fitness/manifest.test.mjs` -- 5/5 pass (F63 loads clean, no id/filename
  conflicts).
- `node .discipline/fitness/runner.mjs --function=F63` -- PASS (self-skip) with no live-schema export
  present; PASS on the four Part (a) migrations and 19 other reported mismatches with the export
  temporarily present (see Part (b)).
- `node .discipline/fitness/runner.mjs --function=F24` -- 1 known/expected violation
  (`inference_records`, see Part (c)).
- `node .discipline/fitness/runner.mjs --function=F47` -- PASS.
- `node .discipline/fitness/runner.mjs --function=F6` -- PASS (304 migration files, including the two
  new ones, all well-formed).
- `node --test .discipline/consistency/checks/C3-migrations-reality.test.mjs` -- 4/4 pass; live `run()`
  reports 0 drift against the regenerated inventory.

## Write set (matches the dispatch exactly)

`fsi-app/supabase/migrations/{331_harness_runs,335_drop_placeholder_community_layer,
277_corpus_turn_requests,261_drop_dead_notification_v1}.sql` (header only),
`fsi-app/supabase/migrations/{340_drop_sources_reliability_score,341_drop_promotion_policy}.sql` (new),
`fsi-app/.discipline/fitness/functions/F63-migration-applied-status.{mjs,test.mjs}` (new),
`fsi-app/.discipline/governance/db-catalog.json`, `docs/inventories/migrations.md`, this file. No
`F24-db-object-migration-home.mjs` edit (considered, reverted -- out of this lane's write set per the
dispatch; see Part (c)).
