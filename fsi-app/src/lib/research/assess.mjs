// assess.mjs -- THE core deliverable of lane W2-R (RESEARCH-ASSESSMENT-MODEL, 2026-10-01). Operator
// ruling 2026-10-01, verbatim: "Why is research have a design but not a build? Fix this." Research
// gets its producer first (R14: the producer that computes assessments is the core deliverable; the
// surface renders what it produces).
//
// WHAT THIS IS. A PURE, DETERMINISTIC function that turns an item's EXISTING data (its own recorded
// facts, its forward events, its citation/bias signals, its source's institutional tier) into the
// docs/specs/03-research.md shape: a maturity triple (restricted here to the two non-conditional axes
// the dispatch names: technical TRL 1-11, commercial CRI 1-6; the ADOPTION BARRIER / MRL axes are NOT
// modeled by this lane -- no data path for the 17-dimension ARL risk vector exists, so this module never
// fabricates one), a horizon read (band + kind + rule + confidence, or a first-class refusal), and a
// split credibility read (evidence score, authority score). NO LLM CALL, EVER (lane-common-contract section 0:
// "$0: no LLM calls"). Every number this module returns traces to a field the caller handed it; nothing
// is invented (CLAUDE.md rule 2). This module never performs its own network fetch either -- it stays
// I/O-free; see "AUTHORITY SCORE WIRING" below for how a resolved OpenAlex record reaches it.
//
// WHY A SEPARATE PURE MODULE, NOT INLINE IN THE PRODUCER. Same reasoning as taxonomy.mjs and
// credibility-grade-modifiers.mjs in this same directory: plain ESM, zero dependencies, so `node --test`
// covers the entire rule ladder without a database, a fetch, or a DOM, and so a future reader (the
// detail-surface component, a different producer, a unit test) can import the SAME decision logic the
// producer uses rather than a second hand-copy of the R1-R4 ladder.
//
// AUTHORITY SCORE WIRING (lane L3, 2026-10-02, coordinator ruling: W2-R merged, the half-slice
// prohibition on wiring no longer applies). `assessAuthorityScore` now computes the REAL spec-03
// section 4 distribution via `scripts/research/authority-score.mjs`'s `scoreSource`/
// `aggregateAuthorityDistribution` whenever it can resolve ANY source identity for the item:
//   (a) `input.sourceRecords` -- pre-resolved OpenAlex records the PRODUCER attaches after a real,
//       network, DOI-keyed lookup (`research-assessment-producer.mjs`'s `resolveOpenAlexSourceRecords`,
//       using `extractDoiCandidate` below and `scripts/research/openalex-client.mjs`). That network call
//       does NOT happen here -- this module stays pure/sync; the producer is where I/O already lives.
//   (b) a forward event naming a recognized roadmap body (IEA/ICCT/IMO/a national plan -- the SAME
//       `ROADMAP_BODIES` match the R3 horizon rule already uses, reused rather than re-matched), routed
//       through authority-score.mjs's grey-literature path, zero network.
// When NEITHER resolves (no DOI found in the item's text, no named roadmap body in its forward events),
// `assessAuthorityScore` falls back to the ORIGINAL degenerate one-source-from-tier read -- the exact
// same output shape and values every existing caller (the producer, the two page routes, read-
// assessments.mjs) already depends on, unchanged for an item with no resolvable identity.
//
// INPUT SHAPE (never a raw DB row -- the producer's job is to narrow a `intelligence_items` + joined
// rows into this shape; this module never touches Supabase).
//
// @typedef {{
//   id: string,
//   itemType: string,                         // 'research_finding' | 'technology' | 'innovation' | ...
//   addedDate: string | null,                  // ISO
//   text: string,                               // title + whatIsIt/whyMatters/fullBrief, concatenated
//   sourceTier: number | null,                  // base_tier from the institution resolver (1-7, lower = stronger)
//   citationCount: number | null,
//   biasTags: Array<{dimension: string, tag: string, confidence: number|null}>,
//   forwardEvents: Array<{
//     id: string,
//     kind: string,                             // forward-events/kind-labels.mjs vocabulary
//     event_date: string | null,                 // ISO; the named trigger date when R1/R3 fires
//     obligation_text: string | null,
//     source_citation: string | null,            // a named institutional roadmap ("IEA", "ICCT", "IMO"), for R3
//   }>,
//   sourceRecords: Array<object> | undefined,   // OPTIONAL (lane L3): pre-resolved authority-score.mjs
//                                                // records (kind 'openalex'|'grey_literature'), attached
//                                                // by the producer's real OpenAlex-resolution step.
//                                                // Absent/empty is the honest default -- most items
//                                                // resolve nothing and fall back to the tier-based read.
// }} AssessmentInput
//
// OUTPUT SHAPE maps 1:1 onto migration 336's research_assessments columns (see that file for the exact
// CHECK constraints this module's own logic must never violate -- corridor ordering, the horizon-or-
// refusal XOR, the status-token vocabulary). `statusToken` is CLAUDE.md rule 14's label: CONFIRMED when
// the read is anchored to a dated, named instrument or a direct corpus fact; HYPOTHESIS when inferred
// (R4, or a maturity corridor read from forward-event text rather than a structured field) -- labeled as
// a hypothesis in the row itself, never asserted as settled.

