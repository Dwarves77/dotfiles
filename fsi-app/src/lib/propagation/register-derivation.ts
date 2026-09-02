// register-derivation.ts — the ONE write path for a new derived_values row + its derivation_edges (docs/
// specs/08-flywheel-design.md §2.2 Part 2, §3). Lane DP-ENGINE, system-completion train, 2026-09-02.
//
// PLAIN RELATIVE IMPORTS, NO `@/` ALIAS — see types.ts's header for why. `sb` (a Supabase client) is
// ALWAYS a parameter, never imported here — this module has zero npm dependencies at module scope, so it
// is importable directly by Node's native type-stripping AND by a plain `.test.mjs` with a hand-rolled
// fake `sb` (no real database, no supabase-js) — see register-derivation.test.mjs.
//
// registerDerivedValue(sb, input) calls migration 285's `register_derived_value(...)` SQL function via
// `sb.rpc(...)` — NOT a `derived_values` INSERT followed by separate `derivation_edges` INSERTs. WHY (the
// task brief's own "one RPC or a transaction-safe sequence; document which," answered here): a sequence of
// separate `sb.from(...).insert(...)` calls is not transaction-safe over PostgREST (each is its own
// round-trip) — if `assert_acyclic()` rejects one of several edge inserts AFTER the value row already
// committed, the result is a `derived_values` row whose `derivation_edges` no longer match its own
// `inputs` column. One RPC call is one PL/pgSQL function invocation, hence one transaction: the SQL
// function's own header (migration 285) carries the full reasoning; this is the JS-side half of the same
// decision, restated so a reader of only this file still sees it.
//
// `derivedValueId`, not `entityId`, IS THE RETURN VALUE. A derived_values row is data ABOUT an entity (or
// about nothing addressable, when entityId is null), never itself an entity — see migration 285's header
// on why value_id is a plain uuid, not a minted `cl:value:...` entity id.

import type { Derivation, OriginClass, Lifecycle, Admissibility, InputRef } from "./types.ts";

/** A Supabase client's minimal RPC surface this module needs — kept narrow (not the full supabase-js
 *  `SupabaseClient` type) so a hand-rolled test double satisfies it with zero npm dependency. */
export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
}

/** registerDerivedValue's input — the caller-supplied HALF of a derived_values row (the other half —
 *  `valueId`, `computedAt` — is server-assigned). Mirrors types.ts's `Value` interface minus those two
 *  server-assigned fields, plus `confidence` (the wire name for `base_confidence` — kept distinct from
 *  `Value.baseConfidence` because THIS is what a caller SUPPLIES at write time, before any decay has
 *  applied; `Value.baseConfidence` is what a caller later READS back). */
export interface RegisterDerivedValueInput {
  entityId: string | null;
  methodId: string;
  methodVersion: string;
  value?: number | null;
  valueLow?: number | null;
  valueHigh?: number | null;
  unit?: string | null;
  currency?: string | null;
  derivation: Derivation;
  originClass: OriginClass;
  lifecycle: Lifecycle;
  admissibility: Admissibility;
  confidence: number; // base_confidence, 0..1
  assertedAt: string | Date;
  halfLifeDays?: number | null;
  inputs: InputRef[];
  computedBy: string;
  /** Set by drain.ts's recompute pass: the stale value_id this new row replaces. Omitted (null) for a
   *  first-time computation with nothing to supersede. See migration 285's register_derived_value()
   *  header on why this is a parameter of the SAME atomic call, not a follow-up UPDATE. */
  supersedes?: string | null;
}

const REQUIRED_STRING_FIELDS: (keyof RegisterDerivedValueInput)[] = [
  "methodId",
  "methodVersion",
  "derivation",
  "originClass",
  "lifecycle",
  "admissibility",
  "computedBy",
];

/** Runtime guard for the fields TS narrows at compile time but a plain-JS caller (no type-checker) can
 *  still violate — matches this codebase's "DB CHECK is the enforcement, this is a fast, named, pre-flight
 *  refusal" posture (types.ts's own note on InputRef.table). Throws with every problem joined, never a
 *  partial validation. PURE — no I/O. */
export function validateRegisterDerivedValueInput(input: RegisterDerivedValueInput): string[] {
  const problems: string[] = [];
  for (const field of REQUIRED_STRING_FIELDS) {
    const v = input[field];
    if (typeof v !== "string" || v.trim().length === 0) {
      problems.push(`${String(field)} must be a non-empty string`);
    }
  }
  if (typeof input.confidence !== "number" || !Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    problems.push(`confidence must be a finite number in [0, 1] (got ${JSON.stringify(input.confidence)})`);
  }
  if (!input.assertedAt || Number.isNaN(Date.parse(input.assertedAt instanceof Date ? input.assertedAt.toISOString() : input.assertedAt))) {
    problems.push(`assertedAt must be a parseable date (got ${JSON.stringify(input.assertedAt)})`);
  }
  if (input.halfLifeDays != null && (!Number.isFinite(input.halfLifeDays) || input.halfLifeDays <= 0)) {
    problems.push(`halfLifeDays must be null/undefined or a positive finite number (got ${JSON.stringify(input.halfLifeDays)})`);
  }
  if (!Array.isArray(input.inputs)) {
    problems.push("inputs must be an array (may be empty — a value with no declared inputs)");
  } else {
    input.inputs.forEach((ref, i) => {
      if (!ref || typeof ref.table !== "string" || ref.table.trim().length === 0) {
        problems.push(`inputs[${i}].table must be a non-empty string`);
      }
      if (!ref || typeof ref.pk !== "string" || ref.pk.trim().length === 0) {
        problems.push(`inputs[${i}].pk must be a non-empty string`);
      }
    });
  }
  return problems;
}

/**
 * Register a new derived value: writes the `derived_values` row AND its `derivation_edges` (one per
 * declared input) atomically, via migration 285's `register_derived_value(...)` RPC. Returns the new
 * row's `value_id`. Throws (never returns a partial/ambiguous result) on validation failure or an RPC
 * error — including a rejected `assert_acyclic()` (a caller-declared input that would close a
 * derivation-DAG cycle).
 * @param {RpcClient} sb
 * @param {RegisterDerivedValueInput} input
 * @returns {Promise<string>} the new row's value_id (uuid)
 */
export async function registerDerivedValue(sb: RpcClient, input: RegisterDerivedValueInput): Promise<string> {
  const problems = validateRegisterDerivedValueInput(input);
  if (problems.length) {
    throw new Error(`registerDerivedValue: invalid input —\n  ${problems.join("\n  ")}`);
  }

  const assertedAt = input.assertedAt instanceof Date ? input.assertedAt.toISOString() : input.assertedAt;

  const { data, error } = await sb.rpc("register_derived_value", {
    p_entity_id: input.entityId ?? null,
    p_method_id: input.methodId,
    p_method_version: input.methodVersion,
    p_value: input.value ?? null,
    p_value_low: input.valueLow ?? null,
    p_value_high: input.valueHigh ?? null,
    p_unit: input.unit ?? null,
    p_currency: input.currency ?? null,
    p_derivation: input.derivation,
    p_origin_class: input.originClass,
    p_lifecycle: input.lifecycle,
    p_admissibility: input.admissibility,
    p_base_confidence: input.confidence,
    p_asserted_at: assertedAt,
    p_half_life_days: input.halfLifeDays ?? null,
    p_inputs: input.inputs,
    p_computed_by: input.computedBy,
    p_supersedes: input.supersedes ?? null,
  });

  if (error) {
    throw new Error(`registerDerivedValue: register_derived_value RPC failed: ${error.message}`);
  }
  return data as string;
}
