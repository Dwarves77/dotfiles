// methods/infer-from-question.ts, M, learning-loop-design-2026-09-25.md section 6 ("M - inference_record
// object + admissibleFor-gated renderer"), ADR-036 decisions 2/3. Lane W2-G, wave2b, 2026-09-29.
// Coordinator ruling, same day: drain.ts's Pass 2 dispatches on RECORD KIND (derived_values vs
// inference_records), so this file's own registry and method are now symmetric with the numeric
// methods/index.ts shape (MethodContext in, a result out) rather than a bespoke trigger_question/answer
// pair, the SAME dispatch key (method_id, method_version) drain.ts already reads off a stale row, just
// against a second table and a second small registry (INFERENCE_METHODS, kept separate from METHODS
// because a narrative result is not a numeric MethodResult, see below).
//
// WHY INFERENCE_METHODS IS ITS OWN REGISTRY, NOT methods/index.ts's METHODS. That registry's
// `MethodResult` is shaped for `derived_values`: a numeric value/valueLow/valueHigh, `derivation`/
// `lifecycle`/`admissibility` from derived_values' own 8-9 value vocabularies. `inference_records`
// (migration 338) is a narrative table (claim_text/status_token/cited_item_ids/origin_class); forcing it
// through MethodResult would manufacture fake numeric/derivation/lifecycle fields a claim does not have.
// `computeInferFromQuestion` therefore takes the SAME `MethodContext` shape methods/index.ts already
// defines (entityId/inputs/priorValue/now, reused, not re-declared) and returns its own
// `InferenceMethodResult`. drain.ts imports `INFERENCE_METHODS` from here the same way it imports
// `METHODS` from methods/index.ts, and dispatches to whichever registry matches the stale row's own
// table (migration 339, drain.ts Pass 2).
//
// A METHOD IS A PURE FUNCTION OF ITS RESOLVED INPUTS (methods/index.ts's own discipline, reused here):
// no network, no Date.now(), `now` is injected.

import { FLOOR } from "../../entities/decisions.mjs";
import { STATUS_TOKENS, ORIGIN_CLASSES } from "../../learning/constants.mjs";
import type { MethodContext, ResolvedMethodInput } from "./index.ts";
import type { InputRef } from "../types.ts";

export const METHOD_ID = "infer-from-question";
export const METHOD_VERSION = "v1";

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

/** The prior inference_records row shape a recompute reads (drain.ts supplies this as
 *  `MethodContext.priorValue`, the SAME "give the method its own previous state" contract
 *  methods/index.ts's header documents for the numeric path). */
export interface PriorInferenceRow {
  inference_id: string;
  claim_text: string;
  cited_item_ids: string[];
  trigger_question_ref: string | null;
}

export type InferenceMethodFn = (ctx: MethodContext) => InferenceMethodResult | Promise<InferenceMethodResult>;

/**
 * Recompute one inference given its prior row and its freshly RESOLVED declared inputs (drain.ts's
 * `resolveInputs`, called against migration 339's real `derivation_edges` rows for this inference, not
 * a jsonb shadow-copy). PURE. Refuses (ok:false) rather than emit an uncited or unsupported claim:
 *   - no prior row, or a prior row with zero cited_item_ids: refused (migration 338's own CHECK would
 *     reject an uncited insert regardless; refusing here keeps the reason legible to the caller).
 *   - one or more declared inputs exist but EVERY one is unresolvable (row: null): refused, the same
 *     "insufficient inputs" outcome methods/index.ts's own header describes for a numeric method.
 *   - confidence is fixed at FLOOR.analysis (ADR-024's own floor constant, reused rather than a new
 *     number invented here): a recompute against the same product-question template is the
 *     least-speculative inference class this method produces, a HYPOTHESIS, never CONFIRMED (a machine
 *     never self-labels CONFIRMED, rule 14).
 */
export function computeInferFromQuestion(ctx: MethodContext): InferenceMethodResult {
  const prior = ctx.priorValue as PriorInferenceRow | null;
  const citedItemIds = Array.isArray(prior?.cited_item_ids) ? prior!.cited_item_ids.filter(Boolean) : [];
  if (!prior || citedItemIds.length === 0) {
    return { ok: false, reason: "no prior inference_records row with cited_item_ids to recompute from" };
  }

  const resolved = (ctx.inputs ?? []).filter((i: ResolvedMethodInput) => i.row !== null);
  if ((ctx.inputs ?? []).length > 0 && resolved.length === 0) {
    return { ok: false, reason: "every declared input is unresolvable" };
  }

  void ctx.now; // injected per this engine's discipline; not read (no decay component on this table)
  return {
    ok: true,
    claimText: `${prior.claim_text} (recomputed against ${resolved.length} resolved input(s)).`,
    statusToken: "HYPOTHESIS",
    confidence: FLOOR.analysis,
    citedItemIds,
    originClass: "derived",
  };
}

