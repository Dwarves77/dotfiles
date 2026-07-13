---
name: analysis-construction-spec
description: Caro's Ledge Analysis Construction Spec and Build Contract. The construction + grounding depth for the FOUR non-regulatory brief formats (Operations Profile, Market Signal Brief, Research Summary, Technology Profile), which previously had only section names and a sentence of intent each — the gap that made non-regulatory output read as content with no direction. EXTENDS environmental-policy-and-innovation, which stays authoritative for the regulatory 14-section format and the shared rules (four lenses, severity labels, cause-and-effect, no-completion-bias). Specifies every section by five things (ingest, transformation, output-and-decision, integrity, grounding model); the four grounding models (span, corroboration-count, matrix, transitive); the Context Rule (no fact renders alone — value+source+date + comparison/conversion + decision consequence by mode/vertical) and the No-Vacuum Rule (cross-pollination: an item's analysis draws direction from its documented relationships to items on OTHER surfaces, via the intersection contract). Includes the build contract: per-format section-extractor + display wiring + one known-good exemplar, the three net-new grounding capabilities, the routing fix, the sequence (Research first, then Market, then Technology; Operations as its own gated data-sourcing program), and the per-format verification bar.
when_to_load:
  - "Any dispatch generating, sectioning, grounding, or wiring a NON-regulatory brief (item_type market_signal/initiative, research_finding, regional_data, technology/innovation/tool)"
  - "Any work on the Market Intel, Research, Operations, or Technology surfaces, their section-extractors, or their item-detail displays"
  - "Any grounding-model work (span / corroboration-count / matrix / transitive); any content-generate.mjs run or section-extractor (analog of extract-regulation-sections.ts) build for a non-regulatory format"
  - "Authoring or validating a known-good exemplar for any non-regulatory format"
  - "Any work touching cross-surface direction / the intersection contract (operational_scenario_tags, compliance_object_tags, related_items, intersection_summary, detect_intersections)"
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

## Why this exists
The regulatory format already has a detailed construction spec in the brief-formats skill
(environmental-policy-and-innovation): 14 sections, each saying what to extract, how to map it to
the workspace, what conditional logic applies, and how the cause-and-effect chain is built. The
other four formats had section names and a sentence of intent each, not that depth. That gap is why
non-regulatory output read as content with no context. This document supplies the depth for all
four, plus the grounding mechanics, so every surface ingests information and feeds it back as
decision intelligence, not a data dump.

Precondition: this spec gives direction only to content that is already correctly classified and
in-vertical. It does not rescue a mis-typed item (a market signal typed as a regulation) or
off-vertical content. "Random info with no direction" has TWO failure modes — random info (kept out
UPSTREAM by item_type classification, the entity gate, source role/category derivation, and the
vertical-fit gate) and no direction (fixed HERE). Both must hold; this spec owns only the second.
The two directional axes below are the second half: the Context Rule gives an item VERTICAL
direction (within itself, by mode and vertical); the No-Vacuum Rule gives it HORIZONTAL direction
(across items and surfaces). A brief needs both, or it is still a data point.

Authority note: the brief-formats skill remains authoritative for the regulatory format and the
shared rules (four lenses, business-evaluation framework, severity labels, cause-and-effect,
no-completion-bias). This document adds the construction and grounding depth the four
non-regulatory formats lacked, plus the build contract to wire them. Reconcile against that skill,
not the mockups.

Status note: until the first real exemplar per format runs end to end, this is a strong hypothesis,
not a proven contract. Expect Research's exemplar to send edits back to its synthesis sections (S3,
S5). That is the spec being proven, not failing.

---

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

## 2b. Grounding mechanics (GAP claims, slot calibration, format determinism, the span→source→tier chain, the scoped floor)

The grounding contract below is enforced in the database (validate_item_provenance + item_type_required_slots, migrations 112/114/119/121/131/132/137/138); this section is its doctrine so it is not SQL-only.