/** @typedef {"NOW"|"NEAR"|"MID"|"FAR"} HorizonBand */
/** @typedef {"R1"|"R2"|"R3"|"R4"} HorizonRule */
/** @typedef {"availability"|"economic"|"obligation"} HorizonKind */

// Lane L3 wiring (2026-10-02): the real, multi-component spec-03 section 4 scorer. Reused, not
// reimplemented -- see "AUTHORITY SCORE WIRING" above.
import { scoreSource, aggregateAuthorityDistribution } from "../../../scripts/research/authority-score.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * TRL (technical maturity) keyword ladder -- deliberately narrow and literal: a corridor is only ever
 * read when the text names a maturity/deployment state in terms the IEA-extended TRL 1-11 ladder itself
 * uses (spec-03 section 2: "commercial but not yet integrated into value chains at scale" = TRL 10-11).
 * Ordered highest-confidence match first; the first match wins (never summed, never averaged).
 * @type {Array<{low:number, high:number, re:RegExp}>}
 */
const TRL_PATTERNS = [
  { low: 10, high: 11, re: /\b(commercial(ly)? (deployed|operating) at scale|integrated into (the )?value chain|mass[- ]produc)/i },
  { low: 9, high: 10, re: /\b(commercially available|in commercial operation|fully commercial)\b/i },
  { low: 8, high: 9, re: /\b(demonstrat(ed|ion)|pilot (fleet|project|plant)|first[- ]of[- ]a[- ]kind|operational trial)\b/i },
  { low: 6, high: 7, re: /\b(prototype|field trial|demonstration plant|pre[- ]commercial)\b/i },
  { low: 4, high: 5, re: /\b(laboratory|lab[- ]scale|bench[- ]scale|proof of concept)\b/i },
  { low: 1, high: 3, re: /\b(basic research|conceptual design|early[- ]stage research)\b/i },
];

/**
 * CRI (commercial maturity) keyword ladder, ARENA's 1-6 scale (spec-03 section 2).
 * @type {Array<{low:number, high:number, re:RegExp}>}
 */
const CRI_PATTERNS = [
  { low: 6, high: 6, re: /\b(bankable asset class|unsubsidi[sz]ed|without subsidy|investment[- ]grade)\b/i },
  { low: 4, high: 5, re: /\b(scale[- ]?up|multiple (commercial )?contracts|policy[- ]driven deployment)\b/i },
  { low: 3, high: 4, re: /\b(subsidi[sz]ed|mandate[sd]?|government[- ]backed|offtake agreement)\b/i },
  { low: 1, high: 2, re: /\b(pilot purchase|early market|first commercial contract|niche market)\b/i },
];

