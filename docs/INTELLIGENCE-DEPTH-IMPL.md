# Intelligence-Depth Layering — Implementation Notes

Branch: `polish/intelligence-depth`
Date: 2026-05-05

## What shipped

Three-tier progressive disclosure on the regulation detail Summary tab. No agent prompt changes, no DB schema changes, no backfill — pure rendering layer.

- **Tier 1** (existing): the 100-word AI plain-language summary at the top of the Summary tab.
- **Tier 2** (NEW): an "Operational briefing" expander between the AI summary and the Impact assessment bars. Closed by default. When open, renders a severity callout (when applicable) plus first-paragraph previews of the three always-present sections in `regulatory_fact_document` briefs:
  1. Issues Requiring Immediate Action
  2. What This Regulation Is and Why It Applies to the Workspace
  3. How the Workspace Sits in the Compliance Chain
- **Tier 3** (existing, lightly enhanced): the "Full text" tab continues to render the full markdown brief via `IntelligenceBrief`. Tier 2 deep-links switch the user to the Full text tab and scroll to the heading anchor.

## Files

### New
- `fsi-app/src/lib/agent/extract-sections.ts` — pure parser. Exposes:
  - `extractOperationalBriefing(fullBrief)` — pulls the three Tier 2 sections.
  - `extractSectionByHeading(fullBrief, headingText)` — lower-level lookup with H1/H2 + numeric-prefix tolerance.
  - `extractSeverityLabel(paragraph)` — pulls a leading `ACTION REQUIRED` / `COST ALERT` / `WINDOW CLOSING` / `COMPETITIVE EDGE` / `MONITORING` label off a paragraph.
  - `headingSlug(heading)` — heading-to-slug helper that mirrors `IntelligenceBrief`'s anchoring rule (so Tier 2 deep-links land on Tier 3 anchors).
- `fsi-app/supabase/seed/test-extract-sections.mjs` — one-shot test runner.
- `docs/EXTRACT-SECTIONS-TEST.md` — generated test report.
- `docs/INTELLIGENCE-DEPTH-IMPL.md` — this file.

### Modified
- `fsi-app/src/components/regulations/RegulationDetailSurface.tsx` — Summary tab restructure (Tier 2 expander, severity callout, deep-link to Full text). Imports `extract-sections` helpers. Existing polish-ext changes (impact bars block, hidden empty stat tiles, hidden empty deadline card) preserved verbatim.
- `fsi-app/src/components/resource/IntelligenceBrief.tsx` — heading-id and heading-text now strip the `^N\.` numeric prefix that the ACF outlier emits, so Tier 2 deep-links resolve to the same slug regardless of which heading variant the agent produced. Doc-title H1 (`# <Regulation Title>`) and `## Regulatory Fact Document` preamble are now toned down to muted metadata.

## Parser test results

Run:

```
node fsi-app/supabase/seed/test-extract-sections.mjs
```

Result: **7/7 PASS**.

| Brief | Status | Notes |
|---|---|---|
| `w4_ca_sb253` | PASS | All three sections extracted; H1 with H2 sub-headings handled. |
| `w4_ca_sb261` | PASS | Same shape as SB 253. |
| `w4_ca_ab1305` | PASS | Bold-prefix paragraphs handled. |
| `w4_ca_acf` | PASS | ACF-outlier numbered-H2 sections handled (parser strips `^N\.` prefix and matches H2 like H1). |
| `eu-battery-regulation-2023-1542` | PASS | H1 + H2 sub-section pattern same as SB 253. |
| `eu-hdv-co2-standards-2019-1242` | PASS | No doc-title H1 — sections start at H1 level. |
| `eu-net-zero-industry-act-2024-1735` | PASS | H1 with mixed sub-section depths. |

The test runner mirrors the parser's logic in pure JS (no TS compile step) so no build artifacts are required.

## Discovery surfaced beyond the audit

The first parse pass returned PARTIAL on 5/7 briefs — five of the seven `What This Regulation Is and Why It Applies to the Workspace` sections open with an immediate H2 sub-heading (`## Plain-Language Summary` or `## What the Regulation Does`). The original parser stopped capturing at the next heading of any level, which matched the audit's "find the next H1/H2 boundary" pseudo-spec but produced empty bodies for these sections. Fix: the parser now stops at a heading of equal-or-higher level than the matched section (sub-headings stay inside).

A second pass returned PASS on all 7 but with first-paragraph previews like `## Plain-Language Summary` — the H2 sub-heading line itself, since the stripped paragraph splitter treated it as a paragraph. Fix: standalone H2/H3 sub-heading lines are skipped from the first-paragraph slice so the preview leads with the actual prose.

The audit lists `## Plain-Language Summary` and `## Why It Applies to the Workspace` as 2-H2-subs in three briefs (SB 253, EU Battery, NZIA) but did not call out the boundary-detection consequence. This is the kind of detail you only see when you parse all seven against the same algorithm.

## Severity-callout behaviour

When the Immediate Action section's first paragraph leads with one of the five severity labels (`ACTION REQUIRED`, `COST ALERT`, `WINDOW CLOSING`, `COMPETITIVE EDGE`, `MONITORING`), the open expander renders an elevated callout block at the top with:
- Label-keyed tone (mostly maps to existing `--critical` / `--high` / `--moderate` / `--accent` tokens; no new color tokens added).
- First sentence only (not the full paragraph) — the rest of that paragraph is the first paragraph of the Immediate Action subsection below, which would otherwise duplicate the callout text.

Distribution observed across the 7 audited briefs:
- `WINDOW CLOSING — ACTION REQUIRED`: 1 (SB 253)
- `ACTION REQUIRED`: 2 (SB 261, AB 1305)
- `MONITORING`: 3 (ACF, EU Battery, NZIA)
- `COST ALERT`: 1 (EU HDV CO2)
- `COMPETITIVE EDGE`: 0
- (none): 0

All seven briefs lead with a recognised severity label.

## Constraints honoured

- TypeScript clean (`npx tsc --noEmit` exit 0)
- No emojis in code
- Matches RegulationDetailSurface's editorial design language (no Anton in body, semantic color tokens, 8pt grid)
- Light-first per `fsi-app/.claude/CLAUDE.md`
- Pure ESM Node test script
- No agent prompt or schema changes
- Existing polish-ext Summary panel changes (impact bars block, hidden empty tiles, hidden empty deadline card) preserved
