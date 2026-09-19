# Machine lanes (plan section 6): common contract. Read this first, then your lane brief.

You are one lane of the build plan in `docs/plans/complete-system-build-plan-2026-09-04.md` section 6 (read
sections 0, 1, 5 and 6 of that file in your worktree before touching anything; section 6.1 has your lane's
row). The audit that produced the plan is `docs/audits/stage-audit-2026-09-18/README.md`; your lane's stage
file there has the evidence your row cites.

## The execution rule (operator, 2026-09-18, binding)

You do exactly what your brief says and nothing beyond it. If you meet a problem the brief does not address,
a choice the brief does not make, a failure you cannot explain, or a place where the brief and the code
disagree: STOP. Write the problem in your report (what, where, the evidence, what you had done up to that
point), commit what is consistent, and return. Do not work around it, do not widen scope, do not pick an
answer, do not "fix while you are there". The coordinator solves it and re-dispatches you. Deviation is a
defect of the lane, not initiative. A brief that says "grep for prior art" means you find the existing
home and extend it; building a second copy of something that exists is deviation.

## The repo's own lane contract comes first (added 2026-09-18 after lane W10-A was refused at push)

This brief does not replace `docs/dispatches/lane-common-contract.md`; it sits on top of it. Read that file in
your worktree before anything else. The coordinator wrote this brief without pointing lanes at it, and lane
W10-A's push was refused by the UX compliance gate as a result. Where the two disagree, the repo's contract
wins and you say so in your report.

**If your lane writes or changes any `.tsx` or `.css` under `fsi-app/src`** (every W10 parts lane does), the
contract's "UX contract" section binds you:
- Read `docs/design/ux-laws.md` IN FULL and `docs/design/design-principles.md` DP-2 BEFORE writing a component.
- Every row, ledger or card component you add or change: its title element carries `data-guard-title`, and it
  is mounted by a UX smoke spec under `fsi-app/.discipline/rendering/smoke/<name>-smoke.mjs` (extend the existing
  spec; do not create a second one). F35 and the rendering guard measure rows at 375 px (RD-60).
- Your session-log entry carries a `### UX compliance (<lane id>)` block: per screen or block you changed, the
  primary goal, the path in steps, the one primary action, and the feedback state for each async action. Be
  truthful about scope (a style swapped for an existing part with no change in behaviour, copy or layout is
  said as exactly that). A one-line "n/a" written to satisfy the gate's regex on a real surface change is
  fabrication and is refused by the coordinator. The gate (`.discipline/governance/memory-gate.mjs`) fails the
  push when a surface range has no added "UX compliance" line.

## Shared ids are assigned by the coordinator; you never allocate a shared id (added 2026-09-18)

Three collisions in one day came from briefs that said "take the next free number": invariant RD-72 (lanes L41
and M9a), migration 326 (L39 and M9c), skill category 46 (M9a and W10-A). Parallel lanes branch from the same
master and cannot see each other's claims, so "next free" is the same number for all of them. Therefore: you
never allocate a shared id. That covers an invariant id (RD-nn, EP-nn, SC-nn), a fitness function number (Fnn), a
migration number, a skill category number, an ADR number, and a harness run number for a family another open
lane also writes. Your lane brief gives you the exact ids to use. If your work needs an id the brief did not
assign, STOP and ask the coordinator for one; do not read the file and pick.

## Worktree and rules

- Your worktree and branch are named in your lane brief. Run every command from its `fsi-app/` directory.
  You are its only writer. Never touch another worktree or the main checkout.
- Never: `git stash`, `git add -A`, `--no-verify`, the BARE pre-push hook (use the wrapper below), `git push`, a PR, a workflow dispatch,
  `gh workflow run`, a database write, an LLM or paid API call, a background process, a sub-agent, any file
  under another lane's start list (section 6.1 names them), any edit to `.env*`.
- Database access, when your brief allows it: SELECT only, with `LIMIT` or aggregates, never a large text
  column across the corpus. Helper: `scripts/lib/pg-conn.mjs` (`connectPg()` returns a pg Client or null),
  run with `node --env-file=C:/Users/jason/dotfiles/.worktrees/wt-adr016-ft/fsi-app/.env.local`.
