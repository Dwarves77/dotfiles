# Audit A4d, Scripts and Maintenance Completion Pass (2026-09-30)

Lane A4d (SCRIPTS-TURNS-MAINTENANCE-UNREAD-FILES), Sonnet, read-only, worktree
`.claude/worktrees/audit-a4d-scripts` on branch `audit/a4d-scripts`. Scope per the coordinator's
dispatch: close the read-coverage gap A4 (`docs/audits/app-audit-a4-scripts-workflows-2026-09-30.md`,
read via `git show origin/audit/a4-scripts:...`) left open under `fsi-app/scripts/turns/**` and
`fsi-app/scripts/maintenance/**`. Operator directive (binding, carried over from A4): read every line,
no overviews.

## Methodology

A4's own coverage appendix (its "Appendix-rows-vs-file-count reconciliation" table and the two
directory-specific sections immediately above it) states its own per-directory verdict precisely:

- `fsi-app/scripts/maintenance/**`, **58 of 58 files (14,157 lines) READ in full**, across A4's
  current and prior work phases, cross-checked against `find fsi-app/scripts/maintenance -type f`.
  Zero unread files in this directory. A4's own text: "Zero new findings emerged from the full read:
  this is the most consistent, well-documented directory in the whole `scripts/` tree."
- `fsi-app/scripts/turns/**`, **19 of 22 code files READ in full**; 3 files SCANNED only
  (mechanical pattern sweep, F44 CLI-guard idiom, raw `createClient`/raw write bypass, `isMainModule`
  presence, not narratively read): `record-briefs/schema.mjs` (1,114 lines), `run-population-flywheel.mjs`
  (1,748 lines), `run-ledger-consume.mjs` (1,796 lines). A4's own text names these three explicitly as
  "the honest residual gap against 'every line, first line to last' for this directory... the first
  item a follow-up lane should close."

That leaves exactly **3 files, 4,658 lines**, as this lane's READ SET. No file under
`fsi-app/scripts/maintenance/**` needed reading; this audit's job was narrower than its name
suggests, and it is stated here rather than padded with re-reads A4 already completed (CLAUDE.md
rule 11's context-metering default is overridden for the READING itself, per the coordinator's
directive, but re-reading already-read files would not close any gap, it would only inflate this
report).

**READ SET (3 files, 4,658 lines, verified by `wc -l` against the live worktree before reading):**

| File | Lines |
|---|---|
| `fsi-app/scripts/turns/record-briefs/schema.mjs` | 1,114 |
| `fsi-app/scripts/turns/run-population-flywheel.mjs` | 1,748 |
| `fsi-app/scripts/turns/run-ledger-consume.mjs` | 1,796 |

All three were read first line to last line, in full, no sampling, no truncation accepted (each was
paginated by the Read tool across 2-3 calls purely for context-window reasons; every returned line
range was read, none skipped).

