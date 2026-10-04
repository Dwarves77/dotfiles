## 35. `close-acquire-primaries-holds` (supersedes the retired `acquire-primaries` step)

**RETIRED, D17 family 10, defect-fix-plan-2026-09-12 (lane L11).** `scripts/remediation/
acquire-primaries-batch.mjs` (the one-shot 2026-07-16 batch script this section used to document) and its
MAINT wrapper `scripts/maintenance/acquire-primaries.mjs` are DELETED: the enumeration
(`docs/audits/quarantine-and-human-flag-writers-2026-09-12.md`, Family 10) found this script's
`integrity_flags` writer (`created_by='acquire-primaries-batch-2026-07-16'`) had NO reader anywhere -- a
write-only orphan. The free capture path and `provenance-heal.mjs` (this runbook's own `provenance-heal`
section) supersede it for the same job.

**Purpose (this step)**: resolve the 19 rows the deleted writer already left behind
(`created_by='acquire-primaries-batch-2026-07-16'`, `status IN ('open','in_review')`). Every row closes
the same way -- there is no per-row decision left to make (the writer and its only possible reader are
both gone); resolution_note is fixed: "superseded by the free capture path and provenance-heal (task
7.3); item carried in the 7.3 residue report."

**Upstream**: `scripts/lib/db.mjs` (`readAll`, `guardedUpdateByIds`).

**Ruling**: D17 family 10 (defect-fix-plan-2026-09-12, ruling table row 10).

**Dispatch**: no `--arg`. `mode=dry` reports the would-close count and a 20-row sample; `mode=apply`
resolves every matched row via the guarded path and reads back the remaining open count (expected 0).

**Artifact / read back**: `summary.json` under `$OUT_ROOT/close-acquire-primaries-holds/`
(`counts.would_close` / `counts.write.updated` / `read_back.remaining_open`). Confirm against
`SELECT count(*) FROM integrity_flags WHERE created_by = 'acquire-primaries-batch-2026-07-16' AND status
IN ('open','in_review')` (expect 0 after apply).

---

