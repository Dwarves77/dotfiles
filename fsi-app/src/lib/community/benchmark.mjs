// benchmark.mjs — aggregate-only structured instrument support (spec 05 §3, required component 4;
// §1, required component 3). PURE. Shared by scripts/community/seed-benchmark-instruments.mjs (the
// house-seeded recurring benchmark) and src/app/api/community/benchmarks/current/route.ts (the read
// path), so the antitrust gates below are evaluated identically wherever a benchmark result is either
// produced or served.
//
// This module builds the CANDIDATE aggregate from a pool of responses using the same three pure gates
// antitrust.mjs exports (k-anonymity, dominance cap, three-month lag). The REAL, DB-enforced version of
// this same gate — with a durable audit log and defence against the query-set-size/tracker attack this
// module does not attempt to model — is migration 287's `publish_aggregate()` SQL function, which
// migration 294 gives a live subject by registering `community_benchmark_responses` in
// `sensitive_field_policy`. This module's job is the two things `publish_aggregate()` cannot do without a
// live database: (a) be unit-tested in CI on constructed fixtures, and (b) shape a scoped, calendar-aware
// LIST of instruments for a reader's portfolio — `publish_aggregate()` answers "can THIS one field
// publish," not "which benchmarks does this reader's sector see this quarter."

import { kAnonymity, dominanceCap, threeMonthLag } from "./antitrust.mjs";

// LANE NOTICES ADDITION (complete-system build plan W4.3/publish_aggregate() wiring, 2026-09-05):
// publish_aggregate() (migration 287) got a real, registered subject in migration 294
// (community_benchmark_responses.value_numeric) but, until this lane, no runtime caller — the aggregate
// route below computed and served this module's JS-only gate and never called the DB function at all.
// distinctOrganisationKeys() + applyPublishAggregateGate() are the two small, pure pieces the route
// needs to call the RPC and fold its verdict in; see GET /api/community/benchmarks/current/route.ts for
// the actual call and its own header for why publish_aggregate() is consulted WITHOUT `member_values`
// (its generic (table,column) policy sums rather than averages, which would be a wrong published figure
// for a rate/percentage field — this module's own aggregateBenchmarkResponses() below already computes
// the correct statistic; publish_aggregate() instead supplies the real audit log and the longitudinal
// freeze / tracker-attack / complementary-suppression defences this module's own header says it does not
// attempt to model).

/**
 * Filters+shapes a pool of raw responses into `{organisationKey, value}` rows, deduplicating so a
 * repeat submission from the same organisation for the same instrument never inflates the pool (spec
 * 05 §1: "Five submissions from one company is one contributor" — migration 287's own framing, carried
 * here). The MOST RECENT submission per organisation wins.
 *
 * @param {Array<{ organisationKey: string, valueNumeric?: number|null, submittedAt: string }>} responses
 * @returns {Array<{ organisationKey: string, value: number|undefined }>}
 */
function dedupeByOrganisation(responses) {
  const latest = new Map();
  for (const r of responses ?? []) {
    if (!r?.organisationKey) continue;
    const prior = latest.get(r.organisationKey);
    if (!prior || new Date(r.submittedAt) >= new Date(prior.submittedAt)) {
      latest.set(r.organisationKey, r);
    }
  }
  return Array.from(latest.values()).map((r) => ({
    organisationKey: r.organisationKey,
    value: typeof r.valueNumeric === "number" ? r.valueNumeric : undefined,
  }));
}

/**
 * Computes the publishable aggregate for one instrument, or refuses with a reason (spec 05 §1: refuse,
 * never publish a partial/gated figure).
 *
 * @param {{ key: string, periodEnd?: string|null, closesAt?: string|null }} instrument
 * @param {Array<{ organisationKey: string, valueNumeric?: number|null, submittedAt: string }>} responses
 * @param {Date} [now]
 * @returns {{
 *   instrumentKey: string, publishable: boolean, distinctOrganisations: number, minContributors: number,
 *   maxShare: number, ageDays: number, value: number|null, responseCount: number, reason: string|null,
 * }}
 */
export function aggregateBenchmarkResponses(instrument, responses, now = new Date()) {
  const pool = dedupeByOrganisation(responses);
  const k = kAnonymity(pool);
  const d = dominanceCap(pool);
  const asOfDate = instrument?.periodEnd ?? instrument?.closesAt ?? null;
  const lag = threeMonthLag(asOfDate, now);
  const publishable = k.satisfied && d.satisfied && lag.satisfied;

  const numericValues = pool.map((p) => p.value).filter((v) => typeof v === "number");
  const mean = numericValues.length > 0 ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length : null;

  const failing = [];
  if (!k.satisfied) failing.push(`k-anonymity (${k.distinctOrganisations}/${k.minContributors} organisations)`);
  if (!d.satisfied) failing.push(`dominance cap (largest organisation holds ${(d.maxShare * 100).toFixed(0)}%)`);
  if (!lag.satisfied) failing.push(`three-month lag (${lag.ageDays} day(s) old)`);

  return {
    instrumentKey: instrument?.key ?? null,
    publishable,
    distinctOrganisations: k.distinctOrganisations,
    minContributors: k.minContributors,
    maxShare: d.maxShare,
    ageDays: lag.ageDays,
    value: publishable ? mean : null,
    responseCount: pool.length,
    reason: publishable ? null : `not yet publishable: ${failing.join(", ")}`,
  };
}

