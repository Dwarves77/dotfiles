## 19. `spec09-reroute`

**Documentation gap closed, Lane REVIEW-WIRE, 2026-09-04** (`docs/audits/wiring-audit-2026-09-04/
A1-runtimes.md`: `[HYPOTHESIS]` "dispatch-only, no schedule" per session-log Addendum 85, no explicit
apply-count evidence found that session). Written from `scripts/spec09/reroute-producer.mjs`'s own
header; **this step ships 0 rows by design, not by defect** - see below.

**Purpose**: `reroute_events` (migration 296, spec 09 section 1.7) producer. **$0 SOURCING STATUS: GAP** - a
different shape from every other spec-09 producer (see `scripts/spec09/SOURCES.md`). The well-documented
public fact (the Suez/Cape Red Sea diversion) exists, but this table requires TWO DISTINCT
`entities.kind='corridor'` rows (a baseline + a reroute pairing), and only ONE corridor entity
(`CNSHA-NLRTM:ocean`, lane CORR's wave-2 seed) exists in the spine today. This producer reads the live
corridor entity count and reports the honest gap - it never invents a second corridor id (minting one is
`entities`/`entity_kind` territory, `scripts/entities/**`, out of this producer's own write set).

**Upstream**: `scripts/spec09/reroute-producer.mjs`'s own `evaluateCorridorReadiness` (pure decision over
a list of live corridor rows, unit-tested directly against a fixture) + `main({mode}, {readAll,
guardedInsertMany})`.

**Ruling**: none - the gap is structural (corridor-entity count), not a ruling-gated decision.

**Dispatch (no `arg`, legacy corridor-gap report)**: `mode=dry` reads the live `entities
WHERE kind='corridor'` count and reports the gap (`counts.corridor_entities_found`, `gap` - a
human-readable string naming exactly what's missing). `mode=apply` calls
`guardedInsertMany("reroute_events", [], ...)` - an empty-array insert, i.e. `applied: 0` always, until a
second corridor entity exists AND a producer-confirmed reroute pairing (cause + `fuel_burn_multiplier`,
sourced and dated) is built - neither of which this producer alone decides (per its own
`evaluateCorridorReadiness`, `ready` is never `true` from corridor count alone).

**Artifact / read back (no-`arg` path)**: `summary.json`'s `counts.corridor_entities_found` /
`counts.to_insert` and `gap`. Confirm against `SELECT count(*) FROM entities WHERE kind='corridor'` and
`SELECT count(*) FROM reroute_events`.

**Lane SPEC09-A extension, 2026-09-05 - `--rows-file` path (this mechanism is what lane CORRIDORS-STATUTORY's
corridor seed unblocks - it, not this producer, mints the second `entities.kind='corridor'` row; **live SQL,
2026-09-05: corridor entity count is still 1** - the seed had not landed at time of this dispatch, so
`--rows-file` correctly refuses today and will start placing rows the moment a second corridor exists)**:
with `arg` set to a rows-file JSON
path (`scripts/maintenance/lib/cli.mjs`'s `runCli` passes `arg` straight through as `--arg`), the
producer instead loads that file via `scripts/spec09/lib/rows-file.mjs`, and for each row: validates
`baseline_corridor_name` / `reroute_corridor_name` / `cause` / `fuel_burn_multiplier` (> 0) /
`effective_from` (and `effective_to >= effective_from` when present) are present and well-formed (throws
- a malformed row is a producer bug, not a sourcing gap); resolves both corridor names against the live
`entities(kind='corridor')` spine by exact `canonical_name` - an unresolved name, or the same corridor on
both sides, is a **refusal** (reported, not thrown - an honest "can't place this row" is expected input,
not a bug); registers the row's own `citation` block through `registerCitedSource`
(`src/lib/sources/host-authority.ts`'s `classTierForHost` - never a hand-typed tier; a host the class
table can't place is refused, never guessed). Only rows that clear every check are written. `mode=apply`
calls `guardedInsertMany("reroute_events", [...], {skill, reason})` **once per row**, each with that
row's own citation as its rule-18 provenance. This producer never mints a corridor entity - an unresolved
corridor name stays refused, not fabricated.

**Artifact / read back (`--rows-file` path)**: `summary.json`'s `rows_total` / `rows_written` /
`refusals` (each with its row index and reason). Confirm against `SELECT count(*) FROM reroute_events`
and `SELECT id, canonical_name FROM entities WHERE kind='corridor'` (needs >=2 distinct corridors for any
row to place).

**No reviewed rows-file exists yet.** `scripts/spec09/reroute-rows-file.example.json` is an unreviewed
DRAFT template only (placeholder values, `PENDING-BROWSER-VERIFICATION` fields) - see
`scripts/spec09/SOURCES.md`'s `reroute_events` row for the named candidate source lead ([HYPOTHESIS], not
confirmed this session - this sandbox's egress proxy blocks every non-allowlisted host) that a
browser-capable lane must open, verify, and turn into a real rows-file before any `--apply` dispatch
against this path is meaningful.

---

