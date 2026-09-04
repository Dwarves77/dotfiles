// author-edges.mjs — THE ONE DAG-authoring module every producer imports (docs/specs/
// 08-flywheel-design.md §2.2 Part 2; docs/audits/wiring-audit-2026-09-04/C1-loop-map.md §3, the
// "new producer/mint data -> derivation_edges" row, verbatim: "the two registered methods (carbon-
// intensity.ts, automate-vs-hire.ts) or their producers need to register a derivation_edges row... at
// write time -- the SAME call seed-derived-values.mjs already makes, just triggered by ingestion instead
// of a one-off script"). Lane DAG-AUTHOR, 2026-09-04.
//
// WHAT THIS IS, IN ONE SENTENCE. Given a landed figure -- a row a producer just wrote to one of
// derivation_edges' allowed `from_table`s (migration 285's `derivation_edges_from_table_allowed` CHECK:
// emission_factors, market_series, regional_data_facts, derived_values, statutory_computations,
// estimated_values) -- author-edges resolves the declared input set, calls the ALREADY-REGISTERED method
// (methods/index.ts's `getMethod`, the SAME lookup drain.ts's recompute pass uses), and registers the
// result through `registerDerivedValue` (register-derivation.ts's ONE atomic RPC write path -- migration
// 285's `register_derived_value()`, never a raw `derived_values` INSERT followed by separate
// `derivation_edges` INSERTs). This IS "the guarded path" for this pair of tables: the RPC's own atomicity
// (one PL/pgSQL call = one transaction) is the reversibility/audit mechanism -- see register-derivation.ts's
// own header for why a JS-side sequence of separate inserts is unsafe here, and drain.ts's header for the
// established precedent of NOT routing this specific write through scripts/lib/db.mjs's rule-015
// guardedInsert (which exists for one-off, human-cited row mutations, not for a governed SQL function that
// already IS the atomicity/reversibility mechanism).
//
// OWNS NO FORMULA LOGIC OF ITS OWN. This module is a thin orchestration shell around three already-shipped,
// already-tested modules (`resolveInputs` from drain.ts, `getMethod` from methods/index.ts,
// `registerDerivedValue` from register-derivation.ts) -- exactly the "no copies of logic" rule (CLAUDE.md):
// before this lane, `seed-derived-values.mjs` computed carbon-intensity/automate-vs-hire INLINE (calling
// `carbonIntensity()`/`automateVsHire()` directly, re-deriving lifecycle/confidence by hand) rather than
// through the registered MethodFn wrappers -- a real, working, but duplicated computation path next to the
// one methods/carbon-intensity.ts and methods/automate-vs-hire.ts already declare for the drain's own
// recompute pass. This module is the ONE place "landed figure -> registered method -> derived_values row"
// happens; seed-derived-values.mjs's own inline computation is a separate, historical (2026-09-02, pre-
// this-lane) writer this lane does not rewrite (out of this lane's write set -- see the accompanying REPORT
// for why touching a script with a live, tested, already-correct writer would itself be an unrequested
// second change), but every NEW call site (every producer this lane wires) goes through THIS module, never
// re-implements the resolve/call/register sequence a second time.
//
// A METHOD IS RESOLVED BY (methodId, methodVersion) ONLY -- never invented here. A producer names an
// EXISTING registered method (methods/index.ts's `registerMethod` calls, today `carbon_intensity_tkm`/
// `automate_vs_hire`); authorEdges never falls back to computing anything itself when the method is
// unknown -- it reports `unknown-method` and moves on, exactly like drain.ts's own `skippedUnknownMethod`
// counting (spec §2.2 Part 3's "no method registered yet" outcome, never a thrown error, never a guess).
//
// IDEMPOTENT ON NATURAL KEY. The natural key for "has this landed figure already been authored under this
// method" is (from_table, from_pk) x (method_id, method_version) -- there is no DB-level unique constraint
// enforcing this (derivation_edges' own PK is (from_table, from_pk, to_value_id, edge_kind), and
// to_value_id is a fresh uuid every call, so a naive re-run WOULD mint a duplicate derived_values row
// without an application-level check -- see this lane's REPORT for why no new migration is needed: a
// derived_values row legitimately repeats for the SAME (entity, method) pair over time via the
// drain's OWN recompute/supersede chain, by design, so a blanket DB unique constraint on the natural key
// would be wrong, not merely redundant). `authorEdges` checks EVERY declared input ref (not only the
// caller's primary `{table,id}`) against the live derivation_edges/derived_values tables before writing --
// covering the automate_vs_hire shape, where the SAME (region's) wage or energy fact can be the "landed
// figure" that completes the pair on more than one run (a producer re-run that upserts an unchanged row in
// place, matching planUpsert's "current-state table" semantics -- see run-envelope-producer.mjs). A
// producer may therefore call authorEdges every time it writes a candidate row with NO pre-check of its
// own; a second call for an already-authored input set is a documented, cheap no-op
// (`action: "skipped-already-authored"`), never a duplicate write and never a thrown error.
//
// `sb` IS ALWAYS A PARAMETER, never imported at module scope -- same discipline as every other file in
// this directory (drain.ts, register-derivation.ts, admissible-for.ts). Producers pass `scripts/lib/
// db.mjs`'s `readClient()` (a real service-role client whose `.from()` blocks accidental `.insert/.update/
// .delete/.upsert` but passes `.rpc()` through unchanged -- see that module's own header on why an RPC is
// the caller's own responsibility to route through a sanctioned path, which `register_derived_value` is).
//
// PLAIN RELATIVE IMPORTS, NO `@/` ALIAS, NO NPM PACKAGE AT MODULE SCOPE -- matches every other file in
// this directory (Node-native type-stripping for the .ts imports below; see drain.ts's header for the
// full reasoning).

