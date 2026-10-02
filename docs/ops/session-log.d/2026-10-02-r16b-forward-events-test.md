# 2026-10-02, lane R16b (FORWARD-EVENTS-TEST-RUNS)

## Task

`fsi-app/src/lib/forward-events/extract-forward-events.test.mjs` carried four `t.skip()` branches
(inside three describe blocks) that self-skipped (never failed, never ran) whenever their gitignored
`scripts/_snapshots/*.json` evidence file was absent from the working tree. Lane R16-19 (PR 870) had
already committed three replacement fixtures under `src/lib/forward-events/fixtures/` (`retext32.json`,
`fwdtext3-live-58.json`, `feslot2-live-118.json`) but had not pointed the tests at them or removed the
skip branches, so none of the four tests ran in CI (rule 15: "a proof that does not execute is not a
proof").

## What was found, reading the test file and all three fixtures in full

- **`fixtures/retext32.json`** (3 rows): a genuine, well-formed 3-row excerpt of the `retext_targets[]`
  shape the original 654-row snapshot carried. Ran `normalizeObligationText` over its three `before`
  values directly (outside the test harness, via a throwaway `node -e`) and confirmed all three satisfy
  both properties this fixture's tests check: idempotence, and the leading-char / star / pipe-cell / URL /
  trailing-punctuation property set. No extension needed; pointed the tests at it and deleted both skip
  branches.
- **`fixtures/fwdtext3-live-58.json`** (2 rows): a PLACEHOLDER, not a thin-but-usable excerpt. Its
  `content_md` ("Record facts here.", "More facts.") carries no date and no record-facts wrapper token at
  all, so re-extracting it can never produce a fresh event matching either row's `residue_rows` entry;
  confirmed directly by running the test's own extraction logic against it. The strong original assertion
  ("every residue row must still produce a fresh event") is unprovable from this fixture, not because of
  any defect in `extract-forward-events.mjs`, but because the fixture's `content_md` was never real corpus
  text.
- **`fixtures/feslot2-live-118.json`** (3 rows): also a PLACEHOLDER, and in the WRONG schema: it carries
  an `item_forward_events` row shape (`event_id`, `event_date`, `event_kind`, `source_section_id`,
  `source_kind`, `obligation_text`, `confidence`) instead of the `section_claim_provenance` +
  `agent_run_searches` join shape the test reads (`claim_id`, `claim_text`, `source_span`, `search_id`,
  `context_before`, `context_after`). Every field the test needs is `undefined` on every row; confirmed
  that `extractForwardEvents` handles this gracefully (skips the claim wholesale, same as the documented
  `span: null` case), never a crash, but the hard-coded regression-lock counts (baseline 61 / with-context
  90 / rescued 29 / the by-kind breakdowns) are unreachable from this fixture by construction.

Checked `fsi-app/scripts/_snapshots/` for the three original gitignored evidence files to extend the two
placeholder fixtures from real rows, per the dispatch's instruction; none of the three target filenames
exist there (that directory holds unrelated `.jsonl`/audit scratch from other lanes). No DB credentials
are available in this worktree (`SUPABASE_*` unset per dispatch) to re-run the live SQL embedded in each
describe block's own header comment and regenerate a genuine snapshot. Per the dispatch's explicit
fallback ("else trim the assertion to what the fixture proves and say so"), the two placeholder-fixture
tests were rewritten to assert only what their committed data actually demonstrates: deterministic,
crash-free processing of every row, with idempotence/verbatim/forbidden-token checks still enforced over
whatever subset of rows *does* produce a match (zero, for both, today), rather than deleting the
skip-if-missing branch only to leave a permanently-red hard-coded-count assertion in its place. Each
rewritten test carries an inline NOTE explaining the mismatch, why it couldn't be fixed from this lane's
access, and what regenerating the real fixture requires.

## Changes

- `fsi-app/src/lib/forward-events/extract-forward-events.test.mjs`:
  - All three snapshot path constants (`RETEXT32_PATH`, `LIVE58_PATH`, `LIVE118_PATH`) now point at
    `fixtures/<name>.json` (committed, tracked) instead of `scripts/_snapshots/<name>.json` (gitignored,
    absent in a fresh checkout).
  - `loadRetext32Before` / `loadLive58` / `loadLive118` no longer swallow a missing file into `null`;
    they read and parse unconditionally; a missing or malformed fixture now fails loud instead of being
    silently skipped.
  - Deleted all four `t.skip(...)` branches and the `(t) => { if (!x) {...} }` guard code around them.
  - The two `retext32.json` tests are otherwise unchanged (the fixture already proves both properties).
  - The `fwdtext3-live-58.json` test no longer asserts `noFresh.length === 0`; the `feslot2-live-118.json`
    test no longer asserts the exact baseline/with-context/rescued/by-kind regression-lock counts. Both
    still assert row-processing completeness, no-crash, and (for `feslot2`) idempotence/verbatim
    invariants over whatever events are actually produced. Each carries a dated NOTE comment explaining
    why, linking back to this entry.
  - Describe-block titles and header comments updated to describe the fixtures as committed (row counts,
    `fixtures/` path) rather than the original gitignored 654/58/118-row snapshots.

## Verification

- `grep -rn 't\.skip\(' fsi-app --include='*.test.mjs'` → zero matches (previously 4, all in this file).
- Grepped fsi-app for any OTHER test with a skip-if-missing branch on `_snapshots`, `_plans`, `_diag`, or
  `tmp` paths (per dispatch instruction): found none. The five other files matching "self-skip" text
  (`scripts/verify/spec09-org-rls-adversarial-audit.test.mjs`,
  `scripts/verify/lib/harness-family-walk-scan.test.mjs`, `scripts/verify/check-vocabulary-drift.test.mjs`,
  `scripts/turns/deliver-artifact-branch.test.mjs`, `scripts/lib/record-harness-run.test.mjs`) all use the
  rule-15-sanctioned no-DB-credential self-skip (exit 2), not a gitignored-snapshot-file-missing skip;
  out of scope for this fix, left untouched.
- Ran the file directly: `node --test src/lib/forward-events/extract-forward-events.test.mjs` →
  **129 pass, 0 fail, 0 skipped** (previously 2 of these suites reported as skipped tests in a bare run,
  plus 2 more inside the retext32 describe that only ran conditionally).
- Ran it the way CI/pre-push does, through `.discipline/run-test-suite.sh`'s own no-npm sandbox import
  and with every `CREDENTIAL_VARS` entry unset (`node --import
  "./fsi-app/.discipline/lib/no-npm-sandbox.mjs" --test
  fsi-app/src/lib/forward-events/extract-forward-events.test.mjs`): same result, **129 pass, 0 fail, 0
  skipped**.
- Confirmed the file is still discovered by `fsi-app/.discipline/lib/test-discovery.mjs` (unchanged, no
  discovery-glob dependency on the path strings that moved).
- Did not run the full suite (out of scope per dispatch: "do NOT run the full suite").

## Follow-up owed (flagged per CLAUDE.md rule 13/14, not silently dropped), SUPERSEDED, see addendum

~~Regenerate `fixtures/fwdtext3-live-58.json` and `fixtures/feslot2-live-118.json` from the live SQL
already embedded in this test file's own header comments...~~ The coordinator rejected the trimmed-
assertion approach above ("placeholder fixtures that pass trimmed assertions are a workaround, and the
operator ruled 'fixed, not worked around'") and ran this to ground. See addendum below for the resolution
of both fixtures.

## Addendum (same day, after coordinator review): fwdtext3 converted to synthetic; feslot2 re-exported real

The coordinator asked for, per fixture: the original producing SQL/script, the exact row shape, and
whether a smaller real sample suffices, before authorizing a DB executor to run a read-only export. Both
answers below led to a DB-executor read-only export (not run by this session).

**fwdtext3**: the executor re-ran the live count `obligation_text ~ '\[[a-z0-9_]+\]'` for
`extractor_version = 'fe1-2026-09-04.2'` and got **0 of 1336**: the residue defect class this fixture was
built to lock no longer exists in the corpus (lane R16-19's own maintenance pass evidently cleaned up the
remaining instances between the 2026-09-04 capture and now). A real re-export is impossible: there is
nothing live to export. Per the coordinator's decision, converted this fixture to an explicitly SYNTHETIC
one:
- Deleted the placeholder `fixtures/fwdtext3-live-58.json` (the executor's own re-check against it
  confirmed `[]`, i.e. truly nothing to recover).
- Hand-authored `fixtures/fwdtext3-synthetic-residue.json`, 4 rows, exact loader shape (`item_id`,
  `section_id`, `section_key`, `content_md`, `residue_rows[]`, `claim_rows[]`), covering the three
  `byVariant` classes (`plain_slot`, `due_date_with_precision`, `binding_position`) plus one row with no
  residue. Three of the four rows' `content_md` reuse real, live corpus text already verified elsewhere in
  this same test file (items `025e6570-584f-4124-8b69-b69cc534e050`, `128b6a2e-cf78-4c9f-b03d-9256a3df5222`,
  `10cf4da4-9363-4365-90df-a1dceace1b66`); the `residue_rows[].obligation_text` values are necessarily
  invented (standing in for pre-fix defect text that is no longer observable anywhere), which is exactly
  why the fixture is labelled synthetic rather than live, in the test file's own header comment and this
  entry. Verified each row directly with `extractForwardEvents` before committing (confirms the stated
  `event_date`/`event_kind` match the fixture's own `content_md`).
- Restored the hard `noFresh.length === 0` assertion; all 4 residue rows now re-match. The header SQL
  comment's `s.item_id as intelligence_item_id` alias was also corrected to `s.item_id` (matching the field
  the loader actually reads) so a future real re-capture, if the defect class ever recurs, lands in the
  right shape on the first try.

**feslot2**: the first executor attempt hit an escaping error; the coordinator re-ran it and dropped 124
real rows (126,577 bytes) into
`fsi-app/src/lib/forward-events/fixtures/feslot2-live-118.json` (same path the placeholder had occupied).
Confirmed the row shape matches exactly what the loader reads (`claim_id`, `intelligence_item_id`,
`claim_text`, `source_span`, `search_id`, `context_before`, `context_after`) and grepped the file for
`eyJ`/`sk-`/`service_role`: zero matches, clean. Renamed to
`fixtures/feslot2-live-124-2026-10-02.json` (124, not 118, per the coordinator's note that the live
`section_claim_provenance` population grew between the 2026-09-04 capture and this 2026-10-02 re-export)
and updated the loader path + describe title.

Re-measured the four locked properties directly against these 124 real rows (same extraction logic the
test itself runs, via a throwaway `node -e`):

| metric | old (118 rows, 2026-09-04) | new (124 rows, 2026-10-02) |
|---|---|---|
| baseline events | 61 | 65 |
| with-context events | 90 | 95 |
| rescued | 29 | 30 |
| byKind | `{review_or_report:6, compliance_deadline:79, phase_step:2, other:3}` | `{review_or_report:6, compliance_deadline:84, phase_step:2, other:3}` |
| rescuedByKind | `{compliance_deadline:27, other:2}` | `{compliance_deadline:28, other:2}` |
| non-idempotent / non-verbatim | 0 / 0 | 0 / 0 |

Hardcoded the new figures and restored every dropped hard assertion (exact baseline/with-context/rescued
counts, exact byKind/rescuedByKind deep-equal). The shift is consistent with corpus growth (6 more rows,
proportionally similar yield), not a module regression; both old and new are recorded here per the
coordinator's instruction, not silently overwritten.

### Re-verification after the addendum

- `node --test src/lib/forward-events/extract-forward-events.test.mjs` → **129 pass, 0 fail, 0 skipped.**
- Through `.discipline/run-test-suite.sh`'s own no-npm sandbox import, `CREDENTIAL_VARS` unset (CI
  parity): **129 pass, 0 fail, 0 skipped.**
- Rule 022 (no added em/en-dash or section-sign glyphs outside `fixtures/`): re-checked the diff for this
  addendum's edits to the test file; zero added-line violations.
- Did not run the full suite. Did not push.

## Status

Ready to push. Awaiting "Released".
