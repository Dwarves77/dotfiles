// antitrust.mjs — the write-time antitrust guard for the Community surface (spec 05 §1, required
// component 12). PURE. No database, no I/O, no Date.now() read internally except where a caller
// explicitly wants "now" defaulted — every function takes its inputs explicitly, same discipline
// src/lib/propagation/effective-confidence.mjs and aggregate-safeguards.mjs state for themselves.
//
// WHY THIS EXISTS ALONGSIDE migration 287 / src/lib/propagation/aggregate-safeguards.mjs. Migration 287
// (spec 08 section 5, lane DP-ENGINE) ships a DB-enforced k-anonymity/dominance/freeze/forward-looking
// gate (`publish_aggregate()`). The Community benchmark that fed it was removed by ADR-042 (2026-10-03),
// so this module no longer points an author at any aggregate route.
//
// This module answers a narrower decision than `publish_aggregate()`:
// "is this attempted community POST (a title+body write to community_posts) allowed to assert a
// commercially sensitive figure at all." A single free-text post can never itself satisfy k >= 5
// distinct organisations (k-anonymity is a property of a POOL, not of one post), so
// `evaluateAntitrustGuard` refuses every individual point disclosure of a sensitive field outright and
// allows a post that already carries a pool-cleared aggregate (k-anonymity, dominance cap and
// three-month lag all satisfied) through. `kAnonymity`, `dominanceCap` and `threeMonthLag` are exported
// standalone so the three named checks (spec 05 section 1) are independently unit-tested, mirroring the
// same POOL shape `publish_aggregate()` consumes (`member_ids` / `member_values` / a period date).
//
// Dominance-share arithmetic reuses `computeDominanceShare` from aggregate-safeguards.mjs rather than
// re-deriving it (repo convention: "no duplication of an existing module" — COMMON lane contract §Quality
// bar) — the SAME max-share formula this repo already ships and tests.

import { computeDominanceShare } from "../propagation/aggregate-safeguards.mjs";

/** Sum per-organisation values from a pool of `{organisationKey, value}` rows into the
 * `{id: total}` shape `computeDominanceShare` expects. */
function memberValuesFrom(pool) {
  const memberValues = {};
  for (const r of pool) {
    memberValues[r.organisationKey] = (memberValues[r.organisationKey] ?? 0) + r.value;
  }
  return memberValues;
}

/** The commercially sensitive fields this guard recognises (spec 05 §1's own named dangerous categories:
 * current/forward-looking pricing, capacity/output plans, wage data). Matches the four fields migration
 * 287 pre-registered in `sensitive_field_policy` for `community_contributions`, plus `pricing` as a
 * distinct label from `rate` (spec 05 names both "current or forward-looking pricing" and rate data). */
export const SENSITIVE_FIELDS = Object.freeze([
  "rate_per_feu",
  "wage_per_hour",
  "capacity_teu",
  "saf_premium_pct",
  "pricing",
]);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Full elapsed calendar months from `from` to `to` (standard age-difference algorithm — the count only
 * increments once the day-of-month has also been reached, so it never overflows a short month the way
 * naive `Date.UTC(y, m - n, d)` subtraction does for a day like the 29th-31st). */
function monthsBetween(from, to) {
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return months;
}

/**
 * k-anonymity floor: at least `minContributors` DISTINCT organisations (never row count — counting rows
 * is "the most common way this control is quietly defeated", migration 287's own comment, carried
 * forward here). `pool` is an array of `{ organisationKey }` (or plain organisation-key strings).
 *
 * @param {Array<{organisationKey?: string} | string>} pool
 * @param {{ minContributors?: number }} [opts]
 * @returns {{ distinctOrganisations: number, minContributors: number, satisfied: boolean }}
 */
export function kAnonymity(pool, { minContributors = 5 } = {}) {
  const keys = (pool ?? []).map((r) => (typeof r === "string" ? r : r?.organisationKey)).filter(Boolean);
  const distinctOrganisations = new Set(keys).size;
  return {
    distinctOrganisations,
    minContributors,
    satisfied: distinctOrganisations >= minContributors,
  };
}

/**
 * 25% dominance cap: no single organisation may hold more than `capRatio` of the pool. Two modes:
 *   - value-weighted: `pool` rows carry `{ organisationKey, value }` — share is by VALUE (matches
 *     migration 287's dominance check when `member_values` is supplied).
 *   - count-weighted (fallback): rows carry no numeric `value` — share is by RESPONSE COUNT per
 *     organisation (every row counts once).
 *
 * @param {Array<{organisationKey: string, value?: number}>} pool
 * @param {{ capRatio?: number }} [opts]
 * @returns {{ maxShare: number, dominantOrganisation: string|null, capRatio: number, satisfied: boolean }}
 */
