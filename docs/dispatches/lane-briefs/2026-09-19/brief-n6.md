# Lane N6: gate F51 no-shared-append and invariant RD-75 (plan 6.8, the gate that holds the line)

Read first, in this order: `docs/dispatches/lane-briefs/2026-09-18/brief-common-cloud.md` (binds you; the gate
is the repo wrapper `LANE_GATE_SP=<your scratchpad> bash fsi-app/scripts/coordinator/lane-gate-cloud.sh <worktree>`,
run once, last, as one background task), then `docs/plans/complete-system-build-plan-2026-09-04.md` section
6.8 in full (your row is N6; the five checks are specified there), then `docs/dispatches/lane-common-contract.md`,
then the session-log files of lanes N1 to N5 under `docs/ops/session-log.d/` (what each converted).

Lane id: `n6`. Model: Sonnet. Worktree and branch named in your dispatch (cut from a master carrying N0 to
N5). Exactly this brief; anything not covered is a STOP.

## Ids, assigned by the coordinator (you never pick one)

Fitness function **F51** (`F51-no-shared-append.mjs`), invariant **RD-75**
(`invariants.d/RD-75.mjs`), remediation-discipline skill category **48** (heading shape
`### Section 4 - category 48: <one line>` after category 47 in
`fsi-app/.claude/skills/remediation-discipline/SKILL.md`). Registering F51 must need NO edit to any shared
list: the manifest reads the directory (N1), the invariant is its own file (N5), the skill contract needs an
ack file, not a re-pin (N4: add `fsi-app/.discipline/governance/skill-acks/2026-09-19-n6.md` for the skill
file you change). If any of these still needs a hand edit to a shared file, that is a finding: STOP and
report which, with the file and line.

## What you build: F51, five checks, each proven by attack

1. **Converted files stay derived.** A hand-written entry reappearing in `fitness/manifest.mjs` (an
   `import { fitnessFunction as F` line or an array literal of functions), in `governing-files.mjs` or
   `run-artifact.mjs` (a family name literal outside the registry derivation), or in `invariants.mjs` (an
   `id:` entry) is a violation naming the line.
2. **No stored measurement.** In `fitness/functions/*.mjs`, a pattern `_CEILING = <nonzero number>` or a
   hash pin literal (`sha256:[0-9a-f]{16}` or a 64-hex string assigned to a constant) is a violation, with a
   dated allowlist carrying a reason for the constant-zero ceilings only: `F46-external-host-home.mjs`
   `MULTI_HOME_CEILING = 0` and `F47-db-object-reference.mjs` `UNREFERENCED_TABLES_CEILING = 0`,
   `UNREAD_TABLES_CEILING = 0` (a zero ceiling is a strict rule, not a measurement).
3. **Ids unique across entry files.** Across `fitness/functions/F*.mjs`, `invariants.d/*.mjs`,
   `harness-runs/*/family.json`, `supabase/migrations/*.sql` (by number prefix): a duplicated id is a
   violation naming both files.
4. **Coordinator-only files.** With `resolveRange` from `change-range.mjs`: when the current branch name
   starts with `lane/` (read it once through the same git helper) and `gitChangedFiles(range)` contains
   `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, `docs/INDEX.md` or any path under `docs/audits/`, a
   violation naming the file and the contract line. Skipped, with a printed note, when the range is
   unavailable or the branch is not a lane branch.
5. **The hotspot standing number.** Over the last 30 first-parent commits of `origin/master` (via the git
   helper; skipped with a note when unavailable), the files changed by three or more of them, printed with
   their counts as `F51 hotspots (3+ of last 30 merges): N`. Each such file is a violation unless it is an
   entry directory's file (a path under one of the derived directories above), or under
   `docs/ops/session-log.d/`, or in a dated allowlist with a reason. Seed the allowlist from the list the
   coordinator measured on 2026-09-19 (session-log.md 15, the 2026-09-17 system-health audit 5,
   run-artifact.mjs 4, meta-harness PENDING-RUN.md 4, CONVENTION.md 4, INDEX.md 4, governing-files.mjs 3,
   F45 3, the build plan 3, the 2026-09-19 addendum 3, PROGRAM-BOARD 3) ONLY for the files that are
   coordinator-owned by the contract (session-log.md, INDEX.md, PROGRAM-BOARD.md, the plan, the handoff
   addendum, the audit) with the reason "coordinator-only by contract"; the others must fall out of the
   window on their own now that N1 to N5 landed, and if one of them is still a hotspot on your tree, STOP and
   report it rather than allowlisting it.

Register: the function file (self-describing header), its `.test.mjs` with a red test per check (plant the
violation in a temp fixture, see it caught, remove it, see it pass), `invariants.d/RD-75.mjs` citing
`fitness:F51` and the selftest, skill category 48 stating the rule in one paragraph, the skill ack file.

## The acceptance that closes plan 6.8: the replay

In `F51-no-shared-append.test.mjs`, a replay test: a throwaway git repo (temp dir, `--local` identity) seeded
with the derived directories as they are on your tree (copy the real `fitness/functions/`, `invariants.d/`,
`harness-runs/*/family.json` and one `pending/` file, `docs/ops/session-log.d/`, `skill-acks/`). Five branches,
one per lane of the 2026-09-18 set, each doing what that lane's registration required under 6.8: M8 adds a
family descriptor and a pending file; M9b adds a family descriptor and a pending file; M9a adds a fitness
function file, an invariant file and a skill ack; M1 adds a family descriptor and a pending file; W10-A adds a
fitness function file, an invariant file and a skill ack; every branch adds its own session-log.d file.
Merge the five in every one of the 120 orders (or, if a run exceeds 60 seconds, 24 random orders plus the
two lexical extremes, and say so): zero conflicts in every order, and the derived lists on the merged tree
contain every entry exactly once. Print the order count and the elapsed time.

## Write set (exact)

- `fsi-app/.discipline/fitness/functions/F51-no-shared-append.mjs` and `.test.mjs` (new)
- `fsi-app/.discipline/governance/invariants.d/RD-75.mjs` (new)
- `fsi-app/.claude/skills/remediation-discipline/SKILL.md` (category 48 appended) and
  `fsi-app/.discipline/governance/skill-acks/2026-09-19-n6.md` (new)
- `docs/ops/session-log.d/2026-09-19-n6.md` (new; heading `## 2026-09-19, lane N6: <one line>`; ends with
  `### UX compliance (N6)`: Not a UI change; no customer surface touched by this branch.)

## Acceptance (paste the evidence)

- `node --test fsi-app/.discipline/fitness/functions/F51-no-shared-append.test.mjs`: all pass, including the
  replay with its order count and time; each red test shown RED first.
- `node fsi-app/.discipline/fitness/runner.mjs`: F51 listed, 0 violations, the hotspot line printed.
- `node fsi-app/.discipline/governance/skill-contract-map.mjs --check`: OK.
- `git diff --name-only origin/master..HEAD` shows NO shared list file (no manifest, no invariants.mjs, no
  governing-files, no run-artifact, no CONVENTION.md).
- The push gate through the wrapper, once, last.