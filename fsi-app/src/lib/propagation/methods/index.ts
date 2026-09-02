// methods/index.ts — the METHODS registry + registerMethod() seam (docs/specs/08-flywheel-design.md §2.2
// Part 3: "the drain recomputes each stale value through its own registered method"). Lane DP-ENGINE,
// system-completion train, 2026-09-02.
//
// THIS FILE OWNS THE SEAM, NOT ANY METHOD BODY. `drain.ts` imports ONLY `getMethod`/`METHODS` from here —
// never a concrete method — so drain.ts itself never grows a per-method import list.
//
// UPDATE (Lane DP-SURF, same train, same day): the side-effect imports at the bottom of this file ARE the
// governing plan's own explicit instruction to this lane ("register them in methods/index.ts via the seam
// — you may edit index.ts only to import/register"), and the reason is mechanical, not a change of mind
// about the seam's design: a `registerMethod()` call only RUNS when its module is imported by something,
// and nothing else in this train imports a concrete method module (DP-ENGINE's own drain.ts deliberately
// does not, per the paragraph above, and no route/script/component in this lane's write set is a natural
// "boot" file that every method file could register itself into). This file is the one already-live
// import target every method needs regardless (drain.ts calling `getMethod`/`METHODS` gives IT a real
// production importer), so making it the aggregation point too costs no new liveness risk and needs no new
// file. A method module's OWN header still states its method id/version/registration; this file's job is
// still confined to importing (never re-implementing) — "own the seam, not the body" still holds, the body
// still lives one file over.
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

// ── Registered methods (Lane DP-SURF, 2026-09-02) ─────────────────────────────────────────────────────
// Import each method file's plain exports and call registerMethod() HERE, after REGISTRY (above) is
// already initialized — NOT a self-registering side-effect import from the method file itself. That
// shape was tried first and broke on a real TDZ error ("Cannot access 'REGISTRY' before initialization"):
// ES module linking evaluates an imported module's body BEFORE the importing module's own top-level code,
// so a method file that both imports registerMethod from here AND calls it at its own top level would run
// that call before this file's `const REGISTRY = new Map()` (above) has executed — see automate-vs-hire.ts
// and carbon-intensity.ts's own headers for the same note from the method-file side. Importing here
// (rather than nowhere) is what makes drain.ts's apply-mode recompute pass actually find a method for a
// stale automate-vs-hire or carbon-intensity value instead of leaving it stale forever with
// skippedUnknownMethod incrementing.
import {
  computeAutomateVsHire,
  METHOD_ID as AUTOMATE_VS_HIRE_METHOD_ID,
  METHOD_VERSION as AUTOMATE_VS_HIRE_METHOD_VERSION,
} from "./automate-vs-hire.ts";
import {
  computeCarbonIntensity,
  METHOD_ID as CARBON_INTENSITY_METHOD_ID,
  METHOD_VERSION as CARBON_INTENSITY_METHOD_VERSION,
} from "./carbon-intensity.ts";

registerMethod(AUTOMATE_VS_HIRE_METHOD_ID, AUTOMATE_VS_HIRE_METHOD_VERSION, computeAutomateVsHire);
registerMethod(CARBON_INTENSITY_METHOD_ID, CARBON_INTENSITY_METHOD_VERSION, computeCarbonIntensity);
