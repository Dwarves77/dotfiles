# Real-time learning loop  -  design (2026-09-25)

Scope: general mechanism for any item/value change on any of the five surfaces, any industry. The
operator's BYD/chargers example is illustration only and is not designed around here (CLAUDE.md
standing rule: examples are not scope).

## 1. What already exists, per loop step

**Step 1  -  Trigger.**
- `propagation_events` outbox: a Postgres trigger writes an event **in the same transaction** as the
  change (`event_type`: `value_revised | obligation_amended | signpost_fired | factor_superseded |
  confidence_decayed | source_frozen`). `docs/specs/08-flywheel-design.md` section 2.2. **[CONFIRMED]** by spec
  text; live table existence not re-verified here (see section 7).
- Mint-time trigger: `fsi-app/scripts/turns/run-population-flywheel.mjs` runs discovery, forward-event
  extraction, recluster, obligations, tags, ratification and `--outcomes` after every mint apply, and
  "THE GATE refuses a new apply while the last one is unconnected" (`docs/PROGRAM-BOARD.md` lane TANDEM,
  2026-09-04). **[CONFIRMED]**  -  file read, header quoted above.
- L1 discovery-at-mint: `fsi-app/src/lib/connections/discover.mjs` runs per new node
  (PROGRAM-BOARD U4, `#424 253a3c73`). **[CONFIRMED]**.

**Step 2  -  Question generation (what it raises, across 5 surfaces × 4 product questions).**
- No object in the codebase generates an explicit "question." The nearest analogs:
  - `src/lib/connections/signal-candidates.mjs` (L4): mines title text for regulation identifiers and
    capitalized phrases, proposes candidate cross-surface pairs as `integrity_flags` rows, operator
    review only, no write capability. **[CONFIRMED]** file read.
  - `src/lib/connections/anticipate.mjs` (U5): for each forward event, asks "does the corpus have other
    coverage of this topic" via `topic_tags` overlap, emits a target when coverage is thin.
    **[CONFIRMED]** file read.
  - `scripts/connections/analyze-corpus.mjs` L2 gap detection: cluster shape → `flywheel-gap:`
    integrity_flags (PROGRAM-BOARD U2 row, 3 `jurisdiction_span` gaps). **[CONFIRMED]**.
  - None of these are phrased against the four product questions (what/how-it-affects-me/comply/
    invest-wait-avoid), and none span surfaces by design  -  each is single-purpose. **[HYPOTHESIS]**
    that no broader "question" abstraction exists; based on a targeted, not exhaustive, search.

**Step 3  -  Answer-seeking (retrieval first, bounded acquisition for the residual).**
- RD-8 (retrieval-before-construction/generation) and its mechanized sibling, the spend chokepoint:
  every model call must route through `src/lib/llm/spend-client.ts` with a `SpendTicket`, which must
  reject a ticket resolvable by a deterministic lever. `fsi-app/.claude/skills/remediation-discipline/
  SKILL.md` lines ~151-165. **[CONFIRMED]**.
- RD-31 (operator-priced line, no machine-proposed cost) and RD-32 (no fetch without a cited
  inventory-miss) are named invariants enforcing exactly "retrieval first, then bounded, priced
  acquisition." **[CONFIRMED]**, same file.
- `src/lib/sources/seek-more.mjs`: deterministic-identifier-first candidate generation (CELEX/ELI/UK SI
  number resolve to canonical URL by machine); open-web search fallback only when identity resolution
  yields nothing. **[CONFIRMED]** file read.

**Step 4  -  Conclusion (labeled inference, confidence, cites its items).**
- `admissibleFor(v, use, now)`  -  the one gate every consumer must call; nothing reads `derived_values`
  directly. `docs/specs/08-flywheel-design.md` section 3.3. **[CONFIRMED]** by spec text (function signature
  read).
- `FLOOR = { analysis: 0.50, calculation: 0.75, filing: 0.90 }`, `ESTIMATE_DISPLAY = "range"` (never a
  decision), `DRAIN_MODE = "batch"`  -  ruled in `docs/decisions/ADR-024-decision-propagation.md`, live in
  `fsi-app/src/lib/entities/decisions.mjs`. **[CONFIRMED]** ADR read in full.
- CLAUDE.md rule 14: every finding carries `[CONFIRMED]`/`[HYPOTHESIS]`/`[REFUTED]`; a HYPOTHESIS must be
  spoken as one in prose. This document follows that convention throughout.
