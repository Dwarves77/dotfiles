# Caro's Ledge skills index — cross-cutting

Cross-cutting skills referenced by every workflow in fsi-app and any related repos. These are rules, vocabularies, and reference data — not workflow logic. Workflow skills live at `fsi-app/.claude/skills/`.

This taxonomy was established 2026-05-15 as a decomposition of the previous monolithic `environmental-policy-and-innovation` skill (archived at `fsi-app/.claude/skills/_archived/environmental-policy-and-innovation-2026-04-29/SKILL.md`). The decomposition was driven by the v2 product audit (`docs/caros-ledge-product-audit-2026-05-15.md`) and the operator's direction to refactor from one general skill into many specific skills.

## Categories

### Rules (13) — composable contracts every writer/classifier/dispatch inherits

Data-shape and emission rules:
- [rule-no-regulatory-inferences-as-fact](rule-no-regulatory-inferences-as-fact/SKILL.md) — never present regulatory interpretation as confirmed fact; require legal counsel caveat
- [rule-no-speculation-as-fact](rule-no-speculation-as-fact/SKILL.md) — every specific number/date/dollar requires inline source or sources_used entry
- [rule-source-traceability-per-claim](rule-source-traceability-per-claim/SKILL.md) — every claim on the card surface carries inline attribution; not buried in full_brief
- [rule-cross-reference-integrity](rule-cross-reference-integrity/SKILL.md) — when the same fact lives in multiple stores, they agree; one canonical writer per fact
- [rule-source-tier-hierarchy](rule-source-tier-hierarchy/SKILL.md) — when sources conflict, weight by tier (T1-T7); migration 063 framework canonical, legacy 7-tier deprecated
- [rule-character-normalization](rule-character-normalization/SKILL.md) — every writer normalizes en/em dashes, smart quotes, double-encoded glyphs to plain ASCII; preserves §, ¶, currency, accented Latin, CJK

Editorial-discipline rules (apply at writer emission for every brief):
- [rule-synthesis-from-primary-sources](rule-synthesis-from-primary-sources/SKILL.md) — active synthesis discipline: source discovery, citation extraction, intersection detection, anticipated-guidance identification, cross-jurisdictional synthesis; the permissive companion to the restrictive integrity rules
- [rule-cause-and-effect-chain](rule-cause-and-effect-chain/SKILL.md) — every data point carries cause + mechanical consequence + effect-by-vertical; data without the chain is noise

Context-framing rules (the three-context architecture):
- [rule-workspace-anchored-output](rule-workspace-anchored-output/SKILL.md) — workspace context only: never name workspace, company, or person; framing driven by workspace's freight context
- [rule-community-attributed-output](rule-community-attributed-output/SKILL.md) — community context only: inverse of workspace-anchored; authors named, peer-to-peer framing, trust signals surfaced
- [rule-group-scoped-features](rule-group-scoped-features/SKILL.md) — every people-listing feature declares its context (workspace/community/personal) and scopes accordingly; no feature filters by all platform profiles
- [rule-fsi-brief-framework](rule-fsi-brief-framework/SKILL.md) — action → cost → context, 3sec/10sec/30sec test, lead-time-as-frame, four-lens requirement (substantive / competitive / client-conversation / action)

Discipline rules (apply at dispatch and recommendation level):
- [rule-cost-weighted-recommendations](rule-cost-weighted-recommendations/SKILL.md) — every architectural recommendation weighs four cost surfaces (one-time + ongoing-runtime + ongoing-infra + inheritance) against three value frames (revenue-blocking / accelerating / polish) before being presented; cost-blind output is a failure mode

### Vocabularies (6) — closed enumerations
- [vocabulary-topic-tags](vocabulary-topic-tags/SKILL.md) — 14 closed values per migration 063 for `intelligence_items.topic_tags` and `sources.scope_topics` (reconciliation in v2 audit Section 6.2)
- [vocabulary-compliance-objects](vocabulary-compliance-objects/SKILL.md) — 19 closed values for `intelligence_items.compliance_object_tags`
- [vocabulary-severity-labels](vocabulary-severity-labels/SKILL.md) — 5 closed values mapped to priority via locked rule
- [vocabulary-source-tiers](vocabulary-source-tiers/SKILL.md) — T1-T7 framework values for `sources.tier`
- [vocabulary-verticals](vocabulary-verticals/SKILL.md) — Dietl/Rockit current-build portfolio vocabulary for `intelligence_items.verticals`; multi-tenant expansion is a follow-up
- [vocabulary-transport-modes](vocabulary-transport-modes/SKILL.md) — air/road/ocean/rail platform enumeration for `intelligence_items.transport_modes`; per-tenant ordering lives in workspace_settings