- **Format is f(item_type), PINNED — never agent-chosen.** Each item_type maps to exactly one format; the agent does not pick. format_type is forced to the canonical f(item_type) value after parse (a market_signal brief has no regulation slots, so an agent that mis-picked the format guaranteed a criterion-5 failure). Generation also pins the format's section set into the prompt.
- **Required slots are FACT-or-GAP satisfiable.** Each item_type has required slots (`item_type_required_slots`); a slot is covered by ≥1 FACT or GAP claim. Calibration = rewriting the slot DESCRIPTION (the description feeds the grounding prompt); the slot×item_type matrix is an operator spec decision, never an agent default.
- **A GAP is authorized ONLY by the source's own characterization — never by the item_type label.** A slot may be a GAP only when the fetched source itself states the thing is absent/voluntary (no deadline, non-binding). Migrations 131/132/137 made `penalty_summary` + `primary_deadline` GAP-ok on the NON-BINDING reg-family types (standard/framework/guidance); `regulation`/`directive` stay HARD, and `effective_date` + `jurisdictional_scope` stay HARD on all five. A real deadline/penalty in the source still forces a FACT — the label never licenses the GAP.
- **Grounding chain = span → source → tier (no constants).** Every FACT claim is a VERBATIM span in fetched content, attributed to the SOURCE that CONTAINS the span, and stamped at THAT source's canonical institutional tier (one tier per institution; per source-credibility-model). The tier stamp is resolved, never a constant — a constant masquerading as a resolved tier is fake certification (the F1 defect).
- **The CRITICAL/HIGH authority floor (tier 1-2) is REGULATORY-only.** Migration 138: the per-claim floor bites only on the regulatory item-type family, where primary-legal grounding is the right bar; non-regulatory types are EXEMPT — a NAMED exemption (REVISIT), with the per-type non-reg floor value deferred to the research/tech calibration spec pass (ship the settled half, spec the unsettled half). Severity is not source authority: a CRITICAL market signal grounded in tier-5 market data is correctly sourced.

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
intersection_summary) plus the detect_intersections RPC. But this is DIRECTIONAL, not metadata: a
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
surfaces render the relationships via the detect_intersections RPC.

## 3c. The Forward-Intelligence Rule (proactive, every pull + every update)
The platform is PROACTIVE, not reactive. Its value is knowing what is COMING before competitors —
where to focus energy, how to participate in emerging innovation and testing — not just reporting
formalized, published results. This is a TRIGGER that fires on EVERY information pull and EVERY
update of an existing item, across all formats:

1. Surface the forward picture as first-class. In-progress work IS intelligence: a regulation in
   consultation, a technology in trials, a market signal pre-conversion, a research programme
   pre-publication. Surface its intent, participants/parties, current phase/status, and what it is
   investigating — do NOT omit it as "thin" because the outcome is not yet published.
2. Surface expected timing. A stated schedule is a FACT (sourced). Otherwise emit a labeled
   "Analytical inference:" estimate from industry-standard durations — NEVER a stated date without
   a source.
3. If coverage is limited, SEEK MORE before concluding. Search trade reporting and adjacent sources
   to support the source or to establish it is not worth including. "Limited primary source" is a
   prompt to research further, not a stop.
4. Set the MONITOR re-check trigger. When the real outcome (findings, enactment, conversion) is
   pending, emit MONITORING severity + the expected window so the reconcile loop re-pulls at the
   right time. The brief GENERATES NOW with the forward picture; only the outcome update is deferred
   to the trigger. Sufficiency counts forward intelligence (intent, participants, expected window)
   as CORE grounding — a forward brief that surfaces it scores RICH, not thin.
5. Surface the WORKSPACE's PARTICIPATION / ENGAGEMENT PATHWAY as a first-class ACTION + COMPETITIVE-lens
   output. Reporting WHO is already participating (point 1) is not enough. When in-progress work has an
   OPEN DOOR — a trial recruiting operators, a consortium taking members, a consultation accepting
   responses, a pilot or standard-setting / working group forming — state HOW the workspace can get in,
   the WINDOW to do so, and the COMPETITIVE EDGE of joining before rivals (early operational data,
   shaping the rule before it binds, preferred-supplier signalling to clients). This is the platform's
   proactive value made actionable: knowing what is coming AND how to be in it early, not merely
   watching it. When there is no public way in, say so ("no public participation route identified as of
   [date]") rather than dropping the lens — absence is itself intelligence. (Validated on the JOLT
   research exemplar: the brief named the trial's operator cohort and the route for an operator to
   join, emitted as an action-lens move, not buried as background.)

