// drain.ts — the governed drain: the ONLY place recompute happens (docs/specs/08-flywheel-design.md §2.2:
// "propagation invalidates, it does not compute" — never a trigger). Lane DP-ENGINE, system-completion
// train, 2026-09-02.
//
// PLAIN RELATIVE IMPORTS, NO `@/` ALIAS, NO NPM PACKAGE AT MODULE SCOPE — same discipline as every other
// file in this directory (see types.ts's header for the full reasoning: Node-native type stripping, no
// jiti). `sb` is ALWAYS a parameter; this module never imports supabase-js itself, so it is importable
// directly under plain `node` and testable with a hand-rolled fake client (drain.test.mjs).
//
// TWO PASSES, spec §2.2 Part 2 (invalidate) then Part 3 (recompute) — kept as two loops rather than one,
// because dry mode must stop after the FIRST pass (spec's own "dry run counts, apply run writes and
// recomputes" framing — a dry run recomputing anything would defeat the point of --mode dry as a safe
// preview): mirrors migration 285's own invalidate_dependents()'s p_apply split.
//
//   PASS 1 (always runs, both modes): for every undrained `propagation_events` row (oldest first, capped
//   at `batch` — ADR-024 decision 1's BATCH-TO-A-QUIESCENT-POINT granularity, `DRAIN_MODE` in
//   src/lib/entities/decisions.mjs), call migration 285's `invalidate_dependents(table, pk, event_id,
//   p_apply)` once. Dry mode: p_apply=false, counts only, nothing written, events are NOT marked drained
//   (so a later apply run still sees them). Apply mode: p_apply=true, writes admissibility='stale' across
//   the transitive closure, then marks the event `drained_at`/`drain_run_id`.
//
//   PASS 2 (apply mode only): every `derived_values` row THIS RUN just marked stale (identified by
//   `invalidated_by_event IN (this batch's event_ids)` — never a blanket "all stale rows," so a concurrent
//   drain's own stale rows are never double-recomputed here) is looked up in the METHODS registry by its
//   OWN recorded `(method_id, method_version)`. Unknown method: left stale, counted
//   `skippedUnknownMethod` — spec §2.2 Part 3's explicit "no method registered yet" outcome, not an error.
//   Known method: its declared `inputs` are resolved to real rows and passed to the method function; a
//   `{ok:true,...}` result is written as a NEW derived_values row via registerDerivedValue (register-
//   derivation.ts), `supersedes` pointing at the stale row, in the SAME atomic RPC call (migration 285's
//   register_derived_value, `p_supersedes`). A `{ok:false,...}` result (the method itself refuses to
//   compute) leaves the row stale and is counted alongside skippedUnknownMethod under a distinct reason.
//
// PASS 2 DISPATCHES ON RECORD KIND (ADR-036, learning-loop-design-2026-09-25.md section 6, lane W2-G,
// wave2b, 2026-09-29, coordinator ruling 2026-09-29). Migration 339 widened `derivation_edges` to admit
// `inference_records` (migration 338) as a real DAG participant on both sides, so `invalidate_dependents`
// now marks a stale `inference_records` row the SAME way it marks a stale `derived_values` row (the
// closure walk is polymorphic across both tables). Pass 2 below therefore runs its stale-row read and
// method-dispatch TWICE: once for `derived_values` against `methods/index.ts`'s numeric `METHODS`
// registry (BYTE-IDENTICAL to before this change, proven by drain.test.mjs's 11 pre-existing tests plus
// this file's own new tests), and once for `inference_records` against `methods/infer-from-question.ts`'s
// own `INFERENCE_METHODS` registry, kept separate because a narrative result (claim_text/status_token/
// cited_item_ids) is not a numeric `MethodResult` (that file's own header states the full reasoning). The
// two dispatches never cross: a stale `derived_values` row is never looked up in `INFERENCE_METHODS` and
// a stale `inference_records` row is never looked up in `METHODS`.

import { registerDerivedValue } from "./register-derivation.ts";
import { getMethod } from "./methods/index.ts";
import { INFERENCE_METHODS, registerInferenceRecord, reopenQuestionForRecompute, buildReopenDeps } from "./methods/infer-from-question.ts";
import type { ReopenClient } from "./methods/infer-from-question.ts";
import type { InputRef } from "./types.ts";
import type { ResolvedMethodInput } from "./methods/index.ts";
import { exactCount } from "../db/paginate.mjs";

/** The narrow Supabase client surface this module needs — a `.from(table)` PostgREST-style query builder
 *  plus `.rpc(...)`. Kept minimal (not the full supabase-js `SupabaseClient` type) so a hand-rolled test
 *  double satisfies it with zero npm dependency, same posture as register-derivation.ts's `RpcClient`. */
