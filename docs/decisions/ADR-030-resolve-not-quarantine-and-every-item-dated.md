---
id: ADR-030
title: Lane-authored briefs are resolved, never quarantined; every item carries a timeline date
status: accepted
date: 2026-09-12
scope:
  - "fsi-app/scripts/turns/record-briefs/schema.mjs"
  - "fsi-app/scripts/turns/record-briefs/README.md"
  - "fsi-app/scripts/turns/apply-record-briefs.mjs"
  - "fsi-app/src/lib/sources/target-match.mjs"
  - "fsi-app/src/lib/agent/timeline-parse.mjs"
  - "fsi-app/src/lib/agent/extract-regulation-sections.ts"
  - ".github/workflows/brief-apply.yml"
  - "item_timelines (the structured timeline store)"
supersedes: null
related:
  - ADR-028-record-grade-is-transit
  - "remediation-discipline section 2.1 (quarantine is an open investigation, RD-6)"
  - "docs/plans/brief-chain-build-plan-2026-09-11.md, Part 6"
  - "task 6.1b and 6.1c in the W9 SDD ledger"
---

## Context

The first brief-apply of the ten Part 6 pilot stubs (run 34688130473, 2026-09-12) wrote all ten briefs and then quarantined all ten at the ground step. The causes, each confirmed against the live database and the pipeline code:

- Gate A (criterion 7) found orphan tokens in six briefs. Five of the six orphans were the ISO date the lane wrote in its honest note "not available from primary sources as of 2026-09-12"; the rest were figures the four slot claims did not cover.
- Criterion 4 found requirement sentences in two briefs with no analysis label and no attached FACT claim.
- The target-instrument match held four items whose own text never cites their own number in a form the scanner reads (three UK Acts and instruments cited by chapter, one Commission Decision numbered at publication), while the pool URL bore the identifier in every case.

Separately, 1,411 of 1,518 live items carry no row in item_timelines (1,091 record-grade, 320 brief-grade), including the ten pilot items after apply: the timeline harvester only reads "date - label" entries with a dash, and the lane, which may not write dash glyphs, wrote "date: label".

Operator, 2026-09-12, verbatim: "Items need to be resolved not quarantined. This is a failure of the previous system." and "It couldn't answer questions or capture data in a way to categorize so it quarantined." And, on timelines: "A timeline event can include or simply be when the regulation or event took place or went into effect" and "No item should be without some date in the timeline."

## Decision

1. **A lane-authored brief is refused before any write, or it lands verified.** The record-briefs validator (`validateRecordBriefsFile`) runs the same checks the database applies after the write: the Gate A scan over the body against the entry's FACT claims, the criterion 4 label rule per section, and the timeline section rule below. A failing entry is refused with the item, the token or the section named, at the lane's commit and again in the driver's validate step (one validator, two call sites). The database criteria stay as the backstop; they are no longer the place a lane brief learns it is wrong.

2. **A capture whose URL bears the item's own identifier is the item's instrument.** The target match accepts a pool block by URL identity (CELEX key with or without a suffix, the legislation.gov.uk type/year/number path, a Federal Register document number) before it reads the text. A URL bearing a different instrument's identifier still mismatches.

3. **Every item carries at least one timeline date, and the instrument's own date qualifies.** The instrument's adoption, publication or entry-into-force date is a valid timeline event on its own. For lane briefs the Confirmed Regulatory Timeline section is mandatory with at least one parseable entry, and the parser reads "date: label" as well as the dash forms and prose dates. For the existing corpus, task 6.1c backfills one row per item from the instrument's own date.

## Consequences

- Task 6.1b implements decisions 1 to 3 for the brief-apply path, passes the whole database module to the unscoped flywheel steps (the obligations step threw on a missing function in the pilot), and makes brief-apply.yml commit its run artifact to the dispatched ref and accept an overwrite flag, so the ten pilot items are re-applied to verified rather than left quarantined.
- Task 6.1c, the corpus backfill, has these measured date sources among the 1,411 undated items (read-only SQL, 2026-09-12): 756 carry an effective_date FACT claim but only 137 of those spans contain a year; 298 carry a forward event; 19 brief-grade bodies contain a timeline section; 570 carry neither an effective_date claim nor a forward event. The backfill therefore derives the instrument's own date deterministically from what every item has: the "of DD Month YYYY" in an EU act's title, the date path of a Federal Register URL, the year and the "Made" line of a legislation.gov.uk instrument, else the earliest forward event; it never invents a day (the precision rules of timeline-harvest.mjs apply) and reports every item it cannot date.
- The quarantine doctrine (remediation-discipline 2.1) is unchanged for model-generated briefs and for grounding failures on captured sources; this ADR narrows what may reach that state from the lane path to nothing the validator can see in advance.
