// automate-vs-hire.mjs — the Operations "automate vs hire" calculator (docs/specs/08-flywheel-design.md
// §2.3 worked example, instantiated). Lane DP-SURF, system-completion train, 2026-09-02.
//
// PURE, ZERO DEPENDENCIES. No I/O, no clock, no Supabase import — inputs are plain numbers the caller
// resolves (from `regional_data_facts` BLS OEWS wage / Eurostat nrg_pc_205 energy rows, or reader-entered
// overrides for a live preview). Safe to import directly from a "use client" React component AND from
// `src/lib/propagation/methods/automate-vs-hire.ts` (the registered recompute method the governed drain
// calls — see that file's header).
//
// THE MODEL, STATED PLAINLY (no fabricated precision beyond what these ten inputs support):
//   annualLaborCostManual    = throughput * hoursPerUnitManual * wagePerHour
//   annualLaborCostAutomated = throughput * hoursPerUnitAutomated * wagePerHour
//   annualEnergyCost         = throughput * kwhPerUnitAutomated * energyPricePerKwh
//   annualMaintenanceCost    = maintenancePctOfCapex * capexUsd            (constant every year — a
//                                                                           documented simplification;
//                                                                           no maintenance escalation curve
//                                                                           is modelled)
//   annualNetCashFlow        = (annualLaborCostManual - annualLaborCostAutomated)
//                               - annualEnergyCost - annualMaintenanceCost
//   npv                      = -capexUsd + Σ_{t=1..horizonYears} annualNetCashFlow / (1+discountRate)^t
//   paybackYears             = capexUsd / annualNetCashFlow                (simple payback, never
//                                                                           discounted-payback — named as
//                                                                           such; null when the automation
//                                                                           never breaks even)
//   breakEvenWagePerHour     = the wagePerHour at which annualNetCashFlow == 0, i.e. the manual wage rate
//                               at which automating and staying manual cost exactly the same. Solved
//                               algebraically (energy/maintenance are wage-independent, so this does not
//                               require iteration):
//                                 wage* = (annualEnergyCost + annualMaintenanceCost)
//                                         / (throughput * (hoursPerUnitManual - hoursPerUnitAutomated))
//                               null (with a reason) when automation does not reduce hours per unit at
//                               all — there is then no wage rate at which it breaks even on labor alone.
//
// RANGES (ADR-024 decision 2: ESTIMATE_DISPLAY = "range" — a bare point is never shown). Uncertainty is
// NOT modelled on every input — only on the two inputs this module cannot itself verify (a regional wage
// or energy PRICE fact can move between the as-of date it was asserted and the day a reader consults this
// calculator; the reader-entered engineering assumptions — capex, hours/unit, kWh/unit, discount rate,
// horizon — are treated as given, not uncertain, because this calculator has no basis to second-guess a
// number the reader typed in for their own equipment). `UNCERTAINTY_PCT = 0.10` (±10%) is an EXPLICIT,
// DOCUMENTED convention, not a statistically fitted confidence interval — it mirrors the ±10% band this
// codebase already uses as the generic "a national wage/price series moved since it was published" margin
// nowhere else more precisely quantified in the corpus today. Low/high scenarios are the wage/energy
// combination LEAST/MOST favourable to automation, not an independent Monte Carlo band:
//   low  scenario (worst case FOR automating) = wage low  (less manual-labor saving) + energy high (costlier)
//   high scenario (best case FOR automating)  = wage high (more manual-labor saving) + energy low  (cheaper)
// breakEvenWagePerHour's range comes from energy-price uncertainty alone (the wage itself is the unknown
// being solved for, so varying an ASSUMED wage does not apply to it).

export const UNCERTAINTY_PCT = 0.10; // ±10% on wage and energy facts, documented per file header.

/** Distinct-model states, so a caller never sees a fabricated number for a degenerate configuration
 *  (hours-per-unit that does not fall under automation, or a payback that never arrives). */
export const REFUSAL = Object.freeze({
  NO_HOUR_SAVINGS: "hoursPerUnitAutomated is not less than hoursPerUnitManual — automation saves no labor hours, so no break-even wage exists",
  NEVER_PAYS_BACK: "annual net cash flow is zero or negative at this wage/energy point — automation never pays back capex under these assumptions",
});