export interface DrainClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
  from(table: string): DrainQueryBuilder;
}
export interface DrainQueryBuilder {
  select(cols: string, opts?: { count?: "exact"; head?: boolean }): DrainQueryBuilder;
  update(values: Record<string, unknown>): DrainQueryBuilder;
  is(col: string, value: null): DrainQueryBuilder;
  eq(col: string, value: unknown): DrainQueryBuilder;
  in(col: string, values: unknown[]): DrainQueryBuilder;
  order(col: string, opts?: { ascending?: boolean }): DrainQueryBuilder;
  limit(n: number): DrainQueryBuilder;
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
  // A builder is itself awaitable (PostgREST's thenable pattern) for a plain select/update with no
  // terminal row-shape call — `await sb.from(t).select(c)...` resolves to {data, error}. `count` is
  // present when `select(cols, {count:'exact', head:true})` was used (paginate.mjs's exactCount) —
  // undefined for every other call, same shape supabase-js itself returns.
  then<T>(onfulfilled: (value: { data: unknown; error: { message: string } | null; count?: number | null }) => T): Promise<T>;
}

/** The `(table, row_pk)` -> primary-key COLUMN NAME map — the same closed set migration 284's outbox
 *  triggers are attached to, plus `derived_values`/`statutory_computations`/`estimated_values`
 *  (derivation_edges' own `from_table` allowlist, migration 285). Kept here rather than re-derived from
 *  the DB at runtime: this IS the allowlist a resolvable input can come from; a table absent from this map
 *  resolves to `row: null` (the method sees an unresolved input, not a crash — see resolveInputs below).
 *  2026-09-02: `statutory_computations`/`estimated_values` corrected from `"entity_id"` to their own
 *  surrogate PKs (`computation_id`/`estimate_id`) — migration 286's dated amendment demoted `entity_id` to
 *  a plain required FK (many rows per entity: formula/model version x scenario_key), so `.eq("entity_id",
 *  pk).maybeSingle()` would now throw on any entity with more than one row instead of resolving THE row an
 *  InputRef names. No live InputRef cites either table today (both are terminal outputs, never a
 *  derivation input in this lane's own writers), so this is a latent-correctness fix, not a behavior
 *  change to any code path currently exercised — kept so the map stays true to its own doc comment ("the
 *  primary-key COLUMN NAME map") rather than silently going stale next to migration 286. */
const PK_COLUMN: Readonly<Record<string, string>> = Object.freeze({
  emission_factors: "factor_id",
  market_series: "id",
  regional_data_facts: "id",
  derived_values: "value_id",
  statutory_computations: "computation_id",
  estimated_values: "estimate_id",
  // inference_records (migration 338/339, lane W2-G): the second DAG-node table derivation_edges' own
  // to_table column can now name. No live InputRef cites this as a TARGET-resolution table today (an
  // inference's declared inputs are always something ELSE feeding INTO it, never the other way around
  // in this lane's own writer), but the map stays exhaustive over every table derivation_edges knows
  // about, matching this constant's own doc comment.
  inference_records: "inference_id",
});

/** Resolve a `derived_values.inputs` array (InputRef[]) into real rows for a method to read. Never throws
 *  per-input — an unresolvable table or a row that no longer exists yields `row: null`, matching
 *  ResolvedMethodInput's own contract (methods/index.ts: "or `null` when unresolvable"). Exported so a
 *  method's own test can construct realistic ResolvedMethodInput fixtures the same way drain.ts would.
 * @param {DrainClient} sb
 * @param {InputRef[]} inputs
 * @returns {Promise<ResolvedMethodInput[]>}
 */
export async function resolveInputs(sb: DrainClient, inputs: InputRef[]): Promise<ResolvedMethodInput[]> {
  const resolved: ResolvedMethodInput[] = [];
  for (const ref of inputs) {
    const pkCol = PK_COLUMN[ref.table];
    if (!pkCol) {
      resolved.push({ table: ref.table, pk: ref.pk, version: ref.version ?? null, row: null });
      continue;
    }
    try {
      const { data, error } = await sb.from(ref.table).select("*").eq(pkCol, ref.pk).maybeSingle();
      resolved.push({ table: ref.table, pk: ref.pk, version: ref.version ?? null, row: error ? null : (data ?? null) });
    } catch {
      resolved.push({ table: ref.table, pk: ref.pk, version: ref.version ?? null, row: null });
    }
  }
  return resolved;
}

