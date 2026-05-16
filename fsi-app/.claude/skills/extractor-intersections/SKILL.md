---
name: extractor-intersections
description: Identifies pairs of items that are STRUCTURALLY SIMILAR (sharing operational_scenario_tags AND compliance_object_tags), scored by strength. Output is undirected similarity pairs consumed by the operator-facing Source Health Dashboard intersections sub-tab and per-item metadata strip. Distinct from [[extractor-relationships]], which extracts DIRECTED NARRATIVE EDGES from full_brief prose (A supersedes B, A implements C). The two pipelines answer different operator questions; do not merge them.
---

# Extractor: Intersections

## What this is NOT (read this first)

This is NOT [[extractor-relationships]]. The two skills handle different graph-like data with different inputs, outputs, methods, and consumers. Merging them would conflate narrative linkage with structural similarity.

| Axis | [[extractor-relationships]] | extractor-intersections (this skill) |
|---|---|---|
| Input | Item's `full_brief` prose, AVAILABLE SOURCES pool, related_items UUID array | Item's tag arrays (`operational_scenario_tags` AND `compliance_object_tags`) |
| Method | NLP and pattern extraction over text (citations, "supersedes" language, "implements" language) | Set intersection over tag arrays plus strength scoring |
| Output | Directed edges with relationship_type semantics (A supersedes B; A implements C; A conflicts_with D) | Undirected pairs with shared-tag counts plus strength score |
| Store | Canonical `item_relationships` table per v2 audit Section 6.4 | Intersection store (proposed table or computed-view; see Process below) |
| Consumer | Renderer's LinkedItemsCard, cross-page framing, knowledge graph layer | Source Health Dashboard intersections sub-tab, per-item metadata strip on detail pages, agent's source pool (intersection partners join AVAILABLE SOURCES on regeneration) |
| Trigger | After every full_brief regeneration (the prose changed; re-extract relationships) | After any item's tag arrays change (new item, reclassification, tag backfill) OR periodic batch (full graph recomputation) |
| Semantic | "Item A narratively connects to Item B" | "Items A and B are pattern-similar in operational scenario and compliance role" |
| Operator question answered | "Which items does this one cite, implement, supersede, or otherwise narratively reference?" | "Which items are structurally similar to this one and likely to share compliance posture, regulatory exposure, or operational impact?" |

Both pipelines write to graph-like stores. Both can show edges in a UI. Both feed the operator a sense of how items relate. But they ARE different graphs from different inputs answering different questions.

## Purpose

Computes the structural-similarity graph between items by intersecting tag arrays. Two items are intersected when they share at least one `operational_scenario_tag` AND at least one `compliance_object_tag`. The pair is scored for strength using [[compute-intersection-strength]]. The result drives:

