// methods/carbon-intensity.ts — the registered recompute method for the per-factor carbon-intensity
// derived value (docs/specs/08-flywheel-design.md §2.3 worked example: "Market Intel: carbon-cost-per-FEU
// on 11 corridors" — this is the narrower, one-factor-row shape of the same idea: "an emission_factors row
// changed -> its carbon-intensity figure recomputes"). Lane DP-SURF, system-completion train, 2026-09-02.
//
// PLAIN RELATIVE IMPORTS, NO `@/` ALIAS — see ../types.ts's header.
//
// INPUT RESOLUTION. Exactly one declared input: the `emission_factors` row this value derives from
// (seed-derived-values.mjs registers it that way). `{ok:false, reason}` when the row cannot be resolved
// (deleted, or the drain resolved a `null` for an unrecognised table — see drain.ts's resolveInputs) or
// when carbon-intensity.mjs itself refuses (an unsupported quantity_basis, or no usable ttw/wtw/wtt
// number) — both are ordinary, expected outcomes, never a thrown drain (spec §2.2 Part 3).

// NOTE: this file does NOT import registerMethod from "./index.ts" — see automate-vs-hire.ts's header in
// this same directory for why (a circular index.ts <-> method-file import breaks on REGISTRY's TDZ).
// index.ts imports this file's named exports and calls registerMethod itself.
import type { MethodFn, MethodContext, MethodResult } from "./index.ts";
import { carbonIntensity } from "../../market/carbon-intensity.mjs";

export const METHOD_ID = "carbon_intensity_tkm";
export const METHOD_VERSION = "1.0.0";

/** A pedigree score (migration 258's `pedigree` smallint, 1..5, LOWER IS BETTER — ecoinvent convention)
 *  mapped onto derived_values' 0..1 confidence scale. 1 (best) -> 1.0, 5 (worst) -> 0.2. Absent -> the
 *  documented default below. */
export function confidenceFromPedigree(pedigree: number | null | undefined): number {
  if (typeof pedigree === "number" && Number.isFinite(pedigree) && pedigree >= 1 && pedigree <= 5) {
    return (6 - pedigree) / 5;
  }
  // Documented default when the factor row carries no pedigree score at all — never fabricated
  // precision, a stated fallback for a genuinely missing input.
  return 0.7;
}

// Nullability here mirrors migration 258's actual CHECK/NOT NULL constraints on emission_factors, not a
// defensive guess: source_key, origin_class and pedigree are all NOT NULL on that table, so a resolved
// row always carries them — carbonIntensity()'s own JSDoc param types (carbon-intensity.mjs) agree.
interface EmissionFactorRow {
  factor_id?: string;
  quantity_basis: string;
  ttw_co2e: number | null;
  wtw_co2e: number | null;
  wtt_co2e: number | null;
  source_key: string;
  origin_class: string;
  pedigree: number;
}

/** A factor whose own origin_class is official/verified backs a "verified" lifecycle for the derived
 *  figure (a deterministic conversion of an already-strong source); anything weaker (partner/derived/
 *  modelled/community*) backs "corroborated" — never claiming stronger provenance than the input carries.
 *  Exported so seed-derived-values.mjs (the OTHER writer of carbon_intensity_tkm derived_values rows —
 *  this method file's own first-computation counterpart) uses the SAME rule rather than a second, drifting
 *  copy of it. */
export function lifecycleFromFactorOriginClass(originClass: string | null | undefined): "verified" | "corroborated" {
  return originClass === "official" || originClass === "verified" ? "verified" : "corroborated";
}

export const computeCarbonIntensity: MethodFn = (ctx: MethodContext): MethodResult => {
  const ref = ctx.inputs.find((i) => i.table === "emission_factors" && i.row);
  if (!ref || !ref.row) return { ok: false, reason: "no resolvable emission_factors input" };
  const factor = ref.row as EmissionFactorRow;

  const r = carbonIntensity(factor);
  if (!r.ok) return { ok: false, reason: r.reason };

  const lifecycle = lifecycleFromFactorOriginClass(factor.origin_class);

  return {
    ok: true,
    value: r.valueGPerUnit,
    unit: r.unit,
    // "calculated" IS contractable (src/lib/contracts/envelope.mjs DERIVATION) — a deterministic unit
    // conversion of a published factor is admissible in a calculation once its confidence clears
    // FLOOR.calculation, unlike the automate-vs-hire estimate (modelled, never contractable).
    derivation: "calculated",
    originClass: "derived",
    lifecycle,
    admissibility: "calculation_ok",
    confidence: confidenceFromPedigree(factor.pedigree),
    // "half-life null (factor-bound)" — the task brief's own words. A carbon-intensity figure does not
    // decay independently of its factor; when the factor is revised (or superseded), the propagation
    // outbox invalidates THIS value directly (derivation_edges), which is the correct staleness signal —
    // adding an independent decay clock on top would double-count the same freshness fact two ways.
    halfLifeDays: null,
  };
};
