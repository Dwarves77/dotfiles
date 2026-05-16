---
name: rule-synthesis-from-primary-sources
description: The permissive companion to the restrictive integrity rules. Authorizes and requires active synthesis discipline within source-grounding constraint: source discovery beyond what was given, citation extraction of new sources surfaced in agent runs, intersection detection across non-obvious regulation interactions, anticipated-guidance identification from scheduling sources, cross-jurisdictional synthesis. The platform's analytical value depends on these active behaviors. Without them, the writer is a passive summarizer and the platform is just a static compliance tool.
---

# Rule: Synthesis from primary sources

## Source

Original `environmental-policy-and-innovation` skill lines 41-62 (archived at `fsi-app/.claude/skills/_archived/environmental-policy-and-innovation-2026-04-29/SKILL.md`), section titled "Operating Principle: Creative intelligence, accurate grounding." The substance is preserved here; the loaded "creative" framing is dropped in favor of "synthesis from primary sources" which names the actual discipline.

## What this rule requires (and authorizes)

The platform's analytical value is the gap between "passive summary of the source you were given" and "active synthesis grounded in primary sources." Every component honors this rule by doing one or more of the following, always within the source-grounding constraint of [[rule-no-speculation-as-fact]]:

- **Active source discovery.** When a brief's source pool is thin, actively seek additional primary sources rather than emit a thin brief. Surface those sources as provisional via [[classifier-source-onboarding]] for operator confirmation.
- **Citation extraction.** When an agent run surfaces a new source not in the registry, capture it through the citation-extraction pipeline (see `route.ts` lines 481-507). New sources become candidates for the registry.
- **Intersection detection.** When two items in the corpus share operational scenario + compliance object tags, surface the intersection proactively per [[extractor-intersections]]. The reader does not have to ask "does X interact with Y."
- **Brief generation that does substantive work.** A regulatory brief that contains 14 honestly-populated sections about a regulation the agent did extensive analysis on is better than a 14-section brief that copies-and-paste the source text into each section.
- **Anticipated guidance identification.** When scheduling sources (regulator meeting calendars, comitology committee agendas, court docket entries) signal that authoritative guidance is coming, populate the Anticipated Authoritative Guidance section (Section 6 of the regulatory fact document) with the sourced expected event.
- **Synthesis briefs.** When multiple component regulations across jurisdictions converge on a pattern (e.g., five different state EPR programs all aligning on the same producer-registration shape), synthesize the cross-jurisdictional pattern with each component cited inline.

These active behaviors are not optional. A writer that produces only what the source text says, without doing synthesis work the source text doesn't do explicitly, has failed this rule.

## The constraint that keeps synthesis honest

Every output of active synthesis is grounded in primary sources cited inline. The integrity rules apply at the link layer:

- [[rule-no-speculation-as-fact]] — every specific number/date/dollar has an inline source citation or a corresponding entry in `sources_used`
- [[rule-no-regulatory-inferences-as-fact]] — synthesis of regulatory interpretation requires a legal-counsel caveat at the surface where the synthesis appears
- [[rule-source-traceability-per-claim]] — synthesis claims are cited per-claim, not in a bulk sources list at the end
- [[rule-cross-reference-integrity]] — synthesized facts agree with the structured columns; if a synthesized date contradicts `entry_into_force`, the structured column wins and the synthesis is corrected

The boundary: **be active about WHAT to find, conservative about WHAT to claim.** If a synthesis claim cannot be grounded in a verifiable source, the claim is omitted. If a new source is found but cannot be verified, it is flagged as provisional rather than treated as canonical. If a non-obvious intersection is detected but cannot be cited, it is documented as a research gap rather than asserted as a finding.

## Why this rule exists (and why the loaded "creative" framing was dropped)

The source skill framed this as "creative intelligence, accurate grounding." The 2026-05-15 decomposition refined the framing because "creative" reads ambiguously in an integrity-first context — operators legitimately worry that "creative" means "imaginative" which means "made up." The discipline this rule encodes is synthesis from primary sources, not invention.

The restrictive integrity rules ([[rule-no-speculation-as-fact]], [[rule-no-regulatory-inferences-as-fact]]) define what the writer cannot do. This rule defines what the writer must do. Without the permissive companion, the integrity rules become license for passive summarization — "I only wrote what the source said." Passive summarization is the failure mode this rule prevents.

## Six concrete components that honor this rule

| Component | Active behavior | Source-grounding constraint |
|---|---|---|
| Source discovery | Actively seek canonical sources for items with broken/missing sources | New sources verified via [[classifier-source-onboarding]] before integration |
| Citation extraction | Surface new sources from agent runs | New sources land in `provisional_sources` with citation context; operator promotes to `sources` |
| Intersection detection | Identify non-obvious regulation interactions | Per [[extractor-intersections]]: share operational_scenario + compliance_object tags, scored deterministically |
| Brief generation | Substantive work to populate sections with real content | Per [[rule-cause-and-effect-chain]]: cause + consequence + per-vertical effect, each sourced |
| Anticipated guidance | Identify likely-coming events from scheduling sources | Per regulatory fact document Section 6: event type + issuing body + sourced expected date |
| Synthesis briefs | Synthesize cross-jurisdictional patterns | Each component regulation cited inline; the pattern's emergence is the synthesis, not the components |

## Composition

- Inherited by: every writer skill (per-format and per-surface frame), [[classifier-source-onboarding]] (the surfacing pipeline), [[extractor-intersections]] (the detection pipeline), [[extractor-relationships]] (the narrative-linkage extraction)
- Composes with: [[rule-no-speculation-as-fact]] (the restrictive constraint on what synthesis can claim), [[rule-cause-and-effect-chain]] (the structural discipline of every data point synthesis emits), [[rule-source-traceability-per-claim]] (the per-claim attribution discipline)
- Inverse of: passive summarization. There is no rule that authorizes passive summarization; this rule is the active counterpart that the integrity rules constrain.

## Failure mode signatures

- A brief that says exactly what the source URL says, with no inline-cited synthesis beyond the source's own analysis
- A brief with empty Section 6 (Anticipated Authoritative Guidance) when scheduling sources for the regulator are publicly available
- A regulation in the corpus whose intersection with another tracked regulation has never been surfaced (extractor-intersections has not run on this pair, or its strength score is below the dashboard threshold without the writer's `intersection_summary` having captured the coupling)
- A market signal item that names the cause and the consequence but skips the synthesis ("this could materialize into an EU directive in 12-18 months based on the parallel Council and Parliament-rapporteur signals") because the writer treated the signal as a passive observation

## What this rule is NOT

- Not a license to invent. Every synthesis claim is sourced.
- Not a demand for synthesis on every claim. Some claims are direct quotations from the source ("Article 4 mandates 2% blend from January 2025"); these don't need synthesis. The rule applies where synthesis is the value the platform adds.
- Not in conflict with the integrity rules. The integrity rules constrain claims; this rule authorizes the active behaviors that produce claims worth constraining.

## Audit cross-reference

- Original `environmental-policy-and-innovation` source lines 41-62 (Operating Principle: Creative intelligence, accurate grounding)
- Dispatch 2.5 prework Gap 1 (severity Medium; the "creative + accurate" half not previously codified)
- The 14 Rules for All Output (source lines 705-720) rules 1, 4, 5 implicitly require this rule's active synthesis as the input that the restrictive rules then constrain
