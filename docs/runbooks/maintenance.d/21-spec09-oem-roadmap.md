## 21. `spec09-oem-roadmap`

**New this runbook, Lane SPEC09-A, 2026-09-05.** Written from `scripts/spec09/oem-roadmap-producer.mjs`'s
own header.

**Purpose**: `oem_tech_roadmaps` (migration 296, spec 09 section ?) producer - OEM commercial-stage technology
roadmap announcements (battery/fuel-cell/etc. by manufacturer). **$0 SOURCING STATUS: GAP, none
confirmed this lane** - see `scripts/spec09/SOURCES.md`'s `oem_tech_roadmaps` row: these announcements
live on manufacturer press pages, not a structured bulk feed, and parsing free-text press releases
without an LLM (the $0/no-LLM rule) is not viable at useful accuracy. Ships 0 rows from any live fetch -
rows-file-only from its first version, same as `spec09-grid-queue`.

**Upstream**: `scripts/spec09/oem-roadmap-producer.mjs`'s own `parseOemRoadmapRow(row, index,
manufacturers, deps)` (pure per-row validation + resolution, unit-tested against fixtures) + `main({mode,
arg}, deps)`. Shares `scripts/spec09/lib/rows-file.mjs` with the other two spec09 rows-file producers.

**Ruling**: none - the gap is a sourcing gap, not a ruling-gated decision. **One open item that IS
ruling-shaped, named for the operator, not decided here**: `oem_tech_roadmaps.source_id` is `NOT NULL`
(unlike `reroute_events` / `grid_connection_queues`, which carry no `source_id` column at all), so a row
whose citation host does not classify under the current institution class table
(`src/lib/sources/host-authority.ts`) is refused outright - and neither the named candidate lead
(`globaldrivetozero.org`) nor a manufacturer's own press site currently classifies. Adding either requires
an operator ruling on the class table, not a producer-side workaround.

**Dispatch**: `arg` is a rows-file JSON path. Each row requires `manufacturer_name` / `tech_category` /
`commercial_stage` / `announced_at`, with enum checks for `tech_category` (8 values), `commercial_stage`
(4 values), `density_basis` (3 values, required together with `energy_density_wh_kg` - one without the
other is a refusal), `origin_class` (7 values, default `'community'`), `derivation` (9 values, default
`'observed'`), and a `confidence_admiralty` code matching `^[A-F][1-6]$`. `manufacturer_name` resolves
against the live `entities(kind='organisation')` spine (1,293 rows, e.g. `volvotrucks.com`) by exact
`canonical_name` - never minted. The row's citation registers through `registerCitedSource`; because
`source_id` is `NOT NULL` on this table, a citation refusal here refuses the whole row (unlike the other
two producers, where citation only gates whether the row is written, not a stored column). `mode=apply`
calls `guardedInsertMany("oem_tech_roadmaps", [...], {skill, reason})` once per row, `source_id` set from
the registered citation's `source_id`.

**Artifact / read back**: `summary.json`'s `rows_total` / `rows_written` / `refusals`. Confirm against
`SELECT count(*) FROM oem_tech_roadmaps` and `SELECT id, canonical_name FROM entities
WHERE kind='organisation' AND canonical_name = 'volvotrucks.com'`.

**No reviewed rows-file exists yet.** `scripts/spec09/oem-roadmap-rows-file.example.json` is an
unreviewed DRAFT template only. `scripts/spec09/SOURCES.md`'s `oem_tech_roadmaps` row names the candidate
lead for the browser-lane worklist ([HYPOTHESIS], not confirmed this session): CALSTART's Global
Commercial Vehicle Drive to Zero Zero-Emission Technology Inventory (ZETI),
`globaldrivetozero.org/tools/zeti-tool/` - plus the host-authority.ts class-table gap named above, which
blocks this source (and any manufacturer press site) from ever producing a written row until an operator
ruling adds a class-table entry for it.

---