import { resolveInputs } from "./drain.ts";
import { getMethod } from "./methods/index.ts";
import { registerDerivedValue } from "./register-derivation.ts";

/**
 * @typedef {{table: string, pk: string, version?: string|null}} InputRef
 * @typedef {{
 *   table: string,
 *   id: string,
 *   entity?: string|null,
 *   method: {id: string, version: string},
 *   inputs: InputRef[],
 * }} LandedFigure
 * @typedef {{
 *   from(table: string): {
 *     select(cols: string): any,
 *   },
 *   rpc(fn: string, args: Record<string, unknown>): Promise<{data: unknown, error: {message: string}|null}>,
 * }} AuthorEdgesClient
 */

/**
 * Has ANY of `inputRefs` already been authored into the DAG for this exact (methodId, methodVersion)?
 * Natural-key idempotency check (see file header) -- reads derivation_edges for each ref's (table,pk),
 * then checks whether any of the resolved to_value_id rows in derived_values carries this method. A ref
 * with NO derivation_edges row at all is cheap to rule out (one read, zero rows) before ever touching
 * derived_values.
 * @param {AuthorEdgesClient} sb
 * @param {InputRef[]} inputRefs
 * @param {string} methodId
 * @param {string} methodVersion
 * @returns {Promise<boolean>}
 */
export async function hasBeenAuthored(sb, inputRefs, methodId, methodVersion) {
  for (const ref of inputRefs) {
    const { data: edges, error } = await sb
      .from("derivation_edges")
      .select("to_value_id")
      .eq("from_table", ref.table)
      .eq("from_pk", String(ref.pk));
    if (error) {
      throw new Error(`author-edges: reading derivation_edges failed for ${ref.table}/${ref.pk}: ${error.message}`);
    }
    const valueIds = [...new Set((Array.isArray(edges) ? edges : []).map((e) => e.to_value_id).filter(Boolean))];
    if (!valueIds.length) continue;

    const { data: values, error: vErr } = await sb
      .from("derived_values")
      .select("value_id")
      .in("value_id", valueIds)
      .eq("method_id", methodId)
      .eq("method_version", methodVersion)
      .limit(1);
    if (vErr) {
      throw new Error(`author-edges: reading derived_values failed for ${ref.table}/${ref.pk}: ${vErr.message}`);
    }
    if (Array.isArray(values) && values.length > 0) return true;
  }
  return false;
}

