# Runbook: Train assembly (W1.6)

Written 2026-09-05, lane ASSEMBLY (`docs/plans/complete-system-build-plan-2026-09-04.md` §W1.6: "the
train assembly (fold artifact branches, proposer pass, land) becomes one scripted step the coordinator
runs per train"). Governs `fsi-app/scripts/lib/assemble-train.mjs`.

## Why this exists

Six of the seventeen workflows (`population-turn.yml`, `source-sweep.yml`, `propagation-drain.yml`,
`corpus-turn.yml`, `change-detection.yml`, `ledger-consume.yml`) end every dispatch by pushing an
"artifact branch" (`<prefix>/<github-run-id>`) through `scripts/turns/deliver-artifact-branch.sh`, then
trying `gh pr create`. This repository refuses Actions-created PRs (a Settings toggle), so the fallback
always fires: the branch is pushed and recorded on one tracking issue, never merged by the workflow
itself. `docs/audits/wiring-audit-2026-09-04/A1-runtimes.md` §6 counted **24 such branches stranded on
`origin`, unmerged**, on 2026-09-04. Landing them was, until this lane, a branch-by-branch hand procedure
(fetch the branch, cherry-pick or copy its files, land via the browser transport, repeat) — exactly the
"coordinator, after landing" busywork `complete-system-build-plan-2026-09-04.md`'s own root-cause section
names as the reason components got marked done at their write set and never finished. This script is the
one-shot replacement.

**This container cannot run this procedure for real.** It has no network egress to `origin` and no push
credentials (`docs/dispatches/lane-common-contract.md`: "Never push (the container cannot; do not try)").
Every function in `assemble-train.mjs` is proven against a disposable local git fixture
(`fsi-app/scripts/lib/assemble-train.test.mjs` — a real bare "origin" + working clone per test, real `git`
subprocess calls, no mocking) — see that file for the fixture-repo proof. **The coordinator runs this for
real** from the Codespace the browser-transport procedure already uses (the one with `origin` fetch/push
access), per the dispatch below.

## What it does, in order

1. **Fold.** `foldArtifactBranches(repoRoot, trainBranch)` — with the train branch checked out, lists
   every remote branch matching a known artifact-branch prefix (`population/`, `source-sweep/`,
   `propagation/`, `turn/` [corpus-turn], `ledger-consume/`, `change-detection/` — `producers.yml` and
   `maintenance.yml` write straight through the guarded Supabase path with no branch/PR step, by
   construction, and are deliberately absent from this list), sorted ascending by the numeric run id (the
   order the workflows actually dispatched in). For each branch, it compares FILE CONTENT (blob hashes)
   against the train branch, never ancestry — A1 §6's own finding is that a cherry-pick gives a branch's
   content a NEW commit SHA, so `git merge-base --is-ancestor` cannot tell "already landed" from
   "stranded" once anything has been cherry-picked even once. A branch whose files are not yet
   byte-identical on the train branch gets its own commit(s) cherry-picked (`git cherry-pick -x`, so the
   original run id stays traceable in the landed commit's trailer); a conflict aborts cleanly
   (`cherry-pick --abort`) and is reported, never left as a dirty tree, and does not block the remaining
   branches.
2. **Propose.** `findFamiliesNeedingProposerPass(fsiAppRoot)` reuses F28's OWN rule-(d) comparator
   (`auditProposerAttestation`, imported from `.discipline/fitness/functions/F28-harness-run-integrity.mjs`
   — never re-implemented) to find every harness family whose `LAST-PROPOSER-PASS.md` no longer names its
   latest artifact now that folding landed new ones. `writeProposerBrief()` writes that family's Haiku
   lane brief (per `PROPOSER-RUNBOOK.md` §1-2) to `docs/dispatches/proposer-brief-<family>-<train>.md` —
   the coordinator dispatches a Haiku lane against that brief; **this script never calls a model itself**.
3. **Ledger.** `deriveLedgerRowsForBranch()` reads each folded branch's own harness-run artifact JSON
   (from the branch ref's git tree, not the working copy) and derives a `docs/ops/dispatch-ledger.jsonl`
   row in that file's own live schema (`date`/`workflow`/`step`/`mode`/`run_id`/`outcome`/`note`).
   `appendDispatchLedgerRows()` appends them. Every derived row's `note` is prefixed "assemble-train
   derived ... coordinator: verify and edit this note" — per this workstream's own brief, **the coordinator
   edits the note**; this step only saves the coordinator re-deriving the mechanical parts (date, mode,
   run id, a metric headline) by hand for two dozen branches.
4. **Gate + bundle.** `runGateSet(repoRoot)` runs this repo's own standing gate set (the discipline
   suite, the fitness runner, the closure gate, the override-check) against the assembled tree.
   `bundleCommand(trainBranch)` prints the exact `git bundle create ... origin/master..<trainBranch>`
   invocation for the browser-transport procedure's own first step (`docs/ops/session-log.md`'s repeated
   "land via the browser path: bundle → web upload → Codespace → PR → squash-merge").
5. **Prune (after landing only).** Once the train has actually landed on `origin/master`,
   `classifyBranches(repoRoot, 'origin/master')` re-runs the same content comparison against the new
   `master` tip: every branch that folded cleanly is now `dead` (its content is on `master`, whatever
   commit landed it — the PR merge, not necessarily this script's own cherry-pick, since a human may have
   also merged the assembled train branch's PR by squash). `pruneDeadBranches(..., {execute:true})` (only
   the coordinator, from a checkout that can push, runs this with `execute:true` — this container's own
   dry run always reports `ran:false`) runs `git push origin --delete <branch>` for each. Any branch
   still `live` (not yet folded) that predates the MOST RECENT train already landed —
   `findStaleUnfoldedBranches()` — is printed as a named gap: it has survived one full train cycle
   unfolded, which is exactly the plan's own W1.6 done-condition ("no artifact branch older than one train
   on origin") failing, and needs the coordinator's attention before the NEXT train assembles.

## Dispatch (the coordinator's exact procedure, from the Codespace)

```sh
cd <codespace checkout>            # has `origin` fetch+push access; this container does not
git fetch origin
git checkout -b train/waveNN-<date> origin/master   # cut the train branch fresh from master's current tip
npm --prefix fsi-app run assemble-train -- --train train/waveNN-<date> --all
#   --all = --fold --propose --ledger --gates --bundle, in that order (see "What it does" above)
```

Read the fold/propose/ledger step's stdout — it names every branch folded, every conflict (resolve by
hand: `git cherry-pick <commit>` again with the conflict markers, or drop that one branch's fold and note
it in the train's session-log addendum), and every proposer brief written (dispatch the named Haiku
lane(s) against each, then land `LAST-PROPOSER-PASS.md` in the same train). If every gate in the `--gates`
step prints `PASS`, run the printed `git bundle create ...` command and continue the existing
bundle → web upload → Codespace → PR → squash-merge procedure with the assembled branch.