/**
 * Read a maturity corridor from free text against an ordered pattern ladder. Returns null (honest
 * absence) when nothing matches -- never a guessed midpoint.
 * @param {string} text
 * @param {Array<{low:number, high:number, re:RegExp}>} patterns
 * @returns {{low:number, high:number} | null}
 */
function readCorridor(text, patterns) {
  const t = text || "";
  for (const p of patterns) {
    if (p.re.test(t)) return { low: p.low, high: p.high };
  }
  return null;
}

/**
 * Technical maturity (TRL 1-11) corridor + method + evidence. Reads the item's own text first (a
 * CONFIRMED-eligible read: the brief states its own maturity level), then any forward event whose
 * obligation_text also matches the ladder (contributes its id as corroborating evidence, never
 * overriding the item's own text when both match).
 * @param {import("./assess.mjs").AssessmentInput} input
 * @returns {{low:number, high:number, method:string, evidenceIds:string[]} | null}
 */
export function assessTechnicalMaturity(input) {
  const corridor = readCorridor(input.text, TRL_PATTERNS);
  if (!corridor) return null;
  const evidenceIds = [input.id];
  for (const ev of input.forwardEvents ?? []) {
    const evCorridor = ev.obligation_text ? readCorridor(ev.obligation_text, TRL_PATTERNS) : null;
    // Corroborating evidence only when the event's own text lands on the SAME corridor -- a forward
    // event naming a DIFFERENT maturity band is not evidence for this reading; it is a disagreement,
    // and this function never blends or overrides on disagreement (first match on the item's own text
    // always wins).
    if (evCorridor && evCorridor.low === corridor.low && evCorridor.high === corridor.high) evidenceIds.push(ev.id);
  }
  return {
    ...corridor,
    method: "read from the item's own recorded text against the IEA-extended TRL 1-11 ladder (spec-03 section 2)",
    evidenceIds,
  };
}

/**
 * Commercial maturity (ARENA CRI 1-6) corridor + method + evidence. Same posture as technical maturity.
 * @param {import("./assess.mjs").AssessmentInput} input
 * @returns {{low:number, high:number, method:string, evidenceIds:string[]} | null}
 */
export function assessCommercialMaturity(input) {
  const corridor = readCorridor(input.text, CRI_PATTERNS);
  if (!corridor) return null;
  const evidenceIds = [input.id];
  for (const ev of input.forwardEvents ?? []) {
    const evCorridor = ev.obligation_text ? readCorridor(ev.obligation_text, CRI_PATTERNS) : null;
    if (evCorridor && evCorridor.low === corridor.low && evCorridor.high === corridor.high) evidenceIds.push(ev.id);
  }
  return {
    ...corridor,
    method: "read from the item's own recorded text against the ARENA CRI 1-6 ladder (spec-03 section 2)",
    evidenceIds,
  };
}

/** Roadmap-issuing bodies the R3 rule recognizes (spec-03 section 3's own named examples). */
const ROADMAP_BODIES = /\b(IEA|ICCT|IMO|national (transport )?(ministry|plan))\b/i;

/** Statutory-instrument language the R1 rule recognizes: a dated step with a named legislated mechanism. */
const STATUTORY_RE = /\b(ReFuelEU|FuelEU|EU ETS|CountEmissions|CBAM|CSRD|regulation \(EU\)|directive \d|phase-?in|compliance date)\b/i;

/**
 * Band a date relative to `now` into NOW (0-2y) / NEAR (2-5y) / MID (5-10y) / FAR (10y+). Past dates
 * (already-triggered obligations) band as NOW -- the trigger has already bound, which is the most
 * actionable read, not an error state.
 * @param {Date} date
 * @param {Date} now
 * @returns {HorizonBand}
 */