---

## 4. Regulatory Fact Document (reference, already specced and wired)
For: regulation, directive, standard, guidance, framework. 14 sections, authoritative in the skill.
Context rule: regulation -> mechanical consequence -> effect on the workspace by vertical and mode.
The precedent the four below are built to match. Grounding: fact sections span; timeline and
substantive-requirement sections span; the workspace-position and adjacent-research sections
transitive.

---

## 5. Operations Profile, run as a gated data-sourcing program
For: regional_data. 8 sections. Its own program, not a sibling of the prose formats. It is the
hardest track: a real data-acquisition problem (industrial electricity, diesel and SAF, labor,
port, drayage rates per active region, much of it not free, not centralized, changing constantly),
requiring its own source-registry expansion. It runs parallel to, and does not block, the three
prose formats.

Coverage threshold: S1 and S2 are single-region facts that populate incrementally and carry
standalone value per region. S3 and S4 (comparison and cross-region) gate on the matrix reaching at
least two sourced regions per dimension, and stay omit-with-note until then. So the comparison
beats light up as coverage fills, rather than blocking Operations at cold start.

Reader question: in this region, what is cheaper, what is possible, what changes my plans here
versus elsewhere, and how does my position compare to competitors?
Context rule: regional fact -> comparison (region versus region, or versus the alternative) -> the
operational or footprint decision it drives.
Grounding by section: S1 span, S2 span, S3 matrix plus computation, S4 matrix then transitive,
S5 span, S6 and S7 transitive.

Pipeline: each regional_data item is one sourced dated fact in one (jurisdiction x dimension) cell;
the sections turn cell facts into a contextualized profile; it renders as the per-jurisdiction grid
the surface shows, rolling up to region severity and cross-region implications.

- S1 Operational Cost Baseline. INGEST utility and regulator tariff schedules, fuel reporting,
  labor surveys, port-authority tariffs, freight indices. TRANSFORM each line as figure + trend +
  same-unit anchor against other active regions + mode relevance. OUTPUT a cost table to price the
  region into quotes and feed make-versus-buy. COST ALERT on a rising baseline. INTEGRITY no
  unsourced figure; missing baseline omitted with a dated note.
- S2 Feasibility of Operational Choices. INGEST interconnection and permit regimes, utility-
  monopoly status, equipment rules, supplier base. TRANSFORM each choice to possible / restricted /
  prohibited with reason and source. OUTPUT where capital deployment is possible. INTEGRITY verdict
  sourced; unknown as "unconfirmed, requires [check]."
- S3 Cost Comparison Against Alternatives. INGEST S1 plus the alternative's costs. TRANSFORM
  breakeven and payback with the conditions that flip the answer. OUTPUT the make-versus-buy call.
  INTEGRITY sourced numbers, assumptions stated, missing as a labeled directional range. (MATRIX.)
- S4 Cross-Regional Strategic Implications. INGEST this region's S1 to S3 plus other active
  regions'. TRANSFORM the cross-footprint comparison into allocation logic. OUTPUT footprint
  allocation. INTEGRITY only across regions with sourced data; gaps named. (MATRIX then transitive.)
- S5 Competitive Positioning. INGEST sourced competitor footprint. TRANSFORM into relative
  advantage or exposure. OUTPUT positioning; COMPETITIVE EDGE on first-mover room. INTEGRITY named,
  sourced, no speculation.
- S6 Client Conversation Talking Points. INGEST S1 to S5. TRANSFORM into credible client
  statements and questions. OUTPUT meeting talking points. INTEGRITY only what facts support.
- S7 Pending Changes That Shift the Calculus. INGEST sourced consultations, construction, market
  and supplier shifts with triggers and dates. TRANSFORM each to the section it would alter.
  OUTPUT a watch-list; WINDOW CLOSING or MONITORING as it nears. INTEGRITY announced or scheduled
  only.
