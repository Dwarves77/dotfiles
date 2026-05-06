# W4 — Backfill plan

Four small Node ESM scripts under `fsi-app/supabase/seed/` repair the
`intelligence_items` and `staged_updates` tables after the W1.A / W1.B /
W1.C audits and PR #20's migrations. They are deliberately scoped: NONE
of them touch `sources`, `provisional_sources`, or `source_verifications`,
which are owned by the parallel W3 region batches.

## Scripts

| # | File | Touches | Depends on |
|---|---|---|---|
| W4.1 | `W4_1_iso_backfill.mjs` | `intelligence_items.jurisdiction_iso` | mig 033 applied |
| W4.2 | `W4_2_carb_attribution_fix.mjs` | `intelligence_items.source_id` | W3 US has created the CARB `sources` row |
| W4.3 | `W4_3_materialize_orphans.mjs` | `intelligence_items` (INSERT), `staged_updates.materialization_*` | mig 034 applied + `docs/W1B-orphan-staged-updates.json` exists |
| W4.4 | `W4_4_insert_california_critical_items.mjs` | `intelligence_items` (INSERT) | (optional) W3 US has created `arb.ca.gov` and `leginfo.legislature.ca.gov` `sources` rows |

All scripts read `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
from `fsi-app/.env.local`. All use `process.loadEnvFile` (Node ≥ 20.6).
None take CLI arguments. All are idempotent — safe to re-run.

## Order of execution

```
1. After PR #20 merges + migrations applied:                         done (state shipped)
2. After W3 US batch completes (creates CARB source):
       run W4.2  +  W4.4
3. Independently of W3:
       run W4.1  +  W4.3
4. Recommended execution order (in time):
       W4.1  →  W4.3  →  (wait for W3 US)  →  W4.2  →  W4.4
```

The key dependency is the **CARB source row** in `sources`, which is
discovered and verified by the W3 US batch. W4.2 hard-bails with exit
code 2 and the message `BAIL: No CARB source row found in 'sources'…`
when run before that row exists; the orchestrator should detect exit
code 2 as the documented signal to retry W4.2 once the US batch finishes.

W4.4 is softer: if no `arb.ca.gov` or `leginfo.legislature.ca.gov`
source row exists yet, it inserts the four California items with
`source_id = NULL` and logs each gap in `W4-4-california-critical-log.json`.
The integrity_flag system (migration 035) catches the NULL `source_id`
and surfaces it for review. This is acceptable because the items
themselves are higher-priority signal recovery than the source linkage.

## Per-script execution time and cost

| Script | Wall-clock estimate | Cost (Anthropic API) | DB calls |
|---|---|---|---|
| W4.1 | 30–60 s for ~41 rows | $0 | 1 SELECT (paged) + ~41 UPDATE + 1 file write |
| W4.2 | 5–10 s for typical mismatch volume | $0 | 1 SELECT (sources) + 1 SELECT (intel) + N UPDATE + 1 file write |
| W4.3 | 30–90 s for 24 orphans | $0 | per-orphan: 1 SELECT staged_updates + maybe 1 SELECT intel + 1 INSERT intel + 1 UPDATE staged_updates |
| W4.4 | 10–20 s for 4 inserts | $0 | per-item: 1 SELECT sources + 1 SELECT intel + 1 INSERT intel |

All four scripts are local DB-only — no Claude API calls, no web search.
Total elapsed wall-clock for the full set is well under 5 minutes.

## Audit logs written

Every script writes a structured JSON audit log under `docs/`:

| Script | Log path |
|---|---|
| W4.1 | `docs/W4-1-iso-backfill-log.json` |
| W4.2 | `docs/W4-2-carb-attribution-log.json` |
| W4.3 | `docs/W4-3-materialization-log.json` |
| W4.4 | `docs/W4-4-california-critical-log.json` |

The logs include per-row decisions, derivation strategies hit, and any
errors. They are diff-friendly (sorted, deterministic key order) so a
re-run produces a comparable artifact.

## Rollback notes

All four scripts are non-destructive in the sense that the previous
column values are recoverable from the audit logs:

- **W4.1**: `decisions[].id` plus `decisions[].legacy_jurisdictions` and
  `decisions[].derived_iso` — to revert a single row, write back an empty
  array `[]` (the migration 033 default for unbackfilled rows).
  Bulk revert: `UPDATE intelligence_items SET jurisdiction_iso = '{}' WHERE id IN (…audit log ids…)`.
- **W4.2**: `decisions[].previous_source_id` is captured per item. Revert:
  `UPDATE intelligence_items SET source_id = <previous> WHERE id = <item_id>`.
- **W4.3**: Each materialization gets its own staged_update id and intel
  id captured. To revert: `DELETE FROM intelligence_items WHERE id = <new_id>`
  followed by `UPDATE staged_updates SET materialized_at=NULL, materialized_item_id=NULL, materialization_error=NULL WHERE id = <staged_id>`.
  The `legacy_id` UNIQUE index protects against duplicate inserts on retry.
- **W4.4**: Each row has a stable `legacy_id` (`w4_ca_sb253`, `w4_ca_sb261`,
  `w4_ca_ab1305`, `w4_ca_acf`). Revert: `DELETE FROM intelligence_items WHERE legacy_id IN (...)`.

## Defensive guards summary

| Script | Bails on | Exit code |
|---|---|---|
| W4.1 | missing env, DB query failure | 1 |
| W4.2 | missing env, DB query failure, **no CARB source row in `sources`** | 1, 1, **2** |
| W4.3 | missing env, missing `W1B-orphan-staged-updates.json`, DB query failure | 1 |
| W4.4 | missing env, DB query failure | 1 |

W4.2 exit code 2 is the orchestrator's signal to retry after W3 US.

## Coordination with W3

W3 region batches own:
- `sources`
- `provisional_sources`
- `source_verifications`

W4 backfill scripts own (writes only):
- `intelligence_items` (W4.1, W4.2, W4.3, W4.4)
- `staged_updates.materialization_error`, `materialized_at`, `materialized_item_id` (W4.3)

There is no shared write target. W4.2 and W4.4 do read from `sources`
(specifically: looking up the CARB row, leginfo row, etc.) but never write.