**After the train lands** (the PR is merged and `origin/master` carries the new tip):

```sh
git fetch origin
npm --prefix fsi-app run assemble-train -- --train train/waveNN-<date> --prune
```

This deletes every branch whose content is now confirmed on `origin/master` and prints any branch that is
still not folded and already older than the train before this one — an operator/coordinator ruling item,
not a silent carry-forward.

## Evidence this step leaves

- **Reachable**: `fsi-app/package.json`'s `scripts.assemble-train` entry is a dispatch root F25
  (module-liveness, widened to `scripts/**` per plan §W7.1) already recognizes as reachable-by-convention
  (`findDispatchRoots`'s "Source 2: package.json scripts" — the same shape `perf:bundles` already uses),
  so `scripts/lib/assemble-train.mjs` needs no allowlist entry.
- **Run**: this container's own dry proof is `node --test fsi-app/scripts/lib/assemble-train.test.mjs`
  (11 fixture-repo tests, real `git` subprocess calls against a disposable bare+working repo pair, no
  mocking) — see that file. The FIRST REAL run is the coordinator's own next train assembly; append its
  outcome (branches folded, conflicts, briefs written) to this runbook's own dispatch log below once run.
- **Gated**: the fixture test itself, wired into `fsi-app/.discipline/run-test-suite.sh`'s named
  `scripts/lib` list (that list is NOT a directory glob despite one stale comment in the file claiming
  otherwise — F23's ORPHANED-PROOF ratchet is the backstop if a future edit drops a test off the list
  silently).
- **Documented**: this file. `docs/INDEX.md` needs a line for it — lane ASSEMBLY's write set excludes
  `docs/INDEX.md`; the coordinator adds the line at landing (same treatment every lane brief gives that
  file).

## Open question for the operator (proposed, not decided here)

**Does a family with N artifacts folded in one train need N proposer passes, or one pass naming the
latest?** `PROPOSER-RUNBOOK.md` §1's precondition reads "before a family's NEXT batch runs" (singular,
one pass per dispatch); F28 rule (d) only checks that `LAST-PROPOSER-PASS.md` names the LATEST artifact,
which is silent on whether every artifact folded since the previous pass needed its own hypothesis-or-
attestation, or whether one pass reading the whole backlog (all N) satisfies the rule once it names the
last one. In practice a train can fold several same-family artifacts at once (e.g. two `source-sweep`
runs dispatched days apart, both still unfolded when the train assembles) — this script's
`findFamiliesNeedingProposerPass()` currently treats that as ONE gap (one brief, reading all of the
family's unread history, naming the latest) rather than N gaps, which is the runbook's own §4 "worked
examples" precedent (one pass reads a run of several retrofitted artifacts at once) but is not stated as
a rule anywhere. **Proposed ADR draft** (not adopted — this is a lane's proposal, per the operator's
standing instruction that a session may not change a binding rule unilaterally):

> **ADR-XXX: One proposer pass per fold batch, not per artifact.** A family that accumulates multiple
> artifacts between train assemblies needs exactly one proposer pass at the next assembly, reading every
> artifact landed since the previous pass (not only the newest), and its `LAST-PROPOSER-PASS.md` names
> the latest verbatim (satisfying F28 rule (d) unchanged). Rationale: PROPOSER-RUNBOOK.md's own
> ablation-driven design values reading the FULL trace history over reading it n times; a pass-per-
> artifact would either re-read the same backlog N times (wasteful, no new information between them) or
> silently skip straight to the newest (exactly the "scores-plus-summary" failure mode the runbook's own
> arXiv citation warns against). Supersedes nothing; clarifies PROPOSER-RUNBOOK.md §1's "before the
> family's next run" for the batched-fold case §1 did not originally anticipate.

## Dispatch log

(none yet — first real dispatch is the coordinator's, against the next train this lane's PR lands into.
Append each dispatch here: date, train branch, branches folded/conflicted, briefs written, prune result.)
