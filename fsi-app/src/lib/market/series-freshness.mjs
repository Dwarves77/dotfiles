// series-freshness.mjs — Lane SURF, spec 02 §6 item 11 ("Freshness panel: last-updated and
// next-expected on every series, visibly degraded past cadence") and §9's named defect ("PriceBoard
// prints 'Next release: <date>' against a hand-run script with no scheduler").
//
// WHY THIS EXISTS RATHER THAN A NEW "NEXT RELEASE" CALCULATION. Spec §9 calls the current "Next
// release: <date>" claim on the market signal detail page dishonest, specifically because IT IMPLIES A
// RUNNING SCHEDULER THAT DOES NOT EXIST — market_series and published_price_statistics are populated by
// hand-run producer scripts (series-registry.mjs's own header), not a cron. A predicted date is a
// promise this product cannot keep. The honest replacement is not a BETTER prediction, it is a DERIVED
// STATE: how old is the latest observation relative to what this source's own registered cadence would
// imply, told in the vocabulary spec 00 §3.4 / §2 already ships (current / ageing / stale / frozen /
// unknown) — a state, not a forecast.
//
// REUSES THE SHIPPED FRESHNESS-DERIVED FUNCTION. src/lib/contracts/envelope.mjs's `stalenessOf` is
// where this vocabulary's arithmetic already lives (current/ageing/stale/frozen thresholds at 1x/2x/4x
// the nominal period, "frozen" meaning the source stopped publishing, not "pending" — see that file's
// own header). This module does NOT reimplement that arithmetic a second time; it only ADAPTS the
// registry's `cadenceDays` (an integer, series-registry.mjs's own shape) into the cadence NAME
// `stalenessOf` expects (`envelope.mjs`'s REFRESH_PERIOD_DAYS keys), because the two callers evolved
// independently — the registry names a day count, the envelope names a cadence label — and adapting at
// the boundary is what keeps ONE arithmetic home instead of two.
//
// PLAIN ESM, ZERO DEPENDENCIES beyond the two sibling contracts modules (both plain ESM themselves).
// TIME IS INJECTED, never read from the clock — same discipline envelope.mjs's own header states, so
// this module is deterministic and testable with `node --test`.

import { stalenessOf, REFRESH_PERIOD_DAYS } from "../contracts/envelope.mjs";
import { FRESHNESS } from "../contracts/vocabularies.mjs";

/**
 * Adapt a registry `cadenceDays` (integer days, or null for "not decided" / irregular) into the closest
 * REFRESH_PERIOD_DAYS cadence NAME `stalenessOf` accepts.
 *
 * An EXACT day-count match is preferred (today's two implemented producers, eu-oil-bulletin=7 and
 * ecb-fx=1, both match exactly: "weekly" and "daily"/"realtime"). Absent an exact match, the SMALLEST
 * declared period that is still >= cadenceDays is chosen — the conservative direction: a shorter (more
 * frequent) named cadence makes a value go "ageing"/"stale" SOONER than the source's own declared
 * cadence would, never later, so this adapter can never make a genuinely stale series read as fresher
 * than the registry says it is.
 *
 * `null` cadenceDays maps to "irregular", which `stalenessOf` itself already treats as "unknown" — the
 * honest state for a producer whose cadence has not been decided (series-registry.mjs's stub entries).
 */
export function cadenceNameForDays(cadenceDays) {
  if (cadenceDays === null || cadenceDays === undefined) return "irregular";
  const named = Object.entries(REFRESH_PERIOD_DAYS).filter(([, days]) => days !== null);
  const exact = named.find(([, days]) => days === cadenceDays);
  if (exact) return exact[0];
  const atLeast = named.filter(([, days]) => days >= cadenceDays).sort((a, b) => a[1] - b[1]);
  if (atLeast.length > 0) return atLeast[0][0];
  // cadenceDays exceeds every named period (longer than "annual") — the longest declared period is
  // still the closest honest match, never "irregular" (which would silently discard a real cadence).
  return named.sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Derive one series row's freshness state against its registry producer's cadence.
 *
 * @param {{ as_at_date?: string|null, reference_period?: string|null }} row a market_series-shaped row
 *   (or a MarketSeriesDisplayRow — either `asAtDate`/`referencePeriod` or `as_at_date`/`reference_period`
 *   naming is accepted so callers can pass the raw DB row or the buildSeriesBoard display row).
 * @param {{ cadenceDays?: number|null }|null} producerEntry a series-registry.mjs producer entry (or
 *   `null` for an unregistered series — renders "unknown", never guesses a cadence).
 * @param {string} nowIso the current instant, injected (never read from the clock here).
 * @returns {{ code: "current"|"ageing"|"stale"|"frozen"|"unknown", label: string, degraded: boolean,
 *   asOfDate: string|null, cadenceDays: number|null }}
 */
export function deriveSeriesFreshness(row, producerEntry, nowIso) {
  const asOfDate = row?.as_at_date ?? row?.asAtDate ?? row?.reference_period ?? row?.referencePeriod ?? null;
  const cadenceDays = producerEntry?.cadenceDays ?? null;
  const cadenceName = producerEntry ? cadenceNameForDays(cadenceDays) : "irregular";
  const env = {
    expected_refresh: cadenceName,
    as_of: { event_date: asOfDate, source_published_at: asOfDate },
  };
  const code = stalenessOf(env, nowIso);
  const meta = FRESHNESS[code];
  return { code, label: meta.label, degraded: meta.degraded, asOfDate, cadenceDays };
}

/**
 * Roll a list of already-derived per-series freshness states (deriveSeriesFreshness's own return shape,
 * or just their `.code`s) into a panel summary: a count per state plus the single WORST state present —
 * "worst governs the summary" is the same rule envelope.mjs's `propagate()` already applies to an
 * aggregate figure's freshness (spec 00 §2's propagation rule), restated here for a summary rather than
 * a single rolled-up number. An empty list summarises as `unknown` with zero counts — never defaults to
 * "current", which would assert freshness about data that was never examined.
 *
 * @param {Array<{code:string}|string>} states
 * @returns {{ counts: Record<"current"|"ageing"|"stale"|"frozen"|"unknown", number>, total: number,
 *   worst: "current"|"ageing"|"stale"|"frozen"|"unknown" }}
 */
export function summarizeBoardFreshness(states) {
  /** @type {Record<"current"|"ageing"|"stale"|"frozen"|"unknown", number>} */
  const counts = { current: 0, ageing: 0, stale: 0, frozen: 0, unknown: 0 };
  /** @type {"current"|"ageing"|"stale"|"frozen"|"unknown"|null} */
  let worst = null;
  for (const s of states ?? []) {
    const code = /** @type {"current"|"ageing"|"stale"|"frozen"|"unknown"|undefined} */ (typeof s === "string" ? s : s?.code);
    if (!code || !(code in counts)) continue;
    counts[code] += 1;
    const order = FRESHNESS[code]?.order ?? 0;
    if (worst === null || order > (FRESHNESS[worst]?.order ?? 0)) worst = code;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, total, worst: worst ?? "unknown" };
}
