// trigger-questions.mjs, S1, learning-loop-design-2026-09-25.md section 6 ("S - trigger_question
// generator"), ADR-044 decision 1 (QUESTION_ACQUISITION = "holdings-session-batch", superseding ADR-036
// decision 1). Lane W2-G, wave2b, 2026-09-29; change-side wiring added by lane L4-A, 2026-10-05.
//
// WHAT THIS IS. Pure, deterministic, $0: template expansion over (event_type x surface x the four
// product questions), written as `integrity_flags` rows under flag-namespaces.mjs's QUESTION_NAMESPACE
// ("question:"). No LLM call, no network, no DB access in the generator itself, same "PURE, no DB, no
// LLM" posture flag-namespaces.mjs's own header states for the SoT it defines. Mirrors
// scripts/connections/propose-tags.mjs's producer shape (a pure `deriveX` computing what SHOULD exist,
// a thin MAINT-step `main({mode,arg}, deps)` doing the dedup-before-insert I/O), reused, not
// reinvented, per the lane-common-contract's "prior art" rule.
//
// TWO TRIGGERS, ONE GENERATOR. (1) Mint time: this module is wired as the next step in
// run-population-flywheel.mjs's own tandem sequence (section 3: "added as the next step in that same
// sequence, not a new standalone runner"), which scopes itself to the batch of items a dispatch minted
// or substantively touched, so that trigger is MINTED_OR_TOUCHED (a generator-local sentinel).
// (2) Change time (lane L4-A, 2026-10-05): run-propagation-drain.mjs calls this generator, through
// questions-on-change.mjs, for the verified items linked to an entity whose value changed, with one of
// constants.mjs's TRIGGER_EVENT_TYPES as the eventType and a `change` description (what changed, on which
// entity) built from the outbox row. Both paths write through the same flag row builder and the same
// dedup rule (no duplicate while an open row exists for the same subject_ref and created_by).
//
// EXAMPLES ARE NOT SCOPE (CLAUDE.md rule 19): the four QUESTION_BUILDERS below are written against the
// PRODUCT_QUESTIONS axis in the abstract (what changed / does it reach my portfolio / what must I do /
// act now or wait) and read only generic item fields (title, item_type, jurisdiction_iso), never a
// hardcoded vertical, corridor, or regulation family. The two worked walk-throughs in the design doc
// (a bonded-warehouse humidity amendment; a war-risk insurance premium spike) are illustrations the
// coverage test below deliberately does NOT special-case.

import { QUESTION_NAMESPACE, createdBy, buildSubjectRef, isInNamespace } from "../connections/flag-namespaces.mjs";
import { PRODUCT_QUESTIONS } from "./constants.mjs";
import {
  REGULATIONS_DOMAIN, MARKET_TECH_DOMAIN, OPERATIONS_REGIONAL_DOMAIN, MARKET_SIGNALS_DOMAIN,
  OPERATIONS_FACILITY_DOMAIN, RESEARCH_DOMAIN,
} from "../domains.ts";

export const CITE = Object.freeze({
  skill: "learning-loop-design-2026-09-25",
  reason:
    "Lane W2-G (2026-09-29): S1 trigger_question generator, ADR-036 decision 1 (question generation is " +
    "$0-only). Writes one integrity_flags row per (item, surface, product_question) combination under " +
    "the QUESTION_NAMESPACE ('question:'). Answered from holdings by a session batch (ADR-044 decision 1), " +
    "never auto-priced, never parked for an operator.",
});

/** Generator-local trigger sentinel, see module header. Not a propagation_events.event_type value. */
export const MINTED_OR_TOUCHED = "item_minted_or_touched";

/** intelligence_items.domain (INT 1-7, domains.ts) -> this module's own coarse SURFACES token. Domain 5
 *  and the Community surface (no domain column value) are deliberately absent, domains.ts documents 5
 *  as unused/legacy, and Community has no domain-routed items today (Community is user-generated, not
 *  domain-classified intelligence_items, caros-ledge-platform-intent). @type {Map<number,string>} */
