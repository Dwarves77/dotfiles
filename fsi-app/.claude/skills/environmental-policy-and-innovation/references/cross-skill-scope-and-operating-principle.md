## Cross-Skill Scope

Other Caro's Ledge skills extend or depend on this skill. Load is additive, not exclusive.

- **`source-credibility-model`** extends the 6-level Source Type Hierarchy to add citation-network scoring, bias tags, recency decay, and operator override logic. Load alongside this skill on any dispatch touching source credibility computation.
- **`caros-ledge-platform-intent`** uses this skill's source-category taxonomy (regulation, directive, standard, guidance, framework, market_signal, initiative, research_finding, technology, innovation, tool, regional_data) to map content to the five customer-facing surfaces (Regulations, Market Intel, Research, Operations, Community).
- **`sprint-followups-discipline`** enforces this skill's integrity rule at the dispatch-report level via the Inference correction rule (no extrapolation from inferences when contradicting evidence is in hand). Cross-dispatch synthesis inherits this skill's grounding requirements.
- **`remediation-discipline`** applies the integrity rule to remediation work: no invented worked examples, concrete instances only, gap labeling on unverified pattern recurrence.

## Operating Principle: Creative intelligence, accurate grounding

The platform actively seeks intelligence beyond what's directly given. When source coverage is thin, it searches for additional sources. When canonical sources are broken or missing, it finds replacements. When regulations intersect non-obviously, it identifies and synthesizes the intersection. When a topic suggests sources should exist that aren't in the registry, it surfaces them as candidates.

This is the platform's core value: creative AND accurate. Generic LLMs are creative but unreliable. Conservative compliance tools are reliable but limited. Caro's Ledge does both.

Every component honors this principle:
- Source discovery: actively seeks canonical sources for items missing or broken sources
- Citation extraction: surfaces new sources from agent runs, even when not explicitly given
- Intersection detection: identifies non-obvious regulation interactions before users ask
- Brief generation: does substantive work to populate sections with real content
- Anticipated guidance: identifies what's likely coming based on scheduling sources
- Synthesis briefs: synthesizes cross-jurisdictional patterns from component regulations

But every claim is grounded in a verifiable source. The integrity rule is non-negotiable:
- No invented facts, no hallucinated content, no plausible-sounding generic filler
- When source coverage is thin, sections are honestly omitted (not filled with invented content)
- When canonical sources can't be found, the gap is flagged (not papered over)
- All synthesis is grounded in component sources cited inline
- All discovered sources are verified before integration

The agent's mandate: be creative about WHAT to find, conservative about WHAT to claim. If you can't ground a claim in a verifiable source, omit it. If you find new sources that should be tracked, surface them as provisional. If you notice connections that should be flagged, document them with citations.