/** Read an `inference_records` row's declared inputs FROM `derivation_edges` directly (migration 339:
 *  `to_table='inference_records', to_value_id=<inferenceId>`), `inference_records` carries no `inputs`
 *  jsonb mirror column (unlike `derived_values.inputs`; migration 338's amendment deliberately dropped
 *  the jsonb shadow-copy once derivation_edges could hold the real rows). Never throws, a read error
 *  yields `[]` (the method then sees zero declared inputs, not a crash).
 * @param {DrainClient} sb
 * @param {string} inferenceId
 * @returns {Promise<InputRef[]>}
 */
export async function resolveInferenceDeclaredInputs(sb: DrainClient, inferenceId: string): Promise<InputRef[]> {
  try {
    const { data, error } = await sb
      .from("derivation_edges")
      .select("from_table,from_pk")
      .eq("to_table", "inference_records")
      .eq("to_value_id", inferenceId);
    if (error || !Array.isArray(data)) return [];
    return (data as Array<{ from_table: string; from_pk: string }>).map((e) => ({ table: e.from_table, pk: e.from_pk, version: null }));
  } catch {
    return [];
  }
}

export interface RunPropagationDrainOptions {
  /** Identity recorded on `propagation_events.drain_run_id` and used to build recomputed rows'
   *  `computed_by`-adjacent provenance — e.g. a script name or a scheduled-workflow run id. */
  caller: string;
  mode: "dry" | "apply";
  /** Max undrained events processed THIS call — ADR-024 decision 1's batch-to-a-quiescent-point framing;
   *  a drain is repeatedly re-invoked (cron/workflow dispatch) rather than draining an unbounded backlog
   *  in one call. Default DEFAULT_BATCH. */
  batch?: number;
}

export interface DrainEventError {
  eventId: number | string;
  message: string;
}

/** One outbox event this call processed (lane L4-A, 2026-10-05): handed back so the runner can raise
 *  questions on change for the entity the event names (src/lib/learning/questions-on-change.mjs). In apply
 *  mode only an event that was invalidated AND marked drained appears; in dry mode, every event whose
 *  invalidate_dependents count call succeeded. */
export interface ProcessedEvent {
  eventId: number | string;
  tableName: string;
  rowPk: string;
  entityId: string | null;
  changeKind: string | null;
  occurredAt: string;
}

export interface DrainResult {
  mode: "dry" | "apply";
  queueDepthBefore: number;
  eventsConsidered: number;
  eventsDrained: number;
  invalidated: number;
  recomputed: number;
  skippedUnknownMethod: number;
  skippedMethodRefused: number;
  superseded: Array<{ from: string; to: string }>;
  errors: DrainEventError[];
  processedEvents: ProcessedEvent[];
  /** Questions re-opened because a recomputed inference rests on moved holdings (lane L4-B, Pass 2b). */
  questionsReopened: number;
}

const DEFAULT_BATCH = 500;

/**
 * Run one drain pass. See this file's header for the full two-pass contract. `dry` mode is READ-MOSTLY:
 * it calls `invalidate_dependents(..., p_apply=false)` (a pure SELECT-shaped count, see migration 285) and
 * writes nothing at all — no event is marked drained, no value is invalidated or recomputed, so a dry run
 * may be re-run any number of times with identical results until an apply run actually drains the queue.
 * @param {DrainClient} sb
 * @param {RunPropagationDrainOptions} opts
 * @returns {Promise<DrainResult>}
 */
