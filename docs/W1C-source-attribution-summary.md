# W1.C — Source attribution audit summary

Generated: 2026-05-04T01:18:54.740Z

## Totals

- intelligence_items rows: **164**
- with source_id set: **147**
- with NULL source_id: **17**
  - …of which have a non-empty source_url (recoverable): **8**
- **total mismatches: 2**

## Top 10 mismatched source mappings

Pivoted by the source that the items are *currently* linked to. The breakdown shows the eTLD+1 the item URLs *actually* belong to.

| # | Linked source (current) | Linked eTLD+1 | Mismatched items | Actual host breakdown |
|---|---|---|---|---|
| 1 | UK Legislation | `legislation.gov.uk` | 1 | gov.uk (1) |
| 2 | US EPA Emissions Regulations | `epa.gov` | 1 | arb.ca.gov (1) |

## CARB → EPA mis-attribution (confirmed bug)

**1** intelligence_items rows with `source_url` host `arb.ca.gov` are linked to an EPA source row.

Sample (first 5):

- `l7` — CARB Advanced Clean Trucks
  - linked to: `US EPA Emissions Regulations`
  - actual url: https://ww2.arb.ca.gov/our-work/programs/advanced-clean-trucks
  - suggested action: `create_new_source`

## Suggested action breakdown for W4

| Action | Count | Meaning |
|---|---|---|
| `manual_review` | 1 | Multiple candidate sources match the host, OR the linked source has an unparseable URL — needs human eyes. |
| `create_new_source` | 1 | No source matches this host; W4 must create a stub source row first, then rewire. |

## Estimated W4 effort

- `link_to_existing`: 0 rows → batched UPDATE, ~0 minute(s)
- `create_new_source`: 1 rows across 1 distinct new host(s) → ~5 minute(s) (mostly the new-source review)
- `manual_review`: 1 rows → ~3 minute(s) of human triage
- **estimated total: ~8 minute(s) (0.1 hour(s))** plus QA pass

## Heuristic notes

- Host comparison uses **eTLD+1** matching, not exact host equality. `www.epa.gov` and `epa.gov` are the same; `arb.ca.gov` and `epa.gov` are not.
- US sub-state agencies (`arb.ca.gov`, `energy.ca.gov`, etc.) are deliberately treated as DISTINCT eTLD+1s — see the multi-part suffix list in `audit-source-attribution.mjs`. CARB and CDPR are not the same publisher just because both end in `.ca.gov`.
- Items with NULL `source_id` are tracked separately; they cannot mismatch by definition, but they're an attribution gap W4 should also address.

Full machine-readable mismatch list: `docs/W1C-source-attribution-audit.json`
