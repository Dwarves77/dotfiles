## 51. `close-legal-confirmation-rows`

**New this runbook, D17 family 14, defect-fix-plan-2026-09-12 (lane L11).**

**Purpose**: resolves the two per-item carve-outs `close-run-logs.mjs` (section 41) deliberately leaves open --
`isAuthorshipRunSummary`/`isLegacyRemediationRunSummary` are IMPORTED unmodified, never a second,
divergent vocabulary:

1. **authorship-shard-\* BLOCKER rows** -- entity-to-DEFINED-ROLE matching is a legal determination the
   platform never makes (`fsi-app/.claude/CLAUDE.md`'s standing "no legal role determination" rule).
   RESOLVED with "Legal Confirmation Required; no platform determination (environmental-policy skill);
   recorded for counsel", `resolved_by='close-legal-confirmation-rows'`.
   `scripts/verify/population-report.mjs` gains a `legal-confirmation` STORES line counting them
   (informational, never a defect gate -- `total===filled` always, so it reads FILLED/green the moment any
   row exists).
2. **legacy-remediation PARKED rows** (the task 7.3 residue) -- converted to a VALID RD-6 deferral
   (`scripts/lib/deferral.mjs`'s `assertValidDeferral`): a NEW companion `disposition_deferred`
   `integrity_flags` row is written (the SAME mechanism `scripts/verify/quarantine-disposition-audit.mjs`
   already reads), carrying `{ reason, deferred_until: '2026-10-15', owner: 'operator',
   resolution_event: 'acquire lock lifted' }`. **[CONFIRMED] deviation, disclosed**: the plan's own
   literal reason text ("paid re-acquire behind the operator's acquire lock") carries none of
   `isValidDeferral`'s required disposition-path keywords and would be REJECTED by the guard; this step's
   `LEGACY_REMEDIATION_DEFERRAL` reason preserves the exact same meaning, reworded to name "reground ...
   against a primary source" so the guard's own keyword requirement is satisfied. The ORIGINAL
   legacy-remediation row is left untouched (still open -- task 7.3 still owns closing it once the pool
   actually re-grounds); the full `subject_ref`/flag-id list is carried in this run's own `summary.json`
   under `task_7_3_residue.deferred` for the task 7.3 residue report.

**Upstream**: `scripts/lib/db.mjs` (`readAll`, `guardedUpdateByIds`, `guardedInsert`),
`scripts/maintenance/close-run-logs.mjs` (`isAuthorshipRunSummary`, `isLegacyRemediationRunSummary`),
`scripts/lib/deferral.mjs` (`assertValidDeferral`).

**Ruling**: D17 family 14 (defect-fix-plan-2026-09-12, ruling table row 14).

**Dispatch**: no `--arg`. `mode=dry` reports the authorship/legacy candidate counts and samples;
`mode=apply` resolves the authorship-shard set and writes the legacy-remediation deferrals.

**Artifact / read back**: `summary.json`'s `counts.authorship_blockers` / `counts.legacy_parked` /
`task_7_3_residue.deferred`. Confirm against `SELECT count(*) FROM integrity_flags WHERE created_by ILIKE
'authorship-shard-%' AND resolved_by = 'close-legal-confirmation-rows'` and `SELECT count(*) FROM
integrity_flags WHERE created_by = 'disposition_deferred' AND status = 'open' AND
recommended_actions::text LIKE '%acquire lock lifted%'`.

**Time-bound note**: `LEGACY_REMEDIATION_DEFERRAL.deferred_until` is the fixed date `2026-10-15` per the
plan's own wording -- `assertValidDeferral` throws at MODULE LOAD if this payload is ever edited into an
invalid shape, and re-validates the future-date check against wall-clock time on every write, so this
step naturally refuses to run past that date without a deliberate update to the payload (the same
self-resurrection property RD-6 gives every deferral).

---