- S8 Sources. Type-labeled.

---

## 6. Market Signal Brief
For: market_signal, initiative. 8 sections. Surface bands: Price Signals, Corporate and Capital,
Corridors and Trade Routes.
Reader question: what is moving that could give me or my competitors an edge, and what do I do
while it is still a signal?
Context rule: signal -> conversion trigger (what turns it into binding rule or commercial
pressure) -> positioning move while it is still a signal.
No-vacuum: the conversion trigger (S3) is frequently a specific Regulation; link it.
Grounding by section: S1 span plus corroboration-count, S2 and S3 span, S4 through S7 transitive.

- S1 What's Moving and What Triggered It. INGEST the event, parties, trigger, band, convergence
  count. TRANSFORM state what moved with its corroboration strength. OUTPUT act-now versus watch.
  INTEGRITY single-source labeled low-convergence. (SPAN for the event, CORROBORATION-COUNT for
  strength.)
- S2 Who's Driving It and What They Want. INGEST named parties, interests, leverage. TRANSFORM into
  intent and capacity to force the outcome. OUTPUT how to weight it. INTEGRITY sourced inferences;
  motive speculation labeled or omitted.
- S3 Expected Trajectory and Conversion Triggers. INGEST precedent, announced steps, pathway, and
  any linked Regulation/Research item. TRANSFORM the trigger that flips signal to pressure, with
  timeline. OUTPUT the trigger and window; WINDOW CLOSING. INTEGRITY range and trigger, not a false
  date.
- S4 Operational and Cost Implications If It Materializes. INGEST mechanics plus workspace profile.
  TRANSFORM conditional cost or operational consequence by mode and vertical. OUTPUT the exposure;
  COST ALERT on rate moves. INTEGRITY conditional; unknown as a labeled range. (TRANSITIVE.)
- S5 Competitive Implications. INGEST competitor positions, sourced. TRANSFORM who benefits, who is
  exposed, where the workspace sits. OUTPUT positioning; COMPETITIVE EDGE on first move. INTEGRITY
  named, sourced. (TRANSITIVE.)
- S6 Client Conversation Talking Points. INGEST S1 to S5. TRANSFORM into credible statements while
  still a signal. OUTPUT talking points and posture. INTEGRITY never present a signal as done.
- S7 What the Workspace Should Do Now. INGEST S1 to S6. TRANSFORM the positioning moves (vendor
  conversations, clauses, data tracking, coalition participation). OUTPUT the action list.
  INTEGRITY specific actions, not "monitor." (TRANSITIVE.)
- S8 Sources. Type-labeled.

---

## 7. Research Summary
For: research_finding. 6 sections. Surface themes plus a source-coverage matrix (peer-reviewed,
think-tank, quantified research, analytical press). Discriminator: analytical and horizon-scan
depth, not whether it is academic.
Reader question: does this finding change what the workspace should be doing or claiming, and what
do I tell clients?
Context rule: finding -> what it changes for a claim or decision -> what it does not resolve.
No-vacuum: "what it changes" (S3) frequently changes a specific regulatory claim or operational
decision; link the affected item.
Grounding by section: S1 span, S2 transitive, S3 transitive, S4 transitive, S5 span (contradicting
studies) plus transitive, S6 span.

- S1 What the Research Found — OR What the Research Is Investigating (in-progress is first-class).
  INGEST the finding if published; OTHERWISE the research DESIGN, PARTICIPANTS, PHASE, and STATUS,
  plus methodology, scope/limits, source class, tier, recency. TRANSFORM: when findings are pending,
  the design/participants/phase/intent ARE the finding — state them as the headline, never omit S1
  as "thin." (JOLT exemplar: ~12-15 named operators, 4 manufacturers, round-robin phase, the
  eHGV-vs-44t-diesel cost question.) OUTPUT how robust / how to weight it / where it sits in its
  lifecycle. INTEGRITY a finding without sourced methodology is flagged; an in-progress programme
  is stated AS in-progress (status sourced), not dressed up as a published result.
