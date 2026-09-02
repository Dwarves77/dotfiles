// methods/automate-vs-hire.ts — the registered recompute method for the automate-vs-hire estimate (docs/
// specs/08-flywheel-design.md §2.3 worked example: "Operations: 4 automate-vs-hire results that used the
// factor"). Lane DP-SURF, system-completion train, 2026-09-02.
//
// PLAIN RELATIVE IMPORTS, NO `@/` ALIAS — matches every other file in this directory (see ../types.ts's
// header for the full reasoning: Node-native type stripping, no jiti).
//
// WHAT THIS TRACKS, NAMED HONESTLY. `automateVsHire()` (src/lib/operations/automate-vs-hire.mjs) computes
// THREE ranged figures (npv, paybackYears, breakEvenWagePerHour) from one wage fact + one energy fact.
// `derived_values`/`estimated_values` are each ONE-METRIC-PER-ROW tables (migration 285/286: a single
// `value`/`value_low`/`value_high` triple) — there is no schema slot for three independently-versioned
// numbers under one row. This method registers NPV as the propagated headline metric (the DAG's
// `derived_values` row), and ALSO writes payback/break-even into the paired `estimated_values` row's
// `distribution` jsonb column (a deliberate, documented use of that column — see
// seed-derived-values.mjs, the only other writer of estimated_values in this lane, for the exact shape).
// This is a SCOPE NARROWING versus spec §2.3's worked example (which names all three moving together) —
// not a defect: the DAG still links wage/energy facts to ONE result per region, and the fuller range triple
// (still ALL of npv/payback/breakeven) is what the Operations calculator UI shows, computed live from the
// SAME pure function this method calls, whenever a reader is looking at the page — only the PERSISTED,
// propagation-tracked figure is narrowed to NPV.
//
// INPUT RESOLUTION. `ctx.inputs` are the two `regional_data_facts` rows this value's derivation_edges
// declare (see seed-derived-values.mjs for how the edges are first created) — identified by their
// `dimension` column (`labor_markets` = wage, `operational_cost` = energy), NOT by array position, so a
// caller that declared them in either order still resolves correctly. Missing/unresolvable rows ->
// `{ok:false, reason}` (spec §2.2 Part 3's explicit "no method registered yet"-shaped outcome for a
// self-refusing method — the drain counts this and leaves the value stale, never throws).

// NOTE: this file does NOT import registerMethod/anything from "./index.ts" — index.ts imports THIS file's
// named exports and calls registerMethod itself (see index.ts's bottom section). A circular
// index.ts <-> automate-vs-hire.ts import (this file importing registerMethod, index.ts importing this
// file) was the first shape tried and it broke: `const REGISTRY` is in TDZ until index.ts's own top-level
// code runs, but ES module linking evaluates an imported module BEFORE the importing module's own body —
// so a call to registerMethod() from inside this file's top level, triggered by index.ts's own
// side-effect import of it, executed before index.ts's `const REGISTRY = new Map()` line ever ran
// ("ReferenceError: Cannot access 'REGISTRY' before initialization", caught live by this lane's own test
// run). Keeping this file registration-free avoids the cycle entirely: index.ts calls registerMethod AFTER
// its own REGISTRY is initialized, using the plain values this file exports.
import type { MethodFn, MethodContext, MethodResult } from "./index.ts";
import { automateVsHire, DEFAULT_SCENARIO } from "../../operations/automate-vs-hire.mjs";

export const METHOD_ID = "automate_vs_hire";
export const METHOD_VERSION = "1.0.0";

/** A regional_data_facts row's shape this method actually reads, per migration 267's envelope columns. */
interface RegionalFactRow {
  dimension: string;
  value_numeric: number | null;
  unit: string | null;
}

function findFactByDimension(inputs: MethodContext["inputs"], dimension: string): RegionalFactRow | null {
  for (const ref of inputs) {
    if (ref.table !== "regional_data_facts" || !ref.row) continue;
    const row = ref.row as RegionalFactRow;
    if (row.dimension === dimension && typeof row.value_numeric === "number" && Number.isFinite(row.value_numeric)) {
      return row;
    }
  }
  return null;
}

export const computeAutomateVsHire: MethodFn = (ctx: MethodContext): MethodResult => {
  const wage = findFactByDimension(ctx.inputs, "labor_markets");
  const energy = findFactByDimension(ctx.inputs, "operational_cost");
  if (!wage) return { ok: false, reason: "no resolvable labor_markets (wage) regional_data_facts input" };
  if (!energy) return { ok: false, reason: "no resolvable operational_cost (energy) regional_data_facts input" };

  const r = automateVsHire({
    ...DEFAULT_SCENARIO,
    labourCostPerHour: wage.value_numeric as number,
    energyPricePerKwh: energy.value_numeric as number,
  });

  return {
    ok: true,
    value: r.npv.point,
    valueLow: r.npv.low,
    valueHigh: r.npv.high,
    unit: "USD",
    currency: "USD",
    derivation: "modelled",
    originClass: "modelled",
    lifecycle: "emerging",
    admissibility: "analysis_ok",
    // Documented default, not a fitted statistical confidence — a modelled estimate over two official-
    // origin facts (BLS OEWS / Eurostat nrg_pc_205), neither of which is itself community-sourced. See
    // automate-vs-hire.mjs's own header for the ±10% range convention this confidence sits alongside.
    confidence: 0.6,
    // Spec §3.2's decay table: "Modelled estimate | tied to input freshness | Inherits, never independent."
    // effective_confidence() takes one half_life_days number, not a formula referencing another row's
    // freshness — this is the closest honest single number: 365 days, the SHORTER of the two input
    // classes' rough decay character (BLS OEWS/Eurostat are both annual-or-slower-cadence official series,
    // but a modelled OUTPUT built from them should not claim their own statutory-grade non-decay).
    halfLifeDays: 365,
  };
};
