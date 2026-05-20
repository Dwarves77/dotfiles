# Discipline Engine (RaC: Rules as Code)

Executable specifications for the 11 binding rules from `fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md`. Built per Sprint Foundation dispatch 2026-05-20.

## Layout

```
fsi-app/.discipline/
  README.md              this file
  manifest.mjs           rule registry: imports every rule module
  runner.mjs             engine: builds context, applies triggers, runs checks, prints results
  lib/
    result.mjs           PASS/FAIL/SKIP result shape
    context.mjs          CheckContext: commit message, staged files, branch, computed flags
    predicates.mjs       shared check helpers (substantial-dispatch, dispatch-type detection, message-line lookup)
    predicates.test.mjs  unit tests for predicates
  rules/
    NNN-name.mjs         one rule module per binding rule (NNN = 001..011)
    NNN-name.test.mjs    co-located unit tests
```

## Rule module contract (for Wave 1 agents)

Every rule module exports a single `rule` object with this exact shape:

```js
// fsi-app/.discipline/rules/NNN-name.mjs
import { isSubstantialDispatch, isApplicableDispatchType, commitMessageHasLine } from '../lib/predicates.mjs';
import { pass, fail, skip } from '../lib/result.mjs';

export const rule = {
  id: 'NNN',                    // matches frontmatter id, 3-digit zero-padded
  name: 'Human readable name',  // short, used in failure output
  description: 'One-line summary, used in --list and docs',
  ruleSource: 'sprint-followups-discipline § <section name>',

  // Returns true if this rule applies to the proposed commit.
  // SKIP if trigger returns false; no check is run.
  trigger(ctx) {
    return isSubstantialDispatch(ctx) && isApplicableDispatchType(ctx);
  },

  // Returns a CheckResult: pass(), fail({ message, remediation }), or skip(reason).
  // Runs only if trigger returned true.
  check(ctx) {
    if (!commitMessageHasLine(ctx, 'Loop-closure:')) {
      return fail({
        message: 'Commit body missing required line beginning with "Loop-closure:"',
        remediation: 'Add a line like: Loop-closure: OBS-N COVER; OBS-M DEFER; DP-1 PASS',
      });
    }
    return pass();
  },
};
```

## Wave 1 agent constraints (DO NOT TOUCH)

If you are a Wave 1 rule-conversion agent, your worktree allowlist is:

- `fsi-app/.discipline/rules/NNN-name.mjs` (your 3 rule files)
- `fsi-app/.discipline/rules/NNN-name.test.mjs` (your 3 test files)

You may NOT touch any of:

- `fsi-app/.discipline/manifest.mjs` (main session integrates in Wave 2)
- `fsi-app/.discipline/lib/*.mjs` (predicates are stable; surface gaps in your dispatch report)
- `fsi-app/.discipline/runner.mjs`
- `fsi-app/package.json`
- Other agents' rule files

If you need a new predicate that isn't in `lib/predicates.mjs`, do NOT add it. Surface the need in your dispatch report; main session adds it in Wave 2.

## CheckContext shape

```js
{
  // Commit
  commitMessage: string,         // full message (subject + blank line + body)
  commitSubject: string,         // first line
  commitBody: string,            // body after blank line (may be '')
  isMergeCommit: boolean,        // has 2+ parents
  isRevertCommit: boolean,       // subject starts with 'Revert '

  // Files
  stagedFiles: [                 // files staged for commit
    { path: string, status: 'A'|'M'|'D'|'R', additions: number, deletions: number }
  ],
  totalFilesChanged: number,
  totalAdditions: number,
  totalDeletions: number,

  // Branch
  branchName: string | null,     // current branch, or null if detached HEAD
  isOnMaster: boolean,           // branch === 'master' || branch === 'main'

  // Helpers
  filesMatching(pattern): array,       // glob match against staged files (uses simple substring + suffix matching)
  hasFileMatching(pattern): boolean,
}
```

## Result shape

```js
// from lib/result.mjs
pass()                                         // { status: 'PASS' }
fail({ message, remediation })                 // { status: 'FAIL', message, remediation }
skip(reason)                                   // { status: 'SKIP', reason }
```

## Running the engine

```bash
# Validate the PROPOSED commit (commit-msg hook mode)
node fsi-app/.discipline/runner.mjs --mode=commit-msg --message-file=.git/COMMIT_EDITMSG

# Validate an EXISTING commit (CI mode)
node fsi-app/.discipline/runner.mjs --mode=ci --commit=HEAD

# Validate a range of commits (CI for PR)
node fsi-app/.discipline/runner.mjs --mode=ci --range=origin/master..HEAD

# List all rules
node fsi-app/.discipline/runner.mjs --list

# Run on a fixture (for rule development)
node fsi-app/.discipline/runner.mjs --mode=fixture --message-file=<path> --files-file=<path>
```

Exit codes:

- `0` = all applicable rules PASS or SKIP
- `1` = at least one rule FAIL
- `2` = engine error (cannot build context, missing rule module, etc.)

## Test commands

```bash
# All discipline tests
node --test fsi-app/.discipline/**/*.test.mjs

# Single rule
node --test fsi-app/.discipline/rules/008-dispatch-artifact-commit-summary.test.mjs

# Predicates only
node --test fsi-app/.discipline/lib/predicates.test.mjs
```

## Predicate library inventory (Wave 0)

Available in `lib/predicates.mjs`:

| Predicate | Returns | Use |
|---|---|---|
| `commitMessageHasLine(ctx, prefix)` | boolean | true if any line in body starts with `prefix` |
| `commitMessageMatches(ctx, regex)` | boolean | true if full message matches regex |
| `commitSubjectMatches(ctx, regex)` | boolean | true if subject line matches regex |
| `filesMatching(ctx, pattern)` | array | filter staged files by simple pattern |
| `hasFileMatching(ctx, pattern)` | boolean | shortcut for `filesMatching(...).length > 0` |
| `isSubstantialDispatch(ctx)` | boolean | composite: >5 files OR migration OR SKILL.md OR route OR vercel.json OR OBS entry |
| `isApplicableDispatchType(ctx)` | boolean | true unless investigation/hotfix/research/conversation/merge/revert |
| `isInvestigationOnly(ctx)` | boolean | subject matches /^(audit|investigation|discovery|explore):/i |
| `isHotfix(ctx)` | boolean | subject matches /^hotfix:/i with ≤2 files |
| `isResearchOnly(ctx)` | boolean | subject matches /^research:/i |
| `isConversationOnly(ctx)` | boolean | subject matches /^(docs|conversation|status):/i with no code changes |
| `touchedInventorySurfaces(ctx)` | array | list of inventory types the commit touched (routes, migrations, etc.) |

If your rule needs something else, surface in dispatch report. Wave 2 adds it.

## Wave 0 deliverables

- Engine + predicates + result module (this commit)
- 2 example rules:
  - `008-dispatch-artifact-commit-summary` (easy: pure message-pattern check)
  - `011-inventory-artifact-emission` (hard: composite of message-pattern + file-pattern coverage)
- Manifest registers both
- Tests pass: `node --test fsi-app/.discipline/**/*.test.mjs`

Wave 1 fans out the remaining 9 rules across 3 agents. Wave 2 integrates. Wave 3 installs hooks + CI workflow.
