## 43. `resolve-cited-host-gate`

**Purpose**: resolve the `cited-host-gate` `integrity_flags` family -- Part 7 task 7.4 (25 open rows at
authoring, no resolver anywhere in the codebase before this step). Written by
`src/lib/agent/canonical-pipeline.ts` (~L1641) whenever a brief cites a URL whose host is unknown to both
the item's fetched pool and the source registry.

**Upstream**: `scripts/maintenance/resolve-cited-host-gate.mjs`, reusing `classTierForHost`
(`src/lib/sources/host-authority.ts`, the SC-13 class table, imported unmodified) and `registerSource`
(`scripts/lib/db.mjs`, idempotent by institution key). An unclassifiable host is NEVER registered under a
guessed tier -- it routes to the existing `null-tier-host` worklist flag via the SAME
`mergeNullTierAggregate`/`summarizeNullTierAggregate` pure helpers (`src/lib/agent/null-tier-flag.mjs`)
`surfaceNullTierHosts` (canonical-pipeline.ts) already uses at grounding time, same row shape.

**Ruling**: ADR-030 rider. Not gated by a separate `arg` token. No fetch, no network -- registration is a
DB-only decision (`classTierForHost` is a pure pattern table).

**Dispatch**: `mode=dry` extracts every cited URL per flag and reports each host's planned outcome
(register at tier N / route to the null-tier-host worklist). `mode=apply` performs the registration or the
null-tier-host flag read-modify-write per URL, then resolves the cited-host-gate flag with the outcome
recorded in `resolution_note` either way.

**Artifact / read back**: `summary.json`'s `counts` (`would_register_or_registered`/
`would_worklist_or_worklisted`) and `read_back.remaining_open` -- confirm against `SELECT count(*) FROM
integrity_flags WHERE status='open' AND created_by='cited-host-gate'` (0 expected after a clean apply) and
`SELECT host, base_tier FROM sources ...` / `SELECT * FROM integrity_flags WHERE created_by='null-tier-host'`
for the registered/worklisted hosts.

---

