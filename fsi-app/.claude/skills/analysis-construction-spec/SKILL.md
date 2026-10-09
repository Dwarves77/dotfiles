---
name: analysis-construction-spec
description: Caro's Ledge Analysis Construction Spec and Build Contract. The construction + grounding depth for the FOUR non-regulatory brief formats (Operations Profile, Market Signal Brief, Research Summary, Technology Profile), which previously had only section names and a sentence of intent each — the gap that made non-regulatory output read as content with no direction. EXTENDS environmental-policy-and-innovation, which stays authoritative for the regulatory 14-section format and the shared rules (four lenses, severity labels, cause-and-effect, no-completion-bias). Specifies every section by five things (ingest, transformation, output-and-decision, integrity, grounding model); the four grounding models (span, corroboration-count, matrix, transitive); the Context Rule (no fact renders alone — value+source+date + comparison/conversion + decision consequence by mode/vertical) and the No-Vacuum Rule (cross-pollination: an item's analysis draws direction from its documented relationships to items on OTHER surfaces, via the intersection contract). Includes the build contract: per-format section-extractor + display wiring + one known-good exemplar, the three net-new grounding capabilities, the routing fix, the sequence (Research first, then Market, then Technology; Operations as its own gated data-sourcing program), and the per-format verification bar.
when_to_load:
  - "Any dispatch generating, sectioning, grounding, or wiring a NON-regulatory brief (item_type market_signal/initiative, research_finding, regional_data, technology/innovation/tool)"
  - "Any work on the Market Intel, Research, Operations, or Technology surfaces, their section-extractors, or their item-detail displays"
  - "Any grounding-model work (span / corroboration-count / matrix / transitive); any content-generate.mjs run or section-extractor (analog of extract-regulation-sections.ts) build for a non-regulatory format"
  - "Authoring or validating a known-good exemplar for any non-regulatory format"
  - "Any work touching cross-surface direction / the intersection contract (operational_scenario_tags, compliance_object_tags, related_items, intersection_summary, pair-view.mjs / /api/admin/intersections)"
  - "Borderline: default to load when building, grounding, or displaying any non-regulatory brief. Loads alongside environmental-policy-and-innovation (authoritative for regulatory + shared rules) and caros-ledge-platform-intent."
---

# Caro's Ledge, Analysis Construction Spec and Build Contract, v2.2
Single instruction set for Claude Code. Covers every brief-driven customer surface.
v2 changes: grounding model added as a fifth, per-section declaration; Operations reframed as a
gated data-sourcing program; workspace-anchoring clarified as a surface operation; competitive-
section sparseness calibrated; exemplar reframed as spec validation, not only QA.
v2.1 changes: upstream-classification precondition stated; scope tightened to brief-driven surfaces
(Community owned by its own workstream); the No-Vacuum Rule promoted to a first-class directional
principle, paired with the Context Rule.
v2.2 changes: the Forward-Intelligence Rule gains a fifth point — the workspace's participation /
engagement pathway is now a durable ACTION + COMPETITIVE-lens output requirement (how to join the
trial / consortium / consultation, the window, the edge of joining early), not only a JOLT-regen
behaviour. Reporting who else participates is insufficient; the brief must state how the reader gets in.

## Reference index

Everything not stated in this core moved verbatim, unreworded, to `references/`. Read the file whose trigger fires:
- `references/why-this-exists.md`: the gap this spec closes, before changing any format
- `references/grounding-mechanics.md`: section 2b: GAP claims, slot calibration, format determinism, the span to source to tier chain; read before touching grounding code
- `references/forward-intelligence-rule.md`: section 3c: proactive forward intelligence on every pull and update
- `references/formats-regulatory-operations-market.md`: sections 4 to 6: Regulatory Fact Document, Operations Profile, Market Signal Brief construction; read when editing those formats
- `references/formats-research-technology.md`: sections 7 and 8: Research Summary and Technology Profile construction; read when editing those formats
- `references/build-contract.md`: section 9: the build contract for Claude Code (per-format extractor, display wiring, exemplar, sequence, verification bar)

BINDING: references/grounding-mechanics.md, read before touching grounding, slot calibration or the provenance gate (section: 2b. Grounding mechanics)
BINDING: references/formats-regulatory-operations-market.md, read before editing or generating a Market Signal Brief (section: 6. Market Signal Brief)

## 1. The construction method (every format, every section)
A section is specified by five things, not a title:

1. INGESTS, the raw inputs and source types that feed the section.
2. TRANSFORMATION, how a raw input becomes context. The format's core rule, the analog of the
   regulatory cause-and-effect chain.
3. OUTPUT AND DECISION, what the reader sees and the specific decision it drives.
4. INTEGRITY, sourced and dated, omitted with a note if unpopulated, gaps labeled, never invented.
5. GROUNDING MODEL, how the section's content is proven. One of four (section 2 below).

