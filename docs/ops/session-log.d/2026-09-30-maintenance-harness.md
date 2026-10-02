## 2026-09-30, lane maintenance-harness

**Accomplished**

- `fsi-app/scripts/lib/table-primary-keys.mjs` (new): committed `TABLE_PRIMARY_KEY` map, derived from a
  live `information_schema` query, closing the `readAll()` default-`orderBy` bug class at its source
  (three live incidents: `entity_refs`, `item_gate_a_state` PR #812, `harness_runs` PR #819).
- `fsi-app/scripts/lib/db.mjs`: `readAll()` now resolves `orderBy` from `TABLE_PRIMARY_KEY` when not
  given explicitly, and throws loudly for any unmapped table instead of silently defaulting to `"id"`.
- `fsi-app/scripts/verify/pagination-order-key-audit.test.mjs`: extended to audit bare `readAll()` calls
  (not just `readAllByIds`) against the same committed schema snapshot; new goldens for
  `item_gate_a_state`, `harness_runs`, and an unresolved-VIEW case. Full-tree scan: zero violations,
  every existing bare `readAll()` call site already targets a mapped table.
- `fsi-app/scripts/verify/lib/fixtures/duplicate-table-schema-snapshot.json`: refreshed from a live
  schema read (1557 columns, 119 table-comment entries; `harness_runs` now present).
- `.github/workflows/maintenance.yml`: the "maintenance" family's artifact-landing step no longer
  checks out a branch, commits, rebases onto `origin/master`, or pushes -- it calls
  `deliver-artifact-branch.sh` directly (single-label call, matching the post-#824
  `propagation-drain.yml`/`source-sweep.yml` convention), landing straight into `harness_runs`. Rebased
  onto #824 (deliver-artifact-branch.sh rewrite, no git history needed) and #835 (renumber-at-land-time
  fix) as master advanced twice during this lane; both rebases were clean except for one conflict on
  `deliver-artifact-branch.sh` itself, resolved by taking master's version (my own header-comment edit
  was superseded by master's full rewrite).
- `fsi-app/.discipline/governance/skill-acks/2026-09-30-maintenance-harness.md`: acknowledges a
  `remediation-discipline` citation-wording change in `pagination-order-key-audit.test.mjs` (`SKILL:` ->
  `GOVERNING SKILL:`) that the range-based skill-contract-map drift check flagged.

**Verification**

- `bash .discipline/run-test-suite.sh`: green (6235/6238 pass + 2046/2050 pass across the two groups, 0
  fail, skips pre-existing and unrelated).
- Touched files run individually with `SUPABASE_*` unset (CI's env): `db.test.mjs`,
  `pagination-order-key-audit.test.mjs`, `skill-drift-gate.test.mjs` -- 52/52 pass.
- `node .discipline/governance/skill-contract-map.mjs`-equivalent `checkDrift()`: clean (`ok: true`)
  after the skill-ack addition.

**Decisions / findings not acted on this round**

- The `nextRunNumberFromHarnessRuns`-vs-local-filesystem-scan run-numbering class bug I flagged mid-lane
  (the "maintenance" family's own `write-run-artifact.mjs` still used the old git-directory-scanning
  `claimRunId`, which would have collided once nothing was ever committed post-#824) was independently
  found and fixed at the chokepoint by PR #835 (`record-harness-run.mjs` renumbers at land time against
  `harness_runs`' own max) before I acted on it. No further action needed from this lane.

**Blockers**: none. **Next steps**: none pending for this lane; PR opens against the rebased HEAD.