function bandForDate(date, now) {
  const years = (date.getTime() - now.getTime()) / (365.25 * DAY_MS);
  if (years <= 2) return "NOW";
  if (years <= 5) return "NEAR";
  if (years <= 10) return "MID";
  return "FAR";
}

/**
 * Maturity-to-horizon prior for R4 (spec-03 section 3's own table): TRL 10-11 -> NOW/NEAR, 8-9 ->
 * NEAR/MID, 5-7 -> MID/FAR, 1-4 -> FAR. Takes the LOWER (nearer) end of the item's technical-maturity
 * corridor, the more conservative read when a corridor straddles two of the prior's own bands.
 * @param {number} trlLow
 * @returns {HorizonBand}
 */
function priorBandFromTrl(trlLow) {
  if (trlLow >= 10) return "NOW";
  if (trlLow >= 8) return "NEAR";
  if (trlLow >= 5) return "MID";
  return "FAR";
}

/**
 * The R1-R4 horizon cascade (spec-03 section 3). Tries each rule in order; the first that CAN fire
 * wins -- never blended, never averaged, matching the spec's own cascade framing exactly.
 *
 * R1: a dated statutory instrument exists in the item's own text/forward events -> band from the
 *     instrument's own event_date, kind = 'obligation' (the forwarder's obligation horizon almost always
 *     arrives first, spec-03 section 3). Highest confidence.
 * R2: NOT modeled by this lane -- a diffusion/cost-curve model needs a production-and-cost time series
 *     this corpus does not carry (no market_series join is wired into this module's input shape). Named
 *     here, never faked: this function simply never returns rule "R2" because its data precondition can
 *     never be met from AssessmentInput alone. A future lane that wires market_series history can extend
 *     this ladder without touching R1/R3/R4.
 * R3: a forward event names a roadmap-issuing body (IEA/ICCT/IMO/national plan) with a dated event ->
 *     band from that date, kind = 'availability' (a roadmap is a procurement-horizon statement, not an
 *     obligation), confidence medium (the roadmap's own scenario assumption is unresolved -- never high).
 * R4: neither of the above -- fall back to the maturity-to-horizon prior, confidence forced low and
 *     labelled "inferred from maturity, no dated evidence" (spec-03 section 3, verbatim).
 *
 * Returns null when R4 itself cannot fire either (no technical-maturity corridor exists) -- the
 * MANDATORY REFUSAL STATE (spec-03 section 6): this assessment has nothing to band Research's horizon
 * axis on, and the caller must render the "not forecastable" state rather than omit the axis silently.
 *
 * @param {import("./assess.mjs").AssessmentInput} input
 * @param {{low:number, high:number}|null} technicalMaturity
 * @param {Date} now
 * @returns {{kind: HorizonKind, band: HorizonBand, rule: HorizonRule, confidence: "low"|"medium"|"high", triggerNote: string, anchor?: {eventId: string, eventDate: string}} | null}
 *   `anchor` (lane L4-D) names the dated forward event R1 or R3 read; R4 has none, it rests on no dated event.
 */