/**
 * The antitrust COHORT for one instrument's response pool — the distinct, deduplicated organisation
 * keys `publish_aggregate()`'s `member_ids` cohort filter expects (migration 287 §5.2's k-anonymity,
 * freeze and tracker-attack checks all key off this exact set). Reuses `dedupeByOrganisation`'s own
 * "most recent submission per organisation" rule so the cohort passed to the DB gate is always the SAME
 * set `aggregateBenchmarkResponses()` above counted for its own k-anonymity check — one dedup rule, not
 * two independently-maintained copies of it.
 *
 * @param {Array<{ organisationKey: string, valueNumeric?: number|null, submittedAt: string }>} responses
 * @returns {string[]}
 */
export function distinctOrganisationKeys(responses) {
  return dedupeByOrganisation(responses).map((r) => r.organisationKey);
}

/**
 * Folds `publish_aggregate()`'s verdict into this module's own JS-computed aggregate. The RPC is
 * consulted for its REFUSAL only (see this file's header for why its `value` is never used here); when
 * it refuses, that refusal OVERRIDES an otherwise-publishable JS aggregate — the DB gate's freeze /
 * tracker-attack / complementary-suppression checks are real protections the JS gate above does not
 * attempt, so a "yes" from the JS gate is never the last word once the RPC actually answered. When the
 * RPC did not run or did not answer (`gateResult` null/undefined, or `refused` not `true`), the JS
 * aggregate passes through unchanged — the fail-soft posture GET .../current/route.ts documents for an
 * RPC error or a zero-response instrument (nothing to gate).
 *
 * @template {{ publishable: boolean, value: number|null, reason: string|null }} T
 * @param {T} aggregate the full aggregateBenchmarkResponses() result (or any object at least that
 *   shaped) — generic so the caller's extra fields (distinctOrganisations, minContributors, etc.) pass
 *   through untouched rather than being narrowed away by this function's own return type.
 * @param {{ refused: boolean, reason: string|null }|null|undefined} gateResult
 * @returns {T}
 */
export function applyPublishAggregateGate(aggregate, gateResult) {
  if (!gateResult || gateResult.refused !== true) return aggregate;
  return {
    ...aggregate,
    publishable: false,
    value: null,
    reason: gateResult.reason || aggregate.reason || "refused by publish_aggregate()",
  };
}

/**
 * Scopes a list of house-seeded instruments to a reader's portfolio (spec 05 §3: "scoped to the reader's
 * portfolio"). An instrument with `sectorProfile: null` is cross-sector (visible to everyone); one with a
 * sector set is visible only to a reader whose own `sectorProfile` array includes it. Region works the
 * same way with `region`/`readerRegion`.
 *
 * @param {Array<{ sectorProfile?: string|null, region?: string|null }>} instruments
 * @param {{ sectorProfile?: string[], region?: string|null }} reader
 * @returns {Array<object>}
 */
export function scopeBenchmarksForReader(instruments, reader) {
  const readerSectors = new Set(reader?.sectorProfile ?? []);
  const readerRegion = reader?.region ?? null;
  return (instruments ?? []).filter((inst) => {
    const sectorOk = !inst.sectorProfile || readerSectors.has(inst.sectorProfile);
    const regionOk = !inst.region || inst.region === "GLOBAL" || inst.region === readerRegion;
    return sectorOk && regionOk;
  });
}

/**
 * Calendar-driven scheduling (spec 05 §3: "a fixed-calendar, in-product, recurring benchmark poll").
 * True when `now` falls within `[opensAt, closesAt)` — the ONLY window an instrument is open for new
 * responses; a house-seeded run outside this window is a no-op (see the seeder script).
 *
 * @param {{ opensAt: string, closesAt: string }} instrument
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isOpenForResponses(instrument, now = new Date()) {
  const opens = new Date(instrument?.opensAt);
  const closes = new Date(instrument?.closesAt);
  if (Number.isNaN(opens.getTime()) || Number.isNaN(closes.getTime())) return false;
  return now.getTime() >= opens.getTime() && now.getTime() < closes.getTime();
}
