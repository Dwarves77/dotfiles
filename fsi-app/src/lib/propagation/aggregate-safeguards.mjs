// aggregate-safeguards.mjs — the JS mirror of migration 287's SQL antitrust/anonymisation helpers (docs/
// specs/08-flywheel-design.md §5.2(b)-(d), plus the dominance cap and forward-looking refusal). Lane
// DP-ENGINE, system-completion train, 2026-09-02, second commit ("nothing deferred").
//
// WHY A MIRROR RATHER THAN ONE SHARED IMPLEMENTATION. `publish_aggregate()` (migration 287) is what
// actually gates and logs a live request — it owns the audit trail (`aggregate_query_log`) and MUST run
// inside Postgres, since the freeze/overlap/complement checks all consult that log's history. This file
// exists so the SAME arithmetic (bucket rounding, width scaling, dominance share, complement-set
// detection, freeze-window membership) is unit-testable in CI without a database — a caller assembling a
// UI preview, or a test proving the SQL and the JS agree, does not need Postgres running to exercise the
// logic. The two must AGREE — aggregate-safeguards.test.mjs proves it on the SAME literal fixtures
// migration 287's own self-check DO block asserts against (see that migration's header, "second commit"
// section, for the grammar and rule definitions this file transcribes, not re-derives).
//
// PURE. No database, no I/O, no Date.now() read internally — every function takes its inputs explicitly
// (including "now", where relevant), same discipline effective-confidence.mjs states for itself.

/**
 * Mirrors migration 287's `bucket_width_multiplier(n, k_min)`: GREATEST(1, CEIL(2*k_min/n)). 2 at
 * n = k_min (double-width buckets at the floor), falling to 1 (no widening) at n = 2*k_min and staying
 * there above it — spec §5.2(d)'s "widens as cohort size approaches k_min," using spec §5.2(c)'s own
 * "2x the minimum" safe-cohort-size threshold as the point widening stops.
 *
 * @param {number} n - cohort size (distinct contributors)
 * @param {number} kMin - the field's k-anonymity floor
 * @returns {number} multiplier, always >= 1
 */
export function bucketWidthMultiplier(n, kMin) {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new TypeError(`bucketWidthMultiplier: n must be a finite number (got ${JSON.stringify(n)})`);
  }
  if (typeof kMin !== "number" || !Number.isFinite(kMin)) {
    throw new TypeError(`bucketWidthMultiplier: kMin must be a finite number (got ${JSON.stringify(kMin)})`);
  }
  const denom = Math.max(n, 1);
  return Math.max(1, Math.ceil((2 * kMin) / denom));
}

/**
 * Mirrors migration 287's `bucket_value(value, scheme, multiplier)`. Grammar (this migration's own
 * definition, documented in its header):
 *   'pct:N' / 'abs:N' — round to the nearest N * multiplier (the two prefixes apply IDENTICAL rounding;
 *                       'pct' is a label meaning the field is already percentage-denominated).
 *   'log2'             — round DOWN to the nearest power of 2, grouping `multiplier` octaves per bucket:
 *                       2 ^ (floor(log2(value) / multiplier) * multiplier).
 * Returns `null` for a null/undefined value or an unrecognised scheme — NEVER the raw value it cannot
 * bucket (spec §5.1: publish buckets, never raw values).
 *
 * @param {number|null|undefined} value
 * @param {string} scheme - e.g. "pct:5", "abs:100", "log2"
 * @param {number} [multiplier=1] - from bucketWidthMultiplier(); clamped to a minimum of 1
 * @returns {number|null}
 */
export function bucketValue(value, scheme, multiplier = 1) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`bucketValue: value must be null/undefined or a finite number (got ${JSON.stringify(value)})`);
  }
  const m = Math.max(typeof multiplier === "number" && Number.isFinite(multiplier) ? multiplier : 1, 1);

  const fixedStep = /^(pct|abs):([0-9]+(?:\.[0-9]+)?)$/.exec(scheme);
  if (fixedStep) {
    const step = Number(fixedStep[2]) * m;
    if (!(step > 0)) return null;
    return Math.round(value / step) * step;
  }
  if (scheme === "log2") {
    if (value <= 0) return 0;
    const exp = Math.floor(Math.log2(value) / m) * m;
    return Math.pow(2, exp);
  }
  return null; // unrecognised scheme: never publish raw, never guess
}

/**
 * Mirrors migration 287's inline dominance computation (§5.1 max_share_pct): given a map of
 * contributor id -> numeric contribution, returns the total, the largest single contribution, and that
 * contribution's share of the total as a percentage. Returns `null` when `memberValues` is empty/absent
 * or the total is not positive (nothing to compute a share of) — the SQL function's own "checked only
 * when member_values is supplied and totals positive" posture.
 *
 * @param {Record<string, number>|null|undefined} memberValues
 * @returns {{total: number, max: number, maxSharePct: number}|null}
 */
export function computeDominanceShare(memberValues) {
  if (!memberValues || typeof memberValues !== "object") return null;
  const values = Object.values(memberValues).map(Number);
  if (values.length === 0 || values.some((v) => !Number.isFinite(v))) return null;
  const total = values.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  const max = Math.max(...values);
  return { total, max, maxSharePct: (max / total) * 100 };
}

