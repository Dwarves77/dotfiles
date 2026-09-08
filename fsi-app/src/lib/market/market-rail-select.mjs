// market-rail-select.mjs — the two pure selections behind artboard 04/id="p4"'s rail cards,
// CARBON COST PER FEU and NEXT DATA DROPS (lane lists60, 2026-09-08, page-composition train 60).
//
// WHY A MODULE RATHER THAN INLINE JSX. Both cards are a REDUCTION over data /market already loads —
// the per-corridor carbonCostPerFeu() results the page computes for <CarbonCostOverlay/>, and the
// market_series board buildSeriesBoard() already returns — and both reductions have real edge cases
// (a corridor whose result is `ok`, a producer with no observation yet, a producer whose cadence is
// undecided, ties on the same date). Reducing inline would put those cases inside a render function
// where nothing can test them; here they are pure, injected-time, and proven by
// market-rail-select.npmtest.mjs.
//
// NO NEW READ (F38/F39). Neither function fetches. `summariseCarbonCorridors` takes the entries
// /market already builds for the overlay section, and `selectNextDataDrops` takes the board object
// `fetchMarketSeriesBoard()` already returns for MarketSeriesBoard. Nothing new is queried for the
// rail; the rail is a second view of rows already in the page's props.
//
// TIME IS INJECTED. `selectNextDataDrops` takes `now` (src/lib/render-now.ts's server instant, the
// same instant every other clock-reading component on these surfaces takes) and never calls
// `Date.now()` — a next-drop date that fell on opposite sides of a day boundary between SSR and
// hydration is exactly the React #418 class HYDRATION-59 root-caused.
//
// PLAIN ESM, ZERO NPM DEPENDENCIES.

import { producerFor } from "./series-registry.mjs";
import { addDaysIso } from "./refresh-published-price-statistics.mjs";

/** Artboard 04/id="p4" draws three NEXT DATA DROPS rows and two CARBON COST PER FEU rows. Both caps
 *  are the artboard's own row counts, exported so the spec and the card read one value each. */
export const NEXT_DROPS_ROW_CAP = 3;
export const CARBON_CORRIDOR_ROW_CAP = 2;

/**
 * The CARBON COST PER FEU rows: one per corridor, each with the number of inputs still missing.
 *
 * Artboard 04 draws every corridor in its PENDING state ("4 inputs pending") plus one foot line
 * naming the four gaps once — that is exactly the state carbonCostPerFeu() returns today for every
 * live corridor (no emission factor, no routing distance, no tonnes-per-FEU convention, no carbon
 * price feed; see that module's own header for why each is a named GAP and not a fabricated number).
 * A corridor whose result IS `ok` carries a real figure and no pending count, so it is returned with
 * `pending: 0` and its computed point value for the card to render instead.
 *
 * @param {Array<{label: string, result: {ok: boolean, gaps?: string[], point?: number, currency?: string}}>} entries
 * @param {{cap?: number}} [opts]
 * @returns {Array<{label: string, pending: number, point: number|null, currency: string|null}>}
 */
export function summariseCarbonCorridors(entries, { cap = CARBON_CORRIDOR_ROW_CAP } = {}) {
  return (Array.isArray(entries) ? entries : [])
    .filter((e) => e && typeof e.label === "string" && e.label.length > 0 && e.result)
    .slice(0, cap)
    .map((e) => ({
      label: e.label,
      pending: e.result.ok ? 0 : (e.result.gaps ?? []).length,
      point: e.result.ok && typeof e.result.point === "number" ? e.result.point : null,
      currency: e.result.ok ? (e.result.currency ?? null) : null,
    }));
}

/**
 * The NEXT DATA DROPS rows: the soonest expected next observation per producer, ascending.
 *
 * The date is NOT a new prediction. It is the SAME derivation `deriveDisplayRows` already writes
 * into `published_price_statistics.next_release_at` — the producer's latest observed reference
 * period plus that producer's own registered `cadenceDays` — read through the same `addDaysIso`
 * helper, so this card can never state a different next-drop date from the price board's. A
 * producer is omitted, never guessed at, when any of the three inputs is missing:
 *
 *   - no implemented producer entry (a registry stub: `implemented: false`),
 *   - `cadenceDays: null` (the cadence has not been decided; spec 02 §9 forbids implying a
 *     scheduler where none is registered),
 *   - no observation yet (`registered_unpopulated` — there is no period to add a cadence to).
 *
 * With every producer omitted the function returns `[]` and the card renders the Absence
 * convention, never an invented calendar.
 *
 * @param {{groups?: Array<{keyPrefix: string, name: string, implemented: boolean, series?: Array<{referencePeriod: string|null}>}>}|null|undefined} board
 * @param {{now: Date, cap?: number}} opts `now` is the injected server instant.
 * @returns {Array<{keyPrefix: string, name: string, dateIso: string}>} ascending by dateIso
 */
export function selectNextDataDrops(board, { now, cap = NEXT_DROPS_ROW_CAP } = {}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("selectNextDataDrops: opts.now must be a valid Date (the injected server instant)");
  }
  const groups = Array.isArray(board?.groups) ? board.groups : [];
  const rows = [];
  for (const g of groups) {
    if (!g?.implemented) continue;
    const entry = producerFor(g.keyPrefix);
    if (!entry || entry.cadenceDays == null) continue;
    // The producer's most recent observed period across all of its series.
    let latest = null;
    for (const s of g.series ?? []) {
      const p = s?.referencePeriod;
      if (typeof p === "string" && p.length > 0 && (latest === null || p > latest)) latest = p;
    }
    if (latest === null) continue;
    const dateIso = addDaysIso(latest, entry.cadenceDays);
    if (!dateIso) continue;
    rows.push({ keyPrefix: g.keyPrefix, name: g.name, dateIso });
  }
  // Ascending by date, then by name so two producers landing on the same day order stably rather
  // than by whatever order the board's groups happened to arrive in.
  rows.sort((a, b) => (a.dateIso === b.dateIso ? a.name.localeCompare(b.name) : a.dateIso < b.dateIso ? -1 : 1));
  return rows.slice(0, cap);
}
