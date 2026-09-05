# Spec 09 producers — $0 sourcing status per table

Lane SPEC-09, wave 3, 2026-09-03. Updated by Lane SPEC09-B, 2026-09-05 (plan §W5.1 — the CSV upload
flow). Every producer in this directory is dry-by-default, takes `--apply` (alias `--mode apply`), and
never calls an LLM or a paid service ($0 rule, COMMON lane contract). This file names, per table, either
the $0 public source a producer fetches or the honest reason none exists.

## Six tables: no bulk $0 source exists BY DESIGN — now wired to a customer CSV upload, not left empty

Lane SPEC09-B's own finding, unchanged from wave 3: `surcharge_audits`, `tce_data_quality`,
`auxiliary_energy_profiles`, `eudr_plot_claims`, `custody_chains`, and `indexation_clauses` are all
GENUINELY customer-supplied data — a carrier invoice, a shipment's own telemetry, a customer's own
equipment, a consignment filing, a certificate, a signed contract's terms. There is no bulk public dataset
for any of these, by the nature of the data, not a sourcing failure (rule 2: never fabricate — an
unconfirmed dataset is treated as absent, not guessed at). What WAS missing at wave 3 was not a data
source — it was an upload flow for the customer to hand the product their own data. That gap is now
closed:

- **`src/lib/spec09/csv-upload-contract.mjs`** — the one shared column contract (parseCsvUpload,
  entityRefValuesForTable, validateEntityRefs) for all six tables, imported unchanged by both callers
  below.
- **`POST /api/workspace/spec09-upload`** (`src/app/api/workspace/spec09-upload/route.ts` +
  sibling `logic.ts`) — the authenticated, org-scoped HTTP path: `{ table, csv }` in the body, org id
  ALWAYS resolved server-side from the caller's own membership, never trusted from the request. Wired into
  Settings → Data (`SettingsPage.tsx`'s `Spec09CsvUpload` component) as the customer-facing upload surface.
- **`scripts/spec09/*-producer.mjs`** — the SAME parsers, callable as a coordinator-dispatched CLI
  (`--mode apply --csv <path> --org-id <uuid>`) for a reviewed batch file, e.g. a bulk backfill from a
  customer's existing spreadsheet.

Each producer below is now this parser/router, not a permanent no-op — see each file's own header. A
fixture CSV per table (`scripts/spec09/fixtures/*.csv`, 2-4 accept + 2-3 reject rows each) proves both the
accept and reject paths; `scripts/spec09/run-fixture-import.mjs` runs all six through the identical
parse→stamp→insert→read-back pipeline with a deps-injected fake insert (no live DB credentials in this
lane's worktree) and writes a JSON artifact to `scripts/_snapshots/spec09-csv-upload/` (gitignored).

| Table | Producer | Reader | Org-scoped (migration 308) |
|---|---|---|---|
| `surcharge_audits` | `surcharge-audit-producer.mjs` | `SurchargeAuditPanel` (Market) | yes |
| `tce_data_quality` | `dqi-producer.mjs` | `DqiPanel` (Operations) | yes |
| `auxiliary_energy_profiles` | `auxiliary-energy-producer.mjs` | `AuxiliaryEnergyPanel` (Operations) | yes |
| `eudr_plot_claims` | `eudr-custody-producer.mjs` | `EudrCustodyPanel` (Regulations) | yes |
| `custody_chains` | `eudr-custody-producer.mjs` (same file) | `EudrCustodyPanel` (Regulations) | yes |
| `indexation_clauses` | `indexation-producer.mjs` | `IndexationPanel` (Market) — **new this lane**, the reader this table lacked at wave 3 | yes |

Live row count for all six as of this lane's own read-only verification (2026-09-05): **0**. The upload
flow exists; no customer has used it yet. `docs/inventories/shared-dataset-ownership.md`'s "Non-registry
tables named for completeness" section carries the full two-writer detail for all six.

## `carrier_compliance_pools` — DROPPED this lane (migration 308), not given a reader

Spec 09 names Market as the only surface that could ever read this table, but migration 296's own header
already stated its one customer-reachable column (`surcharge_audits.pool_adjusted_eur`) is deliberately
never populated — `src/lib/spec09/surcharge-audit.mjs`'s `poolAdjustedGuard()` refuses to surface it (spec
09 §5 open decision 1's conservative default, left unmade). This lane's brief required either building the
reader or dropping the table with 0 rows confirmed; 0 rows were confirmed live (read-only SELECT,
2026-09-05, and re-checked by migration 308's own precondition), and a reader for a value the calculator
layer refuses to surface would only relocate the unmade operator decision into a new, useless UI element
rather than resolve it. Dropped along with `surcharge_audits.pool_id` and `.pool_adjusted_eur`
(`variance_eur` — the ALWAYS-renderable billed-vs-statutory sentence — is untouched). THETIS-MRV (EMSA)
remains the $0 public source that WOULD have fed this table, named here only so a future operator decision
to reverse this drop knows where the data lives.

## Remaining wave-3 gaps, unchanged by this lane (outside SPEC09-B's write set — see its own W5.1 sub-thread)

| Table | Producer | $0 source | Status |
|---|---|---|---|
| `oem_tech_roadmaps` | `oem-roadmap-producer.mjs` | none confirmed | GAP: OEM commercial-stage announcements live on manufacturer press pages, not a structured bulk feed. Parsing free-text press releases without an LLM (the $0/no-LLM rule) is not viable at useful accuracy; no aggregator with a stable, licence-clear API was confirmed at $0. Ships 0 rows. |
| `reroute_events` | `reroute-producer.mjs` | entity spine (read-only) | GAP, DIFFERENT SHAPE: requires TWO distinct `entities.kind='corridor'` rows (baseline + reroute) and only ONE corridor entity exists in the spine today. Minting a second corridor entity is entities/entity_kind territory, out of this lane's write set. |
| `grid_connection_queues` | `grid-queue-producer.mjs` | none confirmed | GAP: no $0 structured feed was confirmed for DSO/TSO connection-queue MONTHS by capacity band. Ships 0 rows. |

**Sequenced per spec §4**: `surcharge-audit-producer.mjs` was written first at wave 3, matching the
calculator and component build order; this lane's CSV-upload refactor preserved that file as the first of
the six rewritten producers for the same reason.
