// SHARED-WRITER: integrity_flags
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
import { generateTriggerQuestions, triggerQuestionFlagRow } from "../../learning/trigger-questions.mjs";
import type { MethodContext, ResolvedMethodInput } from "./index.ts";
import type { InputRef } from "../types.ts";

export const METHOD_ID = "infer-from-question";
export const METHOD_VERSION = "v1";

type InferenceMethodResult =
  | {
      ok: true;
      claimText: string;
      statusToken: (typeof STATUS_TOKENS)[number];
      confidence: number;
      citedItemIds: string[];
      originClass: (typeof ORIGIN_CLASSES)[number];
      /** The question a recomputed row answers (its `trigger_question_ref`), when it has one. A recompute only
       *  happens because a declared input of the row changed (drain.ts Pass 2b reads `admissibility='stale'`,
       *  which `invalidate_dependents()` sets from a changed input), so the answer was written against holdings
       *  that have since moved: the caller re-opens this question through `reopenQuestionForRecompute` so the
       *  next question export re-answers it against current holdings (lane L4-B, ADR-044 decision 2). */
      reopenQuestionRef?: string | null;
    }
  | { ok: false; reason: string };

/** The prior inference_records row shape a recompute reads (drain.ts supplies this as
 *  `MethodContext.priorValue`, the SAME "give the method its own previous state" contract
 *  methods/index.ts's header documents for the numeric path). */
interface PriorInferenceRow {
  inference_id: string;
  claim_text: string;
  cited_item_ids: string[];
  trigger_question_ref: string | null;
}

type InferenceMethodFn = (ctx: MethodContext) => InferenceMethodResult | Promise<InferenceMethodResult>;

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
    reopenQuestionRef: prior.trigger_question_ref ?? null,
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
interface InferenceRpcClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
}

