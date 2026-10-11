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
interface FuelEuAnnexIvInputs {
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
