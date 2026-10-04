## 32. `spec09-indexation-csv`

**New this runbook, lane ASSEMBLE-47, 2026-09-05** (plan section W5.1); narrowed by lane EXTERNAL-ONLY,
2026-10-03 (ADR-042). Same shape as section 31 above, targeting `scripts/spec09/indexation-producer.mjs` /
`indexation_clauses`. `arg` is `<csv-path>,<org-id>`; a no-arg run skips (the fixture proof ran in section 31).
Confirm against `SELECT count(*) FROM indexation_clauses`. Public-source intake for both kept tables is owed
(coordinator design); neither has a confirmed public bulk source today.

---

