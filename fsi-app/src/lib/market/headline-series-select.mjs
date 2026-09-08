// headline-series-select.mjs: WHICH series the /market headline row contains. The card's own visual
// anatomy (one row of five compact cards, one-line label, Anton value with inline delta, one muted
// "as of") belongs to MarketComparativeRibbon.tsx; this module decides what that row is given, and
// nothing about how it looks lives here.
//
// THE RULING IT IMPLEMENTS (operator, 2026-09-08, verbatim):
//   "the row is not 'first ten series'. It is one card per distinct price signal, freight-relevant
//    first. Query rule:
//    1. One card per series FAMILY. All ECB FX reference rates are one family; show EUR/USD only and
//       fold the rest under '+3 rates' on the same card, or into the series board. Fuel prices are one
//       card per fuel (diesel, euro-super 95, HFO, residual fuel oil), because each drives a different
//       mode's cost.
//    2. Order: fuels · carbon (EUA, when a series exists) · FX · other indices.
//    3. Cap five visible; header count is 'N of 16' where N is distinct families shown; the rest
//       reachable by horizontal scroll, all on the series board.
//    4. Any series with 'one observation, no delta yet' is not a headline; it stays on the series board
//       until it has a delta."
// Family membership itself is series-family.mjs's single decision, applied once, here. Before this
// module the row was `rows.slice(0, 10)` over every populated series in registry order, which is
// literally the "first ten series" the ruling names.
//
// RULE 4 IS STATED AS A DELTA TEST, NOT AN OBSERVATION COUNT. "One observation, no delta yet" is
// series-deltas.mjs's own message for a single-point series, but a two-point series can also fail to
// produce a delta: both points inside the same window (nearestAtOrBefore returns the latest itself),
// a null value_numeric on either side, or a unit/currency change between them, which that module
// refuses to compare across on purpose. All four are the same fact from the reader's side, "there is no
// movement to report", so the test is the outcome and not the count: a series is a headline candidate
// only if at least one window (1w, 1m, YoY) carries a numeric change. A delta whose PERCENT is null
// (the prior value was zero, so a percentage is undefined) still counts, because the change itself is
// known and the card can state it; that is a formatting problem, not an absence of movement.
//
// WHAT TODAY'S DATA DOES TO THIS ROW, stated here because the answer is surprising and the lane was
// told to report rather than force it. Live market_series on 2026-09-08 holds exactly 16 series keys:
// 6 EU Weekly Oil Bulletin fuels (2 observations each), 6 EIA v2 fuel and crude series (454 to 455
// observations each, loaded 2026-09-04), and 4 ECB FX reference rates (1 observation each, loaded
// 2026-09-04). All four FX rates therefore fail rule 4, so the FX family has no eligible member and
// the row is five fuel families. The operator's own expected row ends in EUR/USD, which his rule 4
// excludes; the divergence is reported, not coded around. See this lane's session-log entry.
//
// PLAIN ESM, ZERO DEPENDENCIES. No I/O, no clock: the caller hands in a built board.

import {
  FAMILY_CLASS_ORDER,
  resolveSeriesFamily,
  producerOrderForSeriesKey,
} from "./series-family.mjs";

/** Ruling step 3: five cards visible, the rest reachable, never dropped. */
export const HEADLINE_VISIBLE_CAP = 5;

/**
 * Rule 4's test. True when this series has at least one computed window change.
 * @param {{delta1w?:object|null, delta1m?:object|null, deltaYoY?:object|null}|null|undefined} deltas
 * @returns {boolean}
 */
export function hasComputedDelta(deltas) {
  if (!deltas) return false;
  for (const d of [deltas.delta1w, deltas.delta1m, deltas.deltaYoY]) {
    if (d && typeof d.value === "number" && Number.isFinite(d.value)) return true;
  }
  return false;
}

/** Every display row on the board, in one flat list: every producer group that has series, then the
 *  honest catch-all bucket for a prefix no producer claims (buildSeriesBoard never drops those, and
 *  neither does this).
 *
 *  Deliberately NOT filtered on group.state === "populated". An empty group contributes nothing on its
 *  own, so the filter would buy nothing, and it would hide the one case where it matters: rows under a
 *  producer the registry still marks implemented:false (state "not_built"). That combination is a
 *  stale registry entry, which series-registry.mjs has already had once (the eia-v2 entry, corrected
 *  2026-09-02), and it must not be able to make real observed data disappear from the headline row. */
function flattenBoardRows(board) {
  const rows = [];
  for (const g of board?.groups ?? []) {
    for (const s of g.series ?? []) rows.push(s);
  }
  for (const s of board?.unregistered ?? []) rows.push(s);
  return rows;
}

function classRank(familyClass) {
  const i = FAMILY_CLASS_ORDER.indexOf(familyClass);
  // An unknown class sorts after every known one rather than silently landing first.
  return i === -1 ? FAMILY_CLASS_ORDER.length : i;
}

