## 41. `close-run-logs`

**Purpose**: close informational `integrity_flags` run-log rows -- Part 7 task 7.1 of the brief-chain
build plan (2026-09-11), ADR-030's rider ("no queue on the admin page may require a human click to
resolve; a run log is closed by the runtime that recognizes it as one"). Three named families, ALL THREE
an ALLOWLIST (fix round 1, 2026-09-12 -- the first version denylisted `authorship-shard-*`/
`citation-harvest*` on "not a question," which closed a genuine per-item blocker/park/novel-finding
notice as if it were a log; every family now requires a positive match): `created_by` starting
`authorship-shard-` closes only when `description` matches the charter's own CLOSE-step vocabulary
(`docs/runbooks/fleet-charters/authorship-worker.md`: all four of attempted/completed/parked/flagged
together, or an explicit run-summary marker -- about 370 rows at authoring); `created_by =
'legacy-remediation'` closes only when `description` opens with `RUN SUMMARY` (never the per-item PARKED
rows from the same `created_by`, which task 7.3 resolves separately); `created_by` starting
`citation-harvest` closes only when `description` matches that charter's own CLOSE-step vocabulary
(`docs/runbooks/fleet-charters/citation-harvest.md`: `considered` + `backlog` + a disposition word
together, or an explicit run-summary marker; the backlog counts a genuine batch summary names are
re-derived live elsewhere, never carried forward by this close). A universal guard applies first: a
`description` ending in `?` is a per-item question and is never closed, regardless of which family its
`created_by` matches.

**Upstream**: `scripts/maintenance/close-run-logs.mjs` -- self-contained, no upstream script. The
selection is pure and tested (`decideRunLogClosure`/`planClosure`/`isAuthorshipRunSummary`/
`isCitationHarvestRunSummary`/`isLegacyRemediationRunSummary`), so the dry report lists every KEPT row by
reason, not just a count.

**Ruling**: ADR-030 rider (2026-09-12). Not gated by a separate `arg` token.

**Dispatch**: `mode=dry` reads the three families (`status IN ('open','in_review')`) and reports
`would_close`/`kept` counts by family/reason plus a 20-row kept sample. `mode=apply` resolves every
closeable row via `guardedUpdateByIds` (`status='resolved'`, `resolved_by='close-run-logs'`,
`resolution_note='run log, informational; closed under ADR-030 rider (Part 7.1)'`, re-matched to
`status IN ('open','in_review')` per chunk so a row resolved by another writer between read and write is
left alone) and reads back the remaining open count in these three families.

**Artifact / read back**: `summary.json`'s `read_back.remaining_open_in_families` -- confirm against
`SELECT count(*) FROM integrity_flags WHERE status IN ('open','in_review') AND (created_by ILIKE
'authorship-shard-%' OR created_by = 'legacy-remediation' OR created_by ILIKE 'citation-harvest%')`; a
non-zero remainder is expected only for kept-per-item-question rows and legacy-remediation PARKED rows.

---

