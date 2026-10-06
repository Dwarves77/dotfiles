## 14. `review-apply-canonical-candidates` (RETIRED)

**Status**: retired by lane G6-GATES (2026-10-05). The step, its option in `maintenance.yml`, its wrapper
(`fsi-app/scripts/maintenance/review-apply-canonical-candidates.mjs`), the apply script
(`fsi-app/scripts/review/apply-canonical-candidates.mjs`), the digest library
(`fsi-app/scripts/review/lib/canonical-candidates.mjs`) and their tests are deleted, and the digest
builder (section 6) no longer builds a canonical-candidates queue.

**Why**: operator ruling, no human gates. The step applied an operator-ruled group digest to
`canonical_source_candidates`, and a group-ruled `accept` could only ever resolve a candidate whose URL
already matched a registered source. Section 38 (`canonical-autoverify`) rules every pending candidate by
rule, all the way to a terminal outcome, so nothing is left for a ruling file to decide.

**Where the work lives now**: section 38, `canonical-autoverify`. The coordinator may drop this index line
when the runbook index is next edited.

---
