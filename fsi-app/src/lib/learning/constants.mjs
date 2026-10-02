// constants.mjs, the learning loop's own named constants, ADR-036 fork 1 (docs/decisions/
// ADR-036-learning-loop-forks.md), mirroring src/lib/entities/decisions.mjs's "one home, many
// consumers" discipline for ADR-024's constants. Lane W2-G, wave2b, 2026-09-29.
//
// PLAIN ESM, ZERO DEPENDENCIES, importable from a script, a fitness function, or a component with no
// npm install and no bundler, same constraint decisions.mjs states for itself.

/**
 * ADR-036 decision 1: question generation is $0-only. Template expansion and retrieval against held
 * pools only (RD-8). Every metered acquisition for a `trigger_question` residual needs an
 * operator-priced line (RD-31: operator-priced line, no machine-proposed cost) and a cited
 * inventory-miss (RD-32: no fetch without one), never a machine-picked default price. The ONLY value
 * this constant may hold today; documented as a string (not a boolean) so a later fork, if ever ruled,
 * reads as a new named value here rather than a silently flipped flag.
 * @type {"operator-priced-only"}
 */
export const QUESTION_ACQUISITION = "operator-priced-only";

/**
 * The four product questions every trigger_question is generated against (learning-loop-design
 * section 1, step 2; section 5's worked walk-throughs). Order is the display order the worked
 * walk-throughs use (what -> affects_me -> comply -> invest_wait_avoid).
 * @type {readonly ["what","affects_me","comply","invest_wait_avoid"]}
 */
export const PRODUCT_QUESTIONS = Object.freeze(["what", "affects_me", "comply", "invest_wait_avoid"]);

/**
 * The propagation_events.event_type vocabulary this generator listens for (learning-loop-design
 * section 1, step 1, the trigger). Mirrors the outbox's own CHECK vocabulary (migration 284); kept
 * here as the SUBSET this generator template-expands over, not a re-declaration of the full outbox
 * vocabulary (a generator may not have a template for every outbox event type yet, see
 * trigger-questions.mjs's own TEMPLATES map for which of these are actually wired).
 * @type {readonly string[]}
 */
export const TRIGGER_EVENT_TYPES = Object.freeze([
  "value_revised",
  "obligation_amended",
  "signpost_fired",
  "factor_superseded",
  "confidence_decayed",
  "source_frozen",
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
