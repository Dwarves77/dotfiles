// auxiliary-energy.mjs — spec 09 §1.5's stationary auxiliary load. "A 72-hour climate-controlled airport
// hold for a museum loan can exceed the flight leg's own emissions, and no per-tonne-km model shows
// that." No fs, no I/O.

import { labelled, missing } from "./label.mjs";

/** kWh consumed by a stationary auxiliary load over its typical duration. Pure arithmetic:
 *  kwDraw * dutyCycle * hoursTypical. */
export function computeEnergyConsumedKwh({ kwDraw, dutyCycle, hoursTypical }) {
  for (const [name, v] of Object.entries({ kwDraw, dutyCycle, hoursTypical })) {
    if (typeof v !== "number" || !Number.isFinite(v)) return missing(`${name} must be a finite number.`);
  }
  if (kwDraw < 0 || hoursTypical < 0) return missing("kwDraw and hoursTypical must be non-negative.");
  if (dutyCycle < 0 || dutyCycle > 1) return missing("dutyCycle must be between 0 and 1.");
  return labelled(kwDraw * dutyCycle * hoursTypical, "calculated");
}

/**
 * kWh -> gCO2e, given a grid intensity in gCO2e/kWh. Kept as a SEPARATE step from
 * computeEnergyConsumedKwh (rather than one combined function) because the two inputs have genuinely
 * different provenance: kWh is the profile's own stated load, gCO2e/kWh is an external, dated, sourced
 * series (Ember/EEA, per auxiliary_energy_profiles.grid_intensity_source) this module never fabricates —
 * a caller with no grid intensity value gets M for THIS step while the kWh figure above still stands.
 */
export function convertKwhToGco2e({ energyKwh, gridIntensityGco2ePerKwh }) {
  if (typeof energyKwh !== "number" || !Number.isFinite(energyKwh)) {
    return missing("energyKwh must be a finite number (from computeEnergyConsumedKwh).");
  }
  if (typeof gridIntensityGco2ePerKwh !== "number" || !Number.isFinite(gridIntensityGco2ePerKwh)) {
    return missing("no grid intensity value available for this node — cannot convert kWh to gCO2e without one (never assumed).");
  }
  return labelled(energyKwh * gridIntensityGco2ePerKwh, "calculated");
}

/**
 * Compare a stationary auxiliary load's footprint against the transport leg it accompanies — the
 * differentiating comparison spec text names by worked example. Both inputs are already-computed gCO2e
 * figures (the leg's own transport emissions come from elsewhere in this product, out of this module's
 * scope); this function only does the honest ratio and refuses (M) if either side is missing, rather than
 * silently treating a missing leg figure as zero.
 */
export function compareToLegEmissions({ auxiliaryGco2e, legGco2e }) {
  if (typeof auxiliaryGco2e !== "number" || !Number.isFinite(auxiliaryGco2e)) {
    return missing("auxiliaryGco2e is required to compare against the leg's own emissions.");
  }
  if (typeof legGco2e !== "number" || !Number.isFinite(legGco2e) || legGco2e <= 0) {
    return missing("legGco2e (the transport leg's own emissions) is required and must be > 0 for a ratio.");
  }
  const ratio = auxiliaryGco2e / legGco2e;
  return labelled(ratio, "calculated", {
    exceedsLeg: ratio > 1,
    note: ratio > 1
      ? "the stationary auxiliary load's own footprint exceeds the transport leg's."
      : null,
  });
}
