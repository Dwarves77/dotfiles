// oem-payload.mjs — spec 09 §1.1's two outputs that "justify the whole [oem_tech_roadmaps] table": the
// payload-penalty delta and the TCO diesel-parity crossover. Pure functions; no I/O, no fs (F34).

import { labelled, missing } from "./label.mjs";

/**
 * Δpayload_kg = diesel_powertrain_kg − (usable_kwh / (energy_density_wh_kg / 1000)) − e_powertrain_kg
 * Δpayload_pct = Δpayload_kg / legal_payload_kg
 * (spec 09 §1.1, verbatim formula)
 *
 * REFUSES (returns M) unless densityBasis === 'pack' — spec 09 §5 open decision 3, taken with its own
 * stated conservative default: "manufacturers quote cell-level Wh/kg; payload maths needs pack-level,
 * which is typically 20-30% lower... consistent with everything else in this design the answer is M."
 * A cell-level or module-level density is NOT scaled up here to a synthetic pack estimate — that would be
 * exactly the "flattered" number the spec warns against fabricating.
 *
 * `derivation: 'modelled'` always (spec text: "derivation = 'modelled', never contractable, always
 * rendered as a range" — the range itself is the caller's job, built from a low/high pair of these calls
 * over a plausible density band; this function returns one point for one stated density).
 */
export function computePayloadPenalty({
  dieselPowertrainKg,
  usableKwh,
  energyDensityWhKg,
  densityBasis,
  ePowertrainKg,
  legalPayloadKg,
}) {
  if (densityBasis !== "pack") {
    return missing(
      `density_basis is '${densityBasis ?? "null"}', not 'pack' — spec 09 §5 open decision 3's conservative ` +
      "default: a payload-penalty delta is never computed from a cell/module-level density (it would " +
      "flatter the result by roughly 20-30%, per spec text)."
    );
  }
  for (const [name, v] of Object.entries({ dieselPowertrainKg, usableKwh, energyDensityWhKg, ePowertrainKg, legalPayloadKg })) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return missing(`${name} must be a finite number to compute a payload-penalty delta.`);
    }
  }
  if (energyDensityWhKg <= 0) return missing("energyDensityWhKg must be > 0.");
  if (legalPayloadKg <= 0) return missing("legalPayloadKg must be > 0.");

  const batteryKg = usableKwh / (energyDensityWhKg / 1000);
  const deltaPayloadKg = dieselPowertrainKg - batteryKg - ePowertrainKg;
  const deltaPayloadPct = deltaPayloadKg / legalPayloadKg;

  return labelled(deltaPayloadKg, "modelled", {
    deltaPayloadPct,
    batteryKg,
    densityBasis,
    note: "Negative deltaPayloadKg/deltaPayloadPct means the electrified powertrain displaces cargo capacity.",
  });
}

/**
 * TCO diesel-parity crossover. Spec 09 §1.1: "Output is a crossover interval with a probability, never a
 * date... A point date here would be false precision on a Monte Carlo." This build carries no ICCT cost-
 * structure input series or Monte Carlo engine (out of this lane's write set / $0 sourcing reach), so this
 * function takes the spec 08 §4 "mandatory refusal state" for a genuinely unforecastable case ("not
 * forecastable" plus the conditional structure, rather than a fitted number) — it NEVER fabricates an
 * interval from nothing. `requiredInputs` names exactly what would need to be sourced for a real answer,
 * so the refusal is decision-ready rather than a dead end.
 */
export function tcoCrossoverBand() {
  return missing(
    "not forecastable this build: a diesel-parity crossover interval requires ICCT cost-structure inputs " +
    "plus a Monte Carlo engine over our own electricity/diesel series, neither of which this lane sources " +
    "at $0. Required inputs (named, not built here): ICCT TCO cost-structure series per tech_category, a " +
    "diesel price series, an electricity price series per duty-cycle jurisdiction, and a fitted Monte Carlo " +
    "model (n=10,000 per spec 08 §4's worked example). A fitted point/date is refused rather than guessed."
  );
}
