## Appendix: `check-vocabulary-drift`, wired via the data-audit lane (lane w9-d5-d7, D7 part 3, 2026-09-12)

Same shape as the entries above: not a `.github/workflows/maintenance.yml` step, a
`run-data-audit-lane.mjs` `AUDITS` entry, HARD (fails the lane on drift), dispatched via
`.github/workflows/data-audit-lane.yml`'s existing nightly/CI-with-secrets run.

- **`check-vocabulary-drift`** (`scripts/verify/check-vocabulary-drift.mjs`, pure diff core at
  `scripts/verify/lib/vocab-drift.mjs`): runs section 46's own query live and compares every constraint's
  allowed set against the tracked `docs/inventories/db-check-constraints.json`. Three outcomes, all
  reported: a constraint present on both sides whose allowed set differs (a migration widened/narrowed a
  vocabulary and nobody re-ran section 46's step); live but absent from tracked (new); tracked but no
  longer live (stale). Read-only, pg-direct (`scripts/lib/pg-conn.mjs`'s shared resolver, same as
  `schema-drift-audit`/`vocab-sync-audit`). Self-skips exit 2 without a direct Postgres connection.
  Remediation on a red: dispatch section 48 (`mode=dry`) to refresh the tracked inventory.

**Not registered in `.discipline/governance/invariants.mjs`** [CONFIRMED, read `execution-wiring.mjs`
and `invariant-coverage.mjs`, 2026-09-12]: an `audit:` token is execution-wired by presence in
`run-data-audit-lane.mjs`'s own `AUDITS` list (its `auditLaneSet()`), not by an `invariants.mjs`
citation; separately, the meta-gate's own "no orphan mechanism" check (#5) only walks the rule/fitness/
consistency manifests, never `scripts/verify/*.mjs` audit files directly. Registering this verifier in
`invariants.mjs` is therefore not required for it to be execution-wired or for the meta-gate to pass, so
no entry was added; add one later only if a future invariant text wants to CITE this verifier as its own
enforcement.

**First dispatch** (coordinator): none needed to add, `data-audit-lane.yml`'s next scheduled/manual run
picks up `check-vocabulary-drift` automatically; confirm the run's own printed summary shows a
`check-vocabulary-drift` line (PASS/FAIL/ERROR, `[hard]`).