export function assessHorizon(input, technicalMaturity, now) {
  // R1: a dated statutory instrument.
  if (STATUTORY_RE.test(input.text)) {
    const dated = (input.forwardEvents ?? []).find((e) => e.event_date && STATUTORY_RE.test(`${e.obligation_text ?? ""} ${input.text}`));
    if (dated?.event_date) {
      const d = new Date(dated.event_date);
      if (!Number.isNaN(d.getTime())) {
        return {
          kind: "obligation",
          band: bandForDate(d, now),
          rule: "R1",
          confidence: "high",
          triggerNote: `binds on you at ${dated.event_date} because ${dated.obligation_text ?? "a dated statutory instrument named in the item's own text"}`,
          anchor: { eventId: dated.id, eventDate: dated.event_date },
        };
      }
    }
  }

  // R3: a reputable institutional roadmap names a date.
  const roadmapEvent = (input.forwardEvents ?? []).find(
    (e) => e.event_date && (ROADMAP_BODIES.test(e.source_citation ?? "") || ROADMAP_BODIES.test(e.obligation_text ?? "")),
  );
  if (roadmapEvent) {
    const d = new Date(roadmapEvent.event_date);
    if (!Number.isNaN(d.getTime())) {
      const body = (roadmapEvent.source_citation ?? roadmapEvent.obligation_text ?? "").match(ROADMAP_BODIES)?.[0] ?? "a named institutional roadmap";
      return {
        kind: "availability",
        band: bandForDate(d, now),
        rule: "R3",
        confidence: "medium",
        triggerNote: `${body}'s roadmap dates this at ${roadmapEvent.event_date}, tagged with the issuing body's own scenario assumption`,
        anchor: { eventId: roadmapEvent.id, eventDate: roadmapEvent.event_date },
      };
    }
  }

  // R4: maturity-to-horizon prior, forced low confidence.
  if (technicalMaturity) {
    return {
      kind: "availability",
      band: priorBandFromTrl(technicalMaturity.low),
      rule: "R4",
      confidence: "low",
      triggerNote: "inferred from maturity, no dated evidence",
    };
  }

  return null;
}

/**
 * Credibility, evidence x agreement half (spec-03 section 4 Score 1, IPCC-shaped). This lane's data path
 * is the SAME one CredibilityChipShared.tsx's own header documents as real today: nothing computes
 * n_works/n_independent_groups/claim-polarity -- so this function returns null (honest "not scored")
 * unless the caller hands a citationCount, in which case a coarse, clearly-labelled-as-partial evidence
 * read is produced from citation count alone (never from raw cited_by_count rendered AS credibility --
 * acceptance criterion 8 -- this is the EVIDENCE dimension's "how much has been written about this",
 * not the authority/reception dimension criterion 8 actually forbids).
 * @param {import("./assess.mjs").AssessmentInput} input
 * @returns {"limited"|"medium"|"robust"|null}
 */
export function assessEvidenceScore(input) {
  const n = input.citationCount;
  if (typeof n !== "number" || n < 0) return null;
  if (n === 0) return "limited";
  if (n < 5) return "medium";
  return "robust";
}

/**
 * DOI-shaped substring in free text, syntax-only (conservative: `10.NNNN/suffix`, trailing punctuation
 * stripped). Exported so the producer's real OpenAlex-resolution step
 * (`research-assessment-producer.mjs`'s `resolveOpenAlexSourceRecords`) reuses the SAME extraction this
 * file's own tests cover, rather than a second hand-copy (lane-common-contract "Prior art"). A match is
 * pure syntax, never itself a network call or a claim that the DOI resolves to anything -- the producer's
 * actual `fetchWorkByDoi` call is what finds out.
 * @param {string} text
 * @returns {string | null}
 */
