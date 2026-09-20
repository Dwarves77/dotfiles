# Lane F52: a workflow file is validated before it reaches GitHub

Coordinator brief, 2026-09-20. Executor: Sonnet (gate logic, one workflow edit). Lane id `f52`. Fitness id **F52** and invariant id **RD-77** are ASSIGNED to this lane by the coordinator; you never pick ids. Read `docs/dispatches/lane-briefs/2026-09-19/brief-common-local.md` first (Amendment 1 wins over its body). Worktree and branch are in your dispatch message; base `origin/master`. FIRST tool call: the Skill tool `fsi-app:environmental-policy-and-innovation`.

## Why

[CONFIRMED 2026-09-20, GitHub run 35533637184] Lane M9d put `${{ runner.temp }}` in a job-level `env:` of `.github/workflows/producers.yml`. The `runner` context exists only inside steps, so GitHub refused the file: the workflow "failed" with zero jobs on the branch push. The lane's locked push gate PASSED and all of PR #756's required checks were green or going green: nothing in pre-push or CI validates workflow files, and the coordinator's runner would have merged a dead workflow. Every hop of the loop IS a workflow file (the loop manifest has eleven), F50 checks their `workflow_run` edges by reading the yml, and a file GitHub refuses has no edges at all. One operator ruling covers it: fix the cause so it never happens again, with a gate proven by attack.

## What lands

1. **F52, always on, no binary needed** (`fsi-app/.discipline/fitness/functions/F52-workflow-file-validity.mjs`, one file, the directory IS the registry; copy the export shape of `F50-loop-wiring.mjs`). Pure core plus a `check()` over every `.github/workflows/*.yml` and `.github/actions/*/action.yml`. Reuse the yml reader F50 already uses (read how F50 parses; do not add a dependency; if F50 uses regex line-reading rather than a parser, extract what you need into ONE shared helper both import rather than a copy, and F45 will tell you if you copied). Checks, each with a message naming file, line and the rule:
   a. the file parses, has `on:` and at least one job with `runs-on` or `uses`;
   b. context availability for `env:` blocks: a workflow-level or job-level `env:` value may reference only `github`, `needs` (job level), `strategy`, `matrix`, `vars`, `secrets`, `inputs`; any `${{ runner.` `${{ env.` `${{ steps.` `${{ job.` there is a violation (the M9d class);
   c. `jobs.<id>.if:` may not reference `steps.` or `runner.`; 
   d. every `needs:` names a job that exists; every `steps.<id>.outputs` reference inside a job names a step `id:` that exists in THAT job;
   e. a `workflow_run` trigger's `workflows:` names exist as some workflow's `name:` in the tree (F50 checks the hops it knows; this checks all of them).
   Keep it to these five: a full linter is item 2's job. Each check has a RED fixture test and a GREEN one (attack form, rule 15), and the M9d line itself is one of the RED fixtures, verbatim.
2. **actionlint in CI, pinned.** In `.github/workflows/discipline.yml`, in the job that runs the fitness functions (read the file; add a step, not a job, unless the job layout forces one): download `actionlint` from its GitHub release at a PINNED version, verify the archive against a sha256 you read from that release's own checksums file and write into the step, run it over `.github/workflows/`. A checksum mismatch or a non-zero exit fails the step. No `|| true`. If the tree has EXISTING findings, do not silence them: list every one in your report, fix the ones that are one-line and unambiguous in a file you may touch (say which), and STOP on the rest so the coordinator decides; the step must end up failing on a new finding, so if findings remain it lands with actionlint's own `-ignore` patterns ONLY for those exact existing messages, each with a dated comment naming the owner lane. Locally: F52 runs `actionlint` too when it is on PATH and says "actionlint not on PATH, skipped locally; CI runs it" when it is not (never a false red, never a silent skip).
3. **RD-77**, one file `fsi-app/.discipline/governance/invariants.d/RD-77.mjs` (copy the shape of RD-74's file): "a workflow file GitHub would refuse never reaches master"; enforcers: `fitness:F52` and the CI step. The invariant-coverage meta-gate must stay green: read `execution-wiring.mjs`'s rules for how an enforcer is proven wired.
4. **Your own change is a workflow edit**: after editing `discipline.yml`, run F52 on it, and re-read your added lines against the context rules by eye. Say so in the report.
5. Docs: a short section in the runbook that documents the fitness functions (find it by grep for `F50` under `docs/runbooks/`); `docs/ops/session-log.d/<date>-f52.md`.

## Out of scope: STOP, do not solve

Fixing any workflow's logic; adding schedules or triggers; any derived registry list; `loop-manifest.mjs`; installing software on this PC.

## Lessons from today's lanes, so you do not repeat them

A new test in a directory `run-test-suite.sh` does not cover is an F23 ORPHANED PROOF (lane T3 is fixing the cause; `fsi-app/.discipline/fitness/functions/` IS covered). A skill-ack file copies the exact heading shape of an existing one. A gate FAIL caused by your change: fix the cause, run once more; a second FAIL on the same step is a STOP.

## Standing constraints, gates, report

Commit trailer exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No em dash, en dash or section sign in new prose. Never `git stash`, `git add -A`, `--no-verify`. Gates: `node --test` on your files plus `F50-loop-wiring.test.mjs`; the fitness runner (expect 46 functions, 0 violations, or STOP with the violations F52 finds on master listed: those are real findings, not yours to silence); the invariant-coverage meta-gate; the override check; then the locked push gate once, last, as one background task. You commit; you do not push. Report and PR body returned as TEXT, findings labelled CONFIRMED, HYPOTHESIS or REFUTED.
