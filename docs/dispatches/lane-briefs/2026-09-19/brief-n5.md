# Lane N5: the invariant registry, the migrations inventory and the shared-writer allowlist become derived (plan 6.8, Rule A)

Read first, in this order: `docs/dispatches/lane-briefs/2026-09-18/brief-common-cloud.md` (binds you; the gate
is the repo wrapper `LANE_GATE_SP=<your scratchpad> bash fsi-app/scripts/coordinator/lane-gate-cloud.sh <worktree>`,
run once, last, as one background task), then `docs/plans/complete-system-build-plan-2026-09-04.md` section
6.8 (your row is N5), then `docs/dispatches/lane-common-contract.md`.

Lane id: `n5`. Model: Sonnet. Worktree and branch named in your dispatch (cut from a master carrying N1).
Exactly this brief; anything not covered is a STOP. No shared id allocation. Never edit the F45 ceiling
line; a differing measurement is a STOP with both numbers.

## The problem, measured [CONFIRMED by the coordinator's survey]

- `fsi-app/.discipline/governance/invariants.mjs`: 1,603 lines; exports `INVARIANTS` (one array, lines 261
  to 1603; last entry `RD-73`; `RD-74-loop-hop-wiring` sits earlier at 1579), `SKILL_FILES` (43),
  `MARKER_SOURCE` (65), `SKILL_MARKER_BASELINE` (70). Consumed by `invariant-coverage.mjs` (import line 37,
  `auditInvariants` line 247, tallies 280 to 309). Every lane that adds an invariant appends at the end.
- `docs/inventories/migrations.md`: header `| # | File | Subject (from header comment) |`, 297 rows; checked
  both ways by `fsi-app/.discipline/consistency/checks/C3-migrations-reality.mjs`. Every migration lane
  appends a row.
- `fsi-app/docs/inventories/shared-dataset-ownership.md`: a fenced json block (from line 35) shaped
  `{ version, generated, sharedTables: { "<table>": ["<writer path>", ...] } }`, parsed verbatim by
  `fsi-app/.discipline/shared-writer-registry.test.mjs`, which is run by NO runner today (its header says so;
  rule 15).
- Lanes edit status columns inside shared audit documents under `docs/audits/`.

## What you build

1. **One invariant, one file.** `fsi-app/.discipline/governance/invariants.d/<ID>.mjs`, each exporting
   `invariant` (the object exactly as it is today). `invariants.mjs` keeps the three constants and derives
   `INVARIANTS` by reading the directory, importing each file, validating (`id` equals the filename stem;
   ids unique; `enforcedBy` an array) and sorting by id with a natural number sort (RD-2 before RD-10). A
   `README.md` in the directory: one entry, one file; the coordinator assigns the id; nothing else to edit.
   Split with a script you write once in `fsi-app/scripts/tmp/` (scratch, not committed), never by hand;
   comments that sit between entries today move into the entry file they precede.
2. **Migrations inventory generated.** Every `fsi-app/supabase/migrations/*.sql` already carries a header
   comment; C3 gains a check that the first comment block yields a subject line (well-formedness, with the
   exact rule you derive from today's 297 rows: STOP and report any migration whose header cannot yield the
   subject the inventory shows for it today; do not guess). New `fsi-app/scripts/inventories/generate-migrations-inventory.mjs`
   writes `docs/inventories/migrations.md` from the migration files (header line stating it is generated,
   the command, and "never edited by a lane"). C3's parity check becomes: the committed page equals the
   generator's output byte for byte (a lane that adds a migration runs the generator; two lanes that each
   add one both regenerate, and the page's rows are sorted by number, so the merge is a true add/add only
   when two lanes claim the same number, which the coordinator's id assignment prevents). Prove the
   generator reproduces today's page exactly before changing anything else (diff empty); paste it.
3. **Writers declare their shared tables.** Every writer path listed in the json block gains one header line
   `// SHARED-WRITER: <table>[, <table>...]` (tables byte-for-byte from the block). The registry test derives
   the allowlist from those markers over the same file set it scans today, deletes the json parsing, and
   asserts both directions: every detected write is declared, every declaration is a detected write. The
   json block in the doc is replaced by prose naming the marker and the test. Wire the test: add it to
   `run-test-suite.sh`'s `.discipline` glob or named line (it must reach only `node:` builtins and relative
   imports; if it does not, STOP and report which import).
4. **Audit statuses.** `docs/dispatches/lane-common-contract.md` gains one bullet: a lane never edits a file
   under `docs/audits/`; it records a finding's closure in its own session-log file, and the coordinator's
   close lane folds statuses into the audit. (Lane N6 enforces it.)