- `src/lib/propagation/drain.ts` Pass 2: recompute via a registered `METHODS[method_id]`, write a new
  `derived_values` row with `supersedes` pointing at the stale row  -  old rows retained, never overwritten.
  **[CONFIRMED]** file header read.
- No existing object represents a *narrative* (non-numeric) conclusion with citations  -  `derived_values`
  is numeric. **[HYPOTHESIS]**.

**Step 5  -  Prediction tracking and scoring.**
- `signposts` entity is *designed*: `assessment_id`, `watches`, `predicate` (jsonb `{op, ...}`),
  `direction` (`confirms|refutes|delays`), `fired_at`. `docs/specs/00-foundation-the-spine.md` section 1.2.
  **[CONFIRMED]** as a spec artifact (DDL read). Whether the `signposts` table is live in the DB today is
  **[HYPOTHESIS  -  unverified here]**; `entities.display_name` (migration 312) was applied live per
  PROGRAM-BOARD TRAIN 49, so the entity spine exists, but signposts specifically was not re-checked (this
  task is read-only, no DB query run, per the task's own scope).
- No scoring mechanism ("which sources/reasoning held up") was found for signposts  -  `fired_at` records
  that a predicate fired, not whether the firing validated the original claim, and no ledger of
  source/method accuracy over time was located. **[HYPOTHESIS]**, targeted search only.
- The L4 capability-compounding pattern (`docs/plans/recursive-compounding-discovery-2026-08-10.md` section L4)
  is the closest existing precedent for "the method itself improves from what the graph reveals"  -  but
  it is scoped to `discover.mjs`'s edge-scoring signals, not to source/claim reliability. **[CONFIRMED]**
  as written; its applicability to prediction scoring is this document's own proposal, not existing.

**Step 6  -  Surfacing on affected pages and profiles.**
- Portfolio + triggers + delivery layers (per-surface trigger taxonomy, `must-see` class that ignores
  digest/mute, cross-surface digest composition). `docs/specs/00-foundation-the-spine.md` section 5.
  **[CONFIRMED]** spec text read.
- The propagation drain's step 4 is explicitly "the flywheel's actual output": a reader-facing,
  portfolio-scoped notice ("Rotterdam-Milan payback moves 3.4y → 3.9y"). `08-flywheel-design.md` section 2.3.
  **[CONFIRMED]**.
- Realtime UI freshness: Supabase Realtime greys a stale figure on an open page; explicitly *not* the
  causality mechanism. section 2.2. **[CONFIRMED]**.

## 2. Gaps per step

1. **Trigger**: covers value/obligation/signpost changes; no confirmed event type for "brand-new item
   minted with no prior corpus presence" beyond the mint-time discovery path (which handles edges, not
   cross-surface question-raising).
2. **Question generation**: no object exists. The four-product-question × five-surface matrix is not
   modeled anywhere found. L2 gaps and L4 signal-candidates are single-axis analogs, not the general
   mechanism.
3. **Answer-seeking**: the retrieval-first and spend-gate machinery (RD-8/31/32) is real and general, but
   nothing currently *calls* it in response to a generated question, because no question object exists to
   trigger it.
4. **Conclusion**: `admissibleFor`/`FLOOR`/`derived_values` is a strong, general pattern for *numeric*
   conclusions. No structure exists for a narrative inference ("X likely raises cost on corridor Y")
   that still needs citation + confidence + CONFIRMED/HYPOTHESIS labeling at the presentation layer.
5. **Prediction tracking**: `signposts` is designed but (per this read) not confirmed live, and even if
   live, only records firing, not scoring of the original claim's accuracy.
6. **Learning**: no source/method reliability ledger was found. L4's "candidate new signal" pattern is
   the nearest re-usable shape, but it is not wired to prediction outcomes.
7. **Surfacing**: the delivery/portfolio layer is real and general; nothing new needed here beyond
   feeding it new record types.

## 3. Proposed additions

**New data objects** (additive; no existing table redefined):

- `trigger_question`  -  one row per (propagation_event OR mint, surface, product_question) combination
  the deterministic template generator emits. Fields: `event_id` (FK `propagation_events`), `subject_id`
  (`cl:` entity), `surface`, `product_question` (`what|affects_me|comply|invest_wait_avoid`),
  `status` (`open|answered|acquisition_pending|declined`), `generated_by` (`rule:<template-id>`).
  Written as an `integrity_flags` row under a new `question:` namespace in `flag-namespaces.mjs`'s SoT  - 
  reuses the same operator-inbox pattern `signal-candidates.mjs` and L2 gaps already use, rather than a
  new review surface.
