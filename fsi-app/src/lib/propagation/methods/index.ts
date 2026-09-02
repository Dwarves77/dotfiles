// methods/index.ts — the METHODS registry + registerMethod() seam (docs/specs/08-flywheel-design.md §2.2
// Part 3: "the drain recomputes each stale value through its own registered method"). Lane DP-ENGINE,
// system-completion train, 2026-09-02.
//
// THIS FILE OWNS THE SEAM, NOT ANY METHOD BODY. Zero methods are registered here — DP-SURF (and every
// later lane that ships a computable figure) calls `registerMethod(methodId, methodVersion, fn)` from ITS
// OWN module, at import time, the same "register yourself with a shared table, never edit the table's
// owner" shape `src/lib/entities/decisions.mjs`'s header names for shared constants. `drain.ts` imports
// ONLY `getMethod`/`METHODS` from here — never a concrete method — so this file (and drain.ts) never grows
// a per-method import list, and F25 (module liveness) never needs a per-method exemption here either: this
// module's own liveness is drain.ts calling `getMethod`, which is real, present-day traffic regardless of
// how many methods are registered.
//
// PLAIN RELATIVE IMPORTS, NO `@/` ALIAS, NO NPM PACKAGE AT MODULE SCOPE — see types.ts's header for why.
//
// A METHOD IS A PURE FUNCTION OF ITS RESOLVED INPUTS. No `sb`, no network, no `Date.now()` — `now` is
// injected in `MethodContext`, matching every other pure function in this engine (effective-confidence.mjs,
// admissible-for.ts). drain.ts resolves each `derived_values.inputs` entry into a real row (or `null` when
// unresolvable — e.g. the input row was itself deleted) BEFORE calling the method; a method never fetches
// its own inputs.

import type { Derivation, OriginClass, Lifecycle, Admissibility } from "../types.ts";

/** One resolved input a method receives — the InputRef the value was registered with, plus the actual row
 *  data drain.ts fetched for it (or `null` if that row could not be resolved, e.g. deleted since). */
export interface ResolvedMethodInput {
  table: string;
  pk: string;
  version?: string | null;
  row: unknown;
}

/** What a method sees. `entityId`/`priorValue` let a method reference its own previous state (e.g. an
 *  interpolation that blends toward the last known point) without a second DB round-trip — drain.ts
 *  supplies the row it is about to supersede. */
export interface MethodContext {
  entityId: string | null;
  inputs: ResolvedMethodInput[];
  priorValue: unknown | null;
  now: Date;
}

/** What a method returns — the computed HALF of a new derived_values row; drain.ts supplies the rest
 *  (entityId, methodId, methodVersion, inputs, computedBy, supersedes) via registerDerivedValue(). A
 *  method that cannot compute (insufficient/contradictory inputs) returns `{ok: false, reason}` instead of
 *  throwing — throwing is reserved for a genuine bug in the method itself; a refusal to compute is an
 *  ordinary, expected outcome the drain must count and move on from (spec §2.2 Part 3: an unregistered OR
 *  a self-refusing method both leave the value stale, never a thrown drain). */
export type MethodResult =
  | {
      ok: true;
      value?: number | null;
      valueLow?: number | null;
      valueHigh?: number | null;
      unit?: string | null;
      currency?: string | null;
      derivation: Derivation;
      originClass: OriginClass;
      lifecycle: Lifecycle;
      admissibility: Admissibility;
      confidence: number;
      halfLifeDays?: number | null;
    }
  | { ok: false; reason: string };

export type MethodFn = (ctx: MethodContext) => Promise<MethodResult> | MethodResult;

const REGISTRY = new Map<string, MethodFn>();

/** `"<methodId>@<methodVersion>"` — the same composite key `computed_by` (derived_values, migration 285)
 *  and `drain.ts`'s recompute pass both use to look a method up. PURE. */
export function methodKey(methodId: string, methodVersion: string): string {
  return `${methodId}@${methodVersion}`;
}

/**
 * Register a method. NEVER silently overwrites: a `derived_values` row already carries `computed_by`
 * naming exactly this `(methodId, methodVersion)` pair, and a prior row must remain reproducible against
 * the code that produced it — a NEW behaviour requires a NEW `methodVersion`, never a mutated one (the
 * same immutability discipline `derived_values` itself applies to its own rows: "a recompute inserts a
 * NEW row... the prior row is retained," migration 285's header). Throws on a duplicate registration.
 * @param {string} methodId
 * @param {string} methodVersion
 * @param {MethodFn} fn
 */
export function registerMethod(methodId: string, methodVersion: string, fn: MethodFn): void {
  const key = methodKey(methodId, methodVersion);
  if (REGISTRY.has(key)) {
    throw new Error(
      `registerMethod: "${key}" is already registered — registerMethod never silently overwrites. ` +
        `Register a NEW methodVersion for changed behaviour instead of mutating one already in use.`,
    );
  }
  REGISTRY.set(key, fn);
}

/** Look up a registered method, or `undefined` if none is registered for this exact (methodId,
 *  methodVersion) pair — drain.ts's own `skippedUnknownMethod` counting reads this return directly. */
export function getMethod(methodId: string, methodVersion: string): MethodFn | undefined {
  return REGISTRY.get(methodKey(methodId, methodVersion));
}

/** The read-only surface drain.ts (and tests) use — deliberately NOT the raw mutable Map, so nothing
 *  outside `registerMethod` above can bypass its duplicate-registration guard by writing to the registry
 *  directly. */
export const METHODS = Object.freeze({
  get: getMethod,
  has: (methodId: string, methodVersion: string): boolean => REGISTRY.has(methodKey(methodId, methodVersion)),
  key: methodKey,
  /** Registered keys, for diagnostics/tests only — never used to iterate-and-recompute (drain.ts always
   *  looks a method up BY the value's own recorded method_id/method_version, never by scanning). */
  registeredKeys: (): string[] => [...REGISTRY.keys()],
});

/** Test-only escape hatch: clears the registry so `methods/index.test.mjs` can assert `registerMethod`'s
 *  duplicate-registration guard from a clean slate without cross-test pollution (module-level state is
 *  otherwise process-lifetime, and node:test runs every test file in the same process). NOT exported from
 *  the package's normal surface for production code to call — drain.ts never imports this. */
export function __clearRegistryForTests(): void {
  REGISTRY.clear();
}
