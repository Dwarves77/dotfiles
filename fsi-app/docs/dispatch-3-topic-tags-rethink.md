# Dispatch 3: intelligence_items.topic_tags Vocabulary Rethink

**Status:** placeholder doc; the dispatch itself has not started. This file captures the findings from dispatch 2's prework that motivate dispatch 3 and the six specific questions dispatch 3's own prework must answer.

**Parent dispatch:** Dispatch 2 (vocabulary CHECK constraints + validation layer). Migration 078 constrained 4 vocabularies; intelligence_items.topic_tags was DESCOPED to this dispatch. See `docs/dispatch-2-prework-2026-05-15.md` for the verified ground truth and the operator decision to descope.

---

## Why this dispatch exists

Dispatch 2's prework discovered that `intelligence_items.topic_tags` has drifted to a degree the original dispatch scope did not anticipate. The simple "remap 7→14 with CASE statements" plan does not work because:

1. **1,781 distinct values are currently in use in `intelligence_items.topic_tags`.** Verified 2026-05-15 via `fsi-app/scripts/tmp/dispatch2-prework-introspect.mjs`; raw output at `fsi-app/scripts/tmp/dispatch2-prework-introspect.json`.

2. **319 rows use the OLD 7-value list** (`emissions`, `fuels`, `transport`, `reporting`, `packaging`, `corridors`, `research`) that the Sonnet agent path enforces via `parse-output.ts` (pre-dispatch-2 state).

3. **92 rows use the NEW 14-value list** (per migration 063 + `vocabulary-topic-tags` skill).

4. **2,636 rows use 1,770 values outside both lists.** This drift is the long tail of bypass writer paths (admin SQL, seed scripts, pre-B.2 legacy).

5. **The drift includes legitimate operational concepts, not just noise:**
   - `air_quality` (36 rows)
   - `legislative_process` (32 rows)
   - `sustainability` (26 rows)
   - `waste_management` (25 rows)
   - `decarbonization` (24 rows)
   - `renewable_energy` (23 rows)
   - `climate_change` (22 rows)
   - `environmental_compliance` (18 rows)
   - `energy_efficiency` (15 rows)
   - `biodiversity` (13 rows)
   - `climate_action` (12 rows)
   - `water_quality` (12 rows)
   - `water_management` (11 rows)
   - `circular_economy` (11 rows)
   - `state_government` (11 rows)
   - `electric_vehicles` (11 rows)
   - `environmental_policy` (11 rows)
   - `supply_chain` (10 rows)
   - `energy_transition` (10 rows)
   - `regulatory_framework` (10 rows)
   - … 1,750 more values, mostly long-tail (≤5 occurrences each)

6. **Counterintuitive contrast: `sources.scope_topics` is 100% clean.** 14 distinct values in use, all 14 in the migration 063 canonical list, zero drift. The same 14-value vocabulary works perfectly for sources but accumulates massive drift for items.

This contrast suggests **items may need a different vocabulary structure than sources.** Sources answer "what does this source cover broadly" — a coarse classification axis. Items answer "what is this item specifically about" — which demands more granular tagging.

The dispatch-2 prework presented four options:

- **A.** Per-row Haiku classification of 2,636 drift rows (~$50-100 spend, ~30 min wall time, high quality)
- **B.** Bulk null-and-reclassify (immediate $0, deferred regeneration cost ~$100 over months, quality depends on regen coverage)
- **C.** Vocabulary scope rethink (this dispatch)
- **D.** Defer entirely

Operator decided **D + this dispatch**: ship dispatch 2's clean constraints now, and open this dispatch to do content-judgment prework on whether items need a different vocabulary structure.

---

## What dispatch 3 must answer (six questions, all required before any code)

Dispatch 3 starts with its own prework doc that surfaces verified answers to each of the following six questions. No migration SQL, no application code, no constraints are authored until operator review of the answers.

### Question 1: Are the 14 canonical values the right PARENT categories for a two-level taxonomy, or should the parents be different?

