## Section 9: Anti-Patterns

These behaviors mean the model was not understood or was deliberately ignored:

- **Expanding category vocabulary to capture distinctions that belong in `source_role`.** A common temptation: "we need an 'analytical_press' category for the 8 analytical-press sources." Operator rejected this in the analytical-press dispatch (2026-05-19). Press content goes in `category='research'` with `source_role='trade_press'` and tier 5-6. Categories are surface routing; roles and tiers are credibility differentiation within a surface.

- **Exact-URL matching at source resolution.** Source registry lookups must canonicalize URLs first via `src/lib/sources/url-canonicalize.ts`. Direct `.eq("url", rawUrl)` calls produce silent duplicates from formatting drift (trailing slashes, www, query-param ordering). Q10 fixed the existing sites; new resolution code must use the helper.

- **Discarding tier-opinions when source already exists.** When Haiku estimates a tier for a cited source and the source already exists with a different tier, do not discard the opinion. Record it per Q3. Aggregated disagreement at 5+ within 90 days surfaces for operator review.

- **Conflating role with bias.** `source_role` (institution type: trade_press, academic_research, regulator) is orthogonal to bias (perspective: industry-incumbent, environmental-advocate, peer-reviewed). A `source_role='academic_research'` source can carry any bias profile across the three bias dimensions. Treating role values as bias values (e.g., assuming academic_research implies peer-reviewed) loses signal and produces wrong customer-facing presentation.

- **Treating tier as fully static when network signals exist.** After Q2 schema lands, the dynamic computed `effective_tier` IS the credibility signal customers and agents should consume. Reading `base_tier` directly when the consumer wants dynamic credibility silently shows stale signal.

- **Adding bias tags to user-generated Community content.** The sources registry concept does not apply to user-generated content. Community uses a different credibility model (author identity + workspace verification + posting history). Conflating the two models produces wrong UI and wrong audit semantics.

- **Skipping URL canonicalization on new source resolution code.** When adding a new source lookup, comparison, or write, use `canonicalizeUrl()` from the helper. Skipping it recreates the same silent-duplicate failure mode Q10 fixed.

- **Reading `sources.tier` directly when the consumer wants the dynamic value.** Per Q2 the schema will have both `base_tier` (static) and `effective_tier` (dynamic). Most consumers want `effective_tier`. A few definitional consumers (the `SourceTier` type definition, classifier prompts that reference the tier 1-7 type taxonomy) want `base_tier`. Per-consumer review at the migration point per the decisions doc Open Sub-Decision.

- **Auto-merging duplicate sources without operator decision.** Q10 surfaced 9 duplicate sets in `sources` plus 29 cross-table collisions. The dispatch policy was surface, do not merge. Merging requires operator judgment for sets like BREEAM vs BRE Group where the canonical name is non-obvious.

## Section 10: Cross-References

- **`environmental-policy-and-innovation`**: defines the 6-level Source Type Hierarchy this skill extends in Section 3. Integrity rule applies to bias tag assignment (no invented tags; assignment grounded in source evidence). Load alongside on intelligence_items work.

- **`caros-ledge-platform-intent`**: defines the five-surface canonical model that drives the per-surface signal sets in Section 8. Intelligence Assistant is the cross-cutting capability per platform-intent Section 4 that surfaces credibility per the Assistant signal set (inline citations + full provenance via the CitationPanel component in `src/components/AskAssistant.tsx`).

- **`sprint-followups-discipline`**: load-trigger rule (fifth named binding rule, added 2026-05-19 alongside this skill) names which dispatches must load source-credibility-model. Sources-schema-touch precondition applies to dispatches that touch the sources table. The Sweep-discipline rule applies to credibility-model audits and reviews.

- **`docs/design-principles.md`**: DP-1 single-pane operator review binds on operator-facing credibility surfaces, particularly the candidate review queue (`canonical_source_candidates` review at `src/components/sources/CanonicalSourceReview.tsx`) and the override mechanism UI (TBD).

- **`docs/sprint-2/source-credibility-model-decisions-2026-05-19.md`**: source-of-truth document for all 10 architectural decisions encoded in this skill. Captured at commit `2e9175a` (merged to master in commit `4943e83`). Open sub-decisions tracked there: per-consumer base_tier vs effective_tier migration calls (Q2), exact half-life value (Q6), per-surface implementation specifics during Tier 4 builds (Q9), bias vocabulary iteration if needed (Q4), T7 weight = 0 confirmation (Q7).
