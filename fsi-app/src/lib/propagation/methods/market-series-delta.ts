// methods/market-series-delta.ts — the registered recompute method for `market_series`, spec 08's own
// gap named in the W3-W4 plan-completion audit (2026-09-05): "market_series ... has no edges" (24-row
// derivation_edges covers only emission_factors/regional_data_facts). Lane W4-DAG, 2026-09-06.
//
// WHAT THIS COMPUTES, AND WHY IT IS NOT INVENTED. The task brief for this lane is explicit: "whatever
// spec 08/09 and the overlay actually compute: read them, do not invent a method." Two market-data figures
// are candidates, both already-shipped, already-tested pure computations:
//   (a) `carbon-cost-per-feu.mjs` (spec 02 §6 item 3, "the differentiating component") — but its OWN
//       header names three live GAPS today (no distance dataset, no licence-clear payload convention, no
//       eex-eua carbon-price producer — `market_series` carries ZERO 'eex-eua' rows, confirmed live SQL
//       this lane) — a method wrapping it would refuse on every real market_series row today, so wiring a
//       producer to author its edges could never grow derivation_edges for real (the brief's own Populated
//       evidence bar).
//   (b) `computeSeriesDeltas` (series-deltas.mjs, spec 02 §6 item 1: "Comparative ribbon: ... level ·
//       Δ1w · Δ1m · ΔYoY · sparkline · as-of") — ALREADY RENDERED on the live Market surface
//       (MarketComparativeRibbon.tsx, via series-board-view-model.mjs) and, confirmed live SQL this lane,
//       computable TODAY with zero gaps: `market_series` series_key 'eia-v2:*' carries 454-455 real
//       weekly observations per series (2017-12-15 through 2026-08-28, six series: WTI, Brent, diesel,
//       jet fuel, RBOB gasoline, propane).
// This module wraps (b) — the one the brief's own "read them, do not invent" instruction and the live-data
// check both point to. (a) stays exactly as it is (a documented, honest GAP) — this lane does not build a
// registered method for it, because doing so would be "built, dormant" (CLAUDE.md rule 13/§0's own
// definition of done) the moment it landed: every real call would refuse, forever, until a DIFFERENT
// lane's write set (a distance producer, a payload convention, the eex-eua producer) lands. Naming this
// choice here rather than silently building the dormant one is itself CLAUDE.md rule 18's posture applied
// to a method, not just a figure: the honest gap is documented, not hidden behind a method that never
// actually computes.
//
// NO DUPLICATED MATH. This file owns ZERO delta arithmetic of its own — `computeSeriesDeltas` (imported,
// unmodified, out of this lane's write set) is the SAME function MarketComparativeRibbon.tsx's own render
// path calls; a market_series row's rendered Δ1w and this method's registered-recompute Δ1w can never
// drift apart because there is exactly one implementation. This mirrors carbon-intensity.ts's own posture
// ("the SAME conversion the derived-value pipeline uses") for a different pair of tables.
//
// INPUT SHAPE. Exactly two declared inputs (both `market_series` rows, same `series_key`): the latest
// observation and the nearest-at-or-before-7-days-prior observation — the same pair
// `computeSeriesDeltas`'s own `windowDelta` selects internally for `delta1w`. This method does not
// re-derive WHICH two rows those are on its own (that would be a second, driftable copy of
// `nearestAtOrBefore`'s selection rule) — it hands EVERY resolved input row to `computeSeriesDeltas` and
// reads `delta1w` back, exactly as the UI does; the two input PKs are declared by the AUTHORING side
// (`scripts/producers/market/author-market-series-delta.mjs`), which already had to identify them to
// build the InputRef pair in the first place. A caller (author-edges.mjs at write time, or drain.ts at
// recompute time) may in principle resolve MORE than two inputs for the same declared set (author-edges
// carries whatever the producer declared); this method only ever reads `delta1w` out of whatever set it is
// given, so it is correct for exactly-2 today and would stay correct if a future caller ever widened the
// declared set to a longer window (Δ1m/ΔYoY) — no change needed here, only to the caller's own InputRef
// list.
//
// NEVER FABRICATE A DELTA FROM ONE POINT / NEVER COMPARE ACROSS A UNIT CHANGE — both already enforced by
// `computeSeriesDeltas` itself (see that file's own header); this method just forwards its refusal reasons
// rather than re-implementing either rule.
//
// PLAIN RELATIVE IMPORTS, NO `@/` ALIAS — see ../types.ts's header for why (Node-native type-stripping,
// this whole directory's own convention).

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
