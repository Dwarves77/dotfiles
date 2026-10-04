## 9. `reopen-validation-holds`

**Purpose**: re-admit `census_worklist` rows a mint-batch-report held (`dryrun_disposition='hold'`,
`hold_reason` starting `validation_failed:`) back to `dryrun_disposition='would_mint'`, so the next
population run's real capture+validate pass re-decides the row's fate - never re-validated here. The
symmetric reversal of `apply-mint-batch.mjs`'s validation-failed hold-back (see that file's
`resolveValidationFailedHolds`).

**Upstream**: `scripts/mint/reopen-validation-holds.mjs` (Lane URL-GUIL, 2026-09-03) - its own exported
`main({reasonContains, apply})` does the read, the selection (`isReopenTarget`, a pure predicate - never
matches a non-`hold` row, a hold outside this lane's `validation_failed:` vocabulary, or an empty/missing
scope), and the write (`guardedUpdate`, cited there), imported and called UNMODIFIED by this wrapper;
nothing is reimplemented. **No prior runtime existed to invoke it from**: the ONLY place with database
credentials is GitHub Actions (the cloud container has no egress to Supabase, the Codespace has no
secrets) - this step is that missing runtime, the same gap `origin-class-backfill`/`tag-ratification`
closed for their own upstream scripts.

**Ruling**: none named directly - gated by the upstream tool's own standing rule (its header, verbatim):
never a blanket, unscoped, or scheduled re-admission. This step enforces that one layer earlier: `arg`
(the `--reason-contains` scope) is **required in BOTH modes**, unlike every other `arg`-gated step above
which gates `apply` only - a blank `arg` is refused (exit 1, no DB read at all) before dry mode would even
list anything, because a dry listing of "every held row" is itself the blanket view the tool's header
forbids.

**Dispatch**: `arg` = a substring of the `hold_reason` to reopen (case-insensitive), e.g.
`ungrounded_url`. `mode=dry` returns the full per-row plan - row id, `hold_reason`, and a truncated
`notes` head (the held evidence JSON can be long; the plan previews it, never dumps it whole) - for every
matching row, plus the matched count; writes nothing. `mode=apply` writes through the upstream tool's own
guarded path, then re-reads exactly the rows this run touched (`writtenIds`) and reports their post-write
`dryrun_disposition`/`hold_reason`/notes head as `read_back`. A per-row write failure is reported in the
summary `note` and sets `exitCode=1` without aborting the rest of the batch (matches the upstream tool's
own per-row try/catch). Idempotent: re-dispatching with the same `arg` after a successful apply finds 0
matching rows (the reopened rows no longer carry `dryrun_disposition='hold'`).

**Live state at authoring** (coordinator-confirmed, Supabase, 2026-09-04 00:40 UTC): exactly 1 row held
`validation_failed:2:ungrounded_url` - the guillemet-URL row whose fix landed in the same #557 as the
upstream tool. Coordinator dispatch for that row: `mode=dry, step=reopen-validation-holds,
arg=ungrounded_url` first (confirm the plan names exactly that one row), then `mode=apply,
step=reopen-validation-holds, arg=ungrounded_url`.

**Artifact / read back**: `summary.json`'s `plan` (dry) or `read_back.reopened` (apply) - confirm against
`SELECT id, dryrun_disposition, hold_reason FROM census_worklist WHERE id = ANY(<writtenIds>)`. Never
dispatched from `all` in apply mode (per this workflow's own "all" ⇒ dry-only rule) - a named apply always
carries its own explicit `arg`.

**Registration**: `docs/inventories/shared-dataset-ownership.md`'s `census_worklist` section and its "Open
leaks summary" item 9 - the wrapper is deliberately **not** added to the enforced JSON allowlist, because
it delegates the write entirely (no `guardedUpdate`/`.from("census_worklist")...update(` call site of its
own) rather than re-implementing a second one; verified by re-running
`.discipline/shared-writer-registry.test.mjs` after adding the wrapper file, which still passes.

---

