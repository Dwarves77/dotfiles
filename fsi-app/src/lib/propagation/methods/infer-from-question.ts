// methods/infer-from-question.ts, M, learning-loop-design-2026-09-25.md section 6 ("M -
// inference_record object + admissibleFor-gated renderer"), ADR-036 decisions 2/3. Lane W2-G, wave2b,
// 2026-09-29.
//
// WHY THIS IS NOT A REGISTERED src/lib/propagation/methods/index.ts METHOD (the numeric `MethodFn` /
// `MethodResult` contract). That registry's `MethodResult` is shaped for `derived_values`, a numeric
// value/valueLow/valueHigh, `derivation`/`lifecycle`/`admissibility` from derived_values' own 8-9 value
// vocabularies (migration 285). ADR-036 decision 2 rules `inference_records` a SEPARATE, narrative
// table (`claim_text`/`status_token`/`cited_item_ids`) precisely because it does NOT fit that numeric
// shape, forcing it through MethodResult would mean inventing fake value/derivation/lifecycle fields
// for a claim that has none, exactly the kind of manufactured-fact shape environmental-policy-and-
// innovation's integrity rule forbids one layer up (a narrative claim wearing a numeric method's
// clothing). This file therefore defines its OWN result shape (InferenceMethodResult below) and its
// own tiny registry (INFERENCE_METHODS), parallel to but never merged with methods/index.ts's REGISTRY
//, same "own the seam, not the body" posture that file's header states for itself, applied to a
// second, narrower seam. methods/superseded-notices.ts is this directory's existing precedent for a
// file that lives here without going through the numeric REGISTRY at all.
//
// THE OPEN GAP THIS FILE NAMES, NOT SILENTLY CLOSES (CLAUDE.md rule 13/14). drain.ts's Pass 2 (see that
// file's own header, "PASS 2 (apply mode only)") walks `derived_values` rows with
// `admissibility='stale'` exclusively, there is no equivalent stale-queue on `inference_records` in
// migration 338, and widening Pass 2 to a second table is a larger, cross-cutting change to drain.ts's
// two-pass contract that this lane's write set (drain.ts "METHODS registration", not "Pass 2
// rearchitecture") does not license unilaterally. So: `computeInferFromQuestion` is a pure function
// ready to be called by a FUTURE Pass 3 (or a dedicated inference-drain entry point) once that queue
// exists; `runInferFromQuestion` is the narrow, already-usable write path a script or a route can call
// directly TODAY (writes exactly one guarded inference_records row via the injected `sb`). Neither is
// wired to fire automatically off `propagation_events` yet, flagged in this lane's report as an open
// question for the coordinator, not claimed done.
//
// A METHOD IS A PURE FUNCTION OF ITS RESOLVED INPUTS (methods/index.ts's own discipline, reused here):
// no network, no Date.now(), `now` is injected.

import { FLOOR } from "../../entities/decisions.mjs";
import { QUESTION_ACQUISITION, STATUS_TOKENS, ORIGIN_CLASSES } from "../../learning/constants.mjs";

export const METHOD_ID = "infer-from-question";
export const METHOD_VERSION = "v1";

/** One resolved trigger_question + the answer-seeking result S2 (seek-more.mjs's
 *  `seekAnswerForQuestion`) already produced for it, this method never seeks its own answer, it only
 *  turns an already-resolved (or already-requested) answer into a claim. */
export interface InferFromQuestionInput {
  triggerQuestion: { itemId: string; surface: string; productQuestion: string; questionText: string; subjectRef: string };
  /** The seekAnswerForQuestion() result (src/lib/sources/seek-more.mjs) for this question. */
  answer: { resolved: boolean; source: "held-pool" | "none" | "priced-candidates"; candidates: unknown[] };
  /** The intelligence_items ids this claim would cite, REQUIRED non-empty for a resolved answer
   *  (mirrors migration 338's cited_item_ids CHECK; this method refuses rather than emit an uncited
   *  claim, matching environmental-policy-and-innovation's integrity rule applied to this new table). */
  citedItemIds: string[];
  /** The item's own subject entity id, when resolved (nullable, see migration 338's subject_id). */
  subjectId: string | null;
  now: Date;
}

export type InferenceMethodResult =
  | {
      ok: true;
      claimText: string;
      statusToken: (typeof STATUS_TOKENS)[number];
      confidence: number;
      citedItemIds: string[];
      originClass: (typeof ORIGIN_CLASSES)[number];
    }
  | { ok: false; reason: string };