- `inference_record`  -  the narrative counterpart to `derived_values`. Fields: `subject_id`, `claim_text`,
  `status_token` (`CONFIRMED|HYPOTHESIS|REFUTED`, rule 14), `confidence` (pedigree or Admiralty scheme
  per `00-foundation-the-spine.md` section 3.2, whichever the cited items already carry), `cited_item_ids[]`
  (never empty  -  an uncited inference is not emitted, mirroring section 7's Assistant rule), `origin_class`
  (`derived|modelled`, never `verified` for a machine-written inference), `derived_from` edges into
  `derivation_edges` so it inherits the existing invalidation DAG.
- `prediction`  -  extends the designed-but-unconfirmed-live `signposts` shape: `inference_record_id`,
  `predicate`, `direction`, `fired_at`, plus a new `outcome_assessed_at`, `outcome` (`held|refuted|
  partial`), `scored_by` (`rule:<method>`).
- `source_reliability_ledger`  -  append-only, one row per scored `prediction`: `source_id or method_id`,
  `predicted`, `outcome`, `scored_at`. Never mutates a prior row (matches rule 1's "never hand-edit
  published rows" applied to this new class of row too).

**Where they plug into existing runtimes:**

- `trigger_question` generation is a new step inside `run-population-flywheel.mjs`'s existing section 8/section 9
  orchestration (it already runs discovery → forward-events → recluster → obligations → tags →
  ratification → outcomes "in tandem," rule 17)  -  added as the next step in that same sequence, not a
  new standalone runner. It is pure and $0 (template expansion over event_type × surface × product
  question), so it needs no spend gate itself.
- Answer-seeking for a `trigger_question` reuses `seek-more.mjs`'s deterministic-identifier-first shape
  generalized beyond source URLs: check `corpus_index`/existing pools first (RD-8); if a residual
  remains, a bounded acquisition fires **only** through `spend-client.ts` with an operator-priced line
  and a cited inventory-miss (RD-31/32)  -  identical gate, new caller.
- `inference_record` writes ride the propagation drain's Pass 2 as a new registered method
  (`METHODS['infer-from-question']`), so it inherits `admissibleFor()` gating, the `supersedes` chain,
  and the batch-drain granularity ADR-024 already ruled (`DRAIN_MODE = "batch"`).
- `prediction` creation happens at the same point an `inference_record` makes a forward-looking claim
  (same drain pass, same method).
- `prediction` scoring is event-driven off the **same** `propagation_events` outbox that started the
  loop: when the watched entity changes again, that write is itself a trigger (step 1), and the drain's
  invalidation closure naturally reaches any `prediction` whose `watches` id matches  -  no separate
  scheduler, consistent with rule 16 (no cadence during build) and the recursive-compounding doc's
  "operator-scheduled, never always-on" posture.

**How this obeys the binding limits:**

- **Build-mode cadence off, run-on-demand only**: nothing here adds a cron or scheduled task. Question
  generation rides the already-scheduled mint/corpus-turn events; acquisition and scoring ride the
  already-existing propagation-events outbox. Consistent with rule 16 and
  `recursive-compounding-discovery-2026-08-10.md`'s "Execution model" section (operator-cadence,
  event-driven steps ride existing entry points, no resident process).
- **RD-31/32 spend gate**: every acquisition step for a `trigger_question` residual is a `SpendTicket`
  call; no default price, no machine-proposed cost, no fetch without a named inventory-miss.
- **RD-8 retrieval before acquisition**: the answer-seeking step is retrieval-first by construction  - 
  acquisition is the fallback branch, never the first branch.
- **Every conclusion labeled inference with items cited**: `inference_record.status_token` is mandatory
  and `cited_item_ids[]` cannot be empty; `admissibleFor()` blocks any inference below `FLOOR.analysis`
  from rendering at all, and `ESTIMATE_DISPLAY = "range"` applies identically to a narrative inference
  that carries a numeric component.
- **Assistant stays a research helper**: section 7's guardrails apply unchanged  -  an `inference_record` surfaced
  through the Assistant is cited, entitlement-filtered, refuses verdicts, and never becomes the second
  calculator. Nothing here gives the Assistant synthesis authority it does not already have.
- **Nothing runs alone (rule 17)**: every new object is a step inside the existing tandem orchestration
  (`run-population-flywheel.mjs`) or the existing drain (`run-propagation-drain.mjs`), never a freestanding
  script with no caller  -  the same discipline TANDEM's own gate enforces for mint batches.

## 4. How learning works, without silently changing published facts

- A `prediction`'s outcome is scored by a **new** row in `source_reliability_ledger`, never by editing
  the original `inference_record` or any `derived_values`/statutory row (rule 1: facts live in Supabase,
  owned by DB/validators/quarantine lanes; docs and inferences cite record IDs, never restate or
  overwrite them).
- A REFUTED prediction does not delete or silently correct the prior inference: the prior
  `inference_record` gets a new superseding row (same `supersedes` chain `drain.ts` already uses for
  numeric values), and the ledger entry is the audit trail  -  matching rule 13's corollary ("a flag that
  dissolves under evidence gets a same-session correction wherever it was recorded, never a quiet drop")
  applied to inferences instead of audit findings.
- What the ledger is allowed to adjust: only the **confidence weighting inputs to future
  `inference_record`s** citing the same source or method  -  e.g., a source whose predictions are
  repeatedly REFUTED contributes a lower pedigree "reliability" axis on its *next* citation. This is
  exactly the L4 pattern (`recursive-compounding-discovery-2026-08-10.md` section L4): "a candidate is SURFACED
  with its evidence for ratification... it does not self-modify the scoring SoT." Any reweighting is a
  ratified, human-gated change to a named constant (mirroring ADR-024's `FLOOR`/`decisions.mjs` pattern),
  never an automatic write to `source-credibility-model` tiers.
- What can never move silently: `origin_class`, statutory/verified facts, and any row governed by rule 1.
  The learning loop only ever writes new `prediction`/`source_reliability_ledger` rows and proposes
  (never applies) a reweight.

## 5. Worked walk-throughs (two different surfaces, neither EV/charging)

**Trigger A  -  Regulations surface: a jurisdiction amends bonded-warehouse climate-control requirements
for fine-art storage.** (Illustrative choice: distinct vertical, distinct surface, distinct mechanism
from the operator's own example.)

1. *Trigger*: the amendment lands as an `obligation_amended` propagation_event on the existing
   `cl:instr:*` entity.
2. *Question generation*: `trigger_question` rows spawn for the affected `cl:juris:*` and any
   `cl:corridor:*`/`cl:org:*` scoped to it via `entity_scope`  -  one per product question: what changed
   (new humidity/temperature thresholds); does it apply to me (which portfolio holders have a warehouse
   or corridor scoped to this jurisdiction); what must I do (equipment/monitoring deadline); invest-or-
   wait (upgrade now vs. wait out the amendment's own review window).
3. *Answer-seeking*: retrieval first against held `obligations`/`entity_scope`/prior Operations
   cost data for climate-control retrofits on comparable corridors. Residual (e.g., no current
   manufacturer benchmark for the new threshold) triggers a priced, inventory-miss-cited acquisition.
4. *Conclusion*: an `inference_record`, `status_token=HYPOTHESIS` ("likely raises compliance cost on
   corridor X by an estimated range"), citing the amendment and the one comparable prior retrofit case;
   `ESTIMATE_DISPLAY=range`.
5. *Prediction*: a `prediction` watching the amendment's `enforcement_start` date and a signpost on
   whether Operations sees actual retrofit cost data land within a set window; scored when either fires.
6. *Surfacing*: Regulations detail page (amendment), Operations profile for the affected warehouse
   entity, portfolio notice to holders scoped to that jurisdiction.

**Trigger B  -  Market Intel surface: an insurer's market signal reports a war-risk/high-value-cargo
premium spike on a named overland corridor after a security incident.**

1. *Trigger*: a new Market Intel item (`value_revised` on the corridor's insurance-premium series).
2. *Question generation*: what happened (premium moved, cite the report); does it apply to me (any
   portfolio holder routing live-event or high-value cargo on that corridor); what must I do (rebook
   cover, reroute, notify the client); invest-or-wait (durable risk repricing vs. a transient spike  - 
   wait for a second independent origin before acting).
3. *Answer-seeking*: retrieval first against held corridor/insurance data and any prior incident on the
   same corridor; residual triggers a bounded, priced search for a second corroborating report (needed
   per the state-machine rule: a single-origin claim stays `emerging`, not `strengthening`, until a
   second independent origin corroborates  -  `08-flywheel-design.md` section 3.1).
4. *Conclusion*: `inference_record`, `HYPOTHESIS` until the second origin lands, then eligible to move
   toward `strengthening`/admissible-for-analysis per the existing lifecycle table.
5. *Prediction*: a `prediction` watching whether the premium index crosses a stated threshold within N
   days (`direction=confirms`); scored on the next Market Intel update for that corridor.
6. *Surfacing*: Market Intel corridor page, Operations profile for any live-event job routed through the
   corridor, portfolio `must-see` alert (time-sensitive insurance cost).

## 6. Sequenced build lanes (S/M/L) and operator decisions

- **S  -  trigger_question generator.** Pure, deterministic, $0. Template expansion (event_type × surface
  × 4 product questions), written as `integrity_flags` rows under a new `question:` namespace, wired as
  the next step inside `run-population-flywheel.mjs`'s existing section 8/section 9 sequence. No new scheduler.
- **S  -  answer-seeking wiring.** Generalize `seek-more.mjs`'s deterministic-first/spend-gated-fallback
  shape to consume a `trigger_question` instead of a source-URL miss; reuses `spend-client.ts` unchanged.
- **M  -  `inference_record` object + admissibleFor-gated renderer.** New table, new drain method
  registration, presentation-layer component analogous to `EstimatedFigure` but for narrative claims with
  a mandatory `status_token` and `cited_item_ids[]`.
- **M  -  `prediction` object.** Depends on confirming whether `signposts` is already live (section 7 below); if
  not, this lane also mints the migration for it, scoped to spec 00 section 1.2's existing DDL rather than a
  redesign.
- **L  -  `source_reliability_ledger` + ratification-gated reweight proposal.** The learning step proper.
  Depends on M landing first (nothing to score without predictions), and on an operator ruling on the
  three forks below before the reweight mechanism is built.

**Decision forks this document will not pick silently  -  operator/coordinator ruling needed:**

1. **Is question generation ever allowed to justify a *metered* step on its own, or is it $0-only
   (template + retrieval), with every acquisition requiring a human-reviewed `trigger_question` first?**
   ADR-024's four rulings are the precedent for "a product judgement with commercial consequences should
   not be picked by whoever writes the code"  -  this is the same shape of decision and belongs in a
   named constant, not a default.
2. **Where does `inference_record` live relative to `derived_values`**  -  as a new admissibility state on
   the existing table, or a fully separate table? `derived_values` was designed for numeric values;
   narrative inferences are a new shape ADR-024 did not anticipate.
3. **Does the reliability ledger ever auto-adjust `source-credibility-model` tiers, or does every
   reweight require ratification (the L4 pattern)?** This document assumes ratification-gated, matching
   L4's stated discipline, but that is this document's own lean, not an existing ruling.

## 7. Open questions and unverified points

- Whether `propagation_events`, `derivation_edges`, and `signposts` are live tables today (migrated and
  populated) or still spec-only artifacts was not re-verified by DB query in this read-only task  -  this
  document treats the DDL in `08-flywheel-design.md`/`00-foundation-the-spine.md` as designed
  **[CONFIRMED as spec text]** but their live-migration status as **[HYPOTHESIS]**, distinct from the
  entity spine itself, which PROGRAM-BOARD TRAIN 49 confirms is live (migration 312 applied).
- Whether `run-population-flywheel.mjs`'s section 8/section 9 sequence has an open slot for an additional step, or
  whether adding one requires touching the harness-run family registration (`F28-harness-run-integrity.mjs`)
  this lane's own header says it deliberately avoided  -  not confirmed by reading the full file body.
- Whether `extract-forward-events.mjs` could be extended to answer "how it affects me" / "invest-wait-
  avoid" directly, or whether those two product questions structurally require the acquisition step
  (they are judgments, not extractable dates)  -  this document assumes the latter but did not find a
  ruling either way.
- The exact trigger condition on `propagation-drain.yml`/`corpus-turn.yml` (workflow_run chaining vs.
  manual dispatch) was not read in full  -  `run-propagation-drain.mjs`'s own header references
  "propagation-drain.yml's own `workflow_run` chaining off... 'Data producers'" as **[HYPOTHESIS]**
  pending a direct read of that YAML, which this session's tooling could not complete in time.