The 14-value list (regulatory, finance, technology, fuel, labor, infrastructure, environmental, social, governance, transport, packaging, customs, conservation, materials_science) was designed for source classification (migration 063 Axis 4a). Item-level tagging may need a different parent structure entirely. Examples to consider:

- Are `regulatory` and `governance` distinct parents at the item level, or do they collapse? (At the source level, regulatory means "the source publishes regulations"; at the item level, almost every item is regulatory in some sense.)
- Is `environmental` too broad as a parent? The drift has `air_quality`, `water_quality`, `climate_change`, `biodiversity`, `decarbonization` — these all roll up to environmental, but at different granularities.
- Do `social`, `labor`, `conservation` belong at the item layer at all, or are they source-classification-only?

**Output expected:** a proposed parent vocabulary (might be the same 14, might be 8-12 of them, might be a different set).

### Question 2: Which of the 1,770 drift values are legitimate operational concepts vs accidental / duplicate / noise values?

Frequency analysis on the drift values is the starting point. Each top-N entry (suggested N = 50 covering ~80% of drift rows) gets operator judgment:

- Keep as a legitimate child tag under one of the parents (e.g., `air_quality` under `environmental`)
- Map to an existing canonical value (e.g., `regulatory_framework` → `regulatory`)
- Drop as noise (e.g., a typo of an existing tag, or a category meta-tag with no content meaning)

The long tail (1,720 values with ≤5 occurrences each) gets bulk-handled, likely all mapped to either an emerging child tag or dropped.

**Output expected:** disposition for each of the top 50 drift values, plus a bulk policy for the long tail.

### Question 3: How does the item-level taxonomy interact with `reference-operational-scenarios` (open vocabulary)?

`operational_scenario_tags` is an open vocabulary anchored by the core glossary in `reference-operational-scenarios` (currently 36 values in the core list, used to drive intersection detection per `extractor-intersections`). The risk:

- Overlap: if topic_tags adds `customs-declaration-import` and operational_scenario_tags also has `customs-declaration-import`, the same operational fact is encoded twice in different columns.
- Contradiction: if topic_tags carries `transport` for an item that has `vessel-port-call` in operational_scenario_tags, there is no contradiction; but if topic_tags adds child-level `ocean-shipping` while operational_scenario_tags carries `vessel-port-call`, they overlap with subtle differences.
- Granularity mismatch: topic_tags' new structure may end up at the same granularity as operational_scenario_tags, blurring the distinction.

**Output expected:** an explicit rule for what topic_tags carries vs what operational_scenario_tags carries. Example: "topic_tags is the WHAT (subject matter); operational_scenario_tags is the HOW (operational mechanism)." Or, alternatively: "operational_scenario_tags is the canonical operational layer; topic_tags is a coarser editorial-routing axis." The rule must be unambiguous enough that a classifier can decide which column a given tag belongs in.

### Question 4: What does the new taxonomy mean for the agent ingestion pipeline?

`parse-output.ts` validates agent emissions. After dispatch 2, the validator delegates to `vocabularies.ts` which currently mirrors the old/new 14-value list as `TOPIC_TAG_VOCAB`. The new taxonomy almost certainly changes this. Specific questions:

- Does `vocabularies.ts` add a hierarchy type (e.g., `{ parent: string, children: string[] }`)?
- Does the agent emit one tag or a parent+children pair (e.g., `topic_tags: [{ parent: "environmental", child: "air_quality" }]`)?
- Does the system prompt at `fsi-app/src/lib/agent/system-prompt.ts:268-278` (still hardcoded with the old 7 values) get rewritten with the new structure?
- Does the agent's validation produce a soft-warning on out-of-vocab tags (operator-review queue) or hard-fail (regeneration aborted)?

**Output expected:** a concrete plan for `parse-output.ts` and `system-prompt.ts` changes, with the cost frame.

### Question 5: Migration path for the 2,636 drift rows

After the new taxonomy is defined, the existing 2,636 drift rows need to be either:

