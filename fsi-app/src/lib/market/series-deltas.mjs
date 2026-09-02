// series-deltas.mjs — Lane SURF, spec 02 §6 item 1 ("Comparative ribbon: 6 to 10 headline metrics,
// each `level · Δ1w · Δ1m · ΔYoY · sparkline · as-of`") and §3's "standard row"
// (`current | Δ1w | Δ1m | Δ3m | ΔYoY | 52w range position | sparkline`).
//
// THE LIVE FACT THIS MODULE IS BUILT AGAINST: `market_series` has 6 series keys, 1 row each, today
// [CONFIRMED 2026-09-02]. Every delta computed against today's live data is therefore, correctly,
// "one observation, no delta yet" — this is NOT a bug in this module, it is the honest read of a table
// mid-backfill, and the plan names this exact state as the acceptance bar (§9: "Comparative read
// Absent in substance"; the fix is to make it comparative WHEN THE DATA SUPPORTS IT, and say plainly
// when it does not, never to fabricate a delta from a single point).
//
// NEVER FABRICATE A DELTA FROM ONE POINT. A single-observation series has no prior value to subtract
// against; rendering "+0.0%" or "—" indistinguishably from a real zero-change delta would be exactly
// the false-precision failure spec 00 §2 names ("Publishing €47.83/tCO2e when the honest read is €45 to
// 50"). This module returns `null` for a window with no comparable point and a stated `insufficientHistory`
// reason, never a zero.
//
// NEVER COMPARE ACROSS A UNIT CHANGE. Two "diesel prices" on different units are different commodities
// (spec 00 §2: "unit, currency, fx_date — two 'diesel prices' on different units are different
// commodities"). A pair of observations whose `unit` or `currency` differ is refused for that pair
// specifically (not the whole series — a later, unit-consistent pair may still compare), with reason
// `unit_mismatch`.
//
// NEAREST-AT-OR-BEFORE, NOT EXACT-DATE MATCH. eu-oil-bulletin publishes weekly, not on exact 7/30/365-day
// boundaries from "today", so a window comparison looks for the OLDEST observation at or before
// (latest.date - windowDays) — the nearest fully-elapsed match — never a point AFTER the window target
// (which would understate the elapsed time and overstate how fresh the delta is).
//
// PLAIN ESM, ZERO DEPENDENCIES. TIME IS INJECTED via each row's own `reference_period` (or `as_at_date`
// fallback) — this module never reads the clock; "latest" is the greatest date INSIDE the input, not
// "now" (mirrors refresh-published-price-statistics.mjs's own `latestPerSeries` convention).

function pointDate(row) {
  return row?.reference_period ?? row?.referencePeriod ?? row?.as_at_date ?? row?.asAtDate ?? null;
}

function pointValue(row) {
  const raw = row?.value_numeric ?? row?.value;
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function pointUnit(row) {
  return { unit: row?.unit ?? null, currency: row?.currency ?? null };
}

/**
 * Normalise a raw market_series-shaped row list for ONE series_key into ascending-by-date points,
 * de-duplicated on date (later-seen row wins a same-date collision, mirroring latestPerSeries's
 * "greatest reference_period wins" rule extended to a tie).
 */
function toSortedPoints(rows) {
  const byDate = new Map();
  for (const r of rows ?? []) {
    const date = pointDate(r);
    if (!date) continue;
    byDate.set(date, r);
  }
  return Array.from(byDate.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, row]) => ({ date, row, value: pointValue(row), ...pointUnit(row) }));
}

/** Nearest point at or before `targetDate` (date string comparison — the same ISO-sortable convention
 *  every producer in this repo emits). `null` when every point is after the target (insufficient history). */
function nearestAtOrBefore(points, targetDate) {
  let best = null;
  for (const p of points) {
    if (p.date > targetDate) continue;
    if (!best || p.date > best.date) best = p;
  }
  return best;
}

function isIsoDateLike(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s);
}

