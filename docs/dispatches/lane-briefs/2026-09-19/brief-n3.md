# Lane N3: a harness family's pending run is a file it owns, never a hash it re-pins (plan 6.8, Rule B)

Read first, in this order: `docs/dispatches/lane-briefs/2026-09-18/brief-common-cloud.md` (binds you; the gate
is the repo wrapper `LANE_GATE_SP=<your scratchpad> bash fsi-app/scripts/coordinator/lane-gate-cloud.sh <worktree>`,
run once, last, as one background task), then `docs/plans/complete-system-build-plan-2026-09-04.md` section
6.8 (your row is N3), then `docs/dispatches/lane-common-contract.md`, then
`fsi-app/scripts/harness-runs/CONVENTION.md` in full, then `fsi-app/.discipline/lib/change-range.mjs` (lane
N0's module; you build on it) and `fsi-app/scripts/harness-runs/family-registry.mjs` (lane N2's).

Lane id: `n3`. Model: Sonnet. Worktree and branch are named in your dispatch (cut from a master that carries
N0 and N2). You execute exactly this brief; anything it does not cover is a STOP. No shared id allocation.
Never edit the F45 ceiling line; a differing measurement is a STOP with both numbers.

## The problem, measured [CONFIRMED by the coordinator's survey]

`F28-harness-run-integrity.mjs` rules (b) and (c) read a hash pinned inside each family's `PENDING-RUN.md`
(`harness_version at write time: sha256:<16 hex>`; regex at F28 line 118, `parsePendingRunHash` line 121;
rule (b) `auditFamilyPresence` line 173, rule (c) `auditStalenessCoupling` line 198; the live hash is
`hashHarnessVersion(GOVERNING_FILES[family])` from `scripts/lib/run-artifact.mjs`). The pinned hash is a pure
function of the tree, so every lane that touches a governing file re-pins the same line and two such lanes
always conflict (17 scripted re-pins across four logged days; M8, M9b and M9a collided on the meta-harness
marker on 2026-09-18). Eleven families carry a `PENDING-RUN.md` today.

## What you build

1. **The pending directory.** A family that owes a run declares it as one file it owns:
   `scripts/harness-runs/<family>/pending/<YYYY-MM-DD>-<lane>.md` with a short required shape (a `## Change`
   line naming what changed and a `## Planned run` line naming the run), no hash anywhere. Nothing under
   `pending/` is ever a governing file or an artifact: `family-registry.mjs`'s validation refuses a
   `governing_files` entry under a `pending/` path, and F28's artifact scan (`scanArtifacts`) ignores that
   directory.
2. **F28 by Rule B.** Replace rules (b) and (c) with:
   - Range rule (needs a range; `resolveRange` from `change-range.mjs`; when it returns `unavailable`, this
     rule is skipped and says so in the report line, never fails): for each family, if any of its governing
     files is in `gitChangedFiles(range)` and no new artifact of that family is in `gitAddedFiles(range)`,
     then `gitAddedFiles(range)` must contain a file under that family's `pending/`; otherwise a violation
     naming the family, the changed governing file, and the file it must add.
   - Tree-state rule (always runs): a family with no artifact whose recorded `harness_version` equals the
     live hash must have at least one file under `pending/`; and a family that HAS an artifact at the live
     hash must have NO pending files (reverse audit: "the run happened, delete them"), each a violation
     naming the family and the files.
   Rule (a) (schema of artifacts) and the proposer attestation are unchanged. The report line prints, per
   family, `live hash`, `artifact at live hash: yes/no`, `pending files: N`.
3. **Migration of the eleven markers.** Each `PENDING-RUN.md` becomes `pending/2026-09-19-n3-migrated.md`
   carrying the marker's prose (what changed, planned run) with the hash line removed; the marker file is
   deleted with `git rm`. Any reader of `PENDING-RUN.md` other than F28 (grep `PENDING-RUN` across
   `fsi-app` and `docs`; the lane contract and CONVENTION.md name it) is updated: the contract's "re-pin the
   marker" bullets become "add your pending file"; CONVENTION.md's marker section is rewritten for the
   directory. Lane N2 already removed the per-family table; do not reintroduce any list.
