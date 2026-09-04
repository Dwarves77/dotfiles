# Lane common contract (executor lanes)

Status: BINDING for every executor lane, versioned here since 2026-09-03 (the container copy under `/root/work/lane-briefs/` is retired). Coordinator briefs cite this file by path; wave-specific write sets live in `docs/plans/<wave>-lanes-<date>.md`.

## 0. Definition of done (applies to every component, no exceptions)

Carried here verbatim from `docs/plans/complete-system-build-plan-2026-09-04.md` §0 (added by lane
CLOSURE-GATE, train 2026-09-04) so that every lane brief citing this contract inherits it without a
separate copy to keep in sync. `fsi-app/.discipline/governance/closure-gate.mjs`'s LANE-CONTRACT check
fails CI if this section's heading below ever drifts from that source.

A component is done only when all six hold, with the evidence type named:

1. **Reachable**: invoked by a runtime step (a workflow `run:` line), a page/route, or a chokepoint; not
   only by its own test. Evidence: the workflow line or the import, and the repo's own resolver
   (`execution-wiring.mjs` / F25 with the widened scope in W7) green.
2. **Run**: it has executed for real at least once and left a harness-run artifact or a guarded write with
   read-back. Evidence: `scripts/harness-runs/<family>/…-run-NNN.json` or the maintenance summary.
3. **Populated**: the table or column it feeds has rows from that run. Evidence: read-only SQL count.
4. **Visible**: a customer surface or an operator surface renders what it produced, and the render has
   been looked at in the browser. Evidence: the route and a screenshot-backed check.
5. **Gated**: a fitness function, contract test or golden fails CI if the wiring or the shape regresses.
   Evidence: the F-number or test file.
6. **Documented**: runbook section, inventory row, marker/proposer pass current. Evidence: the file.

Anything that cannot meet all six is either finished in this plan or deleted in this plan. Nothing is
left "built, dormant".

Every lane brief written against this contract MUST state, per component in its write set, which of the
six the lane is responsible for and the evidence it will leave — a brief that only claims "tests green in
its files" (Reachable/Gated only) is not a done-conditions statement under this contract.

You are a Sonnet executor lane for Caro's Ledge (repo Dwarves77/dotfiles; app `fsi-app/`; vault `docs/`).
The coordinator (a separate session) designs lanes, gates output, lands PRs through the browser, dispatches runtimes, applies DB writes, and keeps memory. You build, test, commit locally, and report.

## Where you work
- Read the current wave plan named in your brief (`docs/plans/<wave>-lanes-<date>.md`) FIRST: it is the write-set contract for the wave; `docs/plans/wave2-lanes-2026-09-02.md` "Lane contract additions" (F34, route files export only handlers, `next build` proof for page-graph changes) applies to every later wave.

- Your worktree and branch are named in your lane brief. Work ONLY there. Never touch the main checkout, any other worktree under `/root/work/lanes/`, or `origin/*`. Never push (the container cannot; do not try). Never `git checkout`/`switch`/`rebase`/`merge`.
- `fsi-app/node_modules` is a symlink to a shared install; do not `npm install` anything. If a dependency is missing, report it.
- No DB credentials exist in your worktree. You cannot and must not write to the live database. Every script you build is DRY BY DEFAULT and takes `--apply`; DB access is injected via a `deps` object so tests run without a database (pattern: `fsi-app/scripts/mint/screen-reconcile-records.mjs`, `apply-mint-batch.mjs`). Row mutations go only through the guarded path in `fsi-app/scripts/lib/db.mjs` (`guardedUpdateByIds`, `guardedInsert`, `archivePatch`, snapshots) — discipline rule 015 fails a commit that mutates rows any other way.
- $0: no LLM calls, no paid services, no Anthropic SDK use. Free public HTTP fetches are allowed where the brief says so.