- (forward-intelligence note) Pending-publication research GENERATES NOW with the full forward
  picture (intent, participants, expected window). Surfacing the forward picture scores RICH, not
  thin — this is the proactive value: knowing what is coming, where to focus, how to participate in
  the testing, before competitors. The monitor re-check trigger (S5) is the ONLY thing deferred.
- S2 Why This Finding Matters Operationally and Commercially. INGEST finding plus workspace
  profile. TRANSFORM the mechanism by mode and vertical. OUTPUT relevance to this business.
  INTEGRITY indirect relevance stated as such.
- S3 What the Finding Changes for Strategy, Claims, or Decisions. INGEST S1 and S2 plus any linked
  Regulation/Operations item. TRANSFORM specific decisions impacted (claims the workspace can or
  cannot make, operational choices, regulatory anticipation, vendor selection). OUTPUT what to do or
  say differently. INTEGRITY only changes the finding supports; no overreach from a single study.
- S4 Client Conversation Talking Points and Public Position. INGEST S1 to S3. TRANSFORM credible
  claims, questions, pitfalls. OUTPUT talking points and position. INTEGRITY do not cite an
  unvalidated study.
- S5 What the Finding Does Not Resolve (+ forward timing). INGEST study limits, open questions,
  convergent or contradictory research, AND — for in-progress work — results-pending status + the
  expected publication window. TRANSFORM the limits, conditions for acting, what converges or
  contradicts, and WHEN the findings are due. A stated schedule is a FACT (sourced); otherwise a
  labeled "Analytical inference:" estimate from industry-standard trial/study durations — NEVER a
  stated date without a source. OUTPUT the boundaries, what to watch, and a MONITORING re-check
  trigger for the actual publication. INTEGRITY contradictory research surfaced not hidden; an
  estimated date is labeled as an inference, never asserted as fact.
- S6 Sources. The paper, peer-review status, convergent or contradictory research, type-labeled.

---

## 8. Technology Profile
For: technology, innovation, tool. 8 sections. Surface: TechnologyTracker (wire it to render the
generated profile, not seed).
Reader question: what is happening here, who is doing what, what does it tell me about the
trajectory, where do I stand, and what should I do?
Context rule: deployment -> industry trajectory -> procurement window (when the workspace must
commit to be in time for a contract cycle).
No-vacuum: the procurement window (S7) is frequently driven by a regulatory deadline or a market
shift; link it.
Grounding by section: S1 span, S2 transitive, S3 span, S4 transitive, S5 span plus transitive,
S6 and S7 transitive.

- S1 What's Being Tested or Deployed and By Whom. INGEST named operator activity with quantified
  results, or named research institutions if research-stage. TRANSFORM specific and named, not "the
  industry is moving toward." OUTPUT real versus hype. INTEGRITY no invented operators or pilots;
  "no public deployment as of [date]" where none.
- S2 What This Tells Us About Industry Trajectory. INGEST the deployment pattern. TRANSFORM one-
  operator experiment versus multi-operator race, what drives it, when it becomes table stakes.
  OUTPUT where on the adoption curve. INTEGRITY sourced inferences; estimates labeled.
- S3 Supplier Access and Procurement Reality. INGEST who can buy, at what scale, exclusivity, lead
  times, financing, pilot access. TRANSFORM whether the workspace can obtain it, when. OUTPUT
  access reality. INTEGRITY exclusivity named, sourced.
- S4 Operational Fit by Transport Mode and Cargo Vertical. INGEST applicability plus workspace
  profile. TRANSFORM fits today, never, or conditionally, in mode priority order. OUTPUT whether it
  fits the reader's freight. INTEGRITY "not applicable to [mode]" where true.
- S5 Competitive Positioning Implications. INGEST named competitor access, tender or RFP language.
  TRANSFORM contracts at risk or winnable, specific bidding scenarios. OUTPUT exposure and
  opportunity; COMPETITIVE EDGE on first access. INTEGRITY named, sourced; no invented RFPs.