interface RegisterInferenceRecordInput {
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

// ── the FIRST write of an inference: an answered question (lane L4-B, ADR-044 decisions 1 and 3) ──────────
// A session lane authors an answer batch from held source text (scripts/turns/question-answers/); the apply
// step (scripts/turns/apply-question-answers.mjs) validates it and calls this. The row is an INFERENCE, never
// a fact: origin_class 'derived', a status token (HYPOTHESIS, or CONFIRMED only when the validator proved the
// answer is a quotation of the evidence), its cited items and its confidence.
//
// METHOD KEY: `infer-from-question@v1`, not a new version. The key is what drain.ts Pass 2b dispatches a
// STALE row through (INFERENCE_METHODS above); this row is registered by a session-authored batch rather than
// computed by a method, and a later recompute of it is exactly what v1 already does, so v1's semantics are
// unchanged and no second registry entry is needed. `computed_by` carries the batch name instead of
// `method@version`, the "caller identity" form migration 338's column comment allows.
//
// INPUTS (derivation edges): none. `register_inference_record()` writes edges `from_table`/`from_pk` into a
// closed allowlist (derivation_edges_from_table_allowed, migration 339: emission_factors, market_series,
// regional_data_facts, derived_values, statutory_computations, estimated_values, state_cost_facts,
// inference_records). An answer's inputs are intelligence_items and their grounded claims
// (section_claim_provenance), neither of which the allowlist admits, so the cited item ids travel in
// `cited_item_ids` alone. Consequence, stated plainly: such a row has no incoming edge, so
// `invalidate_dependents()` can never mark it stale; widening the allowlist is a migration, outside this lane.

/** `computed_by` for a first-write inference: the answer batch that produced it. */
export function firstInferenceComputedBy(batch: string): string {
  return `question-answers:${batch}`;
}

interface FirstInferenceArgs {
  /** intelligence_items.instrument_entity_id of the question's item, or null (not every item has one yet). */
  subjectId: string | null;
  claimText: string;
  statusToken: (typeof STATUS_TOKENS)[number];
  confidence: number;
  citedItemIds: string[];
  /** The trigger question's subject_ref (buildSubjectRef shape). */
  triggerQuestionRef: string;
  /** The answer batch name, recorded as `computed_by`. */
  batch: string;
  /** The inference this one replaces when a re-opened question is answered again, else null. */
  supersedes?: string | null;
}

/** Pure: the register_inference_record input for an answered question. Refuses a REFUTED token (a refuted
 *  inference is not an answer to a question). */
export function buildFirstInferenceInput(args: FirstInferenceArgs): RegisterInferenceRecordInput {
  if (args.statusToken === "REFUTED") throw new Error("buildFirstInferenceInput: a REFUTED inference is not an answer; refused");
  return {
    subjectId: args.subjectId ?? null,
    claimText: args.claimText,
    statusToken: args.statusToken,
    confidence: args.confidence,
    citedItemIds: args.citedItemIds,
    originClass: "derived",
    methodId: METHOD_ID,
    methodVersion: METHOD_VERSION,
    computedBy: firstInferenceComputedBy(args.batch),
    triggerQuestionRef: args.triggerQuestionRef,
    inputs: [],
    supersedes: args.supersedes ?? null,
  };
}

/** Write the first inference row for an answered question, atomically, through registerInferenceRecord.
 *  @returns the new inference_id */
export async function registerFirstInference(sb: InferenceRpcClient, args: FirstInferenceArgs): Promise<string> {
  return registerInferenceRecord(sb, buildFirstInferenceInput(args));
}

// ── re-open the originating question of a recomputed inference (lane L4-B, ADR-044) ────────────────────────
// computeInferFromQuestion re-stamps the prior text, so a recomputed row says nothing new: the honest move is
// to ask the question again against current holdings. This writes the SAME open question flag the trigger
// generator writes (generateTriggerQuestions + triggerQuestionFlagRow, imported, not copied), under the SAME
// dedup rule (one open row per subject_ref and created_by), so the next question export lists it again.
// NOT CALLED BY drain.ts YET: wiring it into Pass 2b is a drain.ts edit, outside this lane (reported for the
// lane that owns drain.ts next); until then it is reachable from its own test only.

interface ReopenQuestionDeps {
  readItem(itemId: string): Promise<{ id: string; title?: string | null; domain?: number | null; item_type?: string | null; jurisdiction_iso?: string[] | string | null } | null>;
  /** The currently OPEN question flag for (subject_ref, created_by), or null. */
  readOpenQuestionFlag(subjectRef: string, createdBy: string): Promise<{ id: string } | null>;
  insertFlag(row: Record<string, unknown>): Promise<void>;
}

/** Pure: the item id a question subject_ref names (the first of its `<item>:<surface>:<question>` parts). */
export function itemIdOfQuestionRef(subjectRef: string): string | null {
  const parts = String(subjectRef ?? "").split(":");
  return parts.length === 3 && parts[0] ? parts[0] : null;
}

/** The narrow PostgREST query surface `buildReopenDeps` needs (a hand-rolled test double satisfies it). */
interface ReopenQuery {
  select(cols: string): ReopenQuery;
  eq(col: string, value: unknown): ReopenQuery;
  limit(n: number): ReopenQuery;
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
  insert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
  then<T>(onfulfilled: (value: { data: unknown; error: { message: string } | null }) => T): Promise<T>;
}
export interface ReopenClient {
  from(table: string): ReopenQuery;
}

/**
 * The database deps `reopenQuestionForRecompute` runs on, over a service-role client (drain.ts Pass 2b passes
 * its own). The one write is an INSERT of the question generator's own open flag row (additive, never an
 * update of an existing row), so it needs no snapshot; the dedup read keeps it to one open row per question.
 */
export function buildReopenDeps(sb: ReopenClient): ReopenQuestionDeps {
  return {
    async readItem(itemId) {
      const { data, error } = await sb.from("intelligence_items").select("id,title,domain,item_type,jurisdiction_iso").eq("id", itemId).maybeSingle();
      if (error) throw new Error(`reopen question: reading item ${itemId} failed: ${error.message}`);
      return (data as Awaited<ReturnType<ReopenQuestionDeps["readItem"]>>) ?? null;
    },
    async readOpenQuestionFlag(subjectRef, createdBy) {
      const { data, error } = await sb.from("integrity_flags").select("id").eq("subject_ref", subjectRef).eq("created_by", createdBy).eq("status", "open").limit(1);
      if (error) throw new Error(`reopen question: reading open flags failed: ${error.message}`);
      const rows = Array.isArray(data) ? (data as Array<{ id: string }>) : [];
      return rows[0] ?? null;
    },
    async insertFlag(row) {
      const { error } = await sb.from("integrity_flags").insert(row);
      if (error) throw new Error(`reopen question: inserting the flag failed: ${error.message}`);
    },
  };
}

export async function reopenQuestionForRecompute(
  subjectRef: string | null | undefined,
  deps: ReopenQuestionDeps,
): Promise<{ reopened: boolean; reason: string }> {
  if (!subjectRef) return { reopened: false, reason: "the inference carries no trigger_question_ref" };
  const itemId = itemIdOfQuestionRef(subjectRef);
  if (!itemId) return { reopened: false, reason: `trigger_question_ref ${JSON.stringify(subjectRef)} is not an <item>:<surface>:<question> reference` };
  const item = await deps.readItem(itemId);
  if (!item) return { reopened: false, reason: "the question's item no longer exists" };
  const q = generateTriggerQuestions(item).find((g: { subjectRef: string }) => g.subjectRef === subjectRef);
  if (!q) return { reopened: false, reason: "the question is no longer generated for this item" };
  const row = triggerQuestionFlagRow(q) as { subject_ref: string; created_by: string } & Record<string, unknown>;
  const open = await deps.readOpenQuestionFlag(row.subject_ref, row.created_by);
  if (open) return { reopened: false, reason: "an open flag for this question already exists" };
  await deps.insertFlag(row);
  return { reopened: true, reason: "re-opened: the recomputed answer rests on moved holdings" };
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
