---
title: A5.2 Sections Backfill Coverage Report
date: 2026-05-27
status: Complete; intelligence_item_sections populated
script: scripts/sprint3-a5-backfill.mjs
---

# A5.2 — intelligence_item_sections backfill coverage

Script `scripts/sprint3-a5-backfill.mjs` was run against production
(direct service-role write per migration-file-discipline, operator Q3
confirmation, same pattern as A1.6).

## Scope

- Source: `intelligence_items WHERE domain = 1 AND is_archived = false AND full_brief IS NOT NULL`
- Parser: `src/lib/agent/extract-regulation-sections.ts` (A5.1)
- Target: `intelligence_item_sections` (migration 103) — UPSERT on `(item_id, section_key)`

## Coverage report

```
Items inspected:                68
Items with ≥1 parsed section:   66
Items with NO parseable sections: 2
Rows upserted:                  438
Upsert failures:                0

Per-section coverage (% of inspected items with that section parsed):
  §3 :   64 / 68  (94.1%)   Issues Requiring Immediate Action
  §4 :   62 / 68  (91.2%)   How the Workspace Sits in the Compliance Chain
  §8 :   61 / 68  (89.7%)   Substantive Requirements
  §10:   61 / 68  (89.7%)   Registration and Reporting Obligations
  §11:   61 / 68  (89.7%)   Operational System Requirements
  §14:   65 / 68  (95.6%)   Confirmed Regulatory Timeline
  §15:   64 / 68  (94.1%)   Sources
```

## Items with no parseable sections (2)

These rows have full_brief content but no recognizable §-numbered section
headings. They render the existing summary block on the regulation
detail page; A5.3 sections-render path will surface nothing for them
(integrity-preserving silent omission).

- `8cb6e73e-1c35-428f-8f5c-f1ee51a9e169` — European Banking Authority - Key Regulatory Updates and Supervisory Framework
- `r28` — H2 Accelerate

## Observations

1. **§3 / §14 lead at 94-96%.** Action lists and regulatory timelines are the most consistently emitted sections across the corpus. The A5.1 parser handles bulleted variants robustly.
2. **§8 / §10 / §11 tie at 89.7%.** Same 7 items miss all three — suggests a common cause (briefs that don't separately number obligation/reporting/operational requirements). Worth a spot-check but not blocking A5.3.
3. **All-or-none rare.** Only 2 items have ZERO parsed sections — the parser is permissive enough that any §-numbered brief produces at least one row.
4. **Idempotent UPSERT.** Re-running the script returns the same 438 rows, no duplicates. Safe to re-run when regenerations update full_brief content.

## What this enables

A5.3 can now query `intelligence_item_sections` directly to render the
7-section block on `/regulations/[slug]`. The render path drops the
existing markdown re-parse on every request — sections come pre-parsed
from the DB instead.

Storage convention: `content_md` holds the raw markdown body per section
(per migration 103 comment that "markdown stays as the authoritative
content body"). A5.3 re-runs the A5.1 parser at render time to derive
the structured payload (ActionListItem[], ObligationRow[], etc.). This
lets parser logic evolve without DB migrations.

## Next steps

1. A5.3 — sections render path on RegulationDetailSurface
2. A5.4 — Impact Assessment gradient-bar rebuild
3. A5.5 — Why It Matters visual alignment
4. A5.6 — verification audit doc

Re-run cadence: after each agent regeneration pass that touches
full_brief, the backfill script can be re-run to refresh
intelligence_item_sections. A follow-up dispatch (out of A5 scope)
should wire the parser into `/api/agent/run`'s update step so per-
regeneration writes happen automatically without a separate backfill.
