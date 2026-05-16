# Caro's Ledge skills index — project-specific (fsi-app)

Project-specific workflow skills for the freight sustainability intelligence app. These are writers, classifiers, extractors, computations, operational mechanics, and one project-economics reference. Cross-cutting rules, vocabularies, and reference data live at `dotfiles/.claude/skills/` (the parent repo's skills folder).

This taxonomy was established 2026-05-15 and consolidated 2026-05-15 (post multi-tenant foundation deploy). See `dotfiles/.claude/skills/INDEX.md` for context and the cross-cutting registry. The companion prework docs that drove the consolidation are at `docs/skill-refinements-prework-2026-05-15.md` (initial decomposition) and `docs/dispatch-2.5-writer-redistribution-prework-2026-05-15.md` (writer redistribution from the 814-line archived source).

A tombstone pointer at `environmental-policy-and-innovation/SKILL.md` (this folder) redirects from the pre-decomposition skill name to this index and to the archived original at `_archived/environmental-policy-and-innovation-2026-04-29/SKILL.md`. Do not load the tombstone at dispatch time; load the relevant sub-skills directly.

## Categories

### Writers (12) — one per format type, plus per-surface frames + card text + YAML emission

Per-format writers (one per item_type → format_type mapping):
- [writer-regulatory-fact-document](writer-regulatory-fact-document/SKILL.md) — 14 sections; for regulation, directive, standard, guidance, framework
- [writer-technology-profile](writer-technology-profile/SKILL.md) — 8 sections; for technology, innovation, tool
- [writer-operations-profile](writer-operations-profile/SKILL.md) — 8 sections; for regional_data
- [writer-market-signal-brief](writer-market-signal-brief/SKILL.md) — 8 sections; for market_signal, initiative
- [writer-research-summary](writer-research-summary/SKILL.md) — 6 sections; for research_finding

Surface writers (writer-frame-* implements per-surface framing per audit Section 6.9):
- [writer-frame-regulations](writer-frame-regulations/SKILL.md) — regulatory frame for /regulations surface
- [writer-frame-market](writer-frame-market/SKILL.md) — market-signal frame for /market surface
- [writer-frame-research](writer-frame-research/SKILL.md) — research/horizon frame for /research surface
- [writer-frame-operations](writer-frame-operations/SKILL.md) — operations/cost-reality frame for /operations surface

Card-surface and emission contracts:
- [writer-summary-card-surface](writer-summary-card-surface/SKILL.md) — operator-facing card text; integrity non-negotiables enforced AT card layer (closes audit S15)
- [writer-yaml-emission](writer-yaml-emission/SKILL.md) — 13-field YAML metadata block emission contract
- [writer-operator-empty-states](writer-operator-empty-states/SKILL.md) — operator-language empty states; replaces developer-facing placeholder copy that leaks schema field names (closes audit S3 + Chrome 5.1)

### Classifiers (6) — deterministic-first per audit Section 6.3
- [classifier-source-onboarding](classifier-source-onboarding/SKILL.md) — 5-axis classification of new source before it ingests
- [classifier-item-type](classifier-item-type/SKILL.md) — source_role + URL pattern + content features → item_type
- [classifier-vertical-mode](classifier-vertical-mode/SKILL.md) — item.verticals[] + item.transport_modes[]
- [classifier-severity-priority](classifier-severity-priority/SKILL.md) — severity emit + priority computation via locked mapping
- [classifier-jurisdiction](classifier-jurisdiction/SKILL.md) — canonical jurisdiction entity refs (no continents, no agency names)
- [classifier-page-routing](classifier-page-routing/SKILL.md) — composes the 5 axis classifiers into the routing decision; itself auditable

### Extractors (3) — pull structured facts from full_brief into typed columns
- [extractor-structured-facts](extractor-structured-facts/SKILL.md) — dates, penalties, enforcement_body, legal_instrument with confidence + span provenance
- [extractor-relationships](extractor-relationships/SKILL.md) — cross-references, supersessions, implementations
- [extractor-intersections](extractor-intersections/SKILL.md) — operational_scenario × compliance_object pairs

### Compute (4) — deterministic computations
- [compute-urgency-score](compute-urgency-score/SKILL.md) — composite formula
- [compute-lead-time](compute-lead-time/SKILL.md) — source_publication_date − first_observed_at
- [compute-sector-relevance](compute-sector-relevance/SKILL.md) — workspace × item.verticals graded score
- [compute-intersection-strength](compute-intersection-strength/SKILL.md) — +3/+2/+5/+2 strength formula

### Operational (8) — system mechanics
- [operational-entity-resolution](operational-entity-resolution/SKILL.md) — match new ingest against existing canonical entities
- [operational-human-review-queue](operational-human-review-queue/SKILL.md) — route low-confidence classifications
- [operational-migration-authoring](operational-migration-authoring/SKILL.md) — when/how to write a Supabase migration
- [operational-rpc-authoring](operational-rpc-authoring/SKILL.md) — RPC patterns with auth.uid() membership check
- [operational-audit-dispatch-pattern](operational-audit-dispatch-pattern/SKILL.md) — read-only audit pattern (parallel agents + synthesis)
- [operational-versioning-and-changelog](operational-versioning-and-changelog/SKILL.md) — append-only versioning + operator-visible change log
- [operational-backfill-pattern](operational-backfill-pattern/SKILL.md) — backfill discipline distinct from migration authoring
- [operational-merge-deploy-workflow](operational-merge-deploy-workflow/SKILL.md) — PR merge → apply-pending → Vercel sequence

### References (1) — project economics
- [reference-caros-ledge-economics](reference-caros-ledge-economics/SKILL.md) — pricing target ($500/mo per workspace), operating cost tiers (Lean $335/mo, Moderate ~$1K, Comfortable ~$8.3K), kill switch as UI surface, unit economics, per-dispatch cost ranges; consumed by [dotfiles/.claude/skills/rule-cost-weighted-recommendations](../../../dotfiles/.claude/skills/rule-cost-weighted-recommendations/SKILL.md)

## How to use these in dispatched-agent prompts

Reference the skill by RELATIVE PATH (not just by name) so the dispatched agent can read each file. Example for an item-regeneration agent (workspace context):

```
You regenerate intelligence_items.full_brief for the freight sustainability platform.

Apply these cross-cutting rules (read each file before composing):
- dotfiles/.claude/skills/rule-no-regulatory-inferences-as-fact/SKILL.md
- dotfiles/.claude/skills/rule-no-speculation-as-fact/SKILL.md
- dotfiles/.claude/skills/rule-source-traceability-per-claim/SKILL.md
- dotfiles/.claude/skills/rule-cross-reference-integrity/SKILL.md
- dotfiles/.claude/skills/rule-character-normalization/SKILL.md
- dotfiles/.claude/skills/rule-workspace-anchored-output/SKILL.md
- dotfiles/.claude/skills/rule-fsi-brief-framework/SKILL.md
- dotfiles/.claude/skills/rule-source-tier-hierarchy/SKILL.md

Use these vocabularies and references:
- dotfiles/.claude/skills/vocabulary-severity-labels/SKILL.md
- dotfiles/.claude/skills/vocabulary-topic-tags/SKILL.md
- dotfiles/.claude/skills/vocabulary-compliance-objects/SKILL.md
- dotfiles/.claude/skills/vocabulary-source-tiers/SKILL.md
- dotfiles/.claude/skills/reference-jurisdictions/SKILL.md
- dotfiles/.claude/skills/reference-operational-scenarios/SKILL.md

Apply this writer for the format selected by item_type:
- fsi-app/.claude/skills/writer-regulatory-fact-document/SKILL.md   (item_type IN regulation/directive/standard/guidance/framework)
(or one of writer-technology-profile, writer-operations-profile, writer-market-signal-brief, writer-research-summary per item_type)

Then apply the surface frame for the rendering surface:
- fsi-app/.claude/skills/writer-frame-regulations/SKILL.md   (when surface = /regulations)
- fsi-app/.claude/skills/writer-frame-market/SKILL.md        (when surface = /market)
- fsi-app/.claude/skills/writer-frame-research/SKILL.md      (when surface = /research)
- fsi-app/.claude/skills/writer-frame-operations/SKILL.md    (when surface = /operations)

End with:
- fsi-app/.claude/skills/writer-yaml-emission/SKILL.md       (the 13-field metadata block)

Output stored in intelligence_items.full_brief; YAML parsed by downstream code per writer-yaml-emission contract.
```

For dispatch proposals (architectural recommendations, audit work, prework documents), additionally compose:
- dotfiles/.claude/skills/rule-cost-weighted-recommendations/SKILL.md
- fsi-app/.claude/skills/reference-caros-ledge-economics/SKILL.md

For any feature spec that surfaces people, additionally compose:
- dotfiles/.claude/skills/rule-group-scoped-features/SKILL.md

For community-context dispatches (when community generation is built), swap `rule-workspace-anchored-output` for `dotfiles/.claude/skills/rule-community-attributed-output/SKILL.md` and use community-scoped writer skills (to be built).

Citing the FULL PATH (not just the name) is the activation discipline. A dispatched agent that receives only a skill name has no canonical way to find the file; a dispatched agent that receives the path can Read it directly.

## Source of truth

The original monolithic skill (815 lines) is preserved at `_archived/environmental-policy-and-innovation-2026-04-29/SKILL.md`. The 5 format-type writers (writer-regulatory-fact-document, writer-technology-profile, writer-operations-profile, writer-market-signal-brief, writer-research-summary) are extracted directly from the corresponding sections of that document.

## Related documents

- `dotfiles/.claude/skills/INDEX.md` — cross-cutting rules, vocabularies, references
- `docs/caros-ledge-product-audit-2026-05-15.md` (v2) — diagnoses what these skills are designed to fix
- `docs/caros-ledge-supabase-schema-audit-2026-05-15.md` — table-by-table inventory; informs which skills require schema work
