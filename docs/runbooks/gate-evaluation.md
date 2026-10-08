# Gate evaluation runbook

How to reproduce an evaluation of the CI gates from the firing artifacts every discipline run uploads, so
the next evaluation is a query and not a multi-day fact lane over logs (gate plan 2026-10-08, doctrine
point 6). Not dated: a repeatable procedure. It records mechanics only. What to do with a result is
decided elsewhere.

Owner of the upload steps: `.github/workflows/discipline.yml` (lane GATE-4, 2026-10-07). The files are
produced by the rule engine (`fsi-app/.discipline/runner.mjs`) and, for the fitness functions, by the
fitness runner (`fsi-app/.discipline/fitness/runner.mjs`, lane GATE-3).

## What each run uploads

Every `Discipline engine` workflow run, pass or fail, uploads up to two artifacts. A job uploads nothing
and does not fail when its file is absent (`if-no-files-found: ignore`).

| Artifact | Uploaded by job | File | Content |
|---|---|---|---|
| `gate-firings-validate-commits` | `validate-commits` (push and pull request) | `rules-ci-firings.log` | First line `# gate-firings event=<event> branch=<branch> sha=<sha>`, then the rule engine's output: a `PASS` line per passing rule (`SKIP` lines are printed only with `--verbose`, which CI does not pass), a `FAIL` line per failing rule followed by its message, source and fix, and a `Summary:` line. A pull request run prints one block per commit in the range, headed `=== Commit <sha>: <subject> ===` |
| `gate-firings-fitness-check` | `fitness-check` (pull request only) | `fitness-firings.json` | A JSON array of firings written by the fitness runner: `gate`, `verdict`, `file`, `line`, `evidence` (200 characters), per the GATE-3 brief |

Two facts that shape every query:

- One artifact per job, not one `gate-firings` artifact: `actions/upload-artifact@v4` refuses a second
  upload under the same name inside one run, and the two files come from two different runner machines.
  Both names share the prefix `gate-firings-`, so one `--pattern` selects both.
- A push to master runs only `validate-commits` and `consistency-backstop`. The fitness artifact therefore
  exists for pull request runs only; a push run carries the rules log alone.
- Retention is 7 days (`retention-days: 7`, the ceiling fitness function F68 enforces). A run older than 7
  days has no artifact to download. The window of any query is the last 7 days of runs unless the files
  were downloaded and kept earlier.

The `verdict` values and the exact field set of `fitness-firings.json` are fixed by the fitness runner,
not by the workflow. Open one real file from a recent pull request run before relying on a filter below.

## Prerequisites

- `gh` authenticated against the repository (`gh auth status`) and `jq`.
- Work in a scratch directory outside the repository (artifacts are regenerable machine evidence,
  `CLAUDE.md` rule 5).

## Step 1: list the runs in a date range

```
gh run list --workflow discipline.yml --created ">=2026-10-08" --limit 300 \
  --json databaseId,event,headBranch,conclusion,createdAt > runs.json
```

`event` is `pull_request` or `push`; `conclusion` is `success`, `failure` or `cancelled`. A range bound
`--created "2026-10-08..2026-10-14"` works too.

## Step 2: download the firing artifacts for those runs

```
jq -r '.[].databaseId' runs.json | while read -r id; do
  gh run download "$id" --pattern 'gate-firings-*' --dir "firings/$id" 2>/dev/null || true
done
```

Each run lands in `firings/<run id>/gate-firings-<job>/`. A run whose artifacts expired or that never
uploaded leaves no directory; `|| true` keeps the loop going.

## Step 3: one line per question

Fitness functions, firings per gate across the range:

```
jq -r '.[] | .gate' firings/*/gate-firings-fitness-check/fitness-firings.json | sort | uniq -c | sort -rn
```

Fitness functions, every firing of one gate with its evidence:

```
jq -r --arg g F51 '.[] | select(.gate == $g) | [.verdict, .file, .line, .evidence] | @tsv' firings/*/gate-firings-fitness-check/fitness-firings.json
```

Commit rules, firings per rule across the range:

```
grep -h -E '^ +FAIL +\[' firings/*/gate-firings-validate-commits/rules-ci-firings.log | sort | uniq -c | sort -rn
```

Commit rules, every firing of one rule with the run it came from:

```
grep -H -A1 -E '^ +FAIL +\[022\]' firings/*/gate-firings-validate-commits/rules-ci-firings.log
```

Which branch and event a firing belongs to: the directory name is the run id, which keys into
`runs.json` (`jq -r --arg id 123456 '.[] | select(.databaseId == ($id|tonumber)) | [.event, .headBranch, .conclusion] | @tsv' runs.json`);
the first line of each rules log carries the same event, branch and commit.

Runs that fired nothing: a run directory with a rules log and no `FAIL` line, and a fitness file that is an
empty array, is a run where those gates passed. A run with no directory has no data, which is not the same
thing.

## What the artifacts do not carry

- Local firings (pre-commit, commit-msg, pre-push, the PreToolUse gate). They are not CI and are not
  uploaded.
- The classification of a firing as a true positive or not. The artifact gives the gate, the place and the
  evidence text; whether the firing caught a real defect is read from the pull request the run belonged to
  (`gh pr view <headBranch>` or the run's own page), as the 2026-10-08 evaluation did.
- Per-step timings. They come from `gh run view <id> --json jobs`, where each job lists its steps with
  `startedAt` and `completedAt`.
