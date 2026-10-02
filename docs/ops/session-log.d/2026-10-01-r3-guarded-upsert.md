# 2026-10-01, lane R3 (GUARDED-UPSERT)

Operator-approved remediation plan 2026-10-01, item 3 of `docs/plans/remediation-plan-2026-09-30.md`
(`audit/consolidation` branch): `scripts/lib/db.mjs` had no `guardedUpsert`, so two scripts bypassed the
rule-015 guarded write path (discipline rule `.discipline/rules/015-row-mutation-guarded-path.mjs`),
found independently by audits A4/A4b/A4c.

## Built this lane

- **`fsi-app/scripts/lib/db.mjs`**: added `guardedUpsert(table, rows, { onConflict, cite, select,
  stampIso })`. Mirrors `guardedUpdate`'s snapshot-BEFORE-mutate posture: for every incoming row, reads
  whatever currently matches its `onConflict` key(s) and snapshots it (empty when the row is new, the
  insert-shaped half of upsert), THEN runs the upsert. Requires a cite like every other guarded write.
  Accepts a single row object or an array (callers in this lane upsert one row at a time).
- **`fsi-app/scripts/lib/db.test.mjs`**: added `.upsert()` support to the hand-rolled Supabase mock
  (`makeClient`, used throughout this file) and 6 new tests for `guardedUpsert`: prior-snapshot-before-
  upsert ordering, composite onConflict keys, array input (one upsert call, N snapshot reads), missing
  onConflict refusal, empty-array no-op, and PostgREST error propagation. 40/40 pass.
- **`fsi-app/scripts/propagation/seed-derived-values.mjs`**: `seedAutomateVsHire`'s `estimated_values`
  write (previously a raw `sb.from("estimated_values").upsert(...)`, lines 286-308 before this change)
  now calls `guardedUpsert` via an injected `deps.upsertEstimatedValue` (default: the real `guardedUpsert`,
  same deps-injection posture `resolveRegionEntityId` already uses in this file for
  `guardedInsertMany`). Added `ESTIMATED_VALUES_CITE`.
- **`fsi-app/scripts/propagation/seed-derived-values.test.mjs`**: updated the 4 tests that exercised the
  old `sb.upsert()` path to inject a fake `upsertEstimatedValue` instead (`fakeUpsertEstimatedValue`,
  mirrors `guardedUpsert`'s throw-on-failure contract); removed the now-dead `upsertHandler` branch from
  `fakeClient`. 25/25 pass.
- **`fsi-app/scripts/turns/run-source-sweep.mjs`**: `upsertPortalLinkCandidates` (previously a raw
  `sb.from("portal_link_candidates").upsert(...)`, lines 357-368 before this change) now calls
  `guardedUpsert` via an injected `deps.upsertRow` (default: the real `guardedUpsert`). `sb` stays the
  first parameter for call-site stability (every other write in this file still reads through it); only
  this one write no longer needs it, since `guardedUpsert` owns its own write client. Added
  `PORTAL_LINK_CANDIDATES_CITE`. The two in-file callers (`persist`, `persistFor` inside `main()`) are
  unchanged, they call with 3 args, so `deps` defaults to the real guarded path.
- **`fsi-app/scripts/turns/run-source-sweep.test.mjs`**: replaced the old `fakeSb()` (which faked
  `sb.from(table).upsert`) with `fakeUpsertRow()` injected via `deps.upsertRow`; both existing tests
  updated to assert the call carries `onConflict` and a `cite`. 77/77 pass.

## `.upsert(` census (fsi-app/scripts + fsi-app/src/lib)

- `scripts/lib/db.mjs`: the guarded helper itself (not a call site).
- `scripts/propagation/seed-derived-values.mjs`: **MIGRATED** (this lane).
- `scripts/turns/run-source-sweep.mjs`: **MIGRATED** (this lane).
- `scripts/verify/lib/ui-orphan-scan.mjs`: no real call; `.upsert(` appears only in a comment
  describing the pattern this static scanner detects. Out of scope.
- `scripts/connections/generate-theme-brief.mjs`: no real call; `.upsert(` appears only in a comment.
  Out of scope.
- `src/lib/agent/canonical-pipeline.ts` (3 sites: `item_cross_references`, `item_gate_a_state` x2,
  `intelligence_item_citations`): **out of scope**. Discipline rule 015's trigger only scans
  `fsi-app/scripts/`; this is the Next.js app's canonical generation runtime (`src/lib/`), a different
  write-path convention outside this lane's write set and outside the remediation-plan item's named
  files.
- `src/lib/auth/provision-personal-workspace.ts` (`profiles`): out of scope, same reason (`src/lib`,
  not `scripts/`, not named in the remediation-plan item).
- `src/lib/connections/write-edges.mjs` (`item_cross_references`): out of scope, same reason.
- `src/lib/entities/link-item-entities.mjs` (`entities`, `entity_identifiers`, `entity_refs`): out of
  scope, same reason.
- `src/lib/entities/link-items.ts` (`item_cross_references`): out of scope, same reason.
- `src/lib/intake/census-writer.mjs`: out of scope, same reason.
- `src/lib/intake/mint-item.ts`: out of scope, same reason.
- `src/lib/intake/portal-harvest.ts` (`portal_link_candidates`, the original `persistPortalCandidates`
  that `run-source-sweep.mjs`'s `upsertPortalLinkCandidates` mirrors rather than imports, see that
  file's own header): out of scope, same reason.
- `src/lib/sources/snapshot-store.mjs`: out of scope, same reason.
- `src/lib/sources/source-growth.ts` (`provisional_sources`, 2 sites): out of scope, same reason.

None of the `src/lib/` sites are governed by rule 015 (its `relevantScripts` trigger matches only
`fsi-app/scripts/*.mjs`), and none is named in remediation-plan item 3's write set
(`scripts/lib/db.mjs` plus the two `scripts/` call sites). Migrating them would be a larger, separately
scoped lane (the app runtime's own write-path convention, not this rule-015 script-side fix) and is not
undertaken here.

## Dry-run proof

Both scripts still run end-to-end up to the DB-credential gate (no creds in this worktree, per the lane
contract):

```
$ node scripts/propagation/seed-derived-values.mjs --dry
seed-derived-values: no DB creds, cannot run here (exit 2).
$ node scripts/turns/run-source-sweep.mjs --walker feed --feed-url https://example.gov/feed.xml --mode dry
run-source-sweep: no DB creds, cannot run here (exit 2).
```

Exit 2 is the documented, honest "cannot run here" contract (both files' own usage headers); it proves
the modified import graph and call sites parse and execute cleanly up to that gate, not a crash from the
`guardedUpsert` migration.

## Test results

- `node --test scripts/lib/db.test.mjs`: 40/40 pass (6 new).
- `node --test scripts/propagation/seed-derived-values.test.mjs`: 25/25 pass.
- `node --test scripts/turns/run-source-sweep.test.mjs`: 77/77 pass.
- `node --test .discipline/rules/015-row-mutation-guarded-path.test.mjs`: 6/6 pass (unaffected; this
  lane's changes satisfy the rule, not amend it).

All three touched test files run with `SUPABASE_*` unset, the no-npm CI parity posture, per the lane
contract.

## Not run this lane (coordinator directive)

The full `.discipline/run-test-suite.sh` and the wiring-preflight gates were started, then stopped on
coordinator instruction (another lane's pre-push holds the single slot); the full suite runs once, when
released. Only the touched test files and the two dry-runs above were run, the way CI does.

## UX compliance

No `.tsx`/`.css` touched this lane, not applicable.