- S6 Conversational and Strategic Talking Points. INGEST S1 to S5. TRANSFORM credible statements,
  questions, pitfalls. OUTPUT talking points. INTEGRITY only what the evidence supports.
- S7 Time-to-Market, Procurement Window, and Action. INGEST S1 to S6. TRANSFORM when available at
  scale, when the workspace must commit for upcoming cycles, the specific actions. OUTPUT the action
  and the window; WINDOW CLOSING as a cycle deadline nears. INTEGRITY sourced timing or labeled
  estimate; specific actions.
- S8 Sources. Type-labeled.

---

## 9. Build contract for Claude Code
The specs above are what to write. This is what to build.

Scope: this contract covers the four BRIEF-DRIVEN surfaces (Regulations, Market, Research,
Operations) plus Technology. Community is the fifth customer-facing surface but is NOT brief-driven
— it is peer-generated content (working groups, forums, editorial pickups). Its direction is owned
by the Community workstream (group/region structure, editorial curation, author identity), not this
spec.

Per non-regulatory prose format (Research, Market, Technology), reusing the regulatory code pattern:
1. A section-extractor keyed to the format's section list, analog of extract-regulation-sections.ts.
2. An item-detail display, analog of RegulationDetailSurface; wire the existing surface to render
   generated sections, not seed.
3. One validated known-good exemplar (analog of PPWR v7). The only new authoring beyond this spec.
4. Point content-generate.mjs at the format's item_types; the system prompt is already format-aware.

The grounding engine is not one engine. The reused span engine covers the fact sections. Three
capabilities are net-new and are where the build actually lives:
- CORROBORATION-COUNT for Market: discover independent sources, dedup by independence, count within
  the window.
- MATRIX-COMPLETENESS for Operations: confirm the same dimension is sourced across the regions a
  comparison spans; gate the comparison sections on the two-region threshold.
- TRANSITIVE-INTEGRITY for synthesis sections in every format: ground them last; mark valid only if
  every factual claim traces to a grounded input section and no new unsourced fact is introduced.
Build each capability before generating the sections that declare it.

Cross-pollination (No-Vacuum Rule): the non-regulatory formats must EMIT the four intersection-
readiness fields (the 13-field agent contract already does this — verify content-generate.mjs keeps
the full contract for every format) AND CONSUME them where a section's direction is supplied by a
linked item on another surface. The surfaces render the relationships via the existing
detect_intersections RPC. A non-reg brief that cannot point at the item it depends on is missing a
layer of direction the regulatory items get for free.

Operations runs as its own data-sourcing program with source-registry expansion and the coverage
threshold above. It does not block the three prose formats.

Routing, separate from formats: the research surface is showing regulations and Market is showing a
standard (GHG Protocol). Fix item_type-to-surface routing so each surface shows only its types.

Competitive sections (S5) will frequently omit-with-note, because competitor footprint, tender, and
RFP wording are rarely public. That is the integrity rule working. Never fill S5 with speculation to
look complete; sparse-but-true beats full-but-invented. Expect COMPETITIVE EDGE to be the thinnest
lens in real output, and do not read its emptiness as a pipeline failure.

Discipline: the brief-formats skill is authoritative for the regulatory format and the shared rules;
reconcile against it, not the mockups. Surfaces define the grouping axis; this spec defines per-item
sections and per-section grounding; wire all three, reinvent none. Ground every claim; no legal
interpretation pre-empted; supply stays paused.

Sequence: run the regulatory proof in parallel now (ready, metered). Then, one at a time, validating
each against its known-good exemplar before scaling: Research first (6 sections, tightest, fixes the
most-broken surface, grounding model closest to regulatory), then Market, then Technology. Operations
runs as its own parallel program.

Exemplar is spec validation, not only QA: Research's first end-to-end exemplar confirms or corrects
this document. Expect it to send edits back to S3 and S5 here. Nail Research's one exemplar, let it
correct the spec, then scale and move to Market.

Verification bar per format: one real item renders all its sections end to end (generate or source,
extract, ground by the declared model, display) against the known-good exemplar, with severity, the
four lenses, the Context Rule, and the No-Vacuum link visible in the output, before any scale.
