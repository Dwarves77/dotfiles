import { labelled, missing } from "./label.mjs";

/** Scale a baseline fuel-burn figure by a reroute's fuel_burn_multiplier. Pure multiplication — the ONLY
 *  arithmetic this module performs, deliberately, per the header note above. */
export function applyFuelBurnMultiplier({ baselineFuelBurn, fuelBurnMultiplier }) {
  if (typeof baselineFuelBurn !== "number" || !Number.isFinite(baselineFuelBurn) || baselineFuelBurn < 0) {
    return missing("baselineFuelBurn must be a non-negative finite number.");
  }
  if (typeof fuelBurnMultiplier !== "number" || !Number.isFinite(fuelBurnMultiplier) || fuelBurnMultiplier <= 0) {
    return missing("fuelBurnMultiplier must be a positive finite number.");
  }
  return labelled(baselineFuelBurn * fuelBurnMultiplier, "calculated", {
    fuelBurnMultiplier,
    deltaPct: (fuelBurnMultiplier - 1) * 100,
  });
}

/**
 * The five-surface compounding chain, spec text's own list, as a static, orderable, describable
 * structure for a UI notice — NOT a computation. Each step names what moves and, when true, WHY this
 * module does not compute it (the bracketed-penalty steps).
 */
export function compoundingChain() {
  return Object.freeze([
    { step: "reroute", detail: "reroute → higher fuel burn", computedHere: true },
    { step: "intensity", detail: "higher fuel burn → higher GHG intensity", computedHere: false, note: "downstream of applyFuelBurnMultiplier()'s output; not computed by this module" },
    { step: "fueleu", detail: "FuelEU compliance balance worsens → penalty crosses into a higher bracket", computedHere: false, note: "bracketed, not linear — belongs to the statutory_computations domain, out of scope here" },
    { step: "ets", detail: "EU ETS allowance cost rises → the corridor's carbon-per-FEU moves", computedHere: false },
    { step: "indexation", detail: "the forwarder's indexation clause triggers", computedHere: false, note: "see src/lib/spec09/indexation.mjs" },
    { step: "scope3", detail: "the customer's Scope 3 figure changes", computedHere: false },
  ]);
}
