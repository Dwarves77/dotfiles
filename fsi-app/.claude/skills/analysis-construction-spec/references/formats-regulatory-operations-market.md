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
  region into quotes and feed the reader's own cost comparisons. COST ALERT on a rising baseline. INTEGRITY no
  unsourced figure; missing baseline omitted with a dated note.
- S2 Feasibility of Operational Choices. INGEST interconnection and permit regimes, utility-
  monopoly status, equipment rules, supplier base. TRANSFORM each choice to possible / restricted /
  prohibited with reason and source. OUTPUT where capital deployment is possible. INTEGRITY verdict
  sourced; unknown as "unconfirmed, requires [check]."
- S3 Cost Comparison Against Alternatives. INGEST S1 plus the alternative's costs. TRANSFORM
  breakeven and payback with the conditions that flip the answer. OUTPUT the owned-versus-leased, grid-versus-solar or sourcing comparison.
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