## Findings

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| A4d-1 | `fsi-app/scripts/turns/run-ledger-consume.mjs:1470-1473` | **[HYPOTHESIS]** `main()` constructs its own Supabase client directly (`const { createClient } = await import("@supabase/supabase-js"); const sb = createClient(...)`) rather than importing `readClient()`/`writeClient()` from `scripts/lib/db.mjs`, the same duplicate-client-construction pattern A4's finding A4-Q4 already named across ~17 files repo-wide. Unlike `run-propagation-drain.mjs` (which A4-Q4 cites as a REASONED exception, with its own header explaining why) or `run-population-flywheel.mjs` (read in full by this lane, below, it imports the whole `../lib/db.mjs` module and routes every write through `guardedInsertMany`/`guardedUpdateByIds`/`guardedUpdate`), `run-ledger-consume.mjs` carries no comment explaining why it builds its own client instead of reusing `db.mjs`'s. The raw `sb` client is then handed to `consumePortalCandidates` (`src/lib/intake/portal-harvest.ts`), which performs the actual ledger `stamp()` writes and (on a `promoted` disposition) the mint chokepoint call, whether those writes are internally guarded (cite + snapshot, rule-015 discipline) is NOT verifiable from this file alone; `portal-harvest.ts` is a `src/lib/intake/**` file, outside this lane's scope (`scripts/turns/**`/`scripts/maintenance/**` only) and outside A4's own scope too (A4's mechanical `createClient`-outside-`lib/db.mjs` grep swept `fsi-app/scripts/**`, not `src/lib/**`). Labeled HYPOTHESIS because the actual write-safety question sits one file away from what this pass could read. | [HYPOTHESIS] | P2 | A follow-up read of `src/lib/intake/portal-harvest.ts`'s `stamp()`/mint-chokepoint call sites (outside any scripts-lane's current scope) to confirm whether they route through `lib/db.mjs`'s guarded path internally (via a client the caller supplies) or write raw. If raw, this becomes the same class as A4-B2/A4-B3 (add `guardedUpdate`/`guardedUpsert` call sites) on a THIRD file, and warrants a rule-015 sweep scoped to `src/lib/intake/**` specifically, not only `scripts/**`. | S (read) / S-M (fix, contingent on the read's finding) |
| A4d-2 | `fsi-app/scripts/turns/run-ledger-consume.mjs` (whole file) | **[CONFIRMED negative]** No defect found. CLI guard present and correct (`IS_MAIN` via `resolve(process.argv[1]) === fileURLToPath(import.meta.url)`, the fixed F44-class idiom); five distinct, documented exit codes (0 done, 1 bad args, 2 no DB creds, 3 `--allow-api` without a key, 4 malformed verdicts file), no exit-0-on-failure anywhere; every `try`/`catch` in `main()` captures the error into `runError` and still writes a harness-run artifact recording it (never a swallowed error); the `--max-promote` cap (default 50, hard ceiling 200, enforced in `parseArgs`, never silently clamped) is the load-bearing blast-radius guard that replaced the retired `LEDGER_CONSUME_APPLY_ENABLED` source constant, and the apply-arming logic (`isApplyArmed`/`resolveApplyGate`) is pure, unit-testable, and matches its own extensive header documentation exactly. No background poller, no hardcoded run id used as logic (the two legacy unrecoverable-artifact ids named in comments, `mint-run-001`/`mint-run-005`, are data facts cited in prose, not control-flow literals). File is 1,796 lines (already recorded by A4 as part of A4-Q2's over-800-line list); read in full here, no further quality concern beyond A4-Q2's existing note. | [CONFIRMED] |, | none needed |, |
| A4d-3 | `fsi-app/scripts/turns/run-population-flywheel.mjs` (whole file) | **[CONFIRMED negative]** No defect found. Every DB write in this file routes through the whole `../lib/db.mjs` module (imported wholesale specifically to avoid the "latent bug" A4d-1 flags, see this file's own comment at the `--backlog` branch and the direct-`--mint-run` branch, both explaining that a prior narrower destructure omitted `readAllByIds` and was fixed by importing the full module): `guardedInsertMany` (tag-proposals), `guardedUpdateByIds` (stale-flag resolution), `guardedUpdate` (tag-ratification item/flag updates), zero raw `.from(...).update/upsert/insert(` calls found by direct reading. CLI guard correct, dry/apply modes correctly gated (every step's `willWrite` is `apply && <precondition>`, verified individually in `buildFlywheelPlan`, which is pure and step-ordered exactly as documented). THE GATE (`checkAllSlicesConnected`) and BACKLOG MODE (`selectBacklogArtifacts`) are both pure, both correctly exclude the two known-unrecoverable legacy artifacts from auto-selection rather than silently mis-processing them. No background poller, no swallowed error (every step handler throws on failure and the loop in `runFlywheelForOneArtifact` stops immediately, checkpointing prior artifacts already written to disk). File is 1,748 lines (already recorded by A4 as part of A4-Q2's over-800-line list, and it is the file `apply-record-briefs.mjs`'s own `runUnscopedFlywheelSteps` call site already verified at the contract level per A4's own text), read in full here, no further quality concern. | [CONFIRMED] |, | none needed |, |
| A4d-4 | `fsi-app/scripts/turns/record-briefs/schema.mjs` (whole file) | **[CONFIRMED negative]** No defect found; this is a pure, dependency-injected validation library with no CLI entry point, no `IS_MAIN` guard needed (correctly has none, it is imported by `apply-record-briefs.mjs` and the test suite, never invoked directly), no database access of any kind, and no file I/O of any kind. Every regex-based "mirror" (criterion-4 unlabeled-assertion, Gate A orphan-token, timeline, depth-accounting, qualification-accounting, numeric-figure) is extensively cross-referenced in its own header comments against the LIVE write-path module it mirrors (`canonical-pipeline.ts`, `validate_item_provenance`, `gate-a-scan.mjs`, `timeline-section.mjs`), with an explicit, named `[HYPOTHESIS] RESIDUAL` comment (lines 798-818) already flagging its own known incompleteness (this mirror cannot prove a claim survives to ground time, only that it was validly authored), a self-audited gap already carrying its own status token inside the source, which this lane independently confirms is accurately described. No dead code, no TODO/FIXME, file size (1,114 lines) is a data-heavy vocabulary/mirror module, not a control-flow module, consistent with A4-Q2's own "several are shared-primitive modules with heavy doc comments" caveat. | [CONFIRMED] |, | none needed |, |
| A4d-5 | `fsi-app/scripts/maintenance/**` (58 files) | **[CONFIRMED]**, not a new finding, a coverage confirmation. A4's own appendix states all 58 files (14,157 lines) were read in full and found clean; this lane did not re-read them (see Methodology) but did verify, via `find fsi-app/scripts/maintenance -type f`, that the live worktree's file list (51 root files + 6 `lib/` files + 1 `one-off/` file = 58, excluding `.test.mjs`/`.npmtest.mjs` test files and non-code `.json` companions) matches A4's own counted total exactly, confirming A4's coverage claim is not stale against the current checkout. | [CONFIRMED] |, | none needed |, |

## Coverage appendix

One row per file this lane read (3 rows, the entire unread-file count from A4's own appendix for
these two directories):

| File | Lines | Verdict |
|---|---|---|
| `fsi-app/scripts/turns/record-briefs/schema.mjs` | 1,114 | READ (full, first line to last, this pass) |
| `fsi-app/scripts/turns/run-population-flywheel.mjs` | 1,748 | READ (full, first line to last, this pass) |
| `fsi-app/scripts/turns/run-ledger-consume.mjs` | 1,796 | READ (full, first line to last, this pass) |

Rows above equal the unread-file count (3) exactly, per the dispatch's own instruction.

## Closing statement

**A4 (58/58 `scripts/maintenance/**` files + 19/22 `scripts/turns/**` code files, all READ in full)
plus A4d (the remaining 3/22 `scripts/turns/**` code files, READ in full this pass) together cover
every `.mjs`/`.sh`/`.ts`/`.sql` code file under `fsi-app/scripts/turns/**` and
`fsi-app/scripts/maintenance/**`**, 80 of 80 code files across the two directories, 100% narrative
read coverage, closing the specific gap A4's own text named as its "first item... to close." No new
defect was found in the 3 files this pass closed; one HYPOTHESIS (A4d-1) is opened, and it points
outside both A4's and A4d's own scope (`src/lib/intake/portal-harvest.ts`) as the next read a future
lane would need to resolve it.
