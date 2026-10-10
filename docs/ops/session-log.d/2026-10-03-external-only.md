# 2026-10-03, lane EXTERNAL-ONLY: external data only (ADR-042, migration 349)

## Ruling

Operator, 2026-10-03, verbatim: "The customer is not uploading anything to the system. That's not what the
system is for. We're not updating data inside of this with our own information. We are taking external data
and advising what that means for the people without analyzing their specific data that they input." And:
"There are plenty of existing sustainability software tools that do all of that; we are not trying to be what
somebody else is." And: "Being able to enter simple data like hire or automate is probably a good idea as
long as it's just a simple thing you can enter ... and you don't have to upload company information. I would
also remove the community benchmarks." Decision record: `docs/decisions/ADR-042-external-data-only.md`.

Coordinator brief amendment (same day): who supplies the rows is the test. A customer upload through the app
is removed; an operator-dispatched rows file of external public-source data for a kept domain is the ADR-023
ingest path and stays. The CSV splitter moved to `src/lib/csv/split.mjs`; the remaining contract moved to
`scripts/spec09/lib/operator-rows-contract.mjs`, trimmed to the two kept tables.

## What was removed

The workspace CSV upload route and its Settings card; the surcharge-audit, DQI and EUDR/custody panels with
their libraries, producers, fixtures and registry entries; the per-tenant planning-assumption route, library,
Settings section, pipeline read and Research detail row; the Community benchmarks (pages, routes, panel,
libraries, seeding script, nav link) and the antitrust guard's pointer to the benchmark route. Migration 349
(authored, not applied) drops seven tables and one `sensitive_field_policy` row. Full list in the ADR.

## Read and reused

Read every file in the write set in full and every importer by grep before editing. Reused: the existing CSV
splitter body (moved verbatim, one copy; no second splitter existed in `src/` or `scripts/`), the existing
column contract (trimmed in place, not rewritten), `OemRoadmapPanel` and `OemRoadmapPanelView` as the
canonical home of the view/fetch split rationale that the deleted surcharge panel used to carry, and
migration 348 and its static test as the template for 349.

## Findings recorded (rule 14 labels)

- [CONFIRMED, grep] The admin bulk-import route imported `splitCsvLine` from the upload contract, and the two
  kept producers and `run-fixture-import.mjs` imported its parser; resolved by the coordinator ruling above.
- [CONFIRMED, read] `scripts/verify/spec09-org-rls-adversarial-audit.mjs` used `surcharge_audits` as its
  fixture table, so dropping that table would have turned a hard data-audit red. Retargeted to the surviving
  `auxiliary_energy_profiles` (needs no `entities` fixture rows); its unit test follows.
- [CONFIRMED, read] `canonical-pipeline.ts`'s `buildPlanningAssumptionContext` also builds the research
  assessment half of the brief context (external data). Only the per-tenant at-risk half was removed; the
  function name and the "RESEARCH ASSESSMENT CONTEXT" header are kept so the prompt and its drift test agree.
- [CONFIRMED, read] `AssumptionRegisterPanel` (admin) reads migration 271's `assumption_register`, the
  product's own modelling constants, so it is kept.
- [CONFIRMED, read] `FilePickRow` is still imported by `StatutoryRowsUpload`, so it is kept.

## Kept because another consumer exists

`FilePickRow`, `InlineErrorBanner` (StatutoryRowsUpload); `label.mjs` and `spec09.css` (kept spec09
panels); `antitrust.mjs` including `kAnonymity`, `dominanceCap`, `threeMonthLag` (used inside
`evaluateAntitrustGuard`'s aggregate branch); `organisation-key.mjs` and `organisation-salt.ts` (the profile
verify route stores `organisation_key`); `anonymity-floor.mjs` (ADR-035, floor stays for any future aggregate);
`vocab-drift.test.mjs` (guards migration 296 to 298 text).

## Open items for the coordinator

- Public-source intake for `auxiliary_energy_profiles` and `indexation_clauses` is owed (coordinator design).
  Their producers keep an operator `--csv` path only. [WORK: PLAN-2]
- The Research Summary prompt still mandates a "Planning assumption shift" line. This lane removed the
  at-risk-assumption clauses from `system-prompt.ts` and `PLANNING_ASSUMPTION_REGISTER_FIELDS` from
  `metadata-vocab.ts`, so the line is now grounded on the research assessment only, with the existing
  "no shift grounded" sentinel. Whether to rename or drop that line is a prompt-design ruling. [REFUTED: PLANNING_ASSUMPTION_SHIFT_ABSENCE = "no shift grounded" at metadata-vocab.ts:150, pinned by system-prompt.test.mjs:82]
- `organisation_key` and corporate-email verification no longer serve a benchmark; they only back the
  verified badge. Whether to keep the key derivation is a separate ruling. [WORK: PLAN-2]
- The generated layout-guard `baseline.json` still lists `/settings` L7 keys for the removed upload card;
  shrinking it needs `run-layout-guard.mjs --write-baseline`, left to the rendering job. [NOT-WORK: regenerated by the rendering job]
- `db-catalog.json` and `table-primary-keys.mjs` had the seven tables removed in this PR (ADR-041
  precedent); refresh `db-catalog-refresh.sql` after migration 349 is applied. [NOT-WORK: regenerated by the executor refresh]

## Design changes owed (for Claude Design, rule 20)

- Artboard 09 (Operations profile): the "Data quality" section is no longer built (DQI removed).
- Artboard 15 (Settings): the Assumptions and Upload sections and the Assumptions section-index entry are
  no longer built. Artboards 04, 02, 03, 05 (Market, Regulations, Research, Community) where they draw the
  surcharge audit, EUDR/custody panel, the assumption shift row or the Benchmarks row also go on the list.
  `manifests.json` is unchanged (generated from the artboards, never hand-edited).

## UX compliance

Blocks touched: Settings page (Assumptions section, Upload card and section-index entry removed), Market
page (surcharge panel removed), Regulations page (EUDR panel removed), Operations profile (Data quality
section removed), Research finding detail (Assumption shift row removed), Community sidebar (Benchmarks row
removed), Community post composer (refusal block simplified), Community profile copy, indexation panel empty
line. This lane only removes elements and edits copy; it adds no new interactive element and no new async
action.

- Primary goal per block: unchanged by the removal.
- Path in steps: unchanged or one element shorter. No step was added.
- One primary action per section: unchanged. The removed upload and benchmark actions were secondary.
- Feedback state for each async action: no async action was added or changed. The composer refusal still
  explains the refusal and preserves the reader's draft (law 15), now with no benchmark link.
- Touch targets: removed controls are gone; no remaining target was resized.
- Row components: the spec09 smoke still mounts the five kept panel views; F35 entries for the three removed
  views were removed with them.