/**
 * @typedef {object} HeadlineCard
 * @property {string} familyKey
 * @property {string} familyClass
 * @property {string} label       the family's declared label, or the observation's own when undeclared
 * @property {string|null} freightMode
 * @property {object} row         the primary member's display row, exactly as buildSeriesBoard made it
 * @property {{count:number, noun:string}} fold  the OTHER eligible members of this family, folded onto
 *   this card. count is the family's own member count minus one, never a literal.
 * @property {string[]} memberSeriesKeys  every eligible member, primary first
 */

/**
 * Select the headline row from a built series board.
 *
 * @param {{groups?:Array<object>, unregistered?:Array<object>}} board buildSeriesBoard's return shape.
 * @param {{cap?:number, families?:readonly object[]}} [opts] `families` overrides the declared family
 *   list (tests only, including the carbon-arrival proof).
 * @returns {{
 *   cards: HeadlineCard[],
 *   visible: HeadlineCard[],
 *   overflow: HeadlineCard[],
 *   familiesShown: number,
 *   totalSeries: number,
 *   excludedSeriesKeys: string[],
 * }}
 */
export function selectHeadlineSeries(board, { cap = HEADLINE_VISIBLE_CAP, families } = {}) {
  const rows = flattenBoardRows(board);
  const totalSeries = rows.length;

  // Rule 4, applied per series before any grouping: a series with no computed delta is not a headline
  // candidate and stays on the series board, which renders every series regardless.
  const excludedSeriesKeys = [];
  const eligible = [];
  for (const row of rows) {
    if (hasComputedDelta(row?.deltas)) eligible.push(row);
    else excludedSeriesKeys.push(row?.seriesKey);
  }

  // Rule 1: group the eligible series into families.
  const byFamily = new Map();
  for (const row of eligible) {
    const family = resolveSeriesFamily(row.seriesKey, families ? { families } : undefined);
    if (!byFamily.has(family.familyKey)) byFamily.set(family.familyKey, { family, members: [] });
    byFamily.get(family.familyKey).members.push(row);
  }

  const cards = [];
  for (const { family, members } of byFamily.values()) {
    // The primary is the family's declared choice when that member is itself eligible (the ruling's
    // "show EUR/USD only"); otherwise the member with the most observations behind it, which is the
    // most-informative quote of the same signal, with the series key as a stable final tiebreak.
    const sorted = [...members].sort((a, b) => {
      const ao = a.observationCount ?? 0;
      const bo = b.observationCount ?? 0;
      if (ao !== bo) return bo - ao;
      return String(a.seriesKey).localeCompare(String(b.seriesKey));
    });
    const declaredPrimary = sorted.find((m) => m.seriesKey === family.primarySeriesKey);
    const primary = declaredPrimary ?? sorted[0];
    const rest = sorted.filter((m) => m !== primary);

    cards.push({
      familyKey: family.familyKey,
      familyClass: family.familyClass,
      // The declared label describes the declared primary. If the card is showing another member of
      // the family (the declared one had no delta), that label would misdescribe the number under it,
      // so the observation's own label wins instead.
      label:
        (declaredPrimary && family.label) || primary.label || primary.seriesKey,
      freightMode: family.freightMode ?? null,
      row: primary,
      // The fold count is this family's own eligible-member count minus one. "+3 rates" today because
      // four ECB rates are one family, "+4 rates" the day a fifth is tracked, with no edit anywhere.
      fold: { count: rest.length, noun: family.memberNoun },
      memberSeriesKeys: [primary.seriesKey, ...rest.map((m) => m.seriesKey)],
    });
  }

  // Rule 2 plus "freight-relevant first". Class order is the ruling's own; inside a class the families
  // that name a freight mode come first; after that the producer registry order (its own intended
  // reading order) and then the family key, so the result is total and stable for any input.
  cards.sort((a, b) => {
    const ca = classRank(a.familyClass);
    const cb = classRank(b.familyClass);
    if (ca !== cb) return ca - cb;
    const fa = a.freightMode ? 0 : 1;
    const fb = b.freightMode ? 0 : 1;
    if (fa !== fb) return fa - fb;
    const pa = producerOrderForSeriesKey(a.row.seriesKey);
    const pb = producerOrderForSeriesKey(b.row.seriesKey);
    if (pa !== pb) return pa - pb;
    return a.familyKey.localeCompare(b.familyKey);
  });

  const visible = cards.slice(0, Math.max(0, cap));
  const overflow = cards.slice(Math.max(0, cap));

  return {
    cards,
    visible,
    overflow,
    // Rule 3's header count: distinct families SHOWN, which is neither the number of series nor the
    // number of cards that exist.
    familiesShown: visible.length,
    totalSeries,
    excludedSeriesKeys,
  };
}