function requireFinitePositive(name, v) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    throw new Error(`automate-vs-hire: ${name} must be a finite number >= 0 (got ${JSON.stringify(v)})`);
  }
}

/**
 * One scenario's worth of the model (a single wage/energy point). Pure. Exported so the recompute method
 * and tests can probe an individual scenario without going through the full range wrapper.
 * @param {object} p
 * @returns {{ annualNetCashFlow: number, npv: number, paybackYears: number|null, breakEvenWagePerHour: number|null, refusal: string|null }}
 */
export function computeScenario({
  capexUsd,
  annualThroughputUnits,
  labourCostPerHour,
  hoursPerUnitManual,
  hoursPerUnitAutomated,
  energyPricePerKwh,
  kwhPerUnitAutomated,
  maintenancePctOfCapex,
  discountRate,
  horizonYears,
}) {
  const annualLaborManual = annualThroughputUnits * hoursPerUnitManual * labourCostPerHour;
  const annualLaborAutomated = annualThroughputUnits * hoursPerUnitAutomated * labourCostPerHour;
  const annualEnergyCost = annualThroughputUnits * kwhPerUnitAutomated * energyPricePerKwh;
  const annualMaintenanceCost = maintenancePctOfCapex * capexUsd;
  const annualNetCashFlow = (annualLaborManual - annualLaborAutomated) - annualEnergyCost - annualMaintenanceCost;

  let npv = -capexUsd;
  for (let t = 1; t <= horizonYears; t++) {
    npv += annualNetCashFlow / Math.pow(1 + discountRate, t);
  }

  const paybackYears = annualNetCashFlow > 0 ? capexUsd / annualNetCashFlow : null;

  const hourDelta = hoursPerUnitManual - hoursPerUnitAutomated;
  let breakEvenWagePerHour = null;
  let refusal = null;
  if (hourDelta <= 0 || annualThroughputUnits === 0) {
    refusal = REFUSAL.NO_HOUR_SAVINGS;
  } else {
    breakEvenWagePerHour = (annualEnergyCost + annualMaintenanceCost) / (annualThroughputUnits * hourDelta);
  }
  if (!refusal && annualNetCashFlow <= 0) {
    // A break-even wage may still exist algebraically even when the CURRENT wage doesn't clear it — this
    // is a separate, non-fatal note (paybackYears is already null in that case); refusal here is reserved
    // for the payback figure specifically, not the whole scenario, so it does not overwrite an hour-savings
    // refusal (that one blocks the break-even wage entirely, which is the stronger claim).
  }

  return { annualNetCashFlow, npv, paybackYears, breakEvenWagePerHour, refusal };
}

/**
 * The full ranged calculation (spec §2.3 worked example; ADR-024 decision 2's range-native output).
 * @param {object} input
 * @param {number} input.capexUsd
 * @param {number} input.annualThroughputUnits
 * @param {number} input.labourCostPerHour        Point wage (USD/hour) — from BLS OEWS regional_data_facts
 *                                                 or a reader override.
 * @param {number} input.hoursPerUnitManual
 * @param {number} input.hoursPerUnitAutomated
 * @param {number} input.energyPricePerKwh        Point energy price — from Eurostat nrg_pc_205
 *                                                 regional_data_facts or a reader override.
 * @param {number} input.kwhPerUnitAutomated
 * @param {number} input.maintenancePctOfCapex     0..1 (e.g. 0.08 for 8%/year)
 * @param {number} input.discountRate              0..1
 * @param {number} input.horizonYears              positive integer
 * @param {{table: string, pk: string, version?: string|null}} [input.wageInputRef] InputRef for the wage
 *   fact this calculation is derived from (regional_data_facts row), when one backs it. Omitted (undefined)
 *   for a pure reader-entered preview with no backing fact — inputsUsed then carries no wage entry.
 * @param {{table: string, pk: string, version?: string|null}} [input.energyInputRef] Same, for the energy fact.
 * @returns {{
 *   npv: {low:number, point:number, high:number},
 *   paybackYears: {low:number|null, point:number|null, high:number|null},
 *   breakEvenWagePerHour: {low:number|null, point:number|null, high:number|null},
 *   refusal: string|null,
 *   inputsUsed: Array<{table:string, pk:string, version:string|null}>,
 * }}
 */
