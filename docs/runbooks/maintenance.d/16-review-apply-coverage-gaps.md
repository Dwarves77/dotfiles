## 16. `review-apply-coverage-gaps`

**Purpose**: apply an operator-ruled ratification digest for the coverage-gaps queue
(`coverage_gap_candidates` WHERE `disposition IS NULL`, 91 rows). section 6's digest builder groups these by
`coverage_class` (migration 214's evidence hierarchy) × `estimated_priority` (the two fields the recommend
rule reads, so every group has a rule decision; jurisdiction and transport mode are reported as evidence)
and recommends `kept`/`declined`/`parked`/`skip`.

**Upstream**: `fsi-app/scripts/review/apply-coverage-gaps.mjs`'s own `main({rulingPath, apply})`, called
unmodified by `fsi-app/scripts/maintenance/review-apply-coverage-gaps.mjs`. `kept` →
`disposition='kept'` alone. `declined`/`parked` → `disposition` set **and** a uniform `surface_test`
JSON (`{regulations, operations, market_intel, research, community}`, each `{verdict, reason}`) attached
across all five keys - migration 273's `coverage_gap_candidates_surface_test_required_check` requires one
for any non-null, non-`'kept'` disposition; this queue's gaps are not surface-specific (an instrument's
absence isn't scoped to one surface), so the group's own rule rationale is recorded uniformly. On the rule
path the rationale is built from the group's class and priority (`ruleRationale`), e.g. "coverage_class
MISSING, estimated_priority LOW: pending a different review lane or a later priority wave, parked".

**Ruling**: decided by rule (lane G6-GATES, 2026-10-05; operator ruling: no human gates).
`recommendGapDisposition` decides each (class, priority) group: `HAVE_QUARANTINED` is `declined`,
`AMBIGUOUS_ARCHIVED` is `parked`, `MISSING` at `CRITICAL`/`HIGH` is `kept`, otherwise `parked`. A group with
an unrecognised `coverage_class` is RESIDUE (decision `skip`, no mutation), recorded under
`summary.residue["unrecognised-coverage-class"]`.

**Dispatch**: `arg` is OPTIONAL. Blank: the rule path runs over the live rows, no ruling file needed; the
summary carries `decisions` and `residue` counts (groups and rows). An `arg` naming a committed ruling file
(resolved the same way as section 13, e.g. `arg: docs/ratifications/2026-09/coverage-gaps.ruling.json`)
still applies that file, the lane-verdict path. `mode=dry` reports the plan; writes nothing. `mode=apply`
writes through `guardedUpdateByIds` (rule 015).

**Artifact / read back**: `summary.json`'s `plan` (dry) / `applied` (apply, summed across groups) plus
`read_back` - every row named in the ruling, re-read for `disposition`. Confirm against `SELECT id,
disposition FROM coverage_gap_candidates WHERE id = ANY(<ruling row_ids>)`.

**Registration**: not added to the enforced JSON allowlist - `coverage_gap_candidates` is not a
harness/flywheel shared-8 table (same basis as section 13).

---

