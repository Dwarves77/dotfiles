export const FIXED_LOCALE = "en-US";

/** @param {number|null} n */
export function formatNumber(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString(FIXED_LOCALE, { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 });
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
