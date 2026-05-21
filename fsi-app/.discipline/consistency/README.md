# Consistency Checks (Reality Scanner / Layer 4)

Whole-repo reality scanner that verifies inventories and cross-references match actual codebase state. Layer 4 of the discipline enforcement architecture per ADR-005.

After this layer lands, inventories aren't just generated; they're asserted truth that the system mechanically verifies.

## Difference from rules / fitness functions

| Layer | What it checks | Direction | Example |
|---|---|---|---|
| Attestation rules (1-13) | Commit message contains required lines | Per-commit | "Loop-closure: ... line present" |
| Content rules (12) | Forbidden patterns in file contents | Per-commit | "No `C:/Users/jason/...` literal" |
| Fitness functions (F1-F9) | Code applies skill principles | Whole-repo per-file scan | "Every admin route uses isPlatformAdmin" |
| **Consistency checks (C1-C10)** | **Inventory claims match codebase reality** | **Whole-repo cross-reference** | **"Every skill listed in skills.md actually exists at the documented path"** |

Fitness functions look at code and ask "does this code follow the rules?" Consistency checks look at documentation + code together and ask "does what we claim match what exists?"

## Layout

```
fsi-app/.discipline/consistency/
  README.md                  this file
  manifest.mjs               C-check registry
  runner.mjs                 runs all checks, reports drift
  runner.test.mjs            integration tests
  lib/
    drift.mjs                drift-record shape + helpers
    inventory-parser.mjs     parses docs/inventories/*.md table rows
  checks/
    C1-skills-reality.mjs           + .test.mjs
    C2-routes-reality.mjs           + .test.mjs
    C3-migrations-reality.mjs       + .test.mjs
    C4-worktrees-reality.mjs        + .test.mjs
    C5-env-vars-reality.mjs         + .test.mjs
    C6-cron-jobs-reality.mjs        + .test.mjs
    C7-decisions-reality.mjs        + .test.mjs
    C8-obs-status-reality.mjs       + .test.mjs
    C9-discipline-manifest-consistency.mjs  + .test.mjs
    C10-cross-skill-reference-integrity.mjs + .test.mjs
```

## C-check module contract

```js
// fsi-app/.discipline/consistency/checks/CN-name.mjs
export const consistencyCheck = {
  id: 'C1',
  name: 'skills.md reality',
  description: 'Each skill listed in docs/inventories/skills.md exists at the documented path with required frontmatter.',
  source: 'Layer 4 dispatch + ADR-005',

  // Returns array of drift objects (empty = passes).
  // Drift shape: { kind, detail, location? }
  run() {
    const drifts = [];
    // ... scan logic ...
    return drifts;
  },
};
```

## Drift shape (lib/drift.mjs)

```js
{
  kind: 'orphan-claim' | 'missing-claim' | 'stale-status' | 'malformed' | ...,
  detail: 'human-readable description',
  location: 'docs/inventories/X.md:line' | 'fsi-app/path:line' (optional),
}
```

## Running

```bash
# Run all C-checks against the codebase
node fsi-app/.discipline/consistency/runner.mjs

# Run a single check
node fsi-app/.discipline/consistency/runner.mjs --check=C1

# List checks
node fsi-app/.discipline/consistency/runner.mjs --list
```

Exit codes:
- `0` = no drift across any check
- `1` = at least one drift record
- `2` = engine error

## 14th binding rule

`fsi-app/.discipline/rules/014-inventory-consistency.mjs`. Trigger: any commit modifying `docs/inventories/*.md` files. Check: full consistency runner must exit 0 on the resulting state. Override: `Consistency-Override: C-N (rationale: <text>; remediation-deadline: YYYY-MM-DD)` trailer per the rule 13 override pattern; logged in audit for operator follow-up.

## Tests

```bash
node --test fsi-app/.discipline/consistency/checks/*.test.mjs fsi-app/.discipline/consistency/runner.test.mjs
```