export function automateVsHire(input) {
  const {
    capexUsd, annualThroughputUnits, labourCostPerHour, hoursPerUnitManual, hoursPerUnitAutomated,
    energyPricePerKwh, kwhPerUnitAutomated, maintenancePctOfCapex, discountRate, horizonYears,
    wageInputRef = null, energyInputRef = null,
  } = input || {};

  for (const [name, v] of [
    ["capexUsd", capexUsd], ["annualThroughputUnits", annualThroughputUnits],
    ["labourCostPerHour", labourCostPerHour], ["hoursPerUnitManual", hoursPerUnitManual],
    ["hoursPerUnitAutomated", hoursPerUnitAutomated], ["energyPricePerKwh", energyPricePerKwh],
    ["kwhPerUnitAutomated", kwhPerUnitAutomated], ["maintenancePctOfCapex", maintenancePctOfCapex],
    ["discountRate", discountRate], ["horizonYears", horizonYears],
  ]) requireFinitePositive(name, v);
  if (!Number.isInteger(horizonYears) || horizonYears < 1) {
    throw new Error(`automate-vs-hire: horizonYears must be a positive integer (got ${JSON.stringify(horizonYears)})`);
  }

  const wageLow = labourCostPerHour * (1 - UNCERTAINTY_PCT);
  const wageHigh = labourCostPerHour * (1 + UNCERTAINTY_PCT);
  const energyLow = energyPricePerKwh * (1 - UNCERTAINTY_PCT);
  const energyHigh = energyPricePerKwh * (1 + UNCERTAINTY_PCT);

  const base = { capexUsd, annualThroughputUnits, hoursPerUnitManual, hoursPerUnitAutomated, kwhPerUnitAutomated, maintenancePctOfCapex, discountRate, horizonYears };

  const point = computeScenario({ ...base, labourCostPerHour, energyPricePerKwh });
  // Worst case FOR automation: cheaper manual labor (wageLow) + costlier energy (energyHigh).
  const worst = computeScenario({ ...base, labourCostPerHour: wageLow, energyPricePerKwh: energyHigh });
  // Best case FOR automation: pricier manual labor (wageHigh) + cheaper energy (energyLow).
  const best = computeScenario({ ...base, labourCostPerHour: wageHigh, energyPricePerKwh: energyLow });
  // Break-even wage range from energy uncertainty alone (see file header).
  const breakEvenAtEnergyLow = computeScenario({ ...base, labourCostPerHour, energyPricePerKwh: energyLow });
  const breakEvenAtEnergyHigh = computeScenario({ ...base, labourCostPerHour, energyPricePerKwh: energyHigh });

  const inputsUsed = [];
  if (wageInputRef) inputsUsed.push({ table: wageInputRef.table, pk: wageInputRef.pk, version: wageInputRef.version ?? null });
  if (energyInputRef) inputsUsed.push({ table: energyInputRef.table, pk: energyInputRef.pk, version: energyInputRef.version ?? null });

  return {
    npv: { low: worst.npv, point: point.npv, high: best.npv },
    paybackYears: { low: worst.paybackYears, point: point.paybackYears, high: best.paybackYears },
    breakEvenWagePerHour: {
      low: breakEvenAtEnergyLow.breakEvenWagePerHour,
      point: point.breakEvenWagePerHour,
      high: breakEvenAtEnergyHigh.breakEvenWagePerHour,
    },
    refusal: point.refusal,
    inputsUsed,
  };
}

/**
 * The documented default scenario constants — used by `seed-derived-values.mjs` (the initial closure) and
 * `src/lib/propagation/methods/automate-vs-hire.ts` (the drain's recompute path), so a recomputed value
 * reflects the SAME assumptions the seed used rather than silently drifting. Named as a documented
 * default, never presented as a fact about any real facility. A reader's own live-preview inputs on the
 * Operations calculator OVERRIDE every one of these; they apply only to the derived_values/estimated_values
 * rows this module's callers persist.
 */
export const DEFAULT_SCENARIO = Object.freeze({
  capexUsd: 250_000,
  annualThroughputUnits: 50_000,
  hoursPerUnitManual: 0.12,
  hoursPerUnitAutomated: 0.02,
  kwhPerUnitAutomated: 0.35,
  maintenancePctOfCapex: 0.08,
  discountRate: 0.08,
  horizonYears: 7,
});