### References (4) — structured reference data
- [reference-jurisdictions](reference-jurisdictions/SKILL.md) — entity MODEL spec for the jurisdiction layer (11 entity types, hierarchy, alias resolution); the canonical 5,000-10,000 jurisdiction rows live in the jurisdictions entity table per v2 audit Section 6.1, not in this file
- [reference-operational-scenarios](reference-operational-scenarios/SKILL.md) — ~36 open-vocabulary core glossary for `intelligence_items.operational_scenario_tags`
- [reference-priority-source-registry](reference-priority-source-registry/SKILL.md) — curated URL list of priority sources by category
- [reference-resource-taxonomy](reference-resource-taxonomy/SKILL.md) — 7 resource categories with example resource lists

## Rule sequencing for cross-cutting composition

When composing rules, apply in this order:

1. **Foundational data-shape rules at writer emission time** — rule-character-normalization, rule-no-speculation-as-fact, rule-no-regulatory-inferences-as-fact, rule-source-traceability-per-claim, rule-cross-reference-integrity. These shape what reaches the storage layer.
2. **Editorial-discipline rules at writer emission time** — rule-synthesis-from-primary-sources (the permissive companion that authorizes active discovery + synthesis within source-grounding constraint), rule-cause-and-effect-chain (every data point carries cause + mechanical consequence + effect-by-vertical). The restrictive and permissive rules together define what the writer is allowed and required to do.
3. **Foundational framing rules per surface context** — rule-workspace-anchored-output for workspace context surfaces; rule-community-attributed-output for community context surfaces; personal context has no framing rule.
4. **Foundational scoping rules at feature design** — rule-group-scoped-features applies before any feature that lists or surfaces people is built; the context declaration is part of the spec, not a runtime inference.
5. **Foundational discipline rules at dispatch and recommendation level** — rule-cost-weighted-recommendations and rule-cross-reference-integrity apply to every architectural decision, dispatch proposal, and skill change.

The first three apply to runtime artifacts (writer output, feature behavior). The fifth applies to the decisions about WHAT to build. All layers compose.

## How to use these in dispatched-agent prompts

Reference the skill by RELATIVE PATH (not just by name) so the dispatched agent can read each file. Example for a workspace-context writer dispatch:

```
You are a writer for the freight sustainability intelligence platform.

Apply these cross-cutting rules (read each file before composing):
- dotfiles/.claude/skills/rule-no-regulatory-inferences-as-fact/SKILL.md
- dotfiles/.claude/skills/rule-no-speculation-as-fact/SKILL.md
- dotfiles/.claude/skills/rule-source-traceability-per-claim/SKILL.md
- dotfiles/.claude/skills/rule-cross-reference-integrity/SKILL.md
- dotfiles/.claude/skills/rule-character-normalization/SKILL.md
- dotfiles/.claude/skills/rule-workspace-anchored-output/SKILL.md
- dotfiles/.claude/skills/rule-fsi-brief-framework/SKILL.md
- dotfiles/.claude/skills/rule-source-tier-hierarchy/SKILL.md

Use these vocabularies (closed) and references (open):
- dotfiles/.claude/skills/vocabulary-topic-tags/SKILL.md
- dotfiles/.claude/skills/vocabulary-compliance-objects/SKILL.md
- dotfiles/.claude/skills/vocabulary-severity-labels/SKILL.md
- dotfiles/.claude/skills/reference-jurisdictions/SKILL.md
- dotfiles/.claude/skills/reference-operational-scenarios/SKILL.md

Apply this writer for the format selected by item_type:
- fsi-app/.claude/skills/writer-regulatory-fact-document/SKILL.md

Produce a brief for item X.
```

Citing the FULL PATH (not just the name) closes the activation gap: a dispatched agent that receives only a skill name has no canonical way to find the file; a dispatched agent that receives the path can `Read` it directly. This is the operative discipline going forward.

For community-context dispatches, swap `rule-workspace-anchored-output` for `rule-community-attributed-output` and add the community-scoped writer skills (forum-thread-author, vendor-endorsement-author, etc., to be built when community generation is needed).

For dispatch proposals (architectural recommendations, audit work, prework documents), additionally compose:
- dotfiles/.claude/skills/rule-cost-weighted-recommendations/SKILL.md
- fsi-app/.claude/skills/reference-caros-ledge-economics/SKILL.md

For any feature spec that surfaces people, additionally compose:
- dotfiles/.claude/skills/rule-group-scoped-features/SKILL.md

The agent reads each named skill before composing its output. Composition is what allows specific workflows to inherit only the rules and vocabularies they need without absorbing the others.

## Source of truth

The original monolithic skill (815 lines) is preserved at `fsi-app/.claude/skills/_archived/environmental-policy-and-innovation-2026-04-29/SKILL.md`. Every claim in the new skills traces back to a section of that document; the decomposition is structural, not substantive. Substantive evolution from here belongs in the per-skill SKILL.md files with their own changelogs.

## Related documents

- `docs/caros-ledge-product-audit-2026-05-15.md` (v2) — diagnoses the structural failures the skill decomposition addresses
- `docs/caros-ledge-supabase-schema-audit-2026-05-15.md` — table-by-table inventory of the database; informs which skills require schema work
- `fsi-app/.claude/skills/INDEX.md` — project-specific workflow skills (writers, classifiers, extractors, compute, operational)
