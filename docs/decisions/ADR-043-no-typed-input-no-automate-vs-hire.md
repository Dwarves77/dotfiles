---
id: ADR-043
title: No typed input produces a result anywhere; the automate-versus-hire framing is retired
status: accepted
date: 2026-10-03
scope: fsi-app/src/components/operations, fsi-app/src/app/operations, fsi-app/src/lib/operations, fsi-app/src/lib/propagation/methods, fsi-app/scripts/propagation, fsi-app/scripts/producers/regional, fsi-app/supabase/migrations/350_retire_automate_vs_hire_values.sql
supersedes: docs/specs/04-operations.md section 4, components 6, 7 and 12 (the calculator reading of it) and acceptance criteria 8 and 9; docs/specs/07-page-walkthrough.md Operations items 3 (as a typed scenario) and 4; ADR-024 decision 2's break-even equal-billing consequence for this method (the range-only rule for estimates stays); ADR-042's statement that the typed automate-versus-hire calculator stays; the 2026-09-25 "client override, labelled client-supplied" wording on the carbon-cost card
related: ADR-024, ADR-042, ADR-041
---

## Decision

Operator ruling, 2026-10-03, verbatim, final, reversing the same-day "calculator stays": "I've changed my mind. I
don't want to input any outside data to get results from anything in the system, including automate or hire.
Also automate and hire seems very non-PC; it would look terrible to say we're going to automate jobs or people
are so cheap that we'll just hire them and not pay them enough. It's a bad idea, and we can state the evidence
of what wages and stuff cost, but we don't need to blatantly say automate or hire."

The rule: no reader-typed input produces a result anywhere in the system, and the surface does not pose
"automate or hire". Wage, labour-cost and energy-cost evidence stays, shown as sourced regional figures with no
verdict.

## What is removed

- The Operations calculator: `AutomateVsHireCalculator`, `OperationsCalculatorPageView`, the
  `/operations/calculator` route, the one link to it on the Operations list, and its command-bar parts entry.
- The calculator library `src/lib/operations/automate-vs-hire.mjs` and its test. Its one still-used constant,
  `UNCERTAINTY_PCT`, moved to `src/lib/figures/uncertainty.mjs` (consumer: the carbon cost per FEU card). Its
  hourly-wage-unit predicate had no remaining production caller once the authorship hooks below went, so it was
  deleted rather than moved.
- The propagation method `automate_vs_hire` (`methods/automate-vs-hire.ts`, its test and registration), the
  `automate_vs_hire` seed path in `scripts/propagation/seed-derived-values.mjs` (and the region entity mint that
  only it used), the region-grain edge authorship in `run-envelope-producer.mjs`, the state-grain authorship in
  `state-cost-facts-producer.mjs`, and the region step in `backfill-derivation-edges.mjs`.
- The rendering-audit mount and spec for the calculator page, and the calculator link row of the Operations list
  spec.
- The live `derived_values` rows with method `automate_vs_hire` and the edges into them (migration 350, applied by
  the coordinator after merge). `propagation_events` is an append-only outbox and is left untouched.

## What stays

- The labour chain (`labour-chain.ts`, `LabourChain.tsx`), the Operations matrix and ledger wage figures, every
  `regional_data_facts` producer and row, `NoticesRail`, `RecalculationNotice`, `EstimatedFigure` and the
  range-only rule for estimates (ADR-024 decision 2), the carbon-intensity method and its seeding, migration 333.
- Workspace assignment, tags and notes are workspace preferences and stay (ADR-042).
- Community is social only (ADR-041) and external data only (ADR-042) are unchanged.

## Operations contract after this decision

Structured jurisdictional cost and feasibility evidence (labour, energy, materials, infrastructure) for the
reader's own decisions. The phrase "hire-vs-automate" is no longer the surface's purpose anywhere it appeared as
such (spec 04, spec 07, the platform-intent and surface-contract skills).

## Consequences

- Spec 04 section 4, components 6 and 7, and acceptance criterion 8 are retired; criterion 9 and component 12
  stay only as ADR-042 left them (the product's own versioned constants).
- ADR-024 decision 2 stands for estimates (a range, never a bare point); its break-even equal-billing clause
  applied only to the retired method.
- The "client override, labelled client-supplied" wording on the carbon-cost card is superseded; ADR-042 already
  removed customer-supplied inputs from that card and this ruling removes the last typed-input surface.
- `estimated_values` has no registered writer after this change. It is not dropped here; a table with no writer is
  a separate census question for the fitness gate and the coordinator.
- Spec 01 components 8 to 10: component 8 was already superseded by ADR-042. Components 9 (owner, status, review
  date) and 10 (obligation to task) are workspace preference state and are NOT retired by this ADR; the lane brief
  listed them and the dispatch message ruled that workspace assignment, tags and notes stay, so they were left
  alone and the discrepancy is flagged to the coordinator.

## Design changes owed

Artboard 08 (Operations list) never drew the calculator link (it was logged as a deviation), so removing it needs
no artboard change. Claude Design owes nothing for this ruling.
