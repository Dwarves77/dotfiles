---
name: writer-frame-research
description: Per-surface frame for /research. Renders the canonical item as an emerging force (research methodology, expected operational relevance window, planning horizon implications). Accepts T1-T7 with plain-language confidence label at the card per rule-internal-vs-external-surface. Composes with the per-format writer; surface-specific render per v2 audit Section 6.9.
---

# Writer: Frame for /research surface

## Purpose

Renders the canonical item under the research/horizon frame. Foregrounds methodology, source institution credibility (as plain-language confidence label, not tier number), expected operational relevance window (6-36 months typical), planning-horizon implications.

Example: a Norway zero-emission fjords regulation appears on /research (if accompanied by research-finding implications, e.g., MIT CTL has a paper analyzing the regulation's projected emissions impact) as "Research finding: MIT CTL projects 60-80% reduction in heritage-fjord cruise emissions by 2032 [Industry consensus]; methodology is bottom-up vessel-class modeling; planning-horizon implications for cruise-charter contracting."

## Per-page tier acceptance

Per operator clarification 2026-05-15: **/research accepts T1-T7** with plain-language confidence labeling at the card. Academic research (T4) and think-tank analysis (T6) commonly appear here; the card surface labels confidence so the reader knows whether the finding has been peer-reviewed versus is preliminary opinion.

## When to use

When an item is being rendered on /research or /research/[slug]. Item types: primarily research_finding, but also forward-looking standards/frameworks before they become binding.

## Inputs

- `intelligence_items` row + structured facts
- Sources row + tier (internal; academic_research, standards_body, think_tank, intergovernmental_body especially relevant)
- Related items (linked research, regulations the research informs)
- Workspace profile (planning horizon)

## Outputs

Surface-specific text:
- Card body (research frame): "Research finding: [headline]; methodology: [type]; [plain-language confidence]; planning-horizon: [window]; affects [vertical/mode]"
- Hero detail-page text: research framing
- Stat tile values: Source Institution, Methodology Type, Planning Horizon Window, Convergence/Contradiction with Other Research (plain-language: "Multiple sources corroborate" / "Single source signal, unconfirmed")

## Process

1. Identify the research methodology and scope
2. Identify the source institution; translate tier to plain-language confidence label per [[rule-internal-vs-external-surface]]
3. Compute planning-horizon window from item content
4. Identify convergence/contradiction with related research per [[extractor-relationships]]; surface as plain-language
5. Lead with finding per [[rule-fsi-brief-framework]]

## Inherits

- All editorial rules (severity labels are OPTIONAL on research per [[vocabulary-severity-labels]])
- [[rule-fsi-brief-framework]] (action-first when decision pressure exists; informational otherwise)
- [[rule-workspace-anchored-output]]
- [[rule-internal-vs-external-surface]] (plain-language confidence; no tier numbers or scores)
- [[vocabulary-source-tiers]] (internal)
- [[reference-jurisdictions]]

## Failure modes to avoid

- Card surface exposes "T4: peer-reviewed academic" instead of plain-language "Industry consensus" / "Single source signal, unconfirmed"
- Methodology rationale shown as a numeric confidence score
- Convergence/contradiction shown as a count or numeric ("3 of 5 studies agree") rather than plain-language

## Audit cross-reference

- v2 audit Section 6.9
- v2 audit Section 2 (Research page) + Section 5.2 (off-domain items currently routed here — fixed at routing layer per [[classifier-page-routing]])
- Operator clarification 2026-05-15 (per-page tier acceptance + layered transparency)