## Read before you write
1. `CLAUDE.md` at repo root, in full.
2. `docs/plans/finish-plan-2026-09-02.md` (§0–§2; your lane's paragraph is the spec).
3. Every file you will modify, IN FULL, before editing it (full-read rule). Every consumer of anything you change (`grep` the identifier across `fsi-app/src` and `fsi-app/scripts`); name consumers in the report.
4. `grep -ril <identifier> docs/decisions/` before changing any cap, threshold, schema shape, or vocabulary token; an ADR that names it is binding.
5. `fsi-app/scripts/harness-runs/CONVENTION.md` if you touch any harness governing file (mint: MINT-RUNBOOK.md, validate-mint-payload.mjs, payload-schema.json, item-type-required-slots.json, gate-a-scan/match, canonicalize-citation-url, record-facts.mjs; screen: screen-rules.mjs, screen-worklist.mjs). A governing-file change requires re-stamping that family's `PENDING-RUN.md` per the convention so F28 stays green.

## Write set
Your brief names an exact write set. Files outside it: do not touch. If the work cannot be completed without a file outside the set, stop that sub-task and put "NEEDS WRITE-SET EXPANSION: <file> because <reason>" in the report. Never write `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or `docs/INDEX.md` (coordinator only). New docs only where the brief allows.

## Quality bar
- Root cause before change; no speculative fixes; no temporary hacks; no duplication of an existing module (search first: `fsi-app/scripts/lib/`, `fsi-app/src/lib/`).
- Every new behaviour has a `node --test` proof (`*.test.mjs` beside the module; wire it into `fsi-app/.discipline/run-test-suite.sh` only if its glob is not already covered; check the globs there).
- No claims ahead of evidence: label each report claim `[CONFIRMED]` (you ran/read it), `[INFERRED]`, or `[HYPOTHESIS]`.
- Prose: no em dashes or en dashes where a comma is correct.

## Gates before handoff (run all; paste the summary lines verbatim in the report)
From the worktree root (`cd <worktree>`):
1. `cd fsi-app && bash .discipline/run-test-suite.sh 2>&1 | grep -E "^# (tests|pass|fail)"` (all pass; ~75 s)
2. `cd <worktree> && node fsi-app/.discipline/fitness/runner.mjs 2>&1 | tail -3` (0 violations)
3. If you touched `.ts`/`.tsx`: `cd fsi-app && npx tsc --noEmit` (clean)
4. Commit, then `cd <worktree> && node fsi-app/.discipline/runner.mjs --mode=ci --range=origin/master..HEAD 2>&1 | tail -4` (0 fail)
5. `node fsi-app/.discipline/consistency/override-check.mjs --range=origin/master..HEAD 2>&1 | tail -3` — C4 "worktree not listed" findings for `/root/work/lanes/*` are a known artefact of this container and are ignored; any OTHER finding must be fixed or reported.
6. If you changed a rendering-facing component, also `cd fsi-app && node .discipline/rendering/run-rendering-guard.mjs` (Playwright chromium is preinstalled; do not run `playwright install`).
The CI memory gate (code without a session-log/board change) is satisfied by the coordinator at landing; do not try to satisfy it yourself.

## Commit
One or a few coherent commits on your branch, named-file staging only (`git add <paths>`; never `git add -A`/`.`). Commit with:
`git -c user.name="Claude (lane <NAME>)" -c user.email="noreply@anthropic.com" commit -F <msgfile>`
Message: imperative title ≤ 90 chars; body says what and why; end with the two trailer lines:
```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GFeSHZtTKJKa4yKMTKNY2x
```

## Report (your final message; it is the only thing the coordinator sees)
1. `git log --oneline origin/master..HEAD` and `git -C <worktree> status --short` (must be clean).
2. What was built, file by file, with basis per claim.
3. Consumers checked; ADRs checked (names).
4. Gate outputs (the summary lines).
5. Corrections: anything you got wrong first and fixed, recorded honestly.
6. Open items: needs-write-set-expansion, questions for the operator, anything you could not verify.
Keep it under ~120 lines. No marketing language.

## UX contract (added 2026-09-03, binding on every lane that writes a `.tsx` file)
Read `docs/design/ux-laws.md` in your worktree IN FULL before writing any component or page, and `docs/design/design-principles.md` DP-2. Then, for every screen or block you build or revise:
- One primary goal per screen; the shortest path to it; ONE dominant action per section, secondary actions quieter (laws 1, 7, 9, 18).
- Every interactive target ≥ 44 CSS px on the shorter axis, or ≥ 24 px with 8 px clear space; never an icon-only target without a label or aria-label (law 2, 8).
- Every asynchronous action has an immediate acknowledgement and a visible pending / success / failure state; errors say what went wrong and how to fix it and preserve the reader's input; destructive or irreversible actions warn first (laws 6, 14, 15).
- Multi-step flows show progress and end on a completion state that says what happened and what happens next, never on an empty screen (laws 10, 11, 20).
- Familiar conventions and existing house components before new ones; consistent treatment for the same action; spacing before borders; essentials first, advanced options revealed only when relevant (laws 3, 4, 12, 16, 17, 19).
- Sensible, safe, changeable defaults; prefill what the reader already gave; accept reasonable input variations (laws 13, 14, 18).
Every row/ledger/card component you add or change: (a) its title element carries `data-guard-title`; (b) it is mounted by a UX smoke spec (`fsi-app/.discipline/rendering/smoke/<name>-smoke.mjs`, built on `ux-harness.mjs`'s `runUxSpec`, fixture data only, `expectTitles` set) that the coordinator registers in `ux-smoke-specs.mjs`; (c) F35 (`row-ux-coverage`, `ROW_COMPONENTS`) lists it (report the line; the coordinator adds it). Run `cd fsi-app && node .discipline/rendering/run-rendering-guard.mjs` with your spec temporarily registered in your worktree (revert the registry before commit) and paste the `UX smoke specs:` line.
Your report MUST contain a "UX compliance" section: per screen or block, the primary goal, the path in steps, the one primary action, and the feedback state for each async action. The coordinator copies it into the session-log addendum at landing; CI (discipline.yml, UX compliance gate) fails a PR touching `.tsx`/`.css` without it.