/**
 * Turn a resolved (or requested) trigger_question answer into an inference_records row's content.
 * PURE. Refuses (ok:false) rather than emit an uncited or under-confident claim:
 *   - an unresolved answer (S2's `resolved:false`) never becomes a claim, the answer-seeking REQUEST
 *     record IS the outcome for a residual (ADR-036 decision 1, QUESTION_ACQUISITION); this method is
 *     never the thing that fabricates an answer no source actually gave.
 *   - a resolved answer with no cited item ids refuses (migration 338's own CHECK would reject the
 *     insert regardless; refusing here keeps the refusal reason legible to the caller instead of a raw
 *     DB constraint violation).
 *   - confidence is fixed at FLOOR.analysis (ADR-024's own floor constant, reused rather than a new
 *     number invented here) for a held-pool-resolved answer, since a template-derived claim citing an
 *     existing pool hit is the least-speculative inference class this method can produce, a HYPOTHESIS,
 *     never CONFIRMED (a machine never self-labels CONFIRMED; only an operator/independent-verification
 *     pass may promote a token, mirroring CLAUDE.md rule 14's own status-token discipline).
 */
export function computeInferFromQuestion(input: InferFromQuestionInput): InferenceMethodResult {
  const { triggerQuestion, answer, citedItemIds, now } = input;
  if (!answer || !answer.resolved) {
    return { ok: false, reason: `question ${triggerQuestion.subjectRef} not resolved (source=${answer?.source ?? "none"}), ${QUESTION_ACQUISITION} means no fabricated answer` };
  }
  const cites = Array.isArray(citedItemIds) ? citedItemIds.filter(Boolean) : [];
  if (cites.length === 0) {
    return { ok: false, reason: "no cited_item_ids, an uncited inference is never emitted (migration 338 CHECK, mirrors spec section 7)" };
  }
  void now; // injected per this engine's discipline; not read (this method has no decay component)
  return {
    ok: true,
    claimText: `In answer to "${triggerQuestion.questionText}": ${answer.candidates.length} held-pool result(s) inform this claim.`,
    statusToken: "HYPOTHESIS",
    confidence: FLOOR.analysis,
    citedItemIds: cites,
    originClass: "derived",
  };
}

// ── the narrow write path usable TODAY (not auto-fired by drain.ts's Pass 2, see header) ──────────────

/** The minimal Supabase surface this write needs. */
export interface InferenceWriteClient {
  from(table: string): { insert(row: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> };
}

/**
 * Write ONE inference_records row for a resolved trigger_question. Refuses (throws) rather than write
 * a row computeInferFromQuestion refused, never a partial/guessed insert. `sb` is always a parameter
 * (this module never imports supabase-js itself, same discipline as drain.ts/superseded-notices.ts).
 */
export async function runInferFromQuestion(sb: InferenceWriteClient, input: InferFromQuestionInput): Promise<{ ok: true } | { ok: false; reason: string }> {
  const result = computeInferFromQuestion(input);
  if (!result.ok) return result;
  const { error } = await sb.from("inference_records").insert({
    subject_id: input.subjectId,
    claim_text: result.claimText,
    status_token: result.statusToken,
    confidence: result.confidence,
    cited_item_ids: result.citedItemIds,
    origin_class: result.originClass,
    derived_from: [],
    trigger_question_ref: input.triggerQuestion.subjectRef,
    computed_by: `${METHOD_ID}@${METHOD_VERSION}`,
  });
  if (error) return { ok: false, reason: `inference_records insert failed: ${error.message}` };
  return { ok: true };
}

// ── the tiny, narrative-shaped registry parallel to methods/index.ts's numeric REGISTRY (see header) ────

type InferenceMethodFn = (input: InferFromQuestionInput) => InferenceMethodResult;
const INFERENCE_REGISTRY = new Map<string, InferenceMethodFn>();

function inferenceMethodKey(methodId: string, methodVersion: string): string {
  return `${methodId}@${methodVersion}`;
}

/** Read-only surface, same "never bypass the duplicate-registration guard" posture as METHODS in
 *  methods/index.ts. */
export const INFERENCE_METHODS = Object.freeze({
  get: (methodId: string, methodVersion: string): InferenceMethodFn | undefined => INFERENCE_REGISTRY.get(inferenceMethodKey(methodId, methodVersion)),
  has: (methodId: string, methodVersion: string): boolean => INFERENCE_REGISTRY.has(inferenceMethodKey(methodId, methodVersion)),
  registeredKeys: (): string[] => [...INFERENCE_REGISTRY.keys()],
});

if (!INFERENCE_REGISTRY.has(inferenceMethodKey(METHOD_ID, METHOD_VERSION))) {
  INFERENCE_REGISTRY.set(inferenceMethodKey(METHOD_ID, METHOD_VERSION), computeInferFromQuestion);
}