- **Mechanical UPDATE:** each drift value maps deterministically to one or more new-taxonomy values. Backfill SQL handles it. Low cost. Quality depends on how clean the mapping is.
- **Per-row content classification:** Haiku reads each row's content and emits new-taxonomy tags. Higher cost (~$50-100 in API spend). Higher quality.
- **Bulk null + regenerate:** set all drift rows' topic_tags to empty; let the regeneration cycle re-tag through the constrained writer. Lowest immediate cost; quality depends on regeneration coverage.
- **Hybrid:** mechanical for the top 50 (covering ~80% of drift rows); per-row for the long tail; or vice versa.

**Output expected:** a recommended migration approach with the cost frame per surface (one-time agent work, ongoing runtime, ongoing infrastructure, inheritance) and the value frame.

### Question 6: Cost frame per [[rule-cost-weighted-recommendations]]

Each of the migration-path options in Question 5 carries different costs. The prework's cost analysis names:

- **One-time agent work:** mechanical UPDATE is low; per-row Haiku is medium ($50-100); hybrid is medium; bulk null + regenerate is low immediate + deferred.
- **Ongoing runtime:** none if mechanical or hybrid; the regenerate-driven path adds ~$100 in Sonnet calls over months.
- **Ongoing infrastructure:** none for any approach.
- **Inheritance:** HIGH whichever approach is chosen, because the new vocabulary becomes the contract every future writer composes with. This is exactly the case where the inheritance cost is the load-bearing surface (per the four-surface rule).
- **Value frame:** revenue-accelerating (data integrity at the storage boundary supports the $500/mo credibility floor); arguably revenue-blocking-adjacent if a paying tenant's UX depends on accurate topic_tag filtering.
- **Manual gating:** the migration runs once; per-row classification cost is gated by operator approval of the dispatch (not per-event compute).

**Output expected:** the full cost table for the recommended approach, in the format `[[rule-cost-weighted-recommendations]]` requires.

---

## Skill citations (for dispatch 3's own prework, when authored)

When dispatch 3 launches, its prework cites at minimum:

- `dotfiles/.claude/skills/rule-cost-weighted-recommendations/SKILL.md` (cost frame at decision points)
- `dotfiles/.claude/skills/rule-cross-reference-integrity/SKILL.md` (vocabulary integrity at the storage boundary)
- `dotfiles/.claude/skills/vocabulary-topic-tags/SKILL.md` (the canonical list that this dispatch may revise)
- `dotfiles/.claude/skills/reference-operational-scenarios/SKILL.md` (the adjacent vocabulary whose interaction Question 3 must resolve)
- `fsi-app/.claude/skills/classifier-page-routing/SKILL.md` (page routing reads topic_tags; changes to the vocabulary may affect routing)
- `fsi-app/.claude/skills/operational-migration-authoring/SKILL.md` (migration patterns)
- `fsi-app/.claude/skills/operational-backfill-pattern/SKILL.md` (the 2,636-row backfill is load-bearing)
- `fsi-app/.claude/skills/extractor-intersections/SKILL.md` (intersections read tag arrays; a topic_tags vocabulary change touches this extractor's behavior)

---

## What dispatch 3 is NOT

- Not a vocabulary RESCUE for sources.scope_topics (already clean and constrained in migration 078)
- Not a refactor of operational_scenario_tags (open vocabulary by design; the shape constraint in migration 078 is sufficient)
- Not the source registry hygiene work (separate dispatch later)
- Not the per-surface framing work (Section 6.9, separate dispatch)

---

## Related documents

- `docs/dispatch-2-prework-2026-05-15.md` — the prework that surfaced the topic_tags drift
- `fsi-app/scripts/tmp/dispatch2-prework-introspect.mjs` — the introspection script
- `fsi-app/scripts/tmp/dispatch2-prework-introspect.json` — raw query output
- `fsi-app/supabase/migrations/078_vocabulary_check_constraints.sql` — what dispatch 2 actually shipped (no topic_tags constraint)
- `dotfiles/.claude/skills/vocabulary-topic-tags/SKILL.md` — the canonical vocabulary (subject to revision by this dispatch)
- `caros-ledge-product-audit-2026-05-15.md` v2 Section 6.2 — the topic_tags / scope_topics / intelligence_types deprecation plan that informs this dispatch