Six overlays sit on every section, inherited from the skill or stated here:
- The four lenses: substantive, competitive, client-conversation, action.
- A severity label where decision pressure exists: ACTION REQUIRED, COST ALERT, WINDOW CLOSING,
  COMPETITIVE EDGE, MONITORING. Mandatory on regulatory, market, technology, operations; optional
  on research.
- Workspace-anchoring is a SURFACE operation, not a generation operation. Generation is
  workspace-generic: the brief carries all facts and all mode and vertical effect chains, names no
  workspace. The surface filters and ranks to the workspace's regions, modes, and verticals through
  the existing overlay model (workspace_item_overrides, the dashboard RPC, urgency weights). The
  extractor stores everything; the surface decides what each workspace sees. Filtering at
  generation time would break multi-tenancy, since one generated brief serves many workspaces.
- The Context Rule (section 3).
- The No-Vacuum Rule (section 3b). Cross-pollination: an item's analysis draws direction from its
  documented relationships to items on OTHER surfaces, not only from its own source.
- The Forward-Intelligence Rule (section 3c). Proactive, not reactive: surface what is COMING
  (in-progress work, intent, participants, expected timing), not only formalized results — and set
  a monitor re-check trigger for the eventual update. Fires on EVERY pull and EVERY update.

## 2. Grounding models (the four; declared per section)
Grounding is not one operation. Each section declares which of these proves it:

- SPAN: a claim grounded to a verbatim span in fetched OR stored-snapshot source content. The canonical
  grounding engine (`groundBrief` in canonical-pipeline.ts, reached via the snapshot-first verify-item
  entry point). Used by every fact section.
- CORROBORATION-COUNT: a signal's strength proven by N independent sources within a window. Not
  span-matching; it is discovery, independence dedup, and counting. New capability. Market's
  convergence signal.
- MATRIX: a comparison proven by the same dimension sourced across multiple regions; gates on
  coverage (at least two sourced regions per dimension). New capability. Operations' comparison beats.
- TRANSITIVE: a synthesis section carries no span of its own. It is valid only if every factual
  claim in it traces to an already-grounded input section, and it introduces no new unsourced fact.
  The inference connecting the inputs is the construction logic, validated by the exemplar.
  Synthesis sections are grounded LAST and inherit their inputs' integrity, so a gap in an input
  propagates as an honest omit-with-note, never papered over. New, simple, but mandatory.

Build implication: span is reused; corroboration-count, matrix, and transitive are net-new and are
where the real per-format engineering lives. Build the capability before generating the sections
that need it.

## 3. The Context Rule (vertical direction, within the item)
A fact is never presented alone. Every data point renders as:

  (value or claim + source + date) + (a comparison or conversion) + (the decision consequence,
  filtered by transport mode and cargo vertical).

A raw fact is content. The fact plus what it beats or what would flip it, plus what to do about it
for the reader's lanes, is intelligence. Each format states its own second beat.

## 3b. The No-Vacuum Rule (horizontal direction, across surfaces)
Nothing happens in a vacuum. Every item's analysis draws direction from its relationships to items
on OTHER surfaces, not only from its own source. The mechanism already exists — the four
intersection-readiness fields (operational_scenario_tags, compliance_object_tags, related_items,
intersection_summary) plus the persisted connection graph (item_cross_references), scored by
discover.mjs and read back via src/lib/connections/pair-view.mjs / /api/admin/intersections — the
detect_intersections RPC that previously did this in SQL was dropped in migration 265 (flywheel U3
supersession). But this is DIRECTIONAL, not metadata: a
section MUST surface the cross-surface link wherever that link supplies the section's direction.

- A MARKET signal's conversion trigger (S3) is frequently a specific REGULATION — name it, link it.
  That link IS the trigger.
- A RESEARCH finding's "what it changes" (S3) frequently changes a specific regulatory CLAIM or an
  OPERATIONAL decision — link the affected item.
- A TECHNOLOGY profile's procurement window (S7) is frequently driven by a regulatory DEADLINE or a
  MARKET shift — link it.
- An OPERATIONS comparison (S3/S4) is frequently gated by regulatory FEASIBILITY (its own S2) and
  MARKET cost signals — link them.

A claim that ignores its documented relationships is missing direction the same way a fact with no
comparison is. The intersection layer is not decoration on the brief; it is one of the two sources
of the brief's direction. Every format must EMIT the intersection-readiness fields (the 13-field
agent contract already does this) AND CONSUME them where they supply a section's direction; the
surfaces render the relationships via the persisted connection graph, read through
src/lib/connections/pair-view.mjs and served at /api/admin/intersections
(IntersectionDetectionView.tsx is the reading surface).