/**
 * Mirrors migration 287's §5.2(d) dominance refusal condition: true when computeDominanceShare's
 * maxSharePct exceeds maxSharePct (the policy's max_share_pct). A memberValues of null/undefined never
 * refuses (nothing supplied to check — same "checked only when data is given" posture as the SQL).
 *
 * @param {Record<string, number>|null|undefined} memberValues
 * @param {number} maxSharePctPolicy
 * @returns {boolean}
 */
export function isDominant(memberValues, maxSharePctPolicy) {
  const share = computeDominanceShare(memberValues);
  if (!share) return false;
  return share.maxSharePct > maxSharePctPolicy;
}

/**
 * Mirrors migration 287's §5.2(b) complementary-cell-suppression definition (this migration's own
 * wording, its header): cohort C and a PRIOR GRANTED cohort P (both id arrays) are complements within
 * parent set S iff (i) C subset of S, (ii) P subset of S, (iii) C and P disjoint, and (iv) |C| + |P| =
 * |S| — which together force C union P = S exactly, with no gap or overlap hidden in S.
 *
 * @param {string[]} thisMembers
 * @param {string[]} parentMembers
 * @param {string[]} priorMembers
 * @returns {boolean} true iff thisMembers and priorMembers are exact complements within parentMembers
 */
export function isExactComplement(thisMembers, parentMembers, priorMembers) {
  const c = new Set(thisMembers ?? []);
  const p = new Set(priorMembers ?? []);
  const s = new Set(parentMembers ?? []);
  if (s.size === 0) return false;
  for (const id of c) if (!s.has(id)) return false;
  for (const id of p) if (!s.has(id)) return false;
  for (const id of c) if (p.has(id)) return false; // must be disjoint
  return c.size + p.size === s.size;
}

/**
 * Scans a list of previously GRANTED cohorts (each an id array) for one that is an exact complement of
 * `thisMembers` within `parentMembers` (see isExactComplement). Mirrors the SQL function's FOR loop over
 * `aggregate_query_log` rows where refused = false. Returns the first matching prior cohort, or null.
 *
 * @param {string[]} thisMembers
 * @param {string[]|null|undefined} parentMembers - absent/empty means the check does not apply (nothing
 *   supplied to define "parent" — same posture as the SQL's `p_cohort_filter ? 'parent_member_ids'` guard)
 * @param {string[][]} priorGrantedMembersList
 * @returns {string[]|null}
 */
export function findComplementOfPrior(thisMembers, parentMembers, priorGrantedMembersList) {
  if (!parentMembers || parentMembers.length === 0) return null;
  for (const prior of priorGrantedMembersList ?? []) {
    if (isExactComplement(thisMembers, parentMembers, prior)) return prior;
  }
  return null;
}

/**
 * Mirrors migration 287's §5.2(c) freeze-window check: true when `requestedAt` (the prior grant's
 * timestamp) is still within `minLagDays` of `now`. Both accept an ISO string or a Date; `minLagDays` is
 * the policy's own min_lag_days (the SQL reuses this single knob as both the freeze window and the
 * §5.2(a) overlap-recency window — same as this mirror).
 *
 * @param {string|Date} requestedAt
 * @param {string|Date} now
 * @param {number} minLagDays
 * @returns {boolean}
 */
export function isWithinFreezeWindow(requestedAt, now, minLagDays) {
  const requestedMs = requestedAt instanceof Date ? requestedAt.getTime() : Date.parse(requestedAt);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(requestedMs)) throw new TypeError(`isWithinFreezeWindow: requestedAt is not a parseable date (${JSON.stringify(requestedAt)})`);
  if (!Number.isFinite(nowMs)) throw new TypeError(`isWithinFreezeWindow: now is not a parseable date (${JSON.stringify(now)})`);
  if (typeof minLagDays !== "number" || !Number.isFinite(minLagDays) || minLagDays < 0) {
    throw new TypeError(`isWithinFreezeWindow: minLagDays must be a non-negative finite number (got ${JSON.stringify(minLagDays)})`);
  }
  const ageDays = (nowMs - requestedMs) / 86_400_000;
  return ageDays >= 0 && ageDays <= minLagDays;
}

/**
 * Mirrors migration 287's §5.1 forward-looking refusal condition: true iff the policy disallows
 * forward-looking publication AND the request names a period (period_end preferred, falling back to
 * period_start when only a start is given) whose date is strictly after `now`. A request naming neither
 * period bound is not period-scoped and never refuses on this ground, matching the SQL's own posture.
 *
 * @param {{periodStart?: string|null, periodEnd?: string|null}} period
 * @param {boolean} forwardLookingAllowed - the policy's forward_looking_allowed
 * @param {string|Date} now
 * @returns {boolean}
 */
export function isForwardLookingRefusal(period, forwardLookingAllowed, now) {
  if (forwardLookingAllowed) return false;
  const periodTxt = period?.periodEnd ?? period?.periodStart ?? null;
  if (!periodTxt) return false;
  const periodMs = Date.parse(periodTxt);
  if (!Number.isFinite(periodMs)) return false; // unparseable: not treated as forward-looking, matches SQL's exception-swallow
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new TypeError(`isForwardLookingRefusal: now is not a parseable date (${JSON.stringify(now)})`);
  // Compare by calendar date (UTC), matching the SQL's `::date > current_date` comparison rather than a
  // millisecond-precision instant comparison.
  const periodDateOnly = new Date(periodMs).toISOString().slice(0, 10);
  const nowDateOnly = new Date(nowMs).toISOString().slice(0, 10);
  return periodDateOnly > nowDateOnly;
}
