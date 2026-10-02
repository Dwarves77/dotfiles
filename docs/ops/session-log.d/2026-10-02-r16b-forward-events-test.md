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

## Follow-up owed (flagged per CLAUDE.md rule 13/14, not silently dropped)

Regenerate `fixtures/fwdtext3-live-58.json` and `fixtures/feslot2-live-118.json` from the live SQL already
embedded in this test file's own header comments (project `kwrsbpiseruzbfwjpvsp`), from a session with
Supabase credentials, to restore the original corpus-wide regression-lock assertions (the exact
baseline/with-context/rescued counts, and the "every residue row re-matches" guarantee) that this lane's
narrowed versions can no longer prove. This lane could not do so itself: no `SUPABASE_*` credentials in
this worktree by dispatch design, and no copy of the real snapshot rows on disk anywhere this lane could
read (`fsi-app/scripts/_snapshots/` holds no file by either of these two names).

## Status

Ready to push. Awaiting "Released".
