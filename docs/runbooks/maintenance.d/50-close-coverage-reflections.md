## 50. `close-coverage-reflections`

**New this runbook, D17 family 13, defect-fix-plan-2026-09-12 (lane L11).**

**Purpose**: one-time drain of the coverage-gap (`flywheel-gap:*`, 18 open) and anticipated-coverage
(`flywheel-anticipate:*`, 6 open) backlog opened before `scripts/connections/analyze-corpus.mjs` started
writing these findings ALREADY RESOLVED (`src/lib/connections/coverage-reflection.mjs`'s
`reflectResolvedFlags`, wired into `analyze-corpus.mjs` the same commit as this step). Both families are
product-scope reflections, not questions to a person (the coordinator's own ruling, plan row 13); every
row resolves with the SAME note the fresh-insert path now uses: "reflected in the coverage view; no
per-row decision pending."

**Upstream**: `scripts/lib/db.mjs` (`readAll`, `guardedUpdateByIds`),
`src/lib/connections/flag-namespaces.mjs` (`GAP_NAMESPACE`, `ANTICIPATE_NAMESPACE`),
`src/lib/connections/coverage-reflection.mjs` (`RESOLVED_REFLECTION_NOTE`, shared with the fresh-insert
path so a reader cannot tell backlog from fresh).

**Ruling**: D17 family 13 (defect-fix-plan-2026-09-12, ruling table row 13).

**Dispatch**: no `--arg`. `mode=dry` reports the by-family would-close counts; `mode=apply` resolves
every matched row.

**Artifact / read back**: `summary.json`'s `counts.by_family` / `read_back.remaining_open`. Confirm
against `SELECT count(*) FROM integrity_flags WHERE (created_by LIKE 'flywheel-gap:%' OR created_by LIKE
'flywheel-anticipate:%') AND status IN ('open','in_review')` (expect 0 after apply).
`scripts/verify/population-report.mjs` carries no dedicated line for these two namespaces today
[CONFIRMED, no `flywheel-gap`/`flywheel-anticipate` reference anywhere in that file] -- the plan's own
"population-report.mjs keeps counting them" premise does not hold; nothing there needed adjusting.

---