- Prose rules for anything you write (code comments, docs, commit messages, the report): no em dash, no en
  dash, no section sign glyph (write "section 0"); a pre-commit rule refuses them. Every finding carries
  `[CONFIRMED]`, `[HYPOTHESIS]` or `[REFUTED]` (CLAUDE.md rule 14). No user-home paths in code or comments
  (pre-commit rule 012); resolve paths from the repo root.
- Tests: `node --test <file>` for every test file you touch; `npx tsc --noEmit` when you touch a `.ts`/`.tsx`;
  for a fitness function, `node .discipline/fitness/run.mjs` (or the runner named in
  `.discipline/fitness/manifest.mjs`'s header) must report 0 violations on your tree, and your function's
  own `*.test.mjs` must plant a violation and see it caught (attack test, rule 15). Do not run the full
  suite or a build by hand; the push gate below runs them once, under the lock.
- Before you report, run the four ratchet gates the pre-push hook will run, from `fsi-app/`, and paste their
  results verbatim in the report (lane M1's first push was refused by all four after its single-file tests
  passed): `node .discipline/fitness/runner.mjs --function=F45` (duplicate code: at or below the committed
  ceiling; if your change removed duplication, re-seed DOWN with the scratchpad `reseed-f45.mjs` in the same
  commit; never up: an increase means you copied code, extract the shared home), `--function=F39` (no
  `.in()` filter without a visible cap), `node --test .discipline/fitness/functions/F47-db-object-reference.test.mjs`
  (a table you newly read must leave the allowlist), and `node --test .discipline/fitness/functions/F28-harness-run-integrity.test.mjs`
  (if you touched a harness family's governing files, the newest artifact or the PENDING-RUN marker must
  record the final hash: write the artifact or re-pin LAST, after every other edit).
- If you edit any file under `fsi-app/.claude/skills/`, re-pin its content hash in
  `.discipline/governance/skill-contract-map.mjs` (`PINNED_MANIFEST`, with a dated note line, as the file's own
  history shows) and run `node .discipline/governance/skill-contract-map.mjs --check` (OK). Lane M9a's push was
  refused for a missing re-pin.
- **LAST, once, before you report: run the repo's own push gate through the wrapper (operator ruling 2026-09-18).**
  Three lanes reported green on 2026-09-18 and were refused at push (M1 on four ratchets, M9a on a skill pin,
  W10-A on the UX compliance block); the contract's one command catches all of them. After every edit is
  committed and the fast checks above are green:
      bash C:/Users/jason/AppData/Local/Temp/claude/C--Users-jason/fddbeade-7f79-480a-9254-e8fdb3278567/scratchpad/lane-prepush-check.sh <your worktree root>
  It waits for the lock the coordinator's push queue and merge train share (two suites side by side flake each
  other), runs `DISCIPLINE_HOOK_TRAMPOLINE=1 sh fsi-app/.discipline/hooks/pre-push < /dev/null` in your worktree,
  and prints `lane-check: PASS` or `lane-check: FAIL` with the refusing step and the step-log folder.
  HOW TO RUN IT, exactly, because on 2026-09-13 four lanes ran the hook and then sat in "waiting for the gate"
  loops and never reported, and W10-A did the same on 2026-09-18: the suite takes 10 to 40 minutes, longer than
  one tool call may block. Start it ONCE as a single background task, then STOP and wait for its one completion
  notice. Do not poll it, do not tail its log in a loop, do not start a second run while one is alive, do not
  run the bare hook yourself. When it completes, read only the summary it printed.
  On FAIL: fix the CAUSE in your own files and run it once more. Never allowlist, exempt, re-seed upward or
  weaken a gate to pass; a gate you believe is wrong is a STOP, reported with the evidence. After two FAILs on
  the same step, STOP and report rather than cycling. Exit 4 (could not get the lock in time) is reported as
  such; the check is never silently skipped. Paste the wrapper's printed summary into your report.