// ── the narrow, already-usable write path for a FIRST (non-recompute) inference row ─────────────────────
// drain.ts's Pass 2 only ever RECOMPUTES an existing stale row (computeInferFromQuestion above); the
// FIRST write, from a resolved S1/S2 trigger_question answer, has no prior row and no MethodContext to
// dispatch through (nothing is stale yet). This is that mint-time write path, mirroring
// register-derivation.ts's registerDerivedValue(sb, input) shape exactly, for migration 339's
// register_inference_record() RPC.

/** The minimal Supabase RPC surface this module needs (same narrow-interface posture as
 *  register-derivation.ts's `RpcClient`). */
export interface InferenceRpcClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface RegisterInferenceRecordInput {
  subjectId: string | null;
  claimText: string;
  statusToken: (typeof STATUS_TOKENS)[number];
  confidence: number;
  citedItemIds: string[];
  originClass: (typeof ORIGIN_CLASSES)[number];
  methodId: string;
  methodVersion: string;
  computedBy: string;
  triggerQuestionRef?: string | null;
  inputs?: InputRef[];
  supersedes?: string | null;
}

/** Runtime guard mirroring validateRegisterDerivedValueInput's posture (DB CHECK is the enforcement;
 *  this is a fast, named, pre-flight refusal). PURE. */
export function validateRegisterInferenceRecordInput(input: RegisterInferenceRecordInput): string[] {
  const problems: string[] = [];
  if (typeof input.claimText !== "string" || input.claimText.trim().length === 0) problems.push("claimText must be a non-empty string");
  if (!STATUS_TOKENS.includes(input.statusToken)) problems.push(`statusToken must be one of ${STATUS_TOKENS.join(",")}`);
  if (typeof input.confidence !== "number" || !Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    problems.push(`confidence must be a finite number in [0, 1] (got ${JSON.stringify(input.confidence)})`);
  }
  if (!Array.isArray(input.citedItemIds) || input.citedItemIds.length === 0) problems.push("citedItemIds must be a non-empty array");
  if (!ORIGIN_CLASSES.includes(input.originClass)) problems.push(`originClass must be one of ${ORIGIN_CLASSES.join(",")}`);
  if (typeof input.methodId !== "string" || !input.methodId.trim()) problems.push("methodId must be a non-empty string");
  if (typeof input.methodVersion !== "string" || !input.methodVersion.trim()) problems.push("methodVersion must be a non-empty string");
  if (typeof input.computedBy !== "string" || !input.computedBy.trim()) problems.push("computedBy must be a non-empty string");
  return problems;
}

/**
 * Write a new inference_records row + its derivation_edges atomically, via migration 339's
 * register_inference_record() RPC. Throws on validation failure or an RPC error (never a partial write).
 * @returns {Promise<string>} the new row's inference_id (uuid)
 */
export async function registerInferenceRecord(sb: InferenceRpcClient, input: RegisterInferenceRecordInput): Promise<string> {
  const problems = validateRegisterInferenceRecordInput(input);
  if (problems.length) throw new Error(`registerInferenceRecord: invalid input -\n  ${problems.join("\n  ")}`);

  const { data, error } = await sb.rpc("register_inference_record", {
    p_subject_id: input.subjectId ?? null,
    p_claim_text: input.claimText,
    p_status_token: input.statusToken,
    p_confidence: input.confidence,
    p_cited_item_ids: input.citedItemIds,
    p_origin_class: input.originClass,
    p_method_id: input.methodId,
    p_method_version: input.methodVersion,
    p_computed_by: input.computedBy,
    p_trigger_question_ref: input.triggerQuestionRef ?? null,
    p_inputs: input.inputs ?? [],
    p_supersedes: input.supersedes ?? null,
  });
  if (error) throw new Error(`registerInferenceRecord: register_inference_record RPC failed: ${error.message}`);
  return data as string;
}

// ── the tiny, narrative-shaped registry parallel to methods/index.ts's numeric REGISTRY (see header) ────

const INFERENCE_REGISTRY = new Map<string, InferenceMethodFn>();

function inferenceMethodKey(methodId: string, methodVersion: string): string {
  return `${methodId}@${methodVersion}`;
}

/** Read-only surface, same "never bypass the duplicate-registration guard" posture as METHODS in
 *  methods/index.ts. drain.ts imports ONLY this from here, mirroring its own "drain.ts imports ONLY
 *  getMethod/METHODS, never a concrete method" discipline. */
export const INFERENCE_METHODS = Object.freeze({
  get: (methodId: string, methodVersion: string): InferenceMethodFn | undefined => INFERENCE_REGISTRY.get(inferenceMethodKey(methodId, methodVersion)),
  has: (methodId: string, methodVersion: string): boolean => INFERENCE_REGISTRY.has(inferenceMethodKey(methodId, methodVersion)),
  registeredKeys: (): string[] => [...INFERENCE_REGISTRY.keys()],
});

if (!INFERENCE_REGISTRY.has(inferenceMethodKey(METHOD_ID, METHOD_VERSION))) {
  INFERENCE_REGISTRY.set(inferenceMethodKey(METHOD_ID, METHOD_VERSION), computeInferFromQuestion);
}
