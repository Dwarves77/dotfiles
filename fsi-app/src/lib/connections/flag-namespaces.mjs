export const GAP_NAMESPACE = "flywheel-gap:";
export const ANTICIPATE_NAMESPACE = "flywheel-anticipate:";
export const SIGNAL_NAMESPACE = "flywheel-signal:";
export const FLYWHEEL_DEFECT_NAMESPACE = "flywheel-defect:";
// TAG_NAMESPACE — the fifth namespace, born with propose-tags.mjs (lane TAG, 2026-09-01): items minted
// with EMPTY operational_scenario_tags/compliance_object_tags/topic_tags score ZERO discover.mjs edges
// (that scorer reads exactly those fields — see discover.mjs's own header). propose-tags.mjs reflects
// one integrity_flags row per such item, carrying derive-tags.mjs's PROPOSED tags (never auto-applied —
// operator ratification required, same posture as ratify-flag-to-census.mjs's `ratify:census` marker)
// for apply-tags.mjs to apply once ratified. subject_type is "item" (like FLYWHEEL_DEFECT_NAMESPACE —
// the finding is about the item row itself, not a theme/pair/event); subject_ref is the bare item id
// (buildSubjectRef(itemId) degrades to itemId unchanged, per that helper's own contract below).
export const TAG_NAMESPACE = "flywheel-tag:";

// QUESTION_NAMESPACE, the sixth namespace, born with trigger-questions.mjs (lane W2-G, wave2b,
// 2026-09-29, learning-loop-design-2026-09-25.md section 3/6, ADR-036). Deliberately NOT prefixed
// "flywheel-" like its five siblings above: the learning-loop design (section 3) names the namespace
// literally as "a new `question:` namespace in flag-namespaces.mjs's SoT", a `trigger_question` is a
// generated QUESTION about an item/event, not a flywheel-internal finding about corpus structure (gap,
// anticipate, signal, defect, tag all describe something the flywheel noticed about the CORPUS; a
// trigger_question describes something a READER would ask). subject_type is "item" (the subject the
// question is about, mirrors FLYWHEEL_DEFECT_NAMESPACE/TAG_NAMESPACE's own subject_type); subject_ref
// is buildSubjectRef(itemId, surface, productQuestion) so one item can carry up to
// SURFACES.length x PRODUCT_QUESTIONS.length open question rows without subject_ref collisions across
// different (surface, product_question) pairs for the same item.
export const QUESTION_NAMESPACE = "question:";

// HOLDINGS_NEED_NAMESPACE, the seventh namespace, born with apply-question-answers.mjs (lane L4-B, 2026-10-05,
// ADR-044 decision 2). A question the held source text cannot answer becomes ONE open discovery target: a need
// stated in words (what kind of source, about what) for a free discovery runtime to search for. Distinct from
// the lineage-gap namespace (an instrument IDENTIFIER, deduplicated one open flag per item): this subject_ref is
// the QUESTION's own subject_ref (buildSubjectRef(itemId, surface, productQuestion)), so there is at most one
// open target per question, and the subtype is the product question. subject_type is "item". The structured
// fields (need, item id, surface, product question, pool_hash) live in the flag's recommended_actions element
// whose action is HOLDINGS_NEED_ACTION. Closed by rule when the question is later answered.
export const HOLDINGS_NEED_NAMESPACE = "holdings-need:";
export const HOLDINGS_NEED_ACTION = "find-source";

// TERM_NEED_NAMESPACE, the eighth namespace, born with raise-term-needs.mjs (lane G5-NEED, 2026-10-07, buildout
// plan Stage 5 last clause). An ADOPTED vocabulary term (vocabulary_terms, migration 355) with no held item whose
// primary source is at or above the item type's authority floor becomes ONE open discovery target: a need stated
// in words, raised by rule, closed by rule when a qualifying holding exists. Same flag shape and the same
// find-source action as the holdings-need target, so ONE reader (question-answers/data.mjs needOfFlag) feeds the
// research walker from both namespaces. subject_type is "system"; subject_ref is the vocabulary term id (or
// `lineage:<identifier>` for an instrument identifier that is not a CELEX id, kind standard); the subtype is the
// term kind.
export const TERM_NEED_NAMESPACE = "term-need:";
export const TERM_NEED_ACTION = HOLDINGS_NEED_ACTION;

export const ALL_NAMESPACES = Object.freeze([
  GAP_NAMESPACE, ANTICIPATE_NAMESPACE, SIGNAL_NAMESPACE, FLYWHEEL_DEFECT_NAMESPACE, TAG_NAMESPACE,
  QUESTION_NAMESPACE, HOLDINGS_NEED_NAMESPACE, TERM_NEED_NAMESPACE,
]);

/**
 * Build an integrity_flags.created_by value for one finding `subtype` under `namespace`.
 * Mirrors the exact string analyze-corpus.mjs's pre-refactor gap reflection built inline
 * (`${GAP_NAMESPACE}${g.type}`) — same shape, now the one place it's assembled.
 * @param {string} namespace - one of the exported *_NAMESPACE constants (must end in ':')
 * @param {string} subtype - the finding's own type/kind (e.g. gaps.mjs's g.type)
 * @returns {string}
 */
export function createdBy(namespace, subtype) {
  if (typeof namespace !== "string" || !namespace.endsWith(":")) {
    throw new Error(`flag-namespaces.createdBy: namespace must end in ':' (got ${JSON.stringify(namespace)})`);
  }
  const st = String(subtype ?? "").trim();
  if (!st) throw new Error("flag-namespaces.createdBy: subtype is required.");
  return `${namespace}${st}`;
}

/**
 * Deterministic subject_ref for a finding, built from an ordered list of parts (a theme id, item
 * ids, an event id, a signal kind — whatever makes the finding's subject unique and reproducible
 * across re-runs on an unchanged corpus). Parts are stringified, trimmed, empty parts dropped, and
 * joined with ':'. A single non-empty part degrades to that part unchanged
 * (buildSubjectRef(themeId) === themeId), which is exactly gaps.mjs's existing convention
 * (subject_ref = theme.id, a bare string) — so extracting this SoT does not change any existing
 * gap's subject_ref.
 * @param {...(string|number|null|undefined)} parts
 * @returns {string}
 */
export function buildSubjectRef(...parts) {
  return parts.map((p) => String(p ?? "").trim()).filter(Boolean).join(":");
}

/**
 * True when `createdByValue` belongs to `namespace` — the predicate analyze-corpus.mjs's
 * dedup/resolve scan uses in place of a hand-rolled `.startsWith(...)` at each call site.
 * @param {string} createdByValue
 * @param {string} namespace
 * @returns {boolean}
 */
export function isInNamespace(createdByValue, namespace) {
  return typeof createdByValue === "string" && createdByValue.startsWith(namespace);
}
