# Cap Inventory — every size/truncation constant on the capture → synthesis → grounding → judge path (2026-07-06)

Standing dispatch item 3 (size-cap doctrine — the size-axis analog of the spend ceiling). **Doctrine:** every cap on
the generation/grounding path is either **sized so it never binds in normal operation**, or **fails LOUD** (surfaced
wall + integrity flag) when it binds. Silent slicing is forbidden. Enforced by fitness **F17** + invariant **RD-12**.

| # | Constant | file:line | value | binds in practice? | silent / surfaced | disposition |
|---|---|---|---|---|---|---|
| 1 | `PRIMARY_MAX_CHARS` | generation-config.ts:23 | 600000 | rarely (full enacted texts 57–173 KB ≪ 600 K) | **SURFACED** (`recordTruncation` → coverage_gap flag) | OK |
| 2 | `SYNTH_INPUT_BUDGET_CHARS` | generation-config.ts:33 | 560000 | rarely | **SURFACED** (`buildSourceBlocks` trims → `recordTruncation`) | OK |
| 3 | `SYNTH_PRIMARY_HARD_CEILING_CHARS` | generation-config.ts:42 | 560000 | rarely | **SURFACED** (ceilingWalls → `recordTruncation`) | OK |
| 4 | `CORROBORATOR_MAX_CHARS` | generation-config.ts:27 | 60000 | sometimes (a long corroborator) | **SURFACED-by-design** (corroborator trims are WARNED not flagged — they share the remainder after the full primary, expected operation) | OK |
| 5 | `GROUND_SECTION_MAX_CHARS` | ~~generation-config.ts:48~~ | ~~12000~~ | **BOUND CONSTANTLY** (17 items have a >12 K section; max 32 K) | **WAS SILENT** — the category-2 defect | **RETIRED 2026-07-06** → item 6 |
| 6 | `GROUND_SECTION_HARD_CEILING_CHARS` | section-grounding.mjs | 200000 | **never** (max real section 32 K ≪ 200 K) | **SURFACED** (`recordTruncation` transport `section-ceiling`) | OK (the fix) |
| 7 | slot-forcing judge span `slice(0,1200)` | canonical-pipeline.ts:776 | 1200 | **never** (nominated span ≤ `MAX_NOMINATION_SPAN`=1000 < 1200) | sized-to-never-bind | OK |
| 8 | discovery-prompt `primaryText.slice(0,3000)` | canonical-pipeline.ts:364 | 3000 | binds | not grounding — feeds the "New Sources Identified" discovery hint only | OK (not fact-grounding) |
| 9 | reference-row excerpt `slice(0,180/280)` | canonical-pipeline.ts:629/723/826 | 180/280 | binds | these are REFERENCE rows (result_index 90/91), a label, not a captured source | OK (not a source capture) |
| 10 | classify excerpt `~6000` | haiku-classify.ts:231 | 6000 | **binds** (classifier sees first 6 K) | **SILENT** | **classify-only** (tier/type/entity/portal classification, NOT fact-grounding) — LOW risk, but a silent binder; **REVISIT** (see note) |
| 11 | first-fetch classify excerpt `~6000` | first-fetch-classify.ts | 6000 | binds | SILENT, classify-only | same as #10 |
| 12 | recommend-tier `maxTextLength: 4000` | recommend-source-tier.ts:88 | 4000 | binds | SILENT, classify-only (tier recommendation) | same as #10 |

## Findings
- **The single live silent binder on the FACT-grounding path was #5 (`GROUND_SECTION_MAX_CHARS`=12000)** — fixed (item 6): sections now reach the grounder complete up to a surfaced 200 K ceiling.
- Every other **grounding-path** cap (#1–4, 6) is **surfaced** (integrity_flag on bind); #7 is sized-to-never-bind; #8–9 are not source captures.
- **#10–12 (classify excerpts, 6 K / 4 K) are silent binders on the CLASSIFICATION path, not the grounding path.** A tier/type/portal classifier seeing the first 6 K is usually sufficient (the nature of a source is evident early), so the risk is LOW — but per doctrine they are silent binders. **Named REVISIT** (not converted now): converting classify excerpts is a separate call; flagged here so it is not silent-by-omission. F17 registers them so a NEW classify cap can't slip in unclassified.

## Enforcement
- **F17** (`.discipline/fitness/functions/F17-size-cap-doctrine.mjs`): a REGISTRY of the caps above (each classified). Any NEW `*_MAX_CHARS` / `*_BUDGET_CHARS` / `*_CEILING_CHARS` constant declared on the path that is NOT in the registry is **RED** (a new cap must be classified silent/surfaced/never-binds before it lands), and any registry entry marked `silent-binding-on-grounding-path` is **RED** (the doctrine forbids it). Invariant **RD-12**.
