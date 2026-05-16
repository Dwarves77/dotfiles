---
name: writer-research-summary
description: Generates the 6-section research summary for item_type=research_finding. Honest about study limits; foregrounds operational implications and what the finding does not resolve. Emits markdown body for intelligence_items.full_brief plus the 13-field YAML metadata block via writer-yaml-emission.
---

# Writer: Research Summary

## Purpose

Generates `full_brief` for peer-reviewed research, white papers, and academic findings. Structure preserved from original `environmental-policy-and-innovation` skill lines 431-459 (archived).

The reader question this writer answers: **does this finding change what the workspace should be doing or claiming, and what should the workspace tell clients about it?**

## When to use

When `item_type = research_finding`. Note: per v2 audit Section 5.2, the /research page today contains many items that should not be there (parliamentary portals, housing lotteries, off-domain content). [[classifier-source-onboarding]] + [[classifier-item-type]] keep those out at write time so this writer is invoked only on legitimate research findings.

## Inputs

- `intelligence_items` row + sources join + AVAILABLE SOURCES pool
- Workspace profile (verticals, modes, lanes, planning horizon)
- Source tier (research findings often T4 academic / T6 think-tank; /research accepts T1-T7 with tier labeled)

## Outputs

- Markdown body for `intelligence_items.full_brief`
- 13-field YAML metadata block via [[writer-yaml-emission]]

## The 6 sections

### Section 1: What the Research Found

Headline finding. Methodology in brief. Scope and limitations. Honest about the study's limits.

Per [[rule-no-speculation-as-fact]]: specific numbers, sample sizes, effect sizes, and confidence intervals come from the research paper itself with citation. If the paper does not report a value, the writer does not invent it.

### Section 2: Why This Finding Matters Operationally and Commercially

The mechanism by which the finding affects freight operations or commercial positioning. Filtered by cargo vertical and transport mode.

Per [[rule-cause-and-effect-chain]]: the mechanism is the cause; the operational/commercial change is the consequence; the per-vertical incidence is the effect. The chain is sourced from the paper or from the analytical synthesis the writer surfaces under [[rule-synthesis-from-primary-sources]].

### Section 3: What the Finding Changes for Strategy, Claims, or Decisions

Specific decisions impacted:
- Sustainability claims (what the workspace can credibly say in marketing or RFPs based on this finding)
- Operational choices (when the finding changes a build-vs-buy, hire-vs-automate, or technology-adoption decision)
- Regulatory anticipation (when the finding informs anticipated guidance per [[writer-regulatory-fact-document]] Section 6)
- Vendor selection (when the finding changes which suppliers or tools the workspace evaluates)

SPECIFIC impacts, not generic "implications." If the finding does not change a specific decision for the workspace's profile, the section says so honestly.

### Section 4: Client Conversation Talking Points and Public Position

- What the workspace can credibly say or claim based on this finding
- What questions to pose to clients
- Pitfalls to avoid (overclaiming, citing studies the workspace has not read in full, ascribing causation to studies that show correlation)

### Section 5: What the Finding Does Not Resolve

Limits of the study. Open questions. Conditions for translation into action. Related research that converges or contradicts.

This section is the integrity counterpart to Section 3: where Section 3 names what changes, Section 5 names what remains unresolved. Per [[rule-no-speculation-as-fact]]: the writer does not paper over study limitations to make the finding look more actionable than it is.

### Section 6: Sources

The research paper, peer review status, related research that converges or contradicts. Source list with type labels per [[rule-source-tier-hierarchy]].

## Severity is OPTIONAL on research summaries

Per [[vocabulary-severity-labels]]: severity is mandatory on regulatory/technology/operations/market-signal items where decision pressure exists. Research summaries assign severity only when the finding has clear decision-pressure implications (e.g., a study confirms that a planned regulatory move will impose specific costs; the finding triggers ACTION REQUIRED for workspaces in scope).

For research summaries with no immediate decision pressure (most academic findings), severity is null and urgency_tier = `informational` per [[writer-yaml-emission]] mappings.

## Tier labeling at the card surface

Per operator clarification 2026-05-15: /research accepts T1-T7 with tier labeled. Academic research (T4) and think-tank analysis (T6) commonly appear here; the card surface labels the tier so the reader knows whether the finding has been peer-reviewed (T4) versus is preliminary opinion (T6/T7).

## Inherits

- [[rule-no-speculation-as-fact]]
- [[rule-source-traceability-per-claim]]
- [[rule-cross-reference-integrity]]
- [[rule-workspace-anchored-output]]
- [[rule-fsi-brief-framework]]
- [[rule-source-tier-hierarchy]]
- [[rule-character-normalization]]
- [[rule-synthesis-from-primary-sources]] (especially: identifying when a finding converges or contradicts adjacent research)
- [[rule-cause-and-effect-chain]] (Section 2 mechanism-to-effect chains)
- [[vocabulary-source-tiers]] (tier labeling at card surface)
- [[vocabulary-topic-tags]]
- [[reference-operational-scenarios]]

## Failure modes to avoid

- Section 1 headline that overstates the finding beyond what the methodology supports
- Section 3 "implications" that are generic rather than specific decisions
- Section 5 missing or perfunctory (the integrity counterpart Section 3; without it the brief overclaims)
- Card surface that displays a T4/T6 finding without tier labeling (the reader cannot weight the claim's reliability)
- Causation language applied to correlational studies

## Composition

Composes with [[writer-yaml-emission]] for the metadata block. Composes with [[writer-frame-research]] when rendered on /research surface.

## Audit cross-reference

- Original source skill lines 431-459
- v2 audit Section 2 (Research page assessment) + Section 5.2 (off-domain items currently routed here — fixed at routing layer per [[classifier-page-routing]])
- Operator clarification 2026-05-15 (per-page tier acceptance: /research accepts T1-T7 with tier labeled)
