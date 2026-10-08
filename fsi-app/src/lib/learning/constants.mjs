// constants.mjs, the learning loop's own named constants, ADR-036 fork 1 (docs/decisions/
// ADR-036-learning-loop-forks.md), mirroring src/lib/entities/decisions.mjs's "one home, many
// consumers" discipline for ADR-024's constants. Lane W2-G, wave2b, 2026-09-29.
//
// PLAIN ESM, ZERO DEPENDENCIES, importable from a script, a fitness function, or a component with no
// npm install and no bundler, same constraint decisions.mjs states for itself.

/**
 * ADR-044 decision 1 (supersedes ADR-036 decision 1): a question is answered from holdings first. A
 * workflow exports open questions with the held source text of the item and its connected items, a
 * Claude session lane writes a committed answer batch, and an apply step validates and writes by rule.
 * No metered call, no priced ticket, no operator review step. A question the holdings cannot answer
 * becomes a source search target through the existing gap-target mechanism (ADR-044 decision 2). The
 * spend chokepoint and RD-31/RD-32 stay in the code as the guard that no learning-loop path spends
 * (ADR-044 decision 5). Documented as a string (not a boolean) so a later fork, if ever ruled, reads as
 * a new named value here rather than a silently flipped flag.
 * @type {"holdings-session-batch"}
 */
export const QUESTION_ACQUISITION = "holdings-session-batch";

/**
 * The four product questions every trigger_question is generated against (learning-loop-design
 * section 1, step 2; section 5's worked walk-throughs). Order is the display order the worked
 * walk-throughs use (what -> affects_me -> comply -> invest_wait_avoid).
 * @type {readonly ["what","affects_me","comply","invest_wait_avoid"]}
 */
export const PRODUCT_QUESTIONS = Object.freeze(["what", "affects_me", "comply", "invest_wait_avoid"]);

/**
 * The trigger event vocabulary for a question raised on a CHANGE (learning-loop-design section 1,
 * step 1). These are NOT a column or a CHECK on propagation_events (migration 284 carries `change_kind`
 * insert/update/delete/supersede and no event_type); they are this module's own names, derived from an
 * outbox row's (table_name, change_kind) by questions-on-change.mjs's eventTypeForOutboxRow. Two of the
 * seven (confidence_decayed, source_frozen) have no emitting table today and stay reserved. identity_revised
 * (lane ALIAS-1, migration 377) is an alias or relation change on an entity: entity_aliases and entity_relations.
 * @type {readonly string[]}
 */
export const TRIGGER_EVENT_TYPES = Object.freeze([
  "value_revised",
  "obligation_amended",
  "signpost_fired",
  "factor_superseded",
  "confidence_decayed",
  "source_frozen",
  "identity_revised",
]);

/**
 * The five customer-facing surfaces (caros-ledge-platform-intent's ratified model), the axis this
 * generator's other dimension expands over.
 * @type {readonly string[]}
 */
export const SURFACES = Object.freeze(["regulations", "market_intel", "research", "operations", "community"]);

/**
 * ADR-036 decision 2: inference_records is a separate table (migration 338), not a state on
 * derived_values. status_token vocabulary, rule 14's three tokens, reused verbatim as the column's
 * own CHECK vocabulary (migration 338) so the code-side constant and the DB constraint never drift
 * apart independently (same "one list, hand-copied, generator-owned" posture migration 285 documents
 * for derived_values.derivation/origin_class).
 * @type {readonly ["CONFIRMED","HYPOTHESIS","REFUTED"]}
 */
export const STATUS_TOKENS = Object.freeze(["CONFIRMED", "HYPOTHESIS", "REFUTED"]);

/**
 * inference_records.origin_class vocabulary (ADR-036 decision 2: "never verified for a
 * machine-written inference"). A narrower vocabulary than derived_values.origin_class (which also
 * carries community/community-corroborated/partner/verified/official), an inference_records row is
 * always either a template-derived question answer (derived) or a modelled narrative conclusion
 * (modelled), never claimed verified by the machine that wrote it.
 * @type {readonly ["derived","modelled"]}
 */
export const ORIGIN_CLASSES = Object.freeze(["derived", "modelled"]);
