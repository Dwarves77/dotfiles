// dqi.mjs — spec 09 §1.4's DQI / primary-data-share rollup. "DQI is per transport chain element, not per
// shipment — averaging it to the shipment destroys the thing the auditor wants to see." Rolled up to a
// shipment as "a share and a distribution, never a mean" (spec text worked example: "62% primary by
// tonne-km; 4 of 11 legs primary; weakest leg geographical correlation 4"). No fs, no I/O.

import { labelled, missing } from "./label.mjs";

const AXES = Object.freeze([
  "reliability", "completeness", "temporal_correlation", "geographical_correlation", "technological_correlation",
]);

/**
 * Roll up a shipment's tce_data_quality rows. `elements` is an array of
 * { tceId, tonneKm, primaryDataShare, reliability, completeness, temporal_correlation,
 *   geographical_correlation, technological_correlation }.
 *
 * primaryShareByTonneKm is a WEIGHTED share (by tonne-km, per spec's own worked example), never an
 * unweighted row-count mean — a shipment with one enormous primary-data leg and ten tiny secondary ones
 * is mostly primary by the measure that matters (activity), which a row mean would misstate.
 *
 * weakestLeg names the single worst axis value found across every element and which axis/leg it came
 * from — the specific thing spec text says a single letter grade hides ("the weakest leg an auditor will
 * ask about"), surfaced rather than averaged away.
 */
export function rollupDqi(elements) {
  if (!Array.isArray(elements) || elements.length === 0) {
    return missing("no transport-chain-element rows to roll up (an empty shipment has no DQI to report).");
  }
  let tonneKmTotal = 0;
  let primaryTonneKmTotal = 0;
  let primaryLegCount = 0;
  let weakest = null; // { tceId, axis, value }
  for (const el of elements) {
    const tk = typeof el.tonneKm === "number" && Number.isFinite(el.tonneKm) ? el.tonneKm : null;
    const share = typeof el.primaryDataShare === "number" && Number.isFinite(el.primaryDataShare) ? el.primaryDataShare : null;
    if (tk === null || share === null) {
      return missing(`element ${el.tceId ?? "(unnamed)"} is missing tonneKm or primaryDataShare — cannot roll up a partial shipment honestly.`);
    }
    tonneKmTotal += tk;
    primaryTonneKmTotal += tk * share;
    if (share >= 0.5) primaryLegCount += 1;
    for (const axis of AXES) {
      const v = el[axis];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      // 1..5, worse is HIGHER (spec: "1 best .. 5 worst") — the weakest leg is the max seen.
      if (weakest === null || v > weakest.value) weakest = { tceId: el.tceId ?? null, axis, value: v };
    }
  }
  if (tonneKmTotal <= 0) return missing("total tonne-km across elements must be > 0 to weight a primary-data share.");

  const primaryShareByTonneKm = primaryTonneKmTotal / tonneKmTotal;
  return labelled(primaryShareByTonneKm, "calculated", {
    legsTotal: elements.length,
    legsPrimary: primaryLegCount,
    weakestLeg: weakest,
    summary:
      `${Math.round(primaryShareByTonneKm * 100)}% primary by tonne-km; ${primaryLegCount} of ${elements.length} ` +
      `legs primary` + (weakest ? `; weakest leg ${weakest.axis.replace(/_/g, " ")} ${weakest.value}` : ""),
  });
}

/** True when a leg counts as "primary" for the legsPrimary tally (share >= 0.5), matching rollupDqi's own
 *  threshold — exported so a caller building its own per-leg badge uses the SAME cutoff, not a second one. */
export function isPrimaryLeg(primaryDataShare) {
  return typeof primaryDataShare === "number" && primaryDataShare >= 0.5;
}
