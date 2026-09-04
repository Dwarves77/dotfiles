# Pending run — meta-harness

F28 rule (c) (staleness coupling, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`): the
`meta-harness` family's governing files re-hash to a value no landed artifact records. This marker
acknowledges the change and names the planned run that supersedes it. (The prior hash,
`sha256:ef2b956784ce02e1`, is what `meta-harness-run-008` records.)

**What changed (2026-09-04, lane GOV-SINGLE, "wrong copy of the truth" fix for the harness-run governing
files):** `meta-harness-run-008` itself named the recurring defect: SEPARATE hand-maintained copies of the
same fact drift apart unless a change makes drift structurally impossible, not merely tested for. Proven
live this wave: F28's `GOVERNING_FILES.mint` (10 files, including the two `src/lib/agent/gate-a-scan.mjs`
/ `gate-a-match.mjs` files PR #580 added) and `run-mint-batch.mjs`'s own `MINT_GOVERNING_FILES` (8 files,
missing that same pair) had already drifted — real population runs `mint-run-024/025/026` stamped
`harness_version sha256:4f09523532bb7aee` (the runner's 8-file hash), which no landed artifact could ever
match against F28's own 10-file re-hash (`sha256:28c98ae2309a416a`, the hash `scripts/harness-runs/mint/
PENDING-RUN.md` is pinned at), so the mint marker could never be honestly discharged by a real run until
the two copies agreed. Every other family with a canonical runner script (`screen`, `forward-events`,
`source-sweep`, `ledger-consume`, `change-detection`, `propagation`) carried the identical two-copies
shape — most only by luck, not by construction (`forward-events`'s copy happened to still agree; nothing
enforced it).

**The fix:** `scripts/harness-runs/governing-files.mjs` — a NEW module, THE single source. It holds one
`GOVERNING_FILES` object (all nine registered families), moved here VERBATIM from what used to be
declared inline in this file (F28-harness-run-integrity.mjs). F28 now `import`s `GOVERNING_FILES` from
that module instead of declaring it (and no longer separately imports `screen-worklist.mjs`'s
`SCREEN_GOVERNING_FILES` either — that family's entry now comes from the same place every other family's
does). Every family's own canonical runner script (`screen-worklist.mjs`, `run-mint-batch.mjs`,
`run-extraction.mjs`, `run-ledger-consume.mjs`, `run-propagation-drain.mjs`, `run-change-detection.mjs`,
`run-source-sweep.mjs`) now imports its ONE entry from `governing-files.mjs` and re-exports it under its
historical `*_GOVERNING_FILES` name, so every existing importer and test keeps working unchanged — a
runner's own self-hash (what it stamps onto `harness_version` when it writes an artifact) and F28's
re-hash (what rule (c) checks a landed artifact against) are now, by construction, the SAME array, not
two hand-maintained ones a coordinator has to remember to keep in sync. The per-runner "matches F28's
hardcoded entry" parity tests (only `run-mint-batch.test.mjs` and `run-extraction.test.mjs` carried one)
are replaced by ONE consolidated contract test, `scripts/harness-runs/governing-files.test.mjs`: every
known runner imports from the module and contains no literal governing-file array, a repo-wide sweep
proves no OTHER file quietly grew a competing copy, and `research-sweep.mjs`'s deliberately independent
`RESEARCH_SWEEP_GOVERNING_FILES` (a genuinely different, non-family-entry list by its own documented
design) is asserted to remain exactly what it is, not silently folded in. `CONVENTION.md`'s markdown table
gained a note stating the module is the source and the table is documentation the CONVENTION-TABLE-PARITY
test (already present, unchanged in shape) checks against it — and gained `governing-files.mjs` itself as
a fifth entry in the `meta-harness` row (see next paragraph).

`scripts/harness-runs/governing-files.mjs` is added to `GOVERNING_FILES['meta-harness']` itself — it now
DEFINES what governs every family (meta-harness's own list included), the same role F28 already held
alone. This file (`F28-harness-run-integrity.mjs`) is UNCHANGED in its four rules (a)-(d); only its
`GOVERNING_FILES` declaration became an import, and its header comments were rewritten to describe the new
single-source shape instead of the old hardcoded-with-one-exception shape. `PROPOSER-RUNBOOK.md` and
`scripts/lib/run-artifact.mjs` are untouched by this lane.

**harness_version at write time:** `sha256:bf7c0e927a84b9f0`

**The planned run that supersedes this marker:** the next `meta-harness-run-009.json`, the coordinator's
next self-application review pass over this wave. Per F28's reverse-audit, this file is deleted the moment
an artifact carrying the hash above lands (or updated to a newer hash, per rule (c), if a `meta-harness`
governing file changes again before that run lands).