/** @typedef {
 *   {ok: true, action: "authored", valueId: string}
 *   | {ok: true, action: "skipped-already-authored"}
 *   | {ok: false, action: "unknown-method"|"method-refused"|"invalid-input", reason: string}
 * } AuthorEdgesResult
 */

/**
 * Author a derivation_edges/derived_values row for one landed figure, through the registered method it
 * names. See file header for the full contract (idempotent, no formula logic of its own, never invents a
 * method). PURE ORCHESTRATION -- every side effect is one of the three imported functions' own.
 * @param {AuthorEdgesClient} sb
 * @param {LandedFigure} figure
 * @param {{
 *   getMethod?: typeof getMethod,
 *   resolveInputs?: typeof resolveInputs,
 *   registerDerivedValue?: typeof registerDerivedValue,
 *   now?: () => Date,
 * }} [deps] Injectable for tests; production callers omit this entirely.
 * @returns {Promise<AuthorEdgesResult>}
 */
export async function authorEdges(sb, figure, deps = {}) {
  const table = figure && figure.table;
  const id = figure && figure.id;
  const entity = figure && Object.prototype.hasOwnProperty.call(figure, "entity") ? figure.entity : null;
  const method = figure && figure.method;
  const inputs = figure && figure.inputs;

  if (!table || typeof table !== "string") return { ok: false, action: "invalid-input", reason: "figure.table must be a non-empty string" };
  if (!id) return { ok: false, action: "invalid-input", reason: "figure.id is required" };
  if (!method || typeof method.id !== "string" || !method.id || typeof method.version !== "string" || !method.version) {
    return { ok: false, action: "invalid-input", reason: "figure.method must be {id, version}, both non-empty strings" };
  }
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return { ok: false, action: "invalid-input", reason: "figure.inputs must be a non-empty InputRef[] array" };
  }
  for (const ref of inputs) {
    if (!ref || typeof ref.table !== "string" || !ref.table || (ref.pk === undefined || ref.pk === null || ref.pk === "")) {
      return { ok: false, action: "invalid-input", reason: `every input must be {table, pk} -- got ${JSON.stringify(ref)}` };
    }
  }

  const getMethodFn = deps.getMethod ?? getMethod;
  const resolveInputsFn = deps.resolveInputs ?? resolveInputs;
  const registerFn = deps.registerDerivedValue ?? registerDerivedValue;
  const now = deps.now ?? (() => new Date());

  const fn = getMethodFn(method.id, method.version);
  if (!fn) {
    return { ok: false, action: "unknown-method", reason: `no method registered for ${method.id}@${method.version}` };
  }

  const already = await hasBeenAuthored(sb, inputs, method.id, method.version);
  if (already) return { ok: true, action: "skipped-already-authored" };

  const resolved = await resolveInputsFn(sb, inputs);
  const nowDate = now();
  const result = await fn({ entityId: entity, inputs: resolved, priorValue: null, now: nowDate });
  if (!result.ok) {
    return { ok: false, action: "method-refused", reason: result.reason };
  }

  const valueId = await registerFn(sb, {
    entityId: entity,
    methodId: method.id,
    methodVersion: method.version,
    value: result.value ?? null,
    valueLow: result.valueLow ?? null,
    valueHigh: result.valueHigh ?? null,
    unit: result.unit ?? null,
    currency: result.currency ?? null,
    derivation: result.derivation,
    originClass: result.originClass,
    lifecycle: result.lifecycle,
    admissibility: result.admissibility,
    confidence: result.confidence,
    assertedAt: nowDate.toISOString(),
    halfLifeDays: result.halfLifeDays ?? null,
    inputs,
    computedBy: `${method.id}@${method.version}:author-edges:${table}:${id}`,
  });

  return { ok: true, action: "authored", valueId };
}
