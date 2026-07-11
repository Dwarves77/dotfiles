# Fitness Functions (Application-Layer Enforcement)

> **STALE-CONTENT NOTICE (2026-07-11, audit CODE-2 F-9).** The F1–F8 list below lags the live set.
> Source of truth = `fsi-app/.discipline/fitness/functions/*.mjs` + `governance/invariants.mjs`. Read
> the directory to know which fitness functions actually run.


Mechanical checks of architectural invariants by scanning code. Complements the 12-rule attestation engine at `fsi-app/.discipline/rules/`. After Sprint Architecture lands, every commit traverses two enforcement layers:

| Layer | What it checks | Engine | Speed |
|---|---|---|---|
| Attestation rules (1-11) | Commit message contains required attestation lines | `runner.mjs` | Fast (~1s) |
| Content rule (12) | Staged code files don't contain forbidden patterns | `runner.mjs` | Fast (~1s) |
| Fitness functions (F1-F8+) | Codebase applies skill principles correctly | `fitness/runner.mjs` | Medium (~5-10s; whole-repo glob + read) |

The split lets each layer evolve independently. Per OBS-59 migration plan, content rule 12 stays in the rules engine for now (single content rule); when content rules grow to 2+, they migrate here too.

## Layout

```
fsi-app/.discipline/fitness/
  README.md                  this file
  manifest.mjs               function registry: imports every function module
  runner.mjs                 fitness runner: enumerates files, runs checks, prints results
  lib/
    glob.mjs                 file enumeration helpers
    result.mjs               PASS/FAIL/VIOLATIONS shape
    file-content.mjs         file reading + caching helpers
  functions/
    F1-sources-tier-columns.mjs            + .test.mjs
    F2-admin-routes-isPlatformAdmin.mjs    + .test.mjs
    F3-src-no-discipline-imports.mjs       + .test.mjs
    F4-intelligence-items-urgency-score.mjs + .test.mjs
    F5-briefs-cite-registered-sources.mjs  + .test.mjs
    F6-migrations-numeric-ordering.mjs     + .test.mjs
    F7-sources-routes-skill-attestation.mjs + .test.mjs
    F8-client-server-tier-boundary.mjs     + .test.mjs
  runner.test.mjs            integration tests
```

## Fitness function module contract

Every function module exports a single `fitnessFunction` object:

```js
// fsi-app/.discipline/fitness/functions/FN-name.mjs
export const fitnessFunction = {
  id: 'F1',                       // F-prefix + number; unique per function
  name: 'sources-tier-columns',   // short slug for failure output
  description: 'One-line summary suitable for --list output.',
  source: 'sprint-architecture OBS-XX or skill section',

  // Returns array of relative file paths this function should scan.
  // Glob-based enumeration via lib/glob.mjs helpers, OR explicit list.
  // Whole-repo by default; functions may scope down per their invariant.
  enumerate() {
    return globFiles(['fsi-app/src/**/*.{ts,tsx,mjs}']);
  },

  // Check a single file. Receives filepath (relative to repo root) and content (string).
  // Returns array of violation objects: { line, message }.
  // Empty array = file passes.
  check(filepath, content) {
    const violations = [];
    // ... scan logic ...
    return violations;
  },
};
```

## Result shape

```js
// from lib/result.mjs
// A violation describes a single failure:
{ line: 42, message: 'human-readable description of what failed' }

// The runner aggregates per file + per function:
{
  function: 'F1',
  file: 'fsi-app/src/lib/foo.ts',
  violations: [{ line, message }, ...]
}
```

## Running

```bash
# Run all fitness functions against the codebase
node fsi-app/.discipline/fitness/runner.mjs

# Run a single function
node fsi-app/.discipline/fitness/runner.mjs --function=F1

# List registered functions
node fsi-app/.discipline/fitness/runner.mjs --list
```

Exit codes:
- `0` = all functions PASS (no violations across any scanned file)
- `1` = at least one violation
- `2` = engine error (missing module, glob failure, etc.)

## Test commands

```bash
# All fitness tests
node --test fsi-app/.discipline/fitness/functions/*.test.mjs fsi-app/.discipline/fitness/runner.test.mjs

# Single function
node --test fsi-app/.discipline/fitness/functions/F2-admin-routes-isPlatformAdmin.test.mjs
```

## Override mechanism

Fitness functions support per-line override via trailing comment:

```ts
const tier = source.tier;  // fitness-allow: F1 (legacy report; deprecated path acceptable)
```

The `fitness-allow: <function-id>` comment on the matching line skips the violation for that function. Reason in parens is required; functions enforce that the parenthetical is non-empty (otherwise overrides are silent escape hatches).

Override usage is detected by `git log --grep="fitness-allow"` for periodic audit. The override exists for transitional and edge cases, not as a routine workaround.

## Wave 1+ agent contract (if you are a parallel agent)

Your allowlist:
- Your assigned function files: `functions/<your-F>-name.mjs` + `functions/<your-F>-name.test.mjs`

You may NOT touch:
- `manifest.mjs` (main session integrates in next wave)
- `lib/*.mjs` (helpers are stable; surface gaps in your report)
- `runner.mjs`
- `README.md`
- Other functions

Read these first:
1. This README
2. `lib/glob.mjs`, `lib/result.mjs`, `lib/file-content.mjs`
3. Example functions F2, F3 for the contract pattern
4. Their tests for the test pattern

Do not run `git` commands or commit. Main session handles integration.

## Integration with CI

The Wave 0 commit adds a new job `fitness-check` to `.github/workflows/discipline.yml`:
- Runs after `validate-commits` and `test-discipline-engine`
- Invokes `node fsi-app/.discipline/fitness/runner.mjs`
- Fails build on any violation
- Output is per-file:line:violation, with function ID and remediation

For local-loop feedback, fitness checks are NOT yet wired into the `commit-msg` hook (would slow commits). A future pre-push hook is the natural extension if local fitness feedback becomes important.