4. **Tests, by attack.** In `F28-harness-run-integrity.test.mjs`: a red test per refusal (range rule: changed
   governing file, no artifact, no pending file; tree rule: no artifact at live hash and no pending file;
   reverse audit: artifact at live hash with a pending file present), each green after the one file is
   added or removed. The collision replay: in a throwaway git repo (temp dir, `--local` identity only) with
   one family, three branches each add their own `pending/<date>-<lane>.md`; merging them in every order
   produces zero conflicts and F28 passes on the merged tree. Delete the `parsePendingRunHash` tests.
5. The coordinator's `repin.mjs` lives only on the operator's machine; nothing in the repo to delete. Say so
   in your report. If `fsi-app/scripts/coordinator/` carries any re-pin helper, STOP and report it.

## Write set (exact)

- `fsi-app/.discipline/fitness/functions/F28-harness-run-integrity.mjs` and its `.test.mjs`
- `fsi-app/scripts/harness-runs/family-registry.mjs` (the `pending/` refusal) and its test (one case)
- `fsi-app/scripts/harness-runs/<family>/pending/2026-09-19-n3-migrated.md` (11 new), the 11 `PENDING-RUN.md`
  (deleted), `fsi-app/scripts/harness-runs/CONVENTION.md` (the marker section)
- `docs/dispatches/lane-common-contract.md` (the marker bullets only)
- `fsi-app/.discipline/governance/invariants.mjs` ONLY the `text`/`residual` of the invariant that cites F28
  (find it by `fitness:F28`); its id and `enforcedBy` unchanged
- `docs/ops/session-log.d/2026-09-19-n3.md` (new; heading `## 2026-09-19, lane N3: <one line>`; ends with
  `### UX compliance (N3)`: Not a UI change; no customer surface touched by this branch.)

## Acceptance (paste the evidence)

- `node --test fsi-app/.discipline/fitness/functions/F28-harness-run-integrity.test.mjs fsi-app/scripts/harness-runs/family-registry.test.mjs`: all pass; the three red tests shown RED before the fix.
- `node fsi-app/.discipline/fitness/runner.mjs --function=F28`: PASS on your tree with the eleven pending files.
- `grep -rln "harness_version at write time" fsi-app/scripts/harness-runs/`: no file.
- `ls fsi-app/scripts/harness-runs/*/PENDING-RUN.md`: none.
- The push gate through the wrapper, once, last.

## Amendment 1 (coordinator, 2026-09-19 17:32 UTC by the date command, after the lane's report)

Two findings stand [CONFIRMED by the lane's reading, file and line named], and both are this lane's class:
(1) `fsi-app/scripts/verify/verification-audit-report.mjs` (`collectHarnessMarkers`, about lines 131 to 252) is a
functional reader of `PENDING-RUN.md` and would now report every family as having no marker; its own test
asserts the old filename. (2) `fsi-app/scripts/turns/research-sweep.mjs:99` names the deleted
`auditStalenessCoupling` in a comment. The write set is extended by exactly these two files and the report's
test:

1. `collectHarnessMarkers` reads the pending directory through F28's exported `listPendingFiles` (import it;
   do not write a second directory reader): `pendingMarker` becomes the count of pending files (rename the
   field if its name says "marker", and update every consumer of that field in the same file and its
   Markdown output line). Its `.test.mjs` asserts the new shape with a temp fixture that has one family with
   a pending file and one without.
2. The comment at `research-sweep.mjs:99` names `auditPendingTreeState` instead; the logic it describes is
   unchanged.
3. Then `node --test` on the report's test and F28's test, the runner (0 violations), one second commit
   (`Lane N3 (Amendment 1): the verification audit report reads the pending directory`),
   `git fetch origin && git merge origin/master` (your branch is already on origin: merge, never rebase or
   force-push), and the gate once more (the second and last run).

The five historical files that quote the marker phrase as evidence stay as they are; the lane's reading of
CLAUDE.md rule 5 is right, and the acceptance grep is amended to exclude `LAST-PROPOSER-PASS.md` and run
artifacts.