const DOMAIN_TO_SURFACE = new Map([
  [REGULATIONS_DOMAIN, "regulations"],
  [MARKET_TECH_DOMAIN, "market_intel"],
  [OPERATIONS_REGIONAL_DOMAIN, "operations"],
  [MARKET_SIGNALS_DOMAIN, "market_intel"],
  [OPERATIONS_FACILITY_DOMAIN, "operations"],
  [RESEARCH_DOMAIN, "research"],
]);

/** Resolve the surface(s) a trigger_question is generated for, from an item's `domain` column. PURE.
 *  Returns [] for an unrouted/legacy domain (5, null, or anything not in the map), an item with no
 *  resolvable surface gets no trigger_question rather than a guessed one (mirrors SC-13's "no default
 *  tier" posture, applied here to "no default surface").
 *  @param {number|null|undefined} domain
 *  @returns {string[]} */
export function surfacesForDomain(domain) {
  const s = DOMAIN_TO_SURFACE.get(domain);
  return s ? [s] : [];
}

/** One builder per product question (PRODUCT_QUESTIONS order). Each is a pure function of
 *  {item, surface, eventType} -> question text. Generic across every surface and event type by
 *  construction, see module header, "examples are not scope". */
const QUESTION_BUILDERS = Object.freeze({
  what: ({ item, change }) =>
    change
      ? `What changed: ${change}. What does that mean for "${item.title ?? "this item"}"?`
      : `What changed: ${item.title ?? "this item"}?`,
  affects_me: ({ item, surface, change }) =>
    `${change ? `Following this change (${change}), does` : "Does"} "${item.title ?? "this item"}" apply to any portfolio holder scoped to its jurisdiction or corridor on ${surface}?`,
  comply: ({ item, change }) =>
    `${change ? `Following this change (${change}), what` : "What"} must a reader do in response to "${item.title ?? "this item"}", and by when?`,
  invest_wait_avoid: ({ item, change }) =>
    `Given "${item.title ?? "this item"}"${change ? ` and this change (${change})` : ""}, should a reader act now, wait for corroboration, or take no action?`,
});

/**
 * Generate the trigger_question rows for one item, across every surface it routes to and all four
 * product questions. PURE, no I/O. Returns [] for an item with no resolvable surface (see
 * surfacesForDomain).
 * @param {{id:string, title?:string|null, domain?:number|null, item_type?:string|null, jurisdiction_iso?:string[]|string|null}} item
 * @param {{eventType?:string, eventId?:number|string|null, change?:string|null}} [opts] `change` is the
 *   plain-words description of what changed (change-time only); `eventId` is the originating outbox event
 *   id, carried to the flag row's structured context.
 * @returns {Array<{itemId:string, surface:string, productQuestion:string, eventType:string, eventId:number|string|null, questionText:string, subjectRef:string, createdBy:string}>}
 */
export function generateTriggerQuestions(item, { eventType = MINTED_OR_TOUCHED, eventId = null, change = null } = {}) {
  if (!item || !item.id) return [];
  const surfaces = surfacesForDomain(item.domain);
  const out = [];
  for (const surface of surfaces) {
    for (const pq of PRODUCT_QUESTIONS) {
      const builder = QUESTION_BUILDERS[pq];
      out.push({
        itemId: item.id,
        surface,
        productQuestion: pq,
        eventType,
        eventId,
        questionText: builder({ item, surface, eventType, change }),
        subjectRef: buildSubjectRef(item.id, surface, pq),
        createdBy: createdBy(QUESTION_NAMESPACE, pq),
      });
    }
  }
  return out;
}

/**
 * Build the integrity_flags row for one generated trigger_question. PURE. category='coverage_gap', * the closest existing vocabulary member (gaps.mjs's own choice for "the corpus doesn't yet answer
 * this"); a trigger_question is exactly that, asked at item-scope instead of corpus-scope. subject_type
 * is "item" (mirrors TAG_NAMESPACE/FLYWHEEL_DEFECT_NAMESPACE, the subject is the minted row).
 * @param {ReturnType<typeof generateTriggerQuestions>[number]} q
 * @returns {object}
 */
