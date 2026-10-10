## 70. `apply-deferrals`

**New this runbook, lane DOCS-5, 2026-10-10** (the step itself shipped in lane M6, 2026-09-21; it had no runbook step
file until now).

**Purpose**: write the deferral that dispositions a past-bound live-quarantined item as BLOCKED (a reason, an owner, a
`deferred_until` date and a `resolution_event`), so the quarantine-disposition audit
(`fsi-app/scripts/verify/quarantine-disposition-audit.mjs`) reads the item as dispositioned and not as silent. A
deferral is dispositioning-as-blocked, never silencing (remediation-discipline section 2.2).

**Upstream**: `fsi-app/scripts/maintenance/apply-deferrals.mjs`. Validation is `scripts/lib/deferral.mjs`
`assertValidDeferral`, the same guard the audit's read side re-checks; this wrapper adds no validation semantics. A row
that fails validation is reported by `item_id` and reason, never written and never dropped silently.

**Dispatch**: `maintenance.yml`, `step=apply-deferrals`. `arg` blank (the default) reads the `plan.json` written by step 69
(`plan-quarantine-disposition`) from its sibling out dir; no plan file is recorded as `no-plan-file` and the step ends
exit 0, never an error. `arg` = a JSON file path (repo-relative or absolute) overrides the plan: an array of
`{ item_id, reason, deferred_until, owner, resolution_event }`; an unreadable explicit path is refused. `mode=dry` validates
and reports. `mode=apply` writes one open `integrity_flags` row per valid row through the guarded `db.mjs` path (rule 015):
`category=data_quality`, `subject_type=item`, `subject_ref=<item_id>`, `created_by=disposition_deferred`,
`description=<reason>`, `recommended_actions=[{ deferral: {...} }]`. That is the exact shape the audit parses; there is no
second reader. The step ends `|| true` so an `all` dry fan-out does not fail the job. `all` runs dry only.

**Build mode**: the apply is a live data write. It stays held while the build-mode hold is on (CLAUDE.md rule 16,
population after all layers); step 69's `dispatch-apply-deferrals` hand-off therefore always calls this step in `dry`.

**Artifact / read back**: `summary.json` (rows read, valid, invalid with reasons, written). Confirm an apply with
`SELECT subject_ref, status FROM integrity_flags WHERE created_by = 'disposition_deferred' AND subject_ref = ANY(<ids>)`.

**Reversal**: the written rows are `integrity_flags` inserts keyed by `created_by = 'disposition_deferred'`; close the
flag (status), do not delete.

---
