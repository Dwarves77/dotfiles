---
title: A5 Sprint-3 Close — Verification & Coverage
date: 2026-05-27
status: A5.1-A5.5 shipped; A5.6 = this audit
commits:
  - A5.1 6ead923 (parser for 7 sections)
  - A5.2 ab16214 (backfill, 438 rows upserted)
  - A5.3 c44415e (sections render path + 5 new section components + 1 integrator)
  - A5.4 640dbea (Impact Assessment gradient-bar rebuild)
  - A5.5 26ebea5 (Why It Matters visual alignment to mockup .why block)
---

# Sprint 3 A5 — Verification Audit

The five-commit A5 batch closes Sprint 3 Group A's design-handoff-2026-05
regulation-detail rebuild scope. This audit documents end state, coverage
metrics, and operator-side verification steps.

## What shipped

| # | Commit | File(s) | Effect |
|---|---|---|---|
| A5.1 | `6ead923` | `src/lib/agent/extract-regulation-sections.ts` | Discriminated-union parser for 7 numbered sections (§3/§4/§8/§10/§11/§14/§15). Pure function; no DB writes. |
| A5.2 | `ab16214` | `scripts/sprint3-a5-backfill.mjs`, `docs/audits/sprint3-a5-backfill-2026-05-27.md` | Backfilled 438 rows into `intelligence_item_sections` from 66 of 68 active D1 items. 89.7-95.6% per-section coverage. |
| A5.3 | `c44415e` | `src/lib/supabase-server.ts` (fetcher), `src/app/regulations/[slug]/page.tsx` (fetch + thread), `src/components/regulations/RegulationDetailSurface.tsx` (sections prop + render slot), `src/components/regulations/sections/*` (7 new files) | Sections render path live on /regulations/[slug]. |
| A5.4 | `640dbea` | `src/components/resource/ImpactScores.tsx` | Gradient-bar rebuild to mockup `.impact-card`; operator Q4 label mapping (3→High, 2→Moderate, 1→Low, 0→hide). |
| A5.5 | `26ebea5` | `src/components/regulations/RegulationDetailSurface.tsx` (Why It Matters block) | Visual alignment to mockup `.why` block; Path-C conditional preserved. |

## Coverage summary

From A5.2 backfill report:

```
Items inspected:                68 (active, D1, non-empty full_brief)
Items with ≥1 parsed section:   66
Items with NO parseable sections: 2
Rows upserted:                  438
Upsert failures:                0

Per-section coverage:
  §3  64/68  (94.1%)
  §4  62/68  (91.2%)
  §8  61/68  (89.7%)
  §10 61/68  (89.7%)
  §11 61/68  (89.7%)
  §14 65/68  (95.6%)
  §15 64/68  (94.1%)
```

The 2 misses had `full_brief` content without recognizable §-numbered
section headings. Both render the existing summary block; sections
silently omit per integrity-rule discipline.

## Operator-side verification

Load /regulations/[slug] for 3-5 D1 regulations. Confirm:

1. **§3 Action list:** severity chip + label + body per row. Severity colors map to the 5 SKILL labels.
2. **§4 Compliance Chain:** prose body + (when present) italic source footer.
3. **§8 Obligations table:** 4-column (Obligation, Deadline, Status, Next action). Header has small-caps eyebrow style.
4. **§10/§11:** prose-only sections rendering the same shape (uses the shared `ProseSection`).
5. **§14 Timeline:** date-column-left + label-right grid; trailing source italic line when present.
6. **§15 Sources:** tier badge (T1-T5 color-coded) + bold source name + meta. URL linkified when present.
7. **Impact Assessment:** 4-row gradient bars; score badge fraction `<b>X/3</b> · Label`; 0-scored rows omitted.
8. **Why It Matters:** small-caps eyebrow, blue left-border, raised-surface background, 14.5px prose at 1.6 line-height; renders only when reasoning OR whyMatters non-empty.

## Known follow-ups (Sprint 4 candidates)

1. **Why It Matters Path A regeneration.** 520 of 641 corpus rows have empty `reasoning` AND `why_matters`. The block hides for them. Path A is a Sonnet regeneration pass with explicit "emit 2-paragraph editorial Why It Matters" prompt.
2. **§15 tier resolution via DB join.** Current parser extracts tier from inline markdown markers ([T2], "Tier 2", etc.). Operator Q2 confirmed the long-term path is joining `intelligence_item_sections.source_ids[]` → `sources.base_tier`. Awaits per-regeneration agent persist step that populates `source_ids`.
3. **Per-regeneration sections persist.** A5.2 backfill is a one-shot script. The /api/agent/run route should also persist sections on every regeneration so the table stays in sync without re-running the script. Out of A5 scope; deserves its own commit.
4. **CORPUS-RECLASSIFY-SOURCES.** Operator surfaced misclassified source-aggregator rows in the /regulations corpus (e.g. EBA homepage rendered as a regulation). Investigation running in parallel; reclassify dispatch follows.
5. **INGESTION-CLASSIFY-SOURCE-VS-REGULATION.** Post-reclassify hardening of the agent classification step so the misclassification doesn't reproduce.

## Sprint 3 Group A status

| Dispatch | Status |
|---|---|
| A1 | GREEN (ratified 2026-05-27) |
| A2 | 24h ingestion monitoring continues |
| A3 | community_posts existence pending |
| A4 | GREEN (ratified 2026-05-27) |
| A5 | GREEN (this audit) |
| A6 | Blocked on operator commit of full operations.html |

After operator verifies the /regulations/[slug] surface, Sprint 3 Group
A formally closes pending A6's operations.html dependency.

## Next dispatch

Per operator's standing instruction ("continue down the unblocked queue
after A5 closes"):

- A6 — blocked on operations.html commit
- SF-2 Phase 1 — verification in parallel
- CORPUS-RECLASSIFY-SOURCES — investigation in flight, fix-shape pending operator green-light on candidates
- RPC-MASTHEAD Option B — held until A-series fully closes
- Sprint 4 backlog: VERTICAL-TAGGING, ADDITIVE-FILTER-SEMANTICS, RESOLVE-ORG-ID-MEMOIZATION, rename src/proxy.ts → src/middleware.ts, AUTO-PROVISION-ORG-ON-SIGNUP, MIGRATION-LEDGER-REPAIR, TIMESERIES-WORKER, MARKET-DETAIL-BAND-PILL-AFFORDANCE, INGESTION-CLASSIFY-SOURCE-VS-REGULATION

Holding for operator on (a) /regulations/[slug] visual verification, (b) CORPUS-RECLASSIFY findings review and fix-shape pick, (c) operations.html commit to unblock A6.