function subtractDaysIso(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute one window's delta between the latest point and the nearest point at or before
 * (latest.date - windowDays). Returns null (never a fabricated 0) when there is no such point, or when
 * the matched pair's unit/currency differ (refuse to compare across a unit change).
 *
 * @returns {{ value:number, pct:number|null, fromDate:string, kind:"quantity" } |
 *   { insufficientHistory:true } | { unitMismatch:true, fromDate:string } | null}
 */
function windowDelta(points, latest, windowDays) {
  if (points.length < 2) return { insufficientHistory: true };
  if (!isIsoDateLike(latest.date)) return { insufficientHistory: true };
  const targetDate = subtractDaysIso(latest.date, windowDays);
  const prior = nearestAtOrBefore(points, targetDate);
  if (!prior || prior.date === latest.date) return { insufficientHistory: true };
  if (latest.value === null || prior.value === null) return { insufficientHistory: true };
  if (prior.unit !== latest.unit || prior.currency !== latest.currency) {
    return { unitMismatch: true, fromDate: prior.date };
  }
  const value = latest.value - prior.value;
  const pct = prior.value !== 0 ? (value / Math.abs(prior.value)) * 100 : null;
  return { value, pct, fromDate: prior.date, kind: "quantity" };
}

/** Named windows the comparative ribbon renders (spec 02 §3's standard row, minus Δ3m/52w-range which
 *  are future ribbon columns this table's current history cannot yet support honestly). */
export const DELTA_WINDOWS = Object.freeze({ w1: 7, m1: 30, yoy: 365 });

/**
 * Build the comparative-ribbon shape for ONE series_key from its (unreduced) observation rows.
 *
 * @param {Array<object>} rows any market_series-shaped rows for exactly one series_key (any order,
 *   any count — including zero).
 * @returns {{
 *   count: number,
 *   latest: { date:string, value:number|null, unit:string|null, currency:string|null } | null,
 *   sparkline: Array<{ date:string, value:number|null }>,
 *   delta1w: object|null, delta1m: object|null, deltaYoY: object|null,
 *   message: string|null,
 * }}
 */
export function computeSeriesDeltas(rows) {
  const points = toSortedPoints(rows);
  const sparkline = points.map((p) => ({ date: p.date, value: p.value }));

  if (points.length === 0) {
    return { count: 0, latest: null, sparkline, delta1w: null, delta1m: null, deltaYoY: null, message: "no observations on record" };
  }

  const latest = points[points.length - 1];
  const latestOut = { date: latest.date, value: latest.value, unit: latest.unit, currency: latest.currency };

  if (points.length === 1) {
    return {
      count: 1,
      latest: latestOut,
      sparkline,
      delta1w: null,
      delta1m: null,
      deltaYoY: null,
      message: "one observation, no delta yet (history backfill pending)",
    };
  }

  return {
    count: points.length,
    latest: latestOut,
    sparkline,
    delta1w: windowDelta(points, latest, DELTA_WINDOWS.w1),
    delta1m: windowDelta(points, latest, DELTA_WINDOWS.m1),
    deltaYoY: windowDelta(points, latest, DELTA_WINDOWS.yoy),
    message: null,
  };
}

/**
 * Group raw market_series rows (any mix of series_key) by series_key and run computeSeriesDeltas over
 * each group — the shape MarketComparativeRibbon.tsx renders directly, one entry per observed series_key
 * regardless of registry grouping (the registry/producer grouping is MarketSeriesBoard's own concern;
 * this is the flat comparative view spec 02 §6 item 1 describes).
 *
 * @param {Array<object>} rawRows any market_series rows (any mix of series_key / reference_period).
 * @returns {Array<{ seriesKey:string, label:string } & ReturnType<typeof computeSeriesDeltas>>}
 */
export function buildComparativeRibbon(rawRows) {
  const bySeriesKey = new Map();
  for (const r of rawRows ?? []) {
    if (!r?.series_key) continue;
    if (!bySeriesKey.has(r.series_key)) bySeriesKey.set(r.series_key, []);
    bySeriesKey.get(r.series_key).push(r);
  }
  const out = [];
  for (const [seriesKey, rows] of bySeriesKey) {
    const deltas = computeSeriesDeltas(rows);
    const label = rows.find((r) => r.label)?.label ?? seriesKey;
    out.push({ seriesKey, label, ...deltas });
  }
  out.sort((a, b) => a.seriesKey.localeCompare(b.seriesKey));
  return out;
}
