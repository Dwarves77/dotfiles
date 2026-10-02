# Source Credibility Model: Architectural Decisions Capture (2026-05-19)

**Date:** 2026-05-19
**Branch:** `doc/source-credibility-model-decisions`
**Status:** DECISIONS CAPTURE. Source-of-truth artifact for Build 8 (Research), Build 4.5+ (sources schema work), the (pending) `source-credibility-model` skill, and downstream Tier 4 build dispatches (Builds 7, 9, 10, 11).
**Dispatch type:** Documentation-only capture. No code. No design surface. Companion sibling dispatches: `feat/q8-assistant-citation-surfacing` (Q8 fix-now) and `feat/q10-url-canonicalization` (Q10 fix-now), both dispatched in parallel.

## Why this document exists

A long architectural conversation on 2026-05-19 closed 10 questions about the source credibility model. The landed decisions lived only in the conversation transcript. Build 8, Build 4.5+, the source-credibility-model skill (TBD), and future build dispatches needed a captured artifact to reference as source of truth. Operator directive: a separate dispatch (not folded into Track B-doc), capturing each Q1-Q10 decision with its rationale, tradeoffs, sequencing bucket, implementation flags surfaced during grounding check, and any open sub-decisions.

Conventions used per question:

- **Question** is the question as posed in the architectural grounding.
- **Decision** preserves the operator's landed answer (verbatim where possible; substance-preserving paraphrase where the operator articulated the decision over multiple turns).
- **Rationale** captures the operator's reasoning, attributed where stated as quotation.
- **Tradeoffs considered** enumerates the rejected alternatives and why.
- **Sequencing bucket** is one of: `fix-now` (dispatched in parallel with this capture), `decide-now-build-later` (landed; implementation in Sprint 2 or Sprint 3), or `defer-execution` (landed; implementation per downstream Tier 4 build dispatches).
- **Implementation notes** include any concrete next-step shape, including flags the grounding check surfaced against the deployed schema and consumer code.
- **Open sub-decisions** enumerate anything within the question's scope still pending operator confirmation or post-launch iteration.
- **Cross-references** link related decisions, skills, OBS entries, and build dispatches.

---

## Q1: Edge table for brief to source citations

**Question:** Should brief-to-source citations move from a JSON column on `intelligence_items.sources_used` to a first-class edge table parallel to the existing `source_citations` source-to-source edge table?

**Decision:** Brief-to-source citations move to an edge table parallel to the existing `source_citations` source-to-source edge table. Backfill from `intelligence_items.sources_used`.

**Rationale:** "Briefs participate in the citation network; treating them as first-class graph nodes lets 'this brief is heavily cited' become a signal. Migration cost is bounded (backfill from sources_used). The storage-shape asymmetry Claude Code flagged is real platform debt that should be resolved."

**Tradeoffs considered:**
- **Keep JSON column on intelligence_items.** Rejected. Asymmetric with the existing source-to-source edge table; locks briefs out of the citation graph as first-class nodes; "this brief is heavily cited" cannot become a signal without re-shaping later.
- **New schema with no backfill.** Rejected. Loses historical citation signal; pointless given backfill is bounded.

**Sequencing bucket:** decide-now-build-later (Sprint 2 or Sprint 3)

**Implementation notes:**

- New edge table parallels `source_citations` shape: `brief_id` (FK to `intelligence_items`), `source_id` (FK to `sources`), `detected_at`, plus any tier-opinion column resolved under Q3.
- Backfill script reads `intelligence_items.sources_used` and inserts one edge row per (brief, source) pair.
- Implementation flag from grounding check: backfill from `sources_used` only captures INPUT-source associations (the sources the brief generation consumed). Discovered sources, which appear in the "New Sources Identified" markdown tables inside brief bodies, live separately in `provisional_sources` and `source_citations`. Backfill captures the input half; the discovered half fills organically as future briefs run. Accepted as v1; no markdown parsing of historical briefs is in scope for the backfill.

**Open sub-decisions:** none at the decision layer. Sprint-level scheduling pending.

