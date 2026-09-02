// format-range.mjs — how an estimated figure's low – point – high triple is rendered as text.
//
// Pure, no React, so the rule is testable on its own. Pulled out of EstimatedFigure.tsx on 2026-09-02
// after a browser read of /operations showed the automate-vs-hire calculator rendering
// "Payback period USD 2.08 – USD 1.83 – USD 1.64": the component applied the PRIMARY figure's currency
// (the NPV's USD) to every companion metric and dropped the companion's own unit ("years"), and the
// sensitivity bands were printed in band order (pessimistic → optimistic), which for a payback period is
// numerically descending and reads as a broken range. Two rules live here now:
//   1. each card formats with ITS OWN currency/unit — a companion never inherits the primary's currency;
//   2. a triple is printed in ascending numeric order (min – central – max). The central value stays
//      central by construction for the monotone metrics this component carries; the min/max labels are
//      the bands, whichever way the metric happens to run.

/** @param {number|null} n */
export function formatNumber(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 });
}

/**
 * @param {number|null} low
 * @param {number|null} point
 * @param {number|null} high
 * @param {string|null} unit      rendered as a suffix when no currency is given
 * @param {string|null} currency  rendered as a prefix; when given, the unit is omitted (a currency IS the unit)
 */
export function formatRange(low, point, high, unit, currency) {
  const suffix = currency ? "" : unit ? ` ${unit}` : "";
  const prefix = currency ? `${currency} ` : "";
  const one = (n) => `${prefix}${formatNumber(n)}${suffix}`;
  if ((low === null || low === undefined) && (high === null || high === undefined)) return one(point);
  const nums = [low, point, high].filter((n) => n !== null && n !== undefined && Number.isFinite(n));
  if (nums.length < 3) return `${one(low)} – ${one(point)} – ${one(high)}`;
  const [a, b, c] = [...nums].sort((x, y) => x - y);
  return `${one(a)} – ${one(b)} – ${one(c)}`;
}
