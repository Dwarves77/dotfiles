# ABSENT-LIST: Spec rows with no code or unexecuted runners

Source: aud-sys-1-traceability-2026-10-11.md. Status values ABSENT, UNWIRED, UNCONSUMED (21 rows).
For each: register row verbatim; spec text citation with line numbers from docs/specs/; docs/** mentions (grep; max 10).

---

## Summary

Output: `fsi-app/scripts/tmp/absent-list-2026-10-11.md`
Row count: **21**

- ABSENT: 16 rows (R-03, R-06, R-09, R-12, R-18, M-03, M-07, M-08, RS-05, RS-07, RS-10, O-06, O-07, O-08, O-09, C-05)
- UNWIRED: 2 rows (SM-3f migration 299; SM-10b theme backfill script)
- UNCONSUMED: 3 rows (C-04, F-10 publish_aggregate, SM-5c structured actions)

---

## ABSENT ROWS (16)

### R-03: Obligation card
**Register:** Obligation card: plain language + verbatim provision + pinpoint + as-at. CODE: none; NEVER | NONE | ABSENT
**Spec:** 01 S4 comp 3, S7 crit 2 - "plain_language | Can a non-lawyer act" (S3.2 L81); "pinpoint_citation (article/paragraph/subsection) | Can a named person find the exact words that bind them" (L79-80)
**Docs:** 0 mentions

### R-06: Horizon lane
**Register:** Horizon lane visually separate from binding. CODE: none; NEVER | NONE | ABSENT
**Spec:** 01 S4 comp 5, S7 crit 7 - horizon lane visual separation requirement
**Docs:** 0 mentions

### R-09: Evidence/retention upload (RETIRED by ADR-042)
**Register:** Evidence/retention artefact upload; customer-obligation ingest. CODE: none; n/a | n/a | ABSENT (RETIRED by ruling)
**Spec:** 01 S4 comp 8, 12 - operator ruling note 2026-10-03 (superseded by ADR-042)
**Docs:** docs/decisions/ADR-042.md

### R-12: Export / snapshot
**Register:** Export / point-in-time snapshot (Excel/PDF), columns origin_class + as-at. CODE: none; NEVER | NONE | ABSENT
**Spec:** 01 S4 comp 11, S7 crit 10 - export to Excel/PDF with origin_class + as-at date
**Docs:** 0 mentions

### R-18: 16 UNCONFIRMED legal facts
**Register:** 16 UNCONFIRMED legal facts re-verified before build. CODE: no mechanism; NEVER | NONE | ABSENT
**Spec:** 01 S9 - lists 16 unconfirmed regulatory facts requiring re-verification
**Docs:** 0 mentions

### M-03: Corridor rate board (RETIRED 2026-09-25)
**Register:** Corridor rate board. CODE: none; n/a | n/a | ABSENT (RETIRED by amendment)
**Spec:** 02 S6 comp 2 - corridor rate board (retired by operator amendment 2026-09-25)
**Docs:** docs/decisions/ amendment entry

### M-07: Peer cohort benchmark
**Register:** Peer cohort benchmark with editable cohort definition. CODE: none standalone; NEVER | NONE | ABSENT
**Spec:** 02 S6 comp 6, S8 crit 9 - peer cohort benchmark with editable definition
**Docs:** 0 mentions (grep: peer_cohort / PeerCohort = 0 hits in src)

### M-08: Capacity and reliability panel
**Register:** Capacity and reliability forward panel. CODE: none; NEVER | NONE | ABSENT
**Spec:** 02 S6 comp 7 - capacity and reliability forward panel
**Docs:** 0 mentions (grep: schedule_reliability / blank_sailings = 0 hits)

### RS-05: Who-is-studying-it panel
**Register:** Who-is-studying-it panel. CODE: none as a panel; NEVER | NONE | ABSENT
**Spec:** 03 S7 comp 5 - who-is-studying-it panel component
**Docs:** 0 mentions (grep: WhoIsStudying / studying_institutions = 0 hits)

### RS-07: Assumption-register binding (RETIRED by ADR-042)
**Register:** Assumption-register binding. CODE: none; n/a | n/a | ABSENT (RETIRED by ADR-042)
**Spec:** 03 S7 comp 7 - assumption register binding (retired by ADR-042)
**Docs:** docs/decisions/ADR-042.md

### RS-10: Obligation calendar join
**Register:** Obligation calendar joined to assessments. CODE: none located; NEVER | NONE | ABSENT
**Spec:** 03 S7 comp 10 - obligation calendar joined to assessments
**Docs:** 0 mentions

### O-06: Automate-vs-hire calculator (RETIRED by ADR-043)
**Register:** Automate-vs-hire TCO panel; sensitivity strip. CODE: none (RETIRED by ADR-043, PR 922); n/a | n/a | ABSENT (RETIRED)
**Spec:** 04 S4, S6 comp 6,7 - TCO panel (retired by ADR-043, migration 350)
**Docs:** docs/decisions/ADR-043.md

### O-07: Feasibility gate layer
**Register:** Feasibility gate layer (PPWR, EPR, PFAS, permitting, ETS2) as gates. CODE: none; NEVER | NONE | ABSENT
**Spec:** 04 S6 comp 8, S8, S9 crit 7 - feasibility gate layer for regulatory regimes
**Docs:** 0 mentions (grep: FeasibilityGate = 0 in src)

### O-08: Materials-compliance join
**Register:** Materials supply to compliance join (recyclate vs PPWR threshold). CODE: none; NEVER | NONE | ABSENT
**Spec:** 04 S6 comp 9, S8 - materials supply to PPWR compliance join
**Docs:** 0 mentions (grep: materials_sourcing producer = not found)

### O-09: Infrastructure distance-to-node
**Register:** Infrastructure read with distance-to-node. CODE: none; NEVER | NONE | ABSENT
**Spec:** 04 S6 comp 10, S9 crit 11 - infrastructure read with distance-to-node calculation
**Docs:** 0 mentions (grep: distance_to_node / nearest.*node = 0 hits)

### C-05: Promotion mechanisms (REMOVED by ADR-041)
**Register:** Corroboration counter, promotion state machine, time decay, editorial pickup. CODE: none in src; n/a | n/a | ABSENT (REMOVED by ADR-041)
**Spec:** 05 S5 comp 5,6,7,10 - post promotion mechanisms (removed by ADR-041)
**Docs:** docs/decisions/ADR-041.md

---

## UNCONSUMED ROWS (3)

### C-04: Aggregate instruments / publish_aggregate
**Register:** Aggregate instruments (polls, surveys) and house-seeded benchmark. CODE: DB function publish_aggregate retained (migration 349); NO runtime caller (git grep rpc publish_aggregate finds only attacks.json). UNCONSUMED
**Spec:** 05 S5 comp 3, 4 - aggregate instruments (retired by ADR-042, migration 349)
**Docs:** docs/decisions/ADR-042.md; migration 349 (lines 37, 85-86)

### F-10: Antitrust write-time gates
**Register:** Antitrust write-time gates (k floor, overlap, complement, freeze, bucketing, dominance) in publish_aggregate. CODE: migrations 287/294/347/349; src/lib/propagation/aggregate-safeguards.mjs; NO runtime caller. UNCONSUMED
**Spec:** 08 S5.1, 5.2 - antitrust write-time gates in publish_aggregate
**Docs:** see C-04

### SM-5c: Structured-action extraction
**Register:** Structured-action extraction (PR 832). CODE: scripts/turns/dry-run-structured-actions.mjs (harness family); no workflow caller. Ledger states "no destination column exists on intelligence_items for a structured action; this run extracts and reports only". UNCONSUMED
**Spec:** SM s5 - structured action extraction phase
**Docs:** 0 mentions (PR 832 in git)

---

## UNWIRED ROWS (2)

### SM-3f: Migration 299 (3-slot kit)
**Register:** Migration 299 (3-slot kit). CODE: supabase/migrations/299_item_type_required_slots_wave3.sql (file present, NEVER APPLIED as of 2026-10-07; APPLIED-MAP has no 299 entry). RUN BY: none. UNWIRED (file present, unapplied)
**Spec:** SM s3 - migration 299 (3-slot kit, held by R14)
**Docs:** docs/CLAUDE.md rule 16 (R14 build-mode state)

### SM-10b: Theme backfill script
**Register:** Theme backfill script (apply disabled). CODE: scripts/research/backfill-themes.mjs (harness family theme-backfill run-001; no workflow; apply disabled). RUN BY: none. UNWIRED (script + one artifact; apply disabled)
**Spec:** SM s10 - theme backfill script
**Docs:** 0 mentions

---

END