export async function runPropagationDrain(sb: DrainClient, opts: RunPropagationDrainOptions): Promise<DrainResult> {
  const mode = opts.mode;
  const apply = mode === "apply";
  const batch = opts.batch ?? DEFAULT_BATCH;

  // CAP-1000 fix (train 48, ASSEMBLE-48 proposer pass over propagation-run-003/004/005): this used to be
  // `.select("event_id").is("drained_at", null)` with no `.limit()`/`.range()` and report `depthRows.length`
  // — PostgREST silently caps a range-less response at 1000 rows (paginate.mjs's own header), so
  // `queue_depth_before` read a flat 1000 on every run once the true pending count passed that ceiling
  // (runs 003/004/005 all show `queue_depth_before: 1000` while the live table genuinely held 2,272-2,778
  // pending events between them — the exact "count fed by a truncated array's .length" defect class
  // CAP-1000 named for PERF-13/obligations/run-change-detection, found here by a proposer pass reading
  // this family's full trace history, not by F38 (whose own header states it does not mechanically detect
  // a bare unranged .select() with no .limit() at all). Fixed the same way those three were: an exact
  // COUNT(*) via paginate.mjs's exactCount(), independent of any row page.
  const queueDepthBefore = await exactCount(
    (async () => {
      const { error, count } = await sb
        .from("propagation_events")
        .select("event_id", { count: "exact", head: true })
        .is("drained_at", null);
      return { count: count ?? null, error };
    })(),
  );

  const { data: events, error: eventsErr } = await sb
    .from("propagation_events")
    .select("event_id,table_name,row_pk,entity_id,change_kind,occurred_at")
    .is("drained_at", null)
    .order("occurred_at", { ascending: true })
    .limit(batch);
  if (eventsErr) {
    throw new Error(`runPropagationDrain: reading propagation_events failed: ${eventsErr.message}`);
  }
  const eventList = (Array.isArray(events) ? events : []) as Array<{
    event_id: number | string;
    table_name: string;
    row_pk: string;
    entity_id: string | null;
    change_kind?: string | null;
    occurred_at: string;
  }>;
  // eventList.length <= batch structurally (the .limit(batch) read above), DEFAULT_BATCH = 500 — well
  // under the ~2,000-UUID .in() danger threshold. Not assertBound: eventList legitimately reaching the
  // full batch size is the NORMAL case for a deep queue (assertBound's "hit the cap == truncation"
  // semantics do not apply to a worker's own page-size limit).
  const result: DrainResult = {
    mode,
    queueDepthBefore,
    eventsConsidered: eventList.length,
    eventsDrained: 0,
    invalidated: 0,
    recomputed: 0,
    skippedUnknownMethod: 0,
    skippedMethodRefused: 0,
    superseded: [],
    errors: [],
    processedEvents: [],
    questionsReopened: 0,
  };

  if (eventList.length === 0) return result;

  const drainRunId = `${opts.caller}:${new Date().toISOString()}`;

  // ── Pass 1: invalidate (both modes) ────────────────────────────────────────────────────────────────
  for (const ev of eventList) {
    const { data: count, error } = await sb.rpc("invalidate_dependents", {
      p_table: ev.table_name,
      p_pk: ev.row_pk,
      p_event: ev.event_id,
      p_apply: apply,
    });
    if (error) {
      result.errors.push({ eventId: ev.event_id, message: `invalidate_dependents: ${error.message}` });
      continue;
    }
    result.invalidated += typeof count === "number" ? count : 0;
    const processed: ProcessedEvent = {
      eventId: ev.event_id,
      tableName: ev.table_name,
      rowPk: ev.row_pk,
      entityId: ev.entity_id ?? null,
      changeKind: ev.change_kind ?? null,
      occurredAt: ev.occurred_at,
    };

    if (apply) {
      const { error: markErr } = await sb
        .from("propagation_events")
        .update({ drained_at: new Date().toISOString(), drain_run_id: drainRunId })
        .eq("event_id", ev.event_id);
      if (markErr) {
        result.errors.push({ eventId: ev.event_id, message: `mark drained: ${markErr.message}` });
        continue;
      }
      result.eventsDrained += 1;
    }
    result.processedEvents.push(processed);
  }

  if (!apply) return result; // dry mode stops here — see header

  // ── Pass 2: recompute (apply mode only) ────────────────────────────────────────────────────────────
  const eventIds = eventList.map((e) => e.event_id);
  const { data: staleRows, error: staleErr } = await sb
    .from("derived_values")
    .select("value_id,entity_id,method_id,method_version,inputs,unit,currency")
    .eq("admissibility", "stale")
    // fitness-allow: F39 (eventIds.length <= batch, DEFAULT_BATCH=500, via .limit(batch) above)
    .in("invalidated_by_event", eventIds);
  if (staleErr) {
    result.errors.push({ eventId: "n/a", message: `reading stale derived_values failed: ${staleErr.message}` });
    return result;
  }

  for (const row of (Array.isArray(staleRows) ? staleRows : []) as Array<{
    value_id: string;
    entity_id: string | null;
    method_id: string;
    method_version: string;
    inputs: InputRef[];
    unit: string | null;
    currency: string | null;
  }>) {
    const fn = getMethod(row.method_id, row.method_version);
    if (!fn) {
      result.skippedUnknownMethod += 1;
      continue;
    }
    try {
      const resolvedInputs = await resolveInputs(sb, row.inputs ?? []);
      const output = await fn({ entityId: row.entity_id, inputs: resolvedInputs, priorValue: row, now: new Date() });
      if (!output.ok) {
        result.skippedMethodRefused += 1;
        continue;
      }
      const newValueId = await registerDerivedValue(sb as unknown as Parameters<typeof registerDerivedValue>[0], {
        entityId: row.entity_id,
        methodId: row.method_id,
        methodVersion: row.method_version,
        value: output.value ?? null,
        valueLow: output.valueLow ?? null,
        valueHigh: output.valueHigh ?? null,
        unit: output.unit ?? row.unit ?? null,
        currency: output.currency ?? row.currency ?? null,
        derivation: output.derivation,
        originClass: output.originClass,
        lifecycle: output.lifecycle,
        admissibility: output.admissibility,
        confidence: output.confidence,
        assertedAt: new Date().toISOString(),
        halfLifeDays: output.halfLifeDays ?? null,
        inputs: row.inputs ?? [],
        computedBy: `${row.method_id}@${row.method_version}`,
        supersedes: row.value_id,
      });
      result.recomputed += 1;
      result.superseded.push({ from: row.value_id, to: newValueId });
    } catch (err) {
      result.errors.push({
        eventId: "n/a",
        message: `recompute ${row.value_id} (${row.method_id}@${row.method_version}) failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // ── Pass 2b: recompute stale inference_records (apply mode only, same batch's events) ────────────────
  // Mirrors the derived_values loop above exactly, dispatched against INFERENCE_METHODS instead of
  // METHODS and writing through registerInferenceRecord instead of registerDerivedValue. A stale
  // derived_values row is NEVER read here (separate query, separate table); a stale inference_records
  // row is NEVER read in the loop above (separate query, separate table), the two dispatches do not
  // cross, proven by drain.test.mjs's "a stale inference triggers the method and a stale derived value
  // does not touch it" pair.
  const { data: staleInferences, error: staleInfErr } = await sb
    .from("inference_records")
    .select("inference_id,subject_id,claim_text,cited_item_ids,trigger_question_ref,method_id,method_version")
    .eq("admissibility", "stale")
    // fitness-allow: F39 (eventIds.length <= batch, DEFAULT_BATCH=500, via .limit(batch) above)
    .in("invalidated_by_event", eventIds);
  if (staleInfErr) {
    result.errors.push({ eventId: "n/a", message: `reading stale inference_records failed: ${staleInfErr.message}` });
    return result;
  }

  for (const row of (Array.isArray(staleInferences) ? staleInferences : []) as Array<{
    inference_id: string;
    subject_id: string | null;
    claim_text: string;
    cited_item_ids: string[];
    trigger_question_ref: string | null;
    method_id: string;
    method_version: string;
  }>) {
    const fn = INFERENCE_METHODS.get(row.method_id, row.method_version);
    if (!fn) {
      result.skippedUnknownMethod += 1;
      continue;
    }
    try {
      const declaredInputs = await resolveInferenceDeclaredInputs(sb, row.inference_id);
      const resolvedInputs = await resolveInputs(sb, declaredInputs);
      const output = await fn({
        entityId: row.subject_id,
        inputs: resolvedInputs,
        priorValue: { inference_id: row.inference_id, claim_text: row.claim_text, cited_item_ids: row.cited_item_ids, trigger_question_ref: row.trigger_question_ref },
        now: new Date(),
      });
      if (!output.ok) {
        result.skippedMethodRefused += 1;
        continue;
      }
      const newInferenceId = await registerInferenceRecord(sb as unknown as Parameters<typeof registerInferenceRecord>[0], {
        subjectId: row.subject_id,
        claimText: output.claimText,
        statusToken: output.statusToken,
        confidence: output.confidence,
        citedItemIds: output.citedItemIds,
        originClass: output.originClass,
        methodId: row.method_id,
        methodVersion: row.method_version,
        computedBy: `${row.method_id}@${row.method_version}`,
        triggerQuestionRef: row.trigger_question_ref,
        inputs: declaredInputs,
        supersedes: row.inference_id,
      });
      result.recomputed += 1;
      result.superseded.push({ from: row.inference_id, to: newInferenceId });
      // The recomputed answer rests on holdings that moved: ask its question again (lane L4-B, ADR-044), so the
      // next question export re-answers it. Best effort, never undoes the recompute above.
      if (output.reopenQuestionRef) {
        try {
          const reopened = await reopenQuestionForRecompute(output.reopenQuestionRef, buildReopenDeps(sb as unknown as ReopenClient));
          if (reopened.reopened) result.questionsReopened += 1;
        } catch (reopenErr) {
          result.errors.push({
            eventId: "n/a",
            message: `re-opening question ${output.reopenQuestionRef} after recomputing inference ${row.inference_id} failed: ${reopenErr instanceof Error ? reopenErr.message : String(reopenErr)}`,
          });
        }
      }
    } catch (err) {
      result.errors.push({
        eventId: "n/a",
        message: `recompute inference ${row.inference_id} (${row.method_id}@${row.method_version}) failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return result;
}
