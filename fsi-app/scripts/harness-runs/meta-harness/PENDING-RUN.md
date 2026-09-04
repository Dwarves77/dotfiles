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

**harness_version at TURNREQ's write time (superseded below — see "What changed (2)"):** `sha256:6be30ff6b965d085` (`sha256:bf7c0e927a84b9f0` before that; see Re-pin note below)

**The planned run that would have superseded THAT marker:** the next `meta-harness-run-009.json`, the
coordinator's next self-application review pass over this wave. That run had not yet landed when lane
DEAD-EXEC moved the hash again below (rule (c)); the next `meta-harness-run-NNN` under the CURRENT hash
covers both this entry and the one below.

---

## Lane DEAD-EXEC (2026-09-04) — governing-files.mjs edited to drop the two deleted mint shim entries

**What changed (2):** lane DEAD-EXEC (2026-09-04) deleted `scripts/mint/lib/gate-a-scan.mjs` and
`scripts/mint/lib/gate-a-match.mjs` — pure `export *` re-export shims added by the Gate-A single-source
collapse (mint marker's own "What changed (10)") that no longer had a reason to exist once their only real
importer (`scripts/mint/validate-mint-payload.mjs`) and only test importer
(`src/lib/intake/record-facts.npmtest.mjs`) were repointed at `src/lib/agent/gate-a-scan.mjs` /
`gate-a-match.mjs` directly. This required editing `scripts/harness-runs/governing-files.mjs` itself
(dropping the two shim paths from `GOVERNING_FILES.mint`, 10 → 8 entries) — and because this file is
ITSELF one of `meta-harness`'s own `GOVERNING_FILES` entries (self-referential by construction, per this
file's own header above), that edit moves the `meta-harness` family's own `harness_version` too, exactly
the mechanism the header describes. No other `meta-harness` governing file
(`scripts/harness-runs/CONVENTION.md`, `PROPOSER-RUNBOOK.md`, `scripts/lib/run-artifact.mjs`,
`F28-harness-run-integrity.mjs`) was edited by this lane beyond `CONVENTION.md`'s `mint` table row (kept in
parity with `governing-files.mjs` per the CONVENTION-TABLE-PARITY test — a documentation-only edit
describing the same 8-file mint list, not a behavior change). See
`scripts/harness-runs/mint/PENDING-RUN.md`'s own "What changed (13)" entry, same commit, for the mint-side
half of this same edit.

**harness_version at write time:** `sha256:bd09a974ebf49c17` (train 38 assembly: TURNREQ's `corpus-turn` registration and DEAD-EXEC's shim removal land in the same train, so the pinned hash is the hash of `governing-files.mjs`/`CONVENTION.md` carrying BOTH edits; DEAD-EXEC's own lane measured `sha256:0e0fb1d1753e53ee` against a tree without the corpus-turn entry)

**The planned run that supersedes this marker:** the next `meta-harness-run-NNN.json`, the coordinator's
next self-application review pass over this wave. Per F28's reverse-audit, this file is deleted the moment
an artifact carrying the hash above lands (or updated to a newer hash, per rule (c), if a `meta-harness`
governing file changes again before that run lands).

**Re-pin note (lane TURNREQ, 2026-09-04):** `sha256:bf7c0e927a84b9f0` → `sha256:6be30ff6b965d085`. This
lane registered the `corpus-turn` harness family (closing the 2026-09-04 wiring audit's B1 Gap #2 / B2 §1
finding — see `scripts/harness-runs/corpus-turn/PENDING-RUN.md`): `scripts/harness-runs/governing-files.mjs`
gained a `corpus-turn` entry and its own header/CONVENTION.md prose gained the family's registration note
— both are `meta-harness`'s own governing files (`governing-files.mjs` and `CONVENTION.md`, per this
file's own list), so editing them to register a NEW family moves `meta-harness`'s own hash, exactly the
"the loop applies to itself" mechanism `governing-files.mjs`'s header describes. `F28-harness-run-integrity.
mjs` and `PROPOSER-RUNBOOK.md` (the other two `meta-harness` governing files) are untouched by this lane.
The planned run is unchanged.