export function triggerQuestionFlagRow(q) {
  return {
    category: "coverage_gap",
    subject_type: "item",
    subject_ref: q.subjectRef,
    status: "open",
    created_by: q.createdBy,
    description: q.questionText.slice(0, 480),
    recommended_actions: [
      {
        action: "answer-seeking",
        rationale:
          `product_question=${q.productQuestion} surface=${q.surface} event_type=${q.eventType}` +
          `${q.eventId != null ? ` event_id=${q.eventId}` : ""} - ` +
          "answered from holdings by a session batch, retrieval-first against held pools (RD-8); a residual " +
          "becomes a source search target (ADR-044 decisions 1 and 2, QUESTION_ACQUISITION=holdings-session-batch), " +
          "never a fetch or a priced request.",
      },
    ],
  };
}

/** True when a createdBy value is one this generator wrote (any of the four product-question
 *  subtypes). @param {string} createdByValue @returns {boolean} */
export function isTriggerQuestionFlag(createdByValue) {
  return isInNamespace(createdByValue, QUESTION_NAMESPACE);
}

/**
 * The shared write half: dedup-before-insert over an already-generated question list. Both the mint-time
 * `main` below and the change-time questions-on-change.mjs call it, so there is one dedup rule and one
 * writer shape. Dry mode computes and reports the plan; apply mode inserts the NEW rows only.
 * Dedup is two-fold: a question whose (subject_ref, created_by) already has an OPEN flag is skipped
 * (`already_open`), and the same key generated twice in one batch is written once (`deduped_in_batch`).
 * @param {{ mode?: "dry"|"apply", questions: ReturnType<typeof generateTriggerQuestions>, itemsConsidered?: number, step?: string }} opts
 * @param {{
 *   readExistingOpen: () => Promise<Array<{subject_ref:string, created_by:string}>>,
 *   insertMany: (rows:object[]) => Promise<{inserted:number, snapshot:string|null}>,
 * }} deps
 */
export async function mainForQuestions({ mode = "dry", questions = [], itemsConsidered = 0, step = "trigger-questions" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step, mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  summary.counts.items_considered = itemsConsidered;
  summary.counts.questions_generated = questions.length;

  if (questions.length === 0) {
    summary.counts.deduped_in_batch = 0;
    summary.counts.already_open = 0;
    summary.counts.new = 0;
    summary.note = "0 questions generated (no item routed to a surface this batch), nothing to write.";
    return summary;
  }

  const keyOf = (q) => `${q.subjectRef}\u0000${q.createdBy}`;
  const seen = new Set();
  const unique = [];
  for (const q of questions) {
    const k = keyOf(q);
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(q);
  }
  summary.counts.deduped_in_batch = questions.length - unique.length;

  const existing = await deps.readExistingOpen();
  const existingKeys = new Set(existing.map((r) => `${r.subject_ref}\u0000${r.created_by}`));
  const fresh = unique.filter((q) => !existingKeys.has(keyOf(q)));
  summary.counts.already_open = unique.length - fresh.length;
  summary.counts.new = fresh.length;

  if (!apply) {
    summary.note = `dry mode, would insert ${fresh.length} new question flag(s), skip ${unique.length - fresh.length} already-open.`;
    return summary;
  }

  if (fresh.length === 0) {
    summary.note = "apply mode, nothing new to insert (every generated question already has an open flag).";
    return summary;
  }

  const rows = fresh.map(triggerQuestionFlagRow);
  const res = await deps.insertMany(rows);
  summary.applied = res.inserted ?? 0;
  summary.read_back = { snapshot: res.snapshot ?? null };
  return summary;
}

/**
 * The mint-time MAINT-step shape (mirrors tag-proposals.mjs's `main({mode,arg}, deps)`): generate for an
 * already-fetched item list, then the shared dedup-before-insert write.
 * @param {{ mode?: "dry"|"apply", items: Array<object> }} opts items already resolved by the caller
 *   (the flywheel step passes its own batch's rows, this function does no corpus read of its own)
 * @param {Parameters<typeof mainForQuestions>[1]} deps
 */
export async function main({ mode = "dry", items = [] } = {}, deps) {
  const generated = items.flatMap((item) => generateTriggerQuestions(item));
  return mainForQuestions({ mode, questions: generated, itemsConsidered: items.length }, deps);
}
