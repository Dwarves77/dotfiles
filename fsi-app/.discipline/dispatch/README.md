# Dispatch Lifecycle Tracking

Per-session dispatch identifiers persisted via git commit trailers so that audit can answer:

- For dispatch UUID X, what commits belong to it?
- What skills did those commits claim loaded?
- What files were touched?
- What fitness functions ran?
- What was the outcome (PASS/FAIL/SKIP per rule, per fitness function)?

Built per Sprint Architecture Phase 5.

## Layout

```
fsi-app/.discipline/dispatch/
  README.md             this file
  start.mjs             generates a new dispatch UUID; operator records for the session
  audit.mjs             takes a UUID and reports all commits + claims + outcomes
  start.test.mjs        unit tests
  audit.test.mjs        unit tests
```

Commits in a dispatch include a `Dispatch-UUID: <uuid>` trailer line in the message body. Format:

```
<commit subject>

<commit body>

Dispatch-UUID: 2026-05-20-3f1a8c7b-sprint-architecture
Loop-closure: OBS-N COVER; DP-1 PASS
Inventory-emission: ...
```

UUID format: `<YYYY-MM-DD>-<random-hex-8>-<dispatch-slug>`. The date prefix groups dispatches chronologically; the random hex disambiguates same-day dispatches; the slug is human-readable.

## Lifecycle

A dispatch starts when the operator (or session) decides substantive work has begun. There is no hard trigger; the discipline is operator-driven:

1. Operator runs `node fsi-app/.discipline/dispatch/start.mjs <slug>` to mint a UUID
2. The script prints the UUID to stdout for the operator to record (paste into session notes, dispatch brief, etc.)
3. Every commit during the dispatch includes the UUID in its message body as `Dispatch-UUID: <uuid>`
4. At dispatch end, no explicit action is required; the UUID becomes part of git history

Audit can be run any time after:
```
node fsi-app/.discipline/dispatch/audit.mjs <uuid>
```

## What audit reports

For a given UUID, audit prints:

- Total commits with that UUID trailer
- Commit SHAs + subjects
- Skills attested via `Skill-loaded:` lines, aggregated across commits
- Files touched, aggregated
- Loop-closure outcomes (OBS-N COVER/DEFER/etc.)
- Inventory-emission lines, aggregated
- Override lines (`// fitness-allow:`) introduced
- Whether bypass mechanisms (`--no-verify`) were used (heuristic: commit lacks expected attestation lines that should have been present)

## Optional 13th rule (not landed yet)

A future rule 013 could enforce that substantial dispatch commits include the `Dispatch-UUID:` trailer. For Phase 5 v1, the rule is NOT enforced; it's an operator-discipline pattern. If discipline drift surfaces (commits routinely missing the trailer), promote to a binding rule.

## Audit script invocation examples

```bash
# Audit a specific dispatch
node fsi-app/.discipline/dispatch/audit.mjs 2026-05-20-3f1a8c7b-sprint-architecture

# List all dispatches in the last 30 days
node fsi-app/.discipline/dispatch/audit.mjs --list-recent --days=30

# Aggregate by skill across all dispatches
node fsi-app/.discipline/dispatch/audit.mjs --aggregate-by-skill
```

## Test commands

```bash
node --test fsi-app/.discipline/dispatch/start.test.mjs fsi-app/.discipline/dispatch/audit.test.mjs
```
