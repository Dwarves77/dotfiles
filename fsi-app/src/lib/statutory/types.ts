// types.ts — Layer 2 of spec §4's four-layer statutory/estimate isolation, for THIS lane's one formula
// (docs/specs/08-flywheel-design.md §4 Layer 2). Lane DP-SURF, system-completion train, 2026-09-02.
//
// PLAIN RELATIVE IMPORTS, NO `@/` ALIAS — matches src/lib/propagation/'s own convention (see that
// directory's types.ts header for the full reasoning: Node-native type stripping, no jiti, no bundler).
//
// ONE HOME, NOT A SECOND DEFINITION. `Contractable`/`NonContractable`/`StatutoryInput`/`StatutoryResult`
// already exist in `src/lib/propagation/types.ts` (Lane DP-ENGINE, same train) — THIS file imports and
// re-exports them rather than re-declaring the vocabulary a second time (the exact "one canonical
// function/type, never a second drift-prone reimplementation" doctrine ADR-024 states for entity identity,
// applied here to the statutory type barrier). What THIS file adds is the part that did not exist yet:
// `computeStatutory<F>()` itself — propagation/types.ts documents its SHAPE (spec §4's own illustrative
// signature) but a shape is not an implementation, and no formula existed in this train before this lane.
//
// THE BARRIER, CONCRETELY. `StatutoryInput.derivation` is typed `Contractable` (propagation/types.ts).
// `computeStatutory()`'s `inputs` parameter is `Record<InputKeyOf<F>, StatutoryInput>`, so a caller passing
// an input whose `derivation` literal is `"modelled"`/`"estimated"`/`"interpolated"` (a `NonContractable`)
// does not TYPE-CHECK — see `types.contractable-barrier.check.ts` in this same directory for the compiled
// proof (a `// @ts-expect-error` case `tsc --noEmit` fails on if the barrier is ever weakened). This is a
// COMPILE-TIME barrier only: a plain-JS caller with no type-checker can still construct a bad object at
// runtime, which is exactly why Layer 3 (migration 286's `assert_statutory_purity()` trigger) exists as the
// DB-level backstop — a single mistake at any one layer is caught by another (spec §4's own framing).

import type { Contractable, NonContractable, StatutoryInput, StatutoryResult, AsOfTriple } from "../propagation/types.ts";
export type { Contractable, NonContractable, StatutoryInput, StatutoryResult, AsOfTriple };

import { computeComplianceBalance, computeFuelEuPenalty } from "./fueleu-annex-iv.mjs";
import { FUELEU_STATUTE_CITATION, FUELEU_FORMULA_VERSION } from "./fueleu-annex-iv.mjs";

/** The one formula this lane registers. A future lane adds a new literal here (never widens this one's
 *  shape) when it ships a second statutory computation. */
export type FormulaId = "fueleu_annex_iv_penalty";

/** FuelEU Annex IV's four reader-entered inputs, each carrying its own provenance (spec §4 Layer 2: a
 *  `StatutoryInput`, not a bare number — `derivation` must be `Contractable` for EVERY key, or the call
 *  does not type-check). `ghgIntensityTarget`/`Actual` are gCO2eq/MJ; `energyUsed` is MJ; `consecutiveYears`
 *  is a plain count (dimensionless), carried as a StatutoryInput too so its own provenance (who asserted
 *  the reporting-period count) is never silently dropped. */
export interface FuelEuAnnexIvInputs {
  ghgIntensityTarget: StatutoryInput;
  ghgIntensityActual: StatutoryInput;
  energyUsed: StatutoryInput;
  consecutiveYears: StatutoryInput;
}

/** Maps a FormulaId to its exact input shape, so a caller of a DIFFERENT (future) formula gets a compile
 *  error on the WRONG key set too, not just on a non-contractable value. `never` for any id this module
 *  does not (yet) implement — computeStatutory()'s runtime `throw` below is the same refusal, restated at
 *  the type layer so a caller cannot even construct a call for an unregistered formula. */
type InputsOf<F extends FormulaId> = F extends "fueleu_annex_iv_penalty" ? FuelEuAnnexIvInputs : never;

/**
 * Layer 2's function. PURE — no I/O, no defaulting, throws on a missing/malformed value (never silently
 * substitutes a default the caller did not supply, per spec §4 Layer 2's own "no defaulting").
 * @param formula   The formula id (today, only "fueleu_annex_iv_penalty").
 * @param inputs    Record of StatutoryInput, ONE PER KEY `InputsOf<F>` requires — every value's
 *                  `derivation` must already be narrowed to `Contractable` at the call site.
 * @returns the formula's result, its unit, and the formula version string this lane's provenance note
 *          (fueleu-annex-iv.mjs's header) applies to.
 */
export function computeStatutory<F extends FormulaId>(formula: F, inputs: InputsOf<F>): StatutoryResult {
  if (formula === "fueleu_annex_iv_penalty") {
    const in_ = inputs as unknown as FuelEuAnnexIvInputs;
    for (const [key, v] of Object.entries(in_) as Array<[string, StatutoryInput]>) {
      if (!v || typeof v.value !== "number" || !Number.isFinite(v.value)) {
        throw new Error(`computeStatutory(fueleu_annex_iv_penalty): input "${key}" must carry a finite numeric value`);
      }
    }
    const complianceBalanceGco2eq = computeComplianceBalance({
      ghgIntensityTargetGco2ePerMJ: in_.ghgIntensityTarget.value,
      ghgIntensityActualGco2ePerMJ: in_.ghgIntensityActual.value,
      energyUsedMJ: in_.energyUsed.value,
    });
    const penalty = computeFuelEuPenalty({
      complianceBalanceGco2eq,
      ghgIntensityActualGco2ePerMJ: in_.ghgIntensityActual.value,
      consecutiveYears: in_.consecutiveYears.value,
    });
    return { result: penalty.penaltyEur, resultUnit: "EUR", formulaVersion: FUELEU_FORMULA_VERSION };
  }
  throw new Error(`computeStatutory: unknown/unregistered formula "${formula}"`);
}

/** Re-exported so a caller (StatutoryFigure, the Operations calculator) cites the same strings this lane's
 *  fueleu-annex-iv.mjs already documents, rather than a second hand-copied citation string. */
export { FUELEU_STATUTE_CITATION, FUELEU_FORMULA_VERSION };