**Cross-references:**
- Q2 (effective_tier computation will read the brief-to-source edge for citation weight inputs)
- Q3 (tier-opinion preservation will likely add a column on the new edge table mirroring the source-to-source column)
- Q6 (recency decay reads `detected_at` from edge rows when computing citation weight)
- Q7 (candidate promotion thresholds read brief-citation count as part of the weighted sum)

---

## Q2: Static base_tier plus computed effective_tier (both)

**Question:** Should source tier be a single static field (classifier or operator sets it, downstream reads it) or a computed field (recomputed from citation network plus base plus override plus decay)? Or both, layered?

**Decision:** Both, layered. A static `base_tier` (what the classifier or operator set, preserved for provenance) plus a computed `effective_tier` (recomputed from network plus base plus override plus decay). Effective tier is the default credibility signal surfaced to customers and agents. Base tier remains queryable for audit and for the "what did the classifier think before the network adjusted it" question.

**Rationale:** Mental model stays single (effective tier is the customer-facing number). Provenance preserved. Audit clean. Operator can always reach back to "what did the classifier originally say" without the dynamic recomputation overwriting the answer.

**Tradeoffs considered:**
- **Static only.** Rejected. Citation-network signal cannot influence the tier surfaced to customers; the network exists but is decoupled from credibility presentation.
- **Computed only.** Rejected. No provenance; cannot answer "what did the classifier think." Loses audit clarity.

**Sequencing bucket:** decide-now-build-later (Sprint 2 or Sprint 3)

**Implementation notes:**

- Effective tier formula per Q5: `COALESCE(tier_override, computed_dynamic_tier, base_tier)`. Computed dynamic tier consumes Q6 decay output and Q3 tier-opinion aggregation.
- Implementation flag from grounding check: consumer migration from `sources.tier` to `sources.effective_tier` is NOT mechanical. Ten-plus tier-reading locations exist across classifier code, scoring lib, UI surfaces, type definitions, stores, and scripts. Most want dynamic (effective_tier). Some want static (the `SourceTier` type definition; classifier prompts referencing the "tier 1-7 hierarchy"). A consumer-by-consumer audit is required.
- Recommended path: keep `sources.tier` as canonical static (= `base_tier`); add `sources.effective_tier` as a new column; migrate consumers individually with explicit decisions per consumer. The decision per consumer is binary (read static, or read dynamic) but the rationale per consumer differs.

**Open sub-decisions:**

- Per-consumer base_tier vs effective_tier decisions, 10-plus consumers, individual review during Build 4.5+ work.

**Cross-references:**
- Q5 (override mechanism is the first column in the COALESCE formula)
- Q6 (decay output is the input to `computed_dynamic_tier`)
- Q3 (tier-opinion aggregation feeds the dynamic computation)
- Q7 (promotion thresholds operate on effective_tier semantics for new candidates)
- Q9 (per-surface signal sets all surface "tier"; they read effective_tier unless explicitly noted otherwise)

---

## Q3: Tier-opinion preservation

**Question:** When the Haiku classifier (or any downstream agent) emits a tier opinion about a source that already exists in the database at a different tier, what should the system do? Discard the opinion, record it silently, or record and surface as a signal?

