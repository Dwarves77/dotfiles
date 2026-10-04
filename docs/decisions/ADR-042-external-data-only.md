---
id: ADR-042
title: External data only; the system takes no customer data and runs no Community benchmark
status: accepted
date: 2026-10-03
scope: fsi-app/src/app/api/workspace, fsi-app/src/lib/spec09, fsi-app/src/lib/assumptions, fsi-app/src/components/settings, fsi-app/src/components/community, fsi-app/src/lib/community, fsi-app/scripts/spec09, fsi-app/supabase/migrations/349_external_data_only.sql
supersedes: docs/specs/09-domain-extensions.md sections 1.2, 1.4 and 1.8; docs/specs/03-research.md section 5 and component 7 (per-tenant assumption register) and ADR-038's deferred wiring of it; docs/specs/04-operations.md component 12 where it means customer-editable stored assumptions; docs/specs/01-regulations.md components 8 and 12; docs/specs/05-community.md section 3 (benchmark) and ADR-035's Community-benchmark consequence (the floor itself stays for any future aggregate)
related: ADR-023, ADR-035, ADR-038, ADR-041
---

## Decision

Operator ruling, 2026-10-03, verbatim: "The customer is not uploading anything to the system. That's not
what the system is for. We're not updating data inside of this with our own information. We are taking
external data and advising what that means for the people without analyzing their specific data that they
input."

And: "There are plenty of existing sustainability software tools that do all of that; we are not trying to
be what somebody else is."

And: "Being able to enter simple data like hire or automate is probably a good idea as long as it's just a
simple thing you can enter ... and you don't have to upload company information. I would also remove the
community benchmarks."

The rule: no upload, and no stored customer-entered data used for analysis. The system takes external data
and advises what it means. Who supplies the rows is the test: a customer upload through the app is removed;
an operator-dispatched rows file of external public-source data for a kept domain is the existing ADR-023
ingest path and stays.

## Reasons

- Customer-entered operational data (invoices, shipment evidence, consignment filings, certificates, contract
  terms, planning assumptions) makes the product a company-data system, which is a different product that
  existing tools already serve.
- Live data on 2026-10-03 (read-only SELECT): every table below has 0 rows. Removal needs no data migration.
- The Community benchmark pooled member-entered figures; with no customer data intake it has no honest
  supply, and Community is a social place (ADR-041).

## Consequences (what lane EXTERNAL-ONLY removed or changed)

Code removed:
- Upload: the workspace CSV upload route, the Settings card, and the six-table customer-data contract.
- Customer-only domains: the surcharge-audit, DQI and EUDR/custody panels, their libraries, producers,
  fixtures, smoke fixtures, registry entries, maintenance steps and runbook sections.
- Planning assumptions: the workspace assumptions route, `src/lib/assumptions`, the Settings section, the
  pipeline read of at-risk assumptions in `canonical-pipeline.ts`, and the Research detail "Assumption shift"
  row. The pipeline's research-assessment context block stays (it is external data).
- Community benchmarks: the benchmarks pages and API routes, `BenchmarksPanel`, `benchmark.mjs`,
  `respond.mjs`, the seeding script and its maintenance step, the nav link, and the antitrust guard's
  pointer to the benchmark route. `evaluateAntitrustGuard` stays (the posts route uses it) and now carries no
  aggregate route.

Code kept or moved:
- The automate-versus-hire calculator stays unchanged (typed inputs, computed in the browser, nothing stored).
- The workspace profile, watchlist, personal archive and priority, tags and briefing schedule are
  preference and lens state and stay.
- `auxiliary_energy_profiles` and `indexation_clauses`, their producers and panels, stay. Their CSV contract
  moved to `scripts/spec09/lib/operator-rows-contract.mjs` and is trimmed to those two tables; its header
  states operator-supplied external public-source rows only. Public-source intake for both is owed
  (coordinator design); neither has a confirmed public bulk source today.
- The CSV line splitter moved to `src/lib/csv/split.mjs` (shared with the admin bulk-import route).
- `assumption_register` (migration 271, the product's own modelling constants) and its admin panel stay.

Schema: migration 349 (`349_external_data_only.sql`, authored here, BREAK-RISKY class under ADR-011, applied
in the operator's window after the PR merges) drops `surcharge_audits`, `tce_data_quality`,
`eudr_plot_claims`, `custody_chains`, `planning_assumption_register`, `community_benchmark_responses` and
`community_benchmark_instruments`, and deletes the benchmark row in `sensitive_field_policy`. It keeps
`sensitive_field_policy`, `aggregate_query_log`, `publish_aggregate`, `community_contributions`,
`auxiliary_energy_profiles` and `indexation_clauses`.

Docs: dated "Operator ruling 2026-10-03 (ADR-042)" notes at the cited passages of specs 01, 02, 03, 04, 05,
07 and 09; the platform-intent skill's operator-stated corrections; the maintenance runbook and the
migrations inventory.

## Design changes owed

The Operations profile no longer draws the "Data quality" section, and the Settings page no longer draws the
Assumptions and Upload sections or the section-index entry for Assumptions; artboards that still draw them
go on the DESIGN CHANGES OWED list for Claude Design (rule 20). The Community sidebar loses its Benchmarks row.