export function dominanceCap(pool, { capRatio = 0.25 } = {}) {
  const rows = pool ?? [];
  if (rows.length === 0) {
    return { maxShare: 0, dominantOrganisation: null, capRatio, satisfied: true };
  }
  const hasValues = rows.every((r) => typeof r.value === "number" && Number.isFinite(r.value));
  if (hasValues) {
    const memberValues = memberValuesFrom(rows);
    const share = computeDominanceShare(memberValues);
    // computeDominanceShare returns null when every value is non-positive (total <= 0) — treat that as
    // "nothing to check," matching migration 287's own "checked only when data is given" posture.
    if (!share) {
      return { maxShare: 0, dominantOrganisation: null, capRatio, satisfied: true };
    }
    const dominantOrganisation =
      Object.entries(memberValues).find(([, v]) => v === share.max)?.[0] ?? null;
    const maxShare = share.maxSharePct / 100;
    return { maxShare, dominantOrganisation, capRatio, satisfied: maxShare <= capRatio };
  }
  const counts = new Map();
  for (const r of rows) counts.set(r.organisationKey, (counts.get(r.organisationKey) ?? 0) + 1);
  let maxShare = 0;
  let dominantOrganisation = null;
  for (const [org, count] of counts) {
    const share = count / rows.length;
    if (share > maxShare) {
      maxShare = share;
      dominantOrganisation = org;
    }
  }
  return { maxShare, dominantOrganisation, capRatio, satisfied: maxShare <= capRatio };
}

/**
 * Historical-data-only lag: the data must be dated more than `lagMonths` calendar months before `now`.
 * Calendar-based (year/month/day compare), not a fixed-day approximation, so a 3-month lag means the
 * same thing in February as in August.
 *
 * @param {string|Date} asOfDate - the date the disclosed data reflects
 * @param {Date} [now]
 * @param {{ lagMonths?: number }} [opts]
 * @returns {{ ageDays: number, lagMonths: number, satisfied: boolean }}
 */
export function threeMonthLag(asOfDate, now = new Date(), { lagMonths = 3 } = {}) {
  const asOf = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);
  if (Number.isNaN(asOf.getTime())) {
    return { ageDays: 0, lagMonths, satisfied: false };
  }
  const ageDays = Math.max(0, Math.floor((now.getTime() - asOf.getTime()) / DAY_MS));
  const elapsedMonths = monthsBetween(asOf, now);
  return { ageDays, lagMonths, satisfied: elapsedMonths >= lagMonths };
}

/**
 * The write-time guard (spec 05 §1, required component 12; interface contract with COMMUNITY-B).
 *
 * @param {{
 *   sensitivityField?: string|null,
 *   isAggregate?: boolean,
 *   pool?: Array<{organisationKey: string, value?: number}>,
 *   asOfDate?: string|Date|null,
 *   now?: Date,
 * }} post
 * @returns {{ allowed: boolean, reason: string|null }}
 */
export function evaluateAntitrustGuard(post) {
  const field = post?.sensitivityField ?? null;
  if (!field) {
    return { allowed: true, reason: null };
  }

  if (!post.isAggregate) {
    return {
      allowed: false,
      reason:
        `"${field}" is a commercially sensitive field (current/forward-looking pricing, capacity, or ` +
        "wage data). A single member's individual disclosure of it is never permitted in a post, " +
        "regardless of anonymity.",
    };
  }

  const now = post.now instanceof Date ? post.now : new Date();
  const k = kAnonymity(post.pool ?? []);
  const d = dominanceCap(post.pool ?? []);
  const lag = threeMonthLag(post.asOfDate ?? null, now);
  const allowed = k.satisfied && d.satisfied && lag.satisfied;

  if (allowed) {
    return { allowed: true, reason: null };
  }

  const reasons = [];
  if (!k.satisfied) {
    reasons.push(
      `needs ${k.minContributors - k.distinctOrganisations} more contributing organisation(s) ` +
        `(${k.distinctOrganisations}/${k.minContributors})`
    );
  }
  if (!d.satisfied) {
    reasons.push(
      `one organisation would hold ${(d.maxShare * 100).toFixed(0)}% of responses ` +
        `(cap ${(d.capRatio * 100).toFixed(0)}%)`
    );
  }
  if (!lag.satisfied) {
    reasons.push(`data is only ${lag.ageDays} day(s) old; must be older than ${lag.lagMonths} months to publish`);
  }

  return {
    allowed: false,
    reason:
      `Refused: ${reasons.join("; ")}. Historical data only, aggregated across at least five ` +
      "contributors with no single contributor above 25%, is the defensible-exchange standard (spec 05 " +
      "section 1).",
  };
}