const DOI_RE = /\b10\.\d{4,9}\/[^\s"'<>)\]]+/;
export function extractDoiCandidate(text) {
  const m = (text || "").match(DOI_RE);
  return m ? m[0].replace(/[.,;]+$/, "") : null;
}

/**
 * Resolve every per-source authority record this item can support, with ZERO network (this module stays
 * I/O-free; see "AUTHORITY SCORE WIRING" in the file header). Two sources, combined:
 *   1. `input.sourceRecords` -- already-resolved OpenAlex records the PRODUCER attached after its own
 *      real, network DOI lookup. Passed straight through, filtered to well-formed entries only.
 *   2. Any forward event naming a recognized roadmap body (the SAME `ROADMAP_BODIES` match the R3
 *      horizon rule already uses above), routed through authority-score.mjs's grey-literature path.
 *      `institutionalMandate` is deliberately left unset here (defaults to false downstream): a forward
 *      event CITING a body's roadmap is weaker evidence than that body being the actual, mandated
 *      standard-setter for this item's domain, and this function has no basis for the stronger claim
 *      (CLAUDE.md rule 2 -- never fabricate a signal stronger than what the data supports).
 * @param {import("./assess.mjs").AssessmentInput} input
 * @returns {Array<object>}
 */
export function resolveAuthoritySources(input) {
  const records = [];
  if (Array.isArray(input.sourceRecords)) {
    for (const r of input.sourceRecords) if (r && r.sourceId) records.push(r);
  }
  for (const ev of input.forwardEvents ?? []) {
    const haystack = `${ev.source_citation ?? ""} ${ev.obligation_text ?? ""}`;
    const m = haystack.match(ROADMAP_BODIES);
    if (m) records.push({ sourceId: `forward-event:${ev.id}`, kind: "grey_literature", displayName: m[0] });
  }
  return records;
}

/**
 * Credibility, source-authority half (spec-03 section 4 Score 2). Returns a DISTRIBUTION-shaped object,
 * never a mean (acceptance criterion 4). Lane L3 (2026-10-02): computes the REAL multi-component
 * distribution via `scripts/research/authority-score.mjs` whenever `resolveAuthoritySources` finds ANY
 * source identity (a producer-resolved OpenAlex record, or a named roadmap body in a forward event).
 * Falls back to the ORIGINAL degenerate one-source-from-tier read -- identical output to every prior
 * caller -- when NEITHER resolves: `null` when no tier is on record either (honest absence, never a
 * guessed tier).
 * @param {import("./assess.mjs").AssessmentInput} input
 * @returns {{highAuthorityIndependent:number, medium:number, vendorFlagged:number, unknown?:number, integrityFlagged?:number, sources?:Array<object>} | null}
 */
export function assessAuthorityScore(input) {
  const resolved = resolveAuthoritySources(input);
  if (resolved.length > 0) {
    return aggregateAuthorityDistribution(resolved.map((r) => scoreSource(r)));
  }
  const tier = input.sourceTier;
  if (typeof tier !== "number") return null;
  // Lower tier number = stronger institution (institution.ts convention). T1-T2 reads as high-authority,
  // T3-T5 as medium, T6-T7 (company/vendor class) as vendor-flagged -- never excluded, per spec section 4
  // ("vendors are never excluded but permanently flagged and capped").
  if (tier <= 2) return { highAuthorityIndependent: 1, medium: 0, vendorFlagged: 0 };
  if (tier <= 5) return { highAuthorityIndependent: 0, medium: 1, vendorFlagged: 0 };
  return { highAuthorityIndependent: 0, medium: 0, vendorFlagged: 1 };
}

/**
 * The forward-looking claim an assessment states, as machine-watchable signposts (lane L4-D, ADR-044
 * decision 4). PURE, rule-based, no text generation, from fields the assessment already carries.
 *
 * What an assessment carries that is signpost-shaped: when horizon rule R1 or R3 anchored on a dated
 * forward event (`horizon.anchor`), the assessment states "this binds or becomes available at that date".
 * The watchable form of that statement, and the only form the available data supports, is movement by
 * the date: by the event date, the entity the item is about (`input.entityId`, the item's
 * instrument_entity_id) records a change in the propagation outbox. The signpost watches that entity,
 * direction `confirms`, predicate `{op: "date_passed", field: "occurred_at", by: <event date>}`: it fires
 * when the drain processes a change event on the entity that occurred on or before `by` (the evaluator
 * reads `occurred_at` off the event), and a `by` that passes with no firing scores the prediction
 * refuted (src/lib/learning/prediction-scoring.mjs). An R4 read rests on no dated event, a refusal has
 * nothing to watch, an assessment with no entity has nothing to watch it on, and a date already past is
 * not a forward expectation: none of those yields a signpost.
 *
 * `seed` is the stable identity (item id plus forward event id): the producer mints the signpost's
 * entity id from it, so a re-run over the same corpus state names the same signpost and writes none.
 * @param {import("./assess.mjs").AssessmentInput & {entityId?: string|null}} input
 * @param {ReturnType<typeof assessHorizon>} horizon
 * @param {Date} now
 * @returns {Array<{seed:string, itemId:string, forwardEventId:string, watches:string, direction:"confirms", predicate:object, label:string}>}
 */
export function assessSignposts(input, horizon, now) {
  if (!horizon || !horizon.anchor || !input.entityId) return [];
  const due = new Date(horizon.anchor.eventDate);
  if (Number.isNaN(due.getTime()) || due.getTime() <= now.getTime()) return [];
  const by = /^\d{4}-\d{2}-\d{2}/.test(String(horizon.anchor.eventDate)) ? String(horizon.anchor.eventDate).slice(0, 10) : due.toISOString().slice(0, 10);
  return [
    {
      seed: `signpost:${input.id}:${horizon.anchor.eventId}`,
      itemId: input.id,
      forwardEventId: horizon.anchor.eventId,
      watches: input.entityId,
      direction: "confirms",
      predicate: {
        op: "date_passed",
        field: "occurred_at",
        by,
        basis: "movement_by_date",
        horizon_rule: horizon.rule,
        forward_event_id: horizon.anchor.eventId,
      },
      label: `Signpost, ${horizon.kind} horizon read ${horizon.rule}: movement on the watched entity by ${by} (item ${input.id})`,
    },
  ];
}

/**
 * Assemble the full migration-336 row shape for one item. Pure; makes no I/O decision (the producer
 * decides whether/how to write this). `null` fields are honest absence, propagated straight through to
 * the DB columns' own nullability -- never defaulted to a sentinel.
 *
 * @param {import("./assess.mjs").AssessmentInput} input
 * @param {{now?: Date}} [opts]
 * @returns {{
 *   itemId: string,
 *   technicalMaturity: {low:number,high:number,method:string,evidenceIds:string[]} | null,
 *   commercialMaturity: {low:number,high:number,method:string,evidenceIds:string[]} | null,
 *   horizon: {kind:HorizonKind,band:HorizonBand,rule:HorizonRule,confidence:string,triggerNote:string} | null,
 *   refusalReason: string | null,
 *   credibilityEvidenceScore: string | null,
 *   credibilityAuthorityScore: object | null,
 *   statusToken: "CONFIRMED" | "HYPOTHESIS",
 *   signposts: ReturnType<typeof assessSignposts>,
 * }}
 */
export function assessItem(input, opts = {}) {
  const now = opts.now ?? new Date();
  const technicalMaturity = assessTechnicalMaturity(input);
  const commercialMaturity = assessCommercialMaturity(input);
  const horizon = assessHorizon(input, technicalMaturity, now);
  const credibilityEvidenceScore = assessEvidenceScore(input);
  const credibilityAuthorityScore = assessAuthorityScore(input);

  // Spec-03 section 6: the mandatory refusal state is first-class, not an error. Fires whenever the
  // horizon ladder could not produce a band at all (R1-R4 all declined -- no statutory date, no roadmap
  // date, no maturity corridor to prior from).
  const refusalReason = horizon
    ? null
    : "not forecastable: no dated statutory instrument, no named institutional roadmap date, and no " +
      "technical-maturity corridor to prior from (spec-03 section 6's mandatory refusal state).";

  // CLAUDE.md rule 14: CONFIRMED only when the horizon read is anchored to a dated, named instrument or
  // roadmap (R1/R3); R4's own maturity-prior inference, and a refusal with nothing to anchor on, are both
  // HYPOTHESIS -- a refusal is not itself a confirmed fact about the world, it is an honest "could not
  // determine" that the next assessment run may overturn with new evidence.
  const statusToken = horizon && (horizon.rule === "R1" || horizon.rule === "R3") ? "CONFIRMED" : "HYPOTHESIS";
  const signposts = assessSignposts(input, horizon, now);

  return {
    itemId: input.id,
    technicalMaturity,
    commercialMaturity,
    horizon,
    refusalReason,
    credibilityEvidenceScore,
    credibilityAuthorityScore,
    statusToken,
    signposts,
  };
}
