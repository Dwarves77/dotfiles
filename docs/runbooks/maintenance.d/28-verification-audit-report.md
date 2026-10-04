## 28. `verification-audit-report`

**Documentation gap closed, Lane W71-WIRE, 2026-09-05** (plan section W7.1, B1 Ranked Gap #8). Written from
`scripts/verify/verification-audit-report.mjs`'s own header.

**Purpose**: W2.F provenance + F28 harness-run legibility report - `intelligence_items` provenance matrix
(grade × status × item_type), `section_claim_provenance` claims citation split by `claim_kind`, sections
carrying a FACT claim missing `source_span`, and F28's registered harness families' run-history markers
(same posture as `population-report.mjs`: legibility, not a pass/fail gate - a corpus mid-verification
legitimately has unverified/pending rows).

**What it does NOT do**: never writes anything; $0, read-only against `intelligence_items` and
`section_claim_provenance` plus a filesystem read of `scripts/harness-runs/`.

**Upstream**: `scripts/lib/run-artifact.mjs` (`readRunHistory`, `DEFAULT_HARNESS_RUNS_ROOT`),
`.discipline/fitness/functions/F28-harness-run-integrity.mjs` (`GOVERNING_FILES` - the registered-family
list, never re-derived by hand here).

**Ruling**: none - a report, not a gate.

**Dispatch**: no `arg`. Not a pass/fail check, so `mode` only changes nothing here - both `dry` and
`apply` write the same report into this run's artifact.

**Artifact / read back**: `$OUT_ROOT/verification-audit-report/report.md` (+ a `.json` twin at the same
path) - uploaded as this run's artifact. Confirm the report's own counts against a direct read, e.g.
`SELECT item_grade, provenance_status, count(*) FROM intelligence_items GROUP BY 1,2 ORDER BY 3 DESC`.

---

