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
      // fitness-allow: F39 (scoped to one item's own claim/section/search rows — small by construction, not corpus-scale)
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