**Decision:** Record AND surface. Discard is wasting signal. When Haiku says "I think cited source X is T2" but X already exists as T4, record the opinion as evidence (tier_opinion table, or a column on the new brief-to-source edge table or on `source_citations`, with the citing agent's estimate). Aggregated opinions feed network weighting. Significant disagreements (5+ Haiku estimates of T2 against a database T4 within a 90-day window) flag for operator review.

**Rationale:** "This makes the discovery loop self-improving on existing sources, not just new ones." The same agent passes that classify new candidates also generate evidence about existing sources; discarding that evidence wastes the input signal and forecloses any path to surfacing classifier-vs-database divergence as a signal.

**Tradeoffs considered:**
- **Discard.** Rejected. Wastes signal; forecloses self-improvement on existing sources.
- **Record silently, never surface.** Rejected. Equivalent to discard for any operator-facing benefit; only useful retroactively in audit replay, and even then nothing acts on the recorded opinion.

**Sequencing bucket:** defer-execution (record-now per the implementation hook; surface-flagging logic later when threshold-crossing rate is observable)

**Implementation notes:**

- Tier-opinion disagreement flag threshold: 5 disagreeing opinions within a 90-day window (cross-referenced with Q7-E threshold).
- Storage shape decision is open: either a dedicated `tier_opinion` table (clean separation, easier to query by agent identity), or a column extension on the source-to-source `source_citations` edge and on the new Q1 brief-to-source edge (denser locality with the citation that carried the opinion). Pick during Build 4.5+ schema work.
- "Surface" semantic at v1: a queue or notification in the operator review surface that lists "sources where classifier estimates disagree with stored tier by N+ opinions in window." UI shape lands per the operator review surface build (Build 4.5+ context).

**Open sub-decisions:**

- Storage shape: dedicated table vs column on edge tables.
- Aggregation function: simple count, or weighted by citing-source tier (T1 disagreement counts more than T6 disagreement).

**Cross-references:**
- Q1 (brief-to-source edge is a candidate carrier for the opinion column)
- Q2 (aggregated opinions are an input to `computed_dynamic_tier`)
- Q7-E (5-in-90-days threshold matches Q7's disagreement flag)

---

## Q4: Bias tag vocabulary (LANDED)

**Question:** Should source bias and orientation be captured? If yes, in what shape: a single column, an extension of `source_role` vocabulary, or a dedicated multi-dimensional tags structure?

**Decision:** Tags table (not a single column, not extended `source_role` vocabulary). Three dimensions, multi-value within each.

**Dimension 1 (Funding / Institutional Affiliation):**

- industry-funded
- government-funded
- foundation-funded
- subscription-supported
- academic-institutional
- mixed-funded
- funding-opaque

**Dimension 2 (Methodological Orientation):**

- peer-reviewed
- methodologically-transparent
- analytical-synthesis
- editorial-opinion
- advocacy
- factual-reporting
- standards-defining

**Dimension 3 (Stakeholder Position):**

- industry-incumbent
- industry-challenger
- regulator-aligned
- environmental-advocate
- independent-research
- customer-perspective
- labor-perspective
- investor-perspective

**Standard:** accuracy and transparency at all times. Multi-value within each dimension. A source can carry multiple tags per dimension (operator example: ICCT = `foundation-funded` + `methodologically-transparent` + `independent-research` + `environmental-advocate`).

**Rationale:** A single bias column collapses three independent axes into one and forces false choices ("is ICCT 'advocacy' or 'research'?"). Extending `source_role` conflates role (what the source IS in the platform's content model) with bias (what its institutional and methodological orientation is). A tags table with three dimensions preserves the independence and supports multi-value, which is what the actual sources require.

**Tradeoffs considered:**
- **Single bias column.** Rejected. Collapses independent axes, forces false binaries.
- **Extend `source_role`.** Rejected. Conflates role and orientation.
- **More than three dimensions.** Considered and not pursued at v1. Three dimensions cover funding, method, and position cleanly; finer-grained slicing (geography, era, ideology) can be added per source-type if a use case surfaces.

**Sequencing bucket:** defer-execution (vocabulary landed; schema and classifier prompt work scheduled later)

**Implementation notes:**

- Tags table: `source_bias_tags` (or similar), with `source_id` (FK), `dimension` (enum of 3), `tag` (enum scoped per dimension), `assigned_by` (classifier name or operator id), `assigned_at`.
- Classifier prompt update: Haiku is taught the three-dimension vocabulary and emits zero-or-more tags per dimension per source.
- Implementation flag from grounding check: bias tags apply to external publisher sources only. Community user-generated content (e.g. a freight forwarder posting an observation) uses author-identity-shaped credibility signals (Q9 Community), not bias tags. The schema MAY enforce this via the source-type the tag attaches to, or it MAY be a soft convention enforced by the classifier prompt; resolve at schema-write time.

**Open sub-decisions:**

- Vocabulary may iterate post-launch based on classification edge cases (sources that don't fit any dimension cleanly).
- Whether to enforce "bias tags apply to publishers only" via schema constraint or by prompt convention.

**Cross-references:**
- Q9 (Research surface signal set includes bias tag)
- Q7 (classifier candidate review surfaces bias tags alongside the tier estimate)

---

## Q5: Override mechanism columns

**Question:** What is the schema shape for an operator override of a source's tier?

**Decision:** `tier_override` + `override_reason` + `override_date` columns on `sources`. Effective tier computation uses override when present, falls back to base_tier (or to the dynamic computation per Q2) otherwise. Full audit lives in the existing `source_trust_events` table.

**Rationale:** "Simple to implement, full audit, supports the 'classifier says T4, operator forced T2, reason: X' semantic." Three columns on the existing table is the minimum viable shape; audit history is already covered by `source_trust_events`, so no parallel event log is needed.

**Tradeoffs considered:**
- **Dedicated override table.** Rejected. Three columns on sources is sufficient; an override is "the current override state," singular per source, and history is already in `source_trust_events`.
- **No override mechanism.** Rejected. Operators must be able to force a tier when the classifier is wrong on a source the operator knows by hand.

**Sequencing bucket:** decide-now-build-later

**Implementation notes:**

- Effective tier formula: `COALESCE(tier_override, computed_dynamic_tier, base_tier)`.
- Override revert semantic: clear the `tier_override` column (set to NULL). Effective tier resumes computation from `computed_dynamic_tier`, then `base_tier`.
- `override_reason` is required when `tier_override` is non-null (enforce via CHECK or trigger). `override_date` is set automatically on update.
- Every override write emits a row in `source_trust_events` for audit.

**Open sub-decisions:** none.

**Cross-references:**
- Q2 (override is the first slot in the COALESCE formula)
- Q3 (operator-set tier may be informed by accumulated tier-opinion disagreement flags)

---

## Q6: Recency decay on citation weight (half-life curve)

**Question:** Should citation weight decay over time (a 2015 citation contributes less to "what is X's current tier" than a 2025 citation)? If yes, what curve and where does decay apply?

**Decision:** Citation weight only, half-life curve. Tier itself stays stable (a 2010 EU regulation is still binding at tier 1; the source's status did not expire). Citation weight decays (a 2015 citation has less signal about CURRENT authority than a 2025 citation).

Half-life parameter: 18-24 months starting range, tunable. Operator judgment for exact value. Half-life can be tuned per source type if needed (regulations rarely move; news fades faster).

**Decay applies to:** citation-network contribution to effective_tier computation.

**Does NOT apply to:**

- `base_tier` (static; preserved as classifier or operator set it)
- accessibility decay (separate existing logic that already works)
- `tier_history` audit trail (history is history; not weighted)

**Rationale:** Conflating "the source's tier" with "the citation's freshness" is a category error. A 2010 EU regulation is still binding; nothing about its tier expired. A 2015 citation, however, is weaker evidence about what the field currently considers authoritative than a 2025 citation. Decaying the weight (not the tier) preserves both intuitions cleanly.

**Tradeoffs considered:**
- **Decay the tier itself.** Rejected. Conflates source status with citation freshness; the source is what it is.
- **No decay.** Rejected. Old citations dominate the network simply by having existed longer; the network signal stagnates.
- **Linear decay.** Considered. Half-life is a better fit for citation-network dynamics (citations accumulate exponentially in active research areas; half-life flattens the recency premium without producing cliff effects).
- **Single half-life across all source types.** Considered. Per-source-type tunability deferred but allowed if observed need arises.

**Sequencing bucket:** decide-now-build-later

**Implementation notes:**

- `source_citations.detected_at` exists today but is currently never read in scoring. This decision wires `detected_at` into the `computed_dynamic_tier` formula.
- New brief-to-source edge table (per Q1) carries `detected_at` and feeds the same decay function.
- Decay formula: `weight = base_weight * 0.5^(age_in_months / half_life_months)`. `base_weight` is the citing source's tier weight per Q7's tier weights.

**Open sub-decisions:**

- Exact half-life value within the 18-24 month range.
- Whether to permit per-source-type half-life parameters (deferred until usage shows the single-value approximation is insufficient).

**Cross-references:**
- Q1 (brief-to-source edge carries `detected_at` for decay input)
- Q2 (decay output feeds `computed_dynamic_tier`)
- Q7 (tier weights are the `base_weight` input to the decay formula)

---

## Q7: Discovery loop autonomy thresholds (LANDED)

**Question:** Should the discovery loop autonomously promote candidate sources, or should every promotion require operator review?

**Decision:** Yes, autonomy with safeguards.

**Operator-set thresholds:**

- Classifier confidence threshold for operator review queue surfacing: **>0.65**
- Citation-frequency threshold for candidate promotion: **3 citations**
- Tier-weighted promotion weights: **T1=1.0, T2=0.85, T3=0.7, T4=0.5, T5=0.3, T6=0.15**
- Promotion threshold: **weighted citation sum >= 2.5**
- Promotion check cadence: **daily batch**
- Tier-opinion disagreement flag threshold: **5 disagreeing opinions within a 90-day window** (cross-reference Q3)
- Expected operator review queue volume: **5-15 new candidates per week**

**Operator note:** these are tunable starting points; adjust based on observed queue size and review experience.

**Rationale:** Pure-manual promotion does not scale and wastes operator attention on candidates that are obvious by the citation network alone. Pure-autonomous promotion ships errors at the rate the classifier produces them. A thresholded autonomy with operator review queue captures the obvious cases automatically and surfaces the ambiguous cases for human judgment.

**Tradeoffs considered:**
- **Fully manual promotion.** Rejected. Does not scale; wastes attention on obvious cases.
- **Fully autonomous promotion.** Rejected. Ships classifier errors at rate.
- **Single confidence threshold without citation-frequency or tier-weighting.** Rejected. Classifier confidence alone is unreliable on novel sources; citation-network signal (especially tier-weighted) is independent evidence.

**Sequencing bucket:** decide-now-build-later (thresholds landed; promotion code execution later)

**Implementation notes:**

- Current `trust.ts` code has T1-T4 weights only. Q7 extends to T5=0.3 and T6=0.15.
- T7 weight not specified by operator. Recommended T7=0 (tier 7 is "overflow/uncategorized" per `environmental-policy-and-innovation` hierarchy; should not propagate credibility signal). Pending operator confirm.
- Daily batch job: scan provisional/candidate sources; compute weighted citation sum per candidate; promote when sum >= 2.5 AND classifier confidence > 0.65; surface review queue when one threshold passes and the other does not.
- Queue volume monitoring: alert operator if weekly queue exceeds 25 or falls below 2 (early warning that thresholds drift from observed reality).

**Open sub-decisions:**

- T7 weight (proposed 0; operator confirm).
- Whether promotion should auto-apply for very-high-confidence cases (sum >= 3.5 AND confidence > 0.9, for example), bypassing the review queue entirely. Not in scope for v1.

**Cross-references:**
- Q2 (effective_tier consumes promotion outputs; newly-promoted sources enter at base_tier set by the promotion logic)
- Q3 (tier-opinion preservation feeds the same review queue when disagreement threshold trips)
- Q4 (bias tags inform candidate review surface; classifier tags candidates with three-dimension tags as part of the same pass)
- Q6 (decay-adjusted citation weight is the input to the weighted citation sum)
- `environmental-policy-and-innovation` skill (T1-T7 hierarchy definition; T7 = overflow/uncategorized)

---

## Q8: Intelligence Assistant citation surfacing

**Question:** The Intelligence Assistant backend assembles full citation metadata but the frontend discards it. Restore the surfacing, redesign it, or accept the gap?

**Decision:** Restore frontend citation rendering. Ship with reasonable defaults: inline numbered footnote markers plus an expandable provenance panel on click showing source name + tier badge + citation count + recency per cited source. Iterate post-launch based on use.

**Rationale:** "Architecture (what data the citations carry, how they're structured) is what matters; the visual is UI polish. Get any version live; iterate." The gap is purely the frontend dropping data that the backend already assembles; restoring the rendering is bounded and reversible work, and any visual treatment that surfaces the four signals (name, tier badge, citation count, recency) is a strict improvement over the current zero-rendering state.

**Tradeoffs considered:**
- **Wait for full-redesign spec.** Rejected. Citation surfacing is structurally absent today; shipping anything that exposes the assembled metadata is a strict improvement and the visual can iterate.
- **Restore without the expandable provenance panel.** Considered. Inline footnote markers alone are weaker; the click-to-expand panel is what makes the four signals legible.

**Sequencing bucket:** fix-now (dispatched in parallel with this doc creation)

**Implementation notes:**

- Branch: `feat/q8-assistant-citation-surfacing`.
- Backend metadata shape is already correct; the dispatch wires the frontend to consume and render it.

**Open sub-decisions:**

- Post-launch visual iteration based on observed use.

**Cross-references:**
- Q9 (Intelligence Assistant row in the per-surface signal table: "inline citations with full provenance")
- Branch `feat/q8-assistant-citation-surfacing`

---

## Q9: Per-surface credibility signal sets (LANDED)

**Question:** Should credibility signals be uniform across surfaces (every surface shows the same set: tier + bias + recency + ...), or per-surface (each surface foregrounds the signals relevant to its audience)?

**Decision:** Per-surface signal sets, consistent vocabulary across surfaces. Asymmetry is deliberate per audience need.

| Surface | Primary credibility signals |
|---|---|
| Regulations | tier + jurisdiction + binding status |
| Research | tier + bias tag + citation count + recency |
| Market Intel | tier + recency + signal-strength |
| Operations | tier + jurisdiction + applicability |
| Community | author identity + workspace verification |
| Map | tier (overlay over Regulations) |
| Assistant | inline citations with full provenance |

**Rationale:** "Customers learn the signal vocabulary once (tier badge means the same everywhere). Each surface foregrounds the signals relevant to its audience's question." A regulations reader is asking "is this binding on me?"; a research reader is asking "how credible is this analysis?"; a market-intel reader is asking "how fresh and strong is this signal?". The vocabulary (tier badge semantics, bias tag semantics) is uniform; the foregrounded subset is per-surface.

**Tradeoffs considered:**
- **Uniform set across surfaces.** Rejected. Forces low-relevance signals onto every surface (a regulations row does not need a bias tag; a market-intel row does not need a binding-status indicator). Visual noise without audience value.
- **Fully bespoke per-surface vocabulary.** Rejected. Customers cannot transfer learning across surfaces if "tier" means different things on Regulations vs Research.

**Sequencing bucket:** defer-execution (decisions landed; per-surface implementation per Tier 4 build dispatches: Build 7 Market Intel, Build 8 Research, Build 9 Operations, Build 10 Community, Build 11 Dashboard)

**Implementation notes:**

- Implementation flag from grounding check: Operations, Community, and Map currently render ZERO credibility signals. Adding them is net-new design work, not retrofit.
- Operations "applicability" semantic needs clarification at Build 9 dispatch (what does "applicable" mean for an operations row: jurisdiction-match plus vertical-match? plus mode-match? plus more?).
- Community signal definition needs clarification at Build 10 dispatch (author-identity rendering: avatar + workspace name + verification badge? plus posting history? plus reputation score?).
- Map overlay UX needs clarification at Build 11 (or wherever Map's Regulations-overlay lives): tier badge on map pins? color-coded by tier? legend treatment?
- Vocabulary uniformity binding: tier badge color, size, and label MUST be identical across all surfaces that render it; recency phrasing MUST be identical; bias tag rendering (when it appears) MUST be identical.

**Open sub-decisions:**

- Per-surface implementation specifics during each Tier 4 build dispatch (Operations "applicability", Community author-identity rendering, Map overlay UX).

**Cross-references:**
- Q2 (every "tier" reading on every surface is effective_tier unless the surface's signal explicitly calls for the static base_tier; none of the Q9 surfaces appear to need static)
- Q4 (Research bias-tag rendering reads from the three-dimension tag table)
- Q8 (Assistant row "inline citations with full provenance" is the Q8 fix-now deliverable)
- Builds 7, 8, 9, 10, 11

---

## Q10: URL canonicalization fix

**Question:** The URL canonicalization gap (silent data-quality issue currently poisoning the candidate queue and producing duplicate provisional rows), fix now, fold into Build 4.5+, or defer?

**Decision:** Fix now. Independent of credibility-model work. Silent data-quality issue currently poisoning the candidate queue and producing duplicate provisional rows. Bounded scope. Should land before any new citation-extraction work because the existing extraction is creating debt every ingest.

**Rationale:** Every ingest cycle that runs without canonicalization extends the cleanup obligation. The fix is bounded (URL normalization is a known problem with known solutions). Q1 (brief-to-source edge) and Q3 (tier-opinion preservation) both add new citation-network writes; running them on top of the current un-canonicalized state would compound the problem.

**Tradeoffs considered:**
- **Fold into Build 4.5+.** Rejected. Build 4.5+ has its own scope; bundling adds risk and delays the fix.
- **Defer to a later sprint.** Rejected. Debt accumulates every ingest; defer is just "fix more later."

**Sequencing bucket:** fix-now (dispatched in parallel with this doc creation)

**Implementation notes:**

- Branch: `feat/q10-url-canonicalization`.
- Scope: URL normalization (scheme, host case, trailing slash, query parameter ordering, tracking-parameter stripping, fragment handling), applied at ingest write and as a one-time backfill across `provisional_sources` and `source_citations`.
- Backfill produces a duplicate-merge report for operator review where canonicalization collapses two provisional rows into one.

**Open sub-decisions:** none.

**Cross-references:**
- Q1 (brief-to-source edge writes will inherit the canonicalized URL shape)
- Q3 (tier-opinion writes will inherit the canonicalized URL shape)
- Branch `feat/q10-url-canonicalization`

---

## Open Sub-Decisions

Consolidated list of every open sub-decision flagged in Q1-Q10, with owner pointers:

- **Q2:** Per-consumer base_tier vs effective_tier decisions, 10-plus consumers, individual review during Build 4.5+ work.
- **Q3:** Storage shape (dedicated tier_opinion table vs column on edge tables); aggregation function (count vs tier-weighted).
- **Q4:** Bias tag vocabulary may iterate post-launch based on classification edge cases; bias-tags-apply-to-publishers-only enforcement mechanism (schema constraint vs prompt convention).
- **Q6:** Exact half-life value within 18-24 month range; whether per-source-type half-life parameters are permitted (deferred until single-value approximation proves insufficient).
- **Q7:** T7 weight (proposed 0; operator confirm); whether very-high-confidence cases bypass review queue (out of scope v1).
- **Q8:** Post-launch visual iteration based on observed use.
- **Q9:** Per-surface implementation specifics during each Tier 4 build dispatch (Operations "applicability", Community author-identity rendering, Map overlay UX).

---

## Sequencing Summary

| Q | Bucket | Depends on |
|---|---|---|
| Q1 | decide-now-build-later | (none; backfillable any time) |
| Q2 | decide-now-build-later | Q5 (override columns inform effective_tier formula), Q6 (decay inputs) |
| Q3 | defer-execution | New tier_opinion table or source_citations column extension |
| Q4 | defer-execution | Bias tags table; classifier prompt update; per-source assignment work |
| Q5 | decide-now-build-later | (none) |
| Q6 | decide-now-build-later | Q2 (effective_tier is the consumer of decay output) |
| Q7 | decide-now-build-later | Q2 (effective_tier consumes promotion thresholds), Q3 (tier-opinion preservation), Q4 (bias tags inform candidate review surface) |
| Q8 | fix-now | (dispatched; ships independent of credibility-model core) |
| Q9 | defer-execution | Per-surface builds (7, 8, 9, 10, 11) |
| Q10 | fix-now | (dispatched; ships independent of credibility-model core) |

**Reading the buckets:**

- **fix-now (Q8, Q10):** Dispatched in parallel with this doc. Independent of credibility-model core. Land first.
- **decide-now-build-later (Q1, Q2, Q5, Q6, Q7):** Decisions landed. Schema and code work scheduled for Sprint 2 or Sprint 3. Q2 and Q7 carry hard dependencies on each other and on Q5, Q6, Q3, Q4; sequence within the bucket per dependency arrows.
- **defer-execution (Q3, Q4, Q9):** Decisions landed; implementation deferred to natural downstream owners. Q3 and Q4 schedule independently. Q9 splits across Builds 7, 8, 9, 10, 11.

---

## Skill Encoding Status

The `source-credibility-model` skill is **PENDING**. Structure proposed 2026-05-19, awaiting operator approval before encoding. Once the skill ships, this decisions doc becomes its source-of-truth reference (the skill's "Why" and "What to apply" sections will cite this doc by path for the full rationale and tradeoff trail; the skill body will encode the operational rules, when to read base_tier vs effective_tier, when to surface bias tags on which surface, when promotion thresholds trip, etc.).

Until the skill ships, build dispatches that touch the credibility model SHOULD reference this doc directly in their pre-work briefs.

---

## OBS coverage (per sprint-followups-discipline)

This dispatch is a decisions-capture artifact (documentation-only, no design surface, no implementation surface). Per the `sprint-followups-discipline` SKILL.md "When to Apply" section, the loop-closure obligation does NOT formally bind on investigation-only or report-only dispatches. The dispatch instructions nonetheless asked for the coverage table; the table below honors that ask with N/A reasoning where appropriate.

Sprint 2 followups doc (`docs/sprint-2/followups.md`) does not exist as of this dispatch. No Sprint 2 OBS entries are open to cover or defer. Sprint 1 followups (`docs/sprint-1/followups.md`) carry OBS-1 through OBS-23; none have decisions-capture scope as their natural owner (the capture is a derivative of the architectural conversation, not of any individual sprint OBS).

| OBS | State | Decision | Cross-references | Reasoning |
|---|---|---|---|---|
| (Sprint 2 OBS-1+) | N/A | N/A | N/A | Sprint 2 followups doc not yet created; no Sprint 2 OBS exist. |
| Sprint 1 OBS-1..23 | N/A | N/A | N/A | Decisions-capture dispatch has no design or implementation surface; Sprint 1 OBS owners are the relevant Sprint 1 phase dispatches and Sprint 2 build dispatches, not this capture. |

**OBS surfaced during this dispatch:** none. The dispatch is a transcript capture; no new sprint findings surfaced.

**Implication for downstream builds:** Build 4.5+, Build 7, Build 8, Build 9, Build 10, Build 11 (any dispatch consuming this doc as input) MUST run their own sprint-followups-discipline loop closure when they touch a sprint phase. This capture is INPUT to those dispatches, not a substitute for their OBS coverage.

---

## DP compliance (per sprint-followups-discipline)

This dispatch is a decisions-capture artifact (documentation-only). Per `sprint-followups-discipline`, the DP compliance section is required regardless; for documentation-only dispatches most DPs are not applicable because the dispatch carries no operator-facing surface to evaluate against the DP test.

| DP | Compliance test | Result | Evidence or reasoning |
|---|---|---|---|
| DP-1 (Single-Pane Operator Review, if registered) | Can the operator complete every related decision and edit on this single item without leaving the current screen, form, or workflow? | N/A | Decisions-capture doc; no operator-facing surface. DP-1 evaluation binds on the build dispatches that implement Q1-Q10, not on the capture artifact. |
| All other DPs registered in `docs/design-principles.md` | (per DP) | N/A | Decisions-capture doc; no design surface for DP evaluation. Build dispatches consuming this capture (Build 4.5+, Builds 7-11) MUST run their own DP compliance pass per the discipline. |

**Binding note for downstream builds:** every build that implements a decision captured here MUST run DP compliance against `docs/design-principles.md` in its own dispatch report. This capture's N/A status does not transfer.

---

## Companion dispatches

- `feat/q8-assistant-citation-surfacing` (Q8 fix-now; restores frontend citation rendering)
- `feat/q10-url-canonicalization` (Q10 fix-now; canonicalizes URLs at ingest plus one-time backfill)

Both branches dispatched in parallel with this capture.

## Reference: architectural conversation source

This doc captures decisions landed in the operator architectural conversation of 2026-05-19. The conversation included a grounding-check pass that surfaced the implementation flags noted in Q1, Q2, Q4, Q7, and Q9. Where this doc paraphrases, the paraphrase preserves substance; where it quotes, the quotation is verbatim from the operator.
