import type { MethodFn, MethodContext, MethodResult } from "./index.ts";
import { computeSeriesDeltas } from "../../market/series-deltas.mjs";

export const METHOD_ID = "market_series_delta";
export const METHOD_VERSION = "1.0.0";

/** A week-over-week delta computed from two OFFICIAL/VERIFIED market_series observations (both EIA rows
 *  carry `origin_class: 'official'` today) backs a "verified" lifecycle — a deterministic diff of two
 *  already-strong sources, the same rule `lifecycleFromFactorOriginClass` (carbon-intensity.ts) applies
 *  for its own single-input case, generalised to "every input" rather than "the one input" since this
 *  method's declared input set is a pair, not a singleton. Anything weaker on EITHER input backs
 *  "corroborated" — never claiming stronger provenance than the weakest input carries. Exported so a
 *  future caller (or this file's own test) can reuse the same rule rather than re-deriving it. */
export function lifecycleFromOriginClasses(originClasses: Array<string | null | undefined>): "verified" | "corroborated" {
  return originClasses.length > 0 && originClasses.every((oc) => oc === "official" || oc === "verified")
    ? "verified"
    : "corroborated";
}

interface MarketSeriesRow {
  id?: string;
  series_key: string;
  reference_period: string | null;
  as_at_date: string | null;
  value_numeric: number | string | null;
  unit: string | null;
  currency: string | null;
  origin_class: string;
}

export const computeMarketSeriesDelta: MethodFn = (ctx: MethodContext): MethodResult => {
  const rows = ctx.inputs.map((i) => i.row).filter((r): r is MarketSeriesRow => Boolean(r));
  if (rows.length < 2) {
    return { ok: false, reason: `fewer than 2 resolvable market_series inputs (got ${rows.length})` };
  }
  const seriesKeys = new Set(rows.map((r) => r.series_key));
  if (seriesKeys.size !== 1) {
    return { ok: false, reason: `inputs span more than one series_key: ${[...seriesKeys].join(", ")}` };
  }

  const deltas = computeSeriesDeltas(rows);
  // computeSeriesDeltas is JSDoc-typed JS (series-deltas.mjs, out of this lane's write set), not a real TS
  // discriminated union — `as any` here is a deliberate, narrow boundary cast at the ONE seam where an
  // untyped .mjs return crosses into this .ts method, not a general escape hatch; every field this
  // function reads off `d` below is still guarded by its own `in`/typeof check before use.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = deltas.delta1w as any;
  if (!d) {
    return { ok: false, reason: "no 1-week delta window in computeSeriesDeltas output" };
  }
  if ("unitMismatch" in d && d.unitMismatch) {
    return { ok: false, reason: `unit/currency changed since ${d.fromDate} — refusing to compare across a unit change` };
  }
  if ("insufficientHistory" in d && d.insufficientHistory) {
    return { ok: false, reason: "insufficient history for a 1-week delta (need a resolvable prior observation)" };
  }
  if (!("value" in d) || typeof d.value !== "number") {
    return { ok: false, reason: "computeSeriesDeltas returned no usable delta1w value" };
  }

  const lifecycle = lifecycleFromOriginClasses(rows.map((r) => r.origin_class));

  return {
    ok: true,
    value: d.value,
    unit: deltas.latest?.unit ?? null,
    currency: deltas.latest?.currency ?? null,
    // A deterministic subtraction of two already-observed points — same posture as carbon_intensity_tkm's
    // own "calculated" classification for a deterministic unit conversion of a published figure.
    derivation: "calculated",
    originClass: "derived",
    lifecycle,
    admissibility: "calculation_ok",
    // Fixed, documented confidence (not derived from a pedigree score — market_series carries none): two
    // official-agency observations, a deterministic diff, no modelling step. Mirrors carbon-intensity.ts's
    // own "documented default when the input carries no finer-grained score" posture (0.7 there, for a
    // single input of unknown pedigree) at a HIGHER fixed value here because both inputs' provenance IS
    // known (origin_class), just not on a 1-5 pedigree scale.
    confidence: 0.9,
    // No independent decay clock: staleness is the DAG's own job (a new market_series observation fires
    // the outbox and re-authors/invalidates this value at write time — see author-edges.mjs), the same
    // "half-life null (factor-bound)" reasoning carbon-intensity.ts states for its own case, generalised
    // from "bound to one factor row" to "bound to the series' own next observation."
    halfLifeDays: null,
  };
};