5. **Equality with the past.** Before editing, dump `INVARIANTS` (ids and the JSON of each entry), the
   inventory page, and the json allowlist to `fsi-app/scripts/tmp/n5-before.json`; after, prove the derived
   `INVARIANTS` deep-equals the dump (order by id aside: state the order rule), the page is byte-identical,
   and the derived allowlist deep-equals the block. Paste.

## Write set (exact)

- `invariants.mjs`, `invariants.d/*.mjs` (new, one per invariant), `invariants.d/README.md`, and a test
  (`invariants.test.mjs`, new or extended): live load, duplicate id refusal, filename mismatch refusal.
- `C3-migrations-reality.mjs` and its test; `generate-migrations-inventory.mjs` (new) and its test;
  `docs/inventories/migrations.md` (regenerated, header added).
- The writer scripts named in the allowlist (one header line each); `shared-writer-registry.test.mjs`;
  `fsi-app/docs/inventories/shared-dataset-ownership.md`; `run-test-suite.sh` (one line).
- `docs/dispatches/lane-common-contract.md` (one bullet).
- `docs/ops/session-log.d/2026-09-19-n5.md` (new; heading `## 2026-09-19, lane N5: <one line>`; ends with
  `### UX compliance (N5)`: Not a UI change; no customer surface touched by this branch.)

## Acceptance (paste the evidence)

- The three equality proofs from step 5.
- `node --test` on the tests you touched, all pass, refusals shown RED first.
- `node fsi-app/.discipline/governance/invariant-coverage.mjs` (or the runner the pre-push hook step 3b
  uses; read the hook): same tallies as before your change.
- `node fsi-app/.discipline/consistency/runner.mjs` (the consistency runner the hook's step 2 runs): C3 green.
- `grep -c "id: 'RD-\|id: 'EP-\|id: 'SC-" fsi-app/.discipline/governance/invariants.mjs`: 0.
- The push gate through the wrapper, once, last.

## Amendment 1 (coordinator, 2026-09-19 18:29 UTC by the date command, after the lane's STOP)

Both STOPs were right. Rulings:

1. **The rebase.** `git fetch origin && git rebase origin/master` again (the branch is not on origin, so a
   rebase is still right). Resolve exactly these: (a) `invariants.mjs`: take master's side for the file (the
   N3 text of `RD-55-harness-run-integrity`), then apply your split on top so that
   `invariants.d/RD-55-harness-run-integrity.mjs` carries N3's text verbatim and `invariants.mjs` is your
   loader; re-run your equality proof against the post-rebase master's array (132 entries, N3's text for
   that one). (b) The five `PENDING-RUN.md` modify/delete conflicts: `git rm` each; master deleted them
   (lane N3, #746) and your re-stamps are moot. Any other conflict is still a STOP.
2. **Pending files under N3's mechanism.** Read `fsi-app/scripts/harness-runs/CONVENTION.md`, section
   "Declaring a pending run", as master has it. F28's range rule now requires: for every family whose
   governing file (from its `family.json` `governing_files`) is in `git diff --name-only origin/master...HEAD`
   with no new artifact in the range, one file added in the range at
   `scripts/harness-runs/<family>/pending/2026-09-19-n5.md` (`## Change`: the SHARED-WRITER header line added
   to <the files>; `## Planned run`: the family's next run; no hash anywhere). Compute the family list from
   the descriptors, do not assume five; the "pre-existing inaccessible-triage NO ARTIFACTS" finding is
   [HYPOTHESIS] until you check whether `scripts/sources/inaccessible-triage.mjs` is in your diff (it is a
   governing file of that family); under the new F28 the pending file closes it either way, and your
   session-log entry says which it was.
3. **The migrations inventory, premise corrected in place.** [CONFIRMED by the lane: about 200 of 296
   subjects are hand-authored and not a function of the header.] The plan's intent stands (one entry, one
   file), so the subject moves INTO each migration once: by a scratch script, never by hand, insert one
   line `-- subject: <the Subject cell for that file, byte for byte>` as the first line of every
   `fsi-app/supabase/migrations/*.sql` (after a leading `/* fitness-allow */` line where one exists). Comment
   lines only; the applied schema is unchanged and the CLI tracks migrations by version, not content; say
   so in the entry. `generate-migrations-inventory.mjs` derives the page from filename plus that line
   (rows sorted by number; header stating it is generated, the command, and "never edited by a lane");
   prove it reproduces today's page byte for byte apart from the new header before anything else, paste
   the diff (empty). C3 gains: every migration carries a well-formed `-- subject:` line (violation names
   the file and the line to add) and the committed page equals the generator's output. The migration files
   join the write set for that one line each.
4. The F25 Source 10 addition is accepted as the same fix N1 made (Source 9); it stays.

Then the acceptance as written (all three equality proofs), the runner at 0 violations, one commit (amend
your existing commit only if nothing has been pushed; it has not, so `--amend` is allowed here, once), and
the gate once, as the brief says.
