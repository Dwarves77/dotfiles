# 2026-09-29, lane REVERSE-CHAINED-APPLY (build only, no DB write executed)

Operator ruling 2026-09-29 on the items GitHub Actions run 36568656803 ("Ledger consume", chained apply
pass, cancelled ~12:42:30 UTC mid-write) minted: "shouldn't [exist]; get rid of them." This lane's scope:
identify the exact write set, reuse the repo's existing reversal path, write and unit-test a one-off
script (dry / apply / archive / verify), and land it via PR. **`--apply` and `--archive` were not run.**
SELECT-only discovery throughout; every count below is [CONFIRMED] by direct query against
`kwrsbpiseruzbfwjpvsp` this session, id-for-id, not carried from the coordinator's brief unverified.

## Write-set evidence [CONFIRMED]

Window: `created_at`/`searched_at` between `2026-09-29 12:37:38` and `2026-09-29 12:42:35` UTC.

| Table | Count | Linkage | Note |
|---|---|---|---|
| `intelligence_items` | 33 | `created_at` in window | all `provenance_status='quarantined'`, `pipeline_stage=null`, never reached a customer surface |
| `staged_updates` | 33 | `materialized_item_id` → 32 of the 33 items | 1 row `status='pending'`, `materialized_item_id=null`, the razorback-sucker item (id `a0bc44b1-5851-44f0-8e64-269cd9dd4801`), the run's own cancellation point |
| `agent_run_searches` | 32 | `intelligence_item_id` → 32 of the 33 items | the razorback-sucker item has no row, consistent with the mid-write cancellation |
| `integrity_flags` | 51 | `subject_ref` (text) = item id, exact string match, zero orphans | 33 from `created_by='set_provenance_status_trigger'`, 18 from `created_by='intake-relevance'` |
| `agent_runs` | **0** | n/a | the 4 rows at 12:32 UTC are `source_id`-linked NYC/Brazil fetches, `intelligence_item_id=null`, no URL overlap with the 33 items, **confirmed unrelated, excluded** |
| `disposition_ledger` | 0 | n/a | no rows for these items/URLs, never written |
| `portal_link_candidates` | 0 touched | matched by `url` | all 33 URL-matching rows still `status='candidate'`, `item_id=null`, `dispositioned_at=null`, never promoted through the candidate ledger; nothing to reset there |

Every other FK-child table of `intelligence_items` (sections, citations, `section_claim_provenance`,
versions, timelines, changelog, `item_gate_a_state`, workspace tags, forward events, obligations,
monitoring queue, canonical source candidates, etc.) returned 0 rows for this id set, the write set is
closed, no further fan-out happened before cancellation.

## Reversal path (reused, nothing new)

`fsi-app/scripts/lib/db.mjs`'s `guardedDelete` (snapshot-then-delete, cite-gated) and `guardedUpdateByIds`
+ `archivePatch` (soft-archive, cite-gated). None of the four touched tables is in
`DELETE_PROTECTED_TABLES` (`sources`, `raw_fetches`, `claim_versions`, `disposition_ledger` only).

## Built this lane

- `fsi-app/scripts/maintenance/one-off/2026-09-29-reverse-chained-apply.mjs`, the four id lists
  (33/33/32/51, plus the 33 `SOURCE_URLS`) committed verbatim, `CITE`, and four modes:
  - `--dry` (default), prints counts + the id-list integrity check, no DB call.
  - `--apply`, `guardedDelete` in FK-safe order: `integrity_flags` → `agent_run_searches` →
    `staged_updates` → `intelligence_items`. **Not run.**
  - `--archive`, alternative to `--apply`: soft-archives the 33 items via `guardedUpdateByIds` +
    `archivePatch("intelligence_items", "reverse-chained-apply-36568656803")`, deletes nothing. **Not run.**
  - `--verify`, the five post-check SELECTs (read-only), reports whether the reversal (by either mode)
    is clean.
- `fsi-app/scripts/maintenance/one-off/2026-09-29-reverse-chained-apply.test.mjs`, 13 tests, `node --test`,
  no DB (deps injected): id-list integrity (counts, no duplicates, a synthetic-duplicate sanity check),
  dry/apply/archive/verify wiring, CITE contents. All 13 pass locally under the no-npm sandbox
  (`SUPABASE_*` unset).

Confirmed by running `node scripts/maintenance/one-off/2026-09-29-reverse-chained-apply.mjs --dry` with no
DB creds set: exits 0, reports `integrity.ok: true`, counts `33/33/32/51`, no DB call.

## Not done this lane (by design, dispatch scope was build + test only)

- `--apply` / `--archive` were not run. No row was deleted or archived. The 33 items, 33 `staged_updates`,
  32 `agent_run_searches`, and 51 `integrity_flags` rows are all still live.
- The five post-check SELECTs (`--verify`) have not been run against live data, there is nothing to
  verify yet.

## Next steps

Coordinator picks `--apply` (hard delete, reversible only via the pre-delete `_snapshots/` JSONL) or
`--archive` (soft-archive, `is_archived=true`, kept queryable) for the 33 items, then runs `--verify`.