- The Source Health Dashboard intersections sub-tab (operator views the corpus's pattern density)
- The per-item metadata strip on detail pages (operator sees "similar items" without leaving the brief)
- The agent's source pool (when an item is regenerated, intersection partners are added to AVAILABLE SOURCES so the new generation has context on pattern-similar items)

Sharing ONLY a `topic_tag` does NOT constitute an intersection. Topic tags are coarse content-area markers; operational+compliance overlap is the meaningful signal.

## When to use

- **Incremental:** after any item is regenerated (the new item's tags may form new intersections with existing items; recompute pairs involving this item)
- **Backfill:** as a periodic batch over the full corpus (full graph recomputation; expected cost is O(N²) over items with non-empty tag arrays; current corpus N≈655 makes this tractable as a one-time batch and as a weekly refresh)
- **On tag change:** when a classifier reassigns tags on an existing item (the item's intersections may now have shifted; recompute pairs involving this item)

## Inputs

- All `intelligence_items` rows where BOTH `operational_scenario_tags` is non-empty AND `compliance_object_tags` is non-empty (rows with either array empty cannot intersect under the rule)
- The item being processed (for incremental mode)
- Existing `item_relationships` rows from [[extractor-relationships]] (explicit narrative linkage is one input to the strength score; pairs already connected by `references` or `implements` relationship type score higher)

## Outputs

For each identified intersection, one row in the intersection store:

- `pair_first_id`, `pair_second_id` — the canonical pair, ordered so `pair_first_id < pair_second_id` (canonical ordering prevents duplicate pairs)
- `shared_operational_scenario_tags` — text array of the scenario tags both items carry
- `shared_compliance_object_tags` — text array of the compliance object tags both items carry
- `strength_score` — numeric value per [[compute-intersection-strength]]
- `last_computed_at` — timestamp
- `narrative_link_modifier` — boolean indicating whether [[extractor-relationships]] also produced a relationship for this pair (used in the strength formula)

## What counts as an intersection (rule)

Two items A and B intersect when:

1. They share at least one `operational_scenario_tag` (set intersection cardinality ≥ 1)
2. AND they share at least one `compliance_object_tag` (set intersection cardinality ≥ 1)
3. AND both items are not archived (`is_archived = false` on both, OR `is_archived IS NULL`)

Sharing only a topic_tag does NOT constitute an intersection. Sharing only an operational_scenario_tag without a compliance_object_tag does NOT. Sharing only a compliance_object_tag without an operational_scenario_tag does NOT.

## Process

1. Pull all items with `operational_scenario_tags <> '{}' AND compliance_object_tags <> '{}' AND is_archived IS NOT TRUE`
2. For each pair (A, B) where A.id < B.id:
   - Compute shared_operational_scenario_tags = A.operational_scenario_tags ∩ B.operational_scenario_tags
   - Compute shared_compliance_object_tags = A.compliance_object_tags ∩ B.compliance_object_tags
   - If both arrays are non-empty, this is an intersection
3. For each intersection, compute strength via [[compute-intersection-strength]] using:
   - Count of shared scenario tags
   - Count of shared compliance object tags
   - Whether the pair has an explicit [[extractor-relationships]] edge (narrative_link_modifier)
   - Recency weighting (recent items get slight boost)
4. Canonicalize pair ordering (already done by the A.id < B.id constraint above)
5. UPSERT to the intersection store (matches existing pair to avoid duplicates; updates strength on tag changes)

For incremental mode (after one item changes), only recompute pairs involving the changed item. For full batch mode, recompute all pairs.

## Inherits

- [[reference-operational-scenarios]] (the open vocabulary for operational_scenario_tags; intersection logic respects this vocabulary)
- [[vocabulary-compliance-objects]] (the closed vocabulary for compliance_object_tags; intersection logic respects this vocabulary)
- [[compute-intersection-strength]] (the strength scoring formula; this extractor calls it but does not define it)
- [[rule-cross-reference-integrity]] (the intersection store is canonical; readers query it, not recompute on the fly)
- [[rule-cost-weighted-recommendations]] (a full batch recomputation at corpus scale touches every item-pair; cost frame matters when scoping)

## Composition

Reads from:
- [[writer-yaml-emission]] outputs (the tag arrays it emits)
- [[extractor-relationships]] (explicit narrative linkage is one input to the strength score; +5 modifier on the strength formula per [[compute-intersection-strength]])

Output consumed by:
- Source Health Dashboard intersections sub-tab (operator-facing pattern detection)
- Per-item metadata strip on detail pages (intersections shown alongside the brief)
- Agent's source pool (when an item is regenerated, intersection partners with strength above a threshold join AVAILABLE SOURCES for context; threshold is per [[compute-intersection-strength]])

Explicitly NOT mergeable with [[extractor-relationships]]. The decision to keep separate is encoded in this skill's frontmatter description and the "What this is NOT" section above. Future operators reading this skill see the distinction first.

## Cost frame (per [[rule-cost-weighted-recommendations]])

- One-time agent work: low for the script itself; the strength formula and the SQL UPSERT are deterministic. No AI calls. ~$0 in API spend.
- Ongoing runtime: O(N²) for full batch where N is items with both tag arrays non-empty. At N≈655 today, the pair count is ~214,000; most pairs do not intersect and are filtered cheaply by the AND condition. Incremental mode is O(N) per item changed. Estimated batch cost: <$1/run; incremental: trivial.
- Ongoing infrastructure: one new table (intersection store) OR a computed view; no tier impact
- Inheritance: low; this skill is consumed by a small set of UI surfaces and the agent's source pool
- Value frame: revenue-accelerating (operator-facing pattern detection is a premium-tier capability; not revenue-blocking today)
- Manual gating: full batch recomputation runs nightly per default; the cadence is operator-configurable per [[reference-caros-ledge-economics]] tier model

## Audit cross-reference

- v2 audit Section 6.4 (knowledge graph layer; this skill is the structural-similarity arm of the graph, [[extractor-relationships]] is the narrative arm)
- Archived monolithic skill `_archived/environmental-policy-and-innovation-2026-04-29/SKILL.md` "Intersection Detection" section
- Operator decision 2026-05-15 (approved in skill-refinements-prework-2026-05-15.md item 8): KEEP SEPARATE from [[extractor-relationships]]; clarify the distinct use case
