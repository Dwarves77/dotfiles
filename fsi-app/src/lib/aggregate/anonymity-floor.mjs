// anonymity-floor.mjs: the ONE k-anonymity floor for every aggregate rendered anywhere in the
// product (ADR-035, "One aggregate anonymity floor", accepted 2026-09-25; docs/decisions/
// ADR-035-one-aggregate-anonymity-floor.md). Operator, 2026-09-25, chosen from offered options:
// "One rule: >= 10 + <= 25%." A single floor governs the Community benchmark (spec 07, amended:
// "Aggregated, historical, >= 10 contributors, no contributor > 25%") AND the population /
// "on behalf of many" aggregate view (ADR-034 Open Item 1) alike, one helper, not two independently
// maintained numbers.
//
// PURE. No database, no I/O. Every aggregate reader imports this instead of hand-writing its own
// `orgCount >= 10` / `maxShare <= 0.25` check, so the floor can only ever be changed in one place and
// every consumer moves together.
//
// NOT the antitrust write-time posting guard (src/lib/community/antitrust.mjs kAnonymity/
// dominanceCap, defaults minContributors=5/capRatio=0.25). That guard answers a different, narrower
// question, "can an individual POST assert a commercially sensitive figure at all", and per
// wave2b-lanes-2026-09-29.md coordinator ruling 4, "the antitrust posting guard and k-anonymity
// mechanics stay unchanged." This module is for DISPLAY: is a computed aggregate eligible to be
// SHOWN as a number, or must the surface render an absence state instead.

/**
 * The single anonymity floor (ADR-035). `minOrgs`: at least this many DISTINCT contributing
 * organisations. `maxShare`: no single contributing organisation may hold more than this fraction
 * (0-1) of the aggregate. Frozen so a caller cannot mutate the shared constant out from under every
 * other consumer.
 */
export const FLOOR = Object.freeze({
  minOrgs: 10,
  maxShare: 0.25,
});

/**
 * Does this candidate aggregate clear the ADR-035 floor?
 *
 * @param {{ orgCount: number, maxShare: number }} candidate
 *   orgCount: distinct contributing organisations in the pool (never row/response count).
 *   maxShare: the largest single organisation's share of the aggregate, 0-1.
 * @returns {boolean} true only when orgCount >= FLOOR.minOrgs AND maxShare <= FLOOR.maxShare.
 */
export function meetsFloor({ orgCount, maxShare }) {
  const orgs = Number.isFinite(orgCount) ? orgCount : 0;
  const share = Number.isFinite(maxShare) ? maxShare : 1;
  return orgs >= FLOOR.minOrgs && share <= FLOOR.maxShare;
}