- Stage explicit paths; one commit per coherent change, subject `Lane <id>: <what landed>`, body with why and
  the evidence, last line exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Session log: write your entry as YOUR OWN NEW FILE `docs/ops/session-log.d/2026-09-18-<lane id, lower case>.md`
  (`## 2026-09-18, W9 lane <id>: <title>`, first person, what landed, evidence per section 0 criterion, what
  you could not do and why; the UX compliance block goes in this same file) in the same commit as the code.
  NEVER edit `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md` or `docs/INDEX.md`: they are coordinator-only
  (repo lane contract), every lane that appended to the shared log on 2026-09-18 went into merge conflict, and
  a conflicting PR gets no CI at all. If your brief creates a new living doc, name it in your report and the
  coordinator adds the INDEX line. Docs: the runbook or README section your brief names.

## Report

When done or stopped, write `C:\Users\jason\AppData\Local\Temp\claude\C--Users-jason\fddbeade-7f79-480a-9254-e8fdb3278567\scratchpad\report-<lane-id>.md`
with: the commits (hash, subject); the six-criteria acceptance from your row, each criterion with the
evidence you can name now and the ones the coordinator must produce (a dispatch, a DDL apply); test and
tsc results verbatim (counts); problems that stopped you, if any, in the form above; nothing else. Reply
with the report path and a three-line summary.

## Amendment 1 (coordinator, 2026-09-19, after plan section 6.8 closed on master `ddcd9a63`). Where this amendment and the text above disagree, this amendment wins.

Plan section 6.8 landed (lanes N0 to N6, T2). These lines of the contract above are RETIRED; doing them is deviation:
- F45 has NO ceiling line and nothing is re-seeded. `reseed-f45.mjs` is deleted; never run it. F45 compares your HEAD with the merge-base; more duplicated lines than the merge-base is a real refusal: extract the shared home.
- F28 has NO `PENDING-RUN.md` marker and nothing is re-pinned. `repin.mjs` is deleted. If your range changes a governing file of a harness family (each family lists its own in `fsi-app/scripts/harness-runs/<family>/family.json`) and adds no new run artifact of that family, add ONE file `fsi-app/scripts/harness-runs/<family>/pending/<date>-<lane id>.md` with two headings, `## Change` and `## Planned run` (copy the shape of any existing file in a `pending/` folder). No hash goes in it.
- Skills have NO `PINNED_MANIFEST` re-pin. `repin-skills.mjs` is deleted. If you change a file under `fsi-app/.claude/skills/`, add `fsi-app/.discipline/governance/skill-acks/<date>-<lane id>.md` naming the skill and the citing files you reviewed.
- Registries are DIRECTORIES, never lists (gate F51 refuses a hand-written entry). A harness family is `fsi-app/scripts/harness-runs/<family>/family.json` (fields: family, registered, registered_by, governing_files, rationale) plus `FAMILY.md` (its description; the per-family text that used to sit in CONVENTION.md lives there now). Never edit `ALLOWED_FAMILIES`, `governing-files.mjs`, the fitness `manifest.mjs`, `invariants.mjs`, the CONVENTION.md table, `run-test-suite.sh` test lists, `discipline.yml` test lists or `docs/inventories/migrations.md`: all are derived. A fitness function is one file `functions/Fnn-*.mjs`; an invariant is one file `governance/invariants.d/<ID>.mjs`; a migration carries its own header comment block.
- A script that needs the env file calls `loadLocalEnvFile()` from `fsi-app/scripts/lib/env-file.mjs`; a bare `process.loadEnvFile` is refused by F48. A test asserting credential-absent behaviour uses that module's `withoutCredentials` helper.
- Your session-log file is `docs/ops/session-log.d/<today from the date command>-<lane id>.md`. F51 fails a `lane/` branch that touches `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md` or `docs/INDEX.md`.
- Run every repo-wide git measurement (`git grep`, `git diff -- <path>`) from the REPO ROOT, never from inside `fsi-app/`; before acting on a zero, search for something known to exist.
- Take every clock time from `date`, never from memory.
- You are a Sonnet or Haiku agent. You do not solve problems the brief does not cover: STOP and report. Tokens are budgeted: read only the files your brief names, run each check once, run the push gate once, last.
