// The number envelope. NO FIGURE SHIPS WITHOUT ONE.
//
// WHY THIS FILE EXISTS (surface spec 00 §2 and 02 §1, 2026-08-12). A professional price is never a
// scalar. The fields below are the intersection of the IOSCO Principles for Oil Price Reporting
// Agencies (PD391), the Platts assessment methodology and Argus's published specifications — the three
// documents that decide whether a number can be written into a contract or only into a newsletter.
//
// The 2026-08-11 re-verification found Market Intel rendering a "key figure" column bound to
// `marketData`, a field with NO PRODUCER anywhere in src, and an Operations masthead claiming "every
// fact carries a source and date" over fact rows that have no date field and a NULL source_id. Both are
// the same defect: a number rendered without the jacket that says what it is. This module makes that
// state unconstructable rather than merely discouraged — makeEnvelope THROWS.
//
// PLAIN ESM, ZERO DEPENDENCIES, same constraint and same reason as vocabularies.mjs and surface-of.mjs.
//
// TIME IS INJECTED, NEVER READ. Every function that needs "now" takes it as an argument. Pure functions
// are testable, deterministic and safe to run in the discipline CI; a module that reads the clock is
// none of those.

import { OBS_STATUS, ORIGIN_CLASS, FRESHNESS, isMissing } from "./vocabularies.mjs";

/**
 * HOW A NUMBER WAS PRODUCED. IOSCO 2.3(a) mandates disclosing whether a value is transaction-based,
 * spread-based or interpolated/extrapolated. This is the single most load-bearing field in the
 * envelope: it is what separates an observation from a guess, and rendering the two identically is the
 * defect this whole module exists to prevent.
 *
 * `contractable` marks the classes a customer may reasonably put in a contract or a filing.
 */
export const DERIVATION = Object.freeze({
  observed: Object.freeze({
    code: "observed", label: "Observed", order: 1, contractable: true,
    note: "Measured or reported directly by the primary source.",
  }),
  transacted_index: Object.freeze({
    code: "transacted_index", label: "Transacted index", order: 2, contractable: true,
    note: "Mechanical aggregation of reported deals. No judgment. Goes dark in illiquid conditions.",
  }),
  assessed: Object.freeze({
    code: "assessed", label: "Assessed", order: 3, contractable: true,
    note: "Expert judgment of market value at a timestamp, under a published data hierarchy. Always prints.",
  }),
  calculated: Object.freeze({
    code: "calculated", label: "Calculated", order: 4, contractable: true,
    note: "Deterministic function of other observed values under a named method.",
  }),
  interpolated: Object.freeze({
    code: "interpolated", label: "Interpolated", order: 5, contractable: false,
    note: "Inferred between known points. Not an observation.",
  }),
  modelled: Object.freeze({
    code: "modelled", label: "Modelled", order: 6, contractable: false,
    note: "Model output. Must never share a visual slot with an observed or statutory figure.",
  }),
  estimated: Object.freeze({
    code: "estimated", label: "Estimated", order: 7, contractable: false,
    note: "Judgment without a fitted model. Must name its donor or basis.",
  }),
});

export const DERIVATIONS = Object.freeze(Object.keys(DERIVATION));

/** May a value of this derivation class be put in a contract or a regulatory filing? */
export function isContractable(derivation) {
  return DERIVATION[derivation]?.contractable === true;
}

/** Fields required on every envelope. Absence of any one makes the number uninterpretable. */
const REQUIRED = Object.freeze(["derivation", "unit", "as_of"]);

function isIsoDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) return false;
  return !Number.isNaN(Date.parse(s));
}

/**
 * Validate an envelope. Returns an array of human-readable errors; empty means valid.
 *
 * Deliberately permissive about OPTIONAL richness (basis, n, method, judgment_note) and strict about
 * the three fields without which a reader cannot interpret the number at all. Being strict about
 * everything would guarantee the envelope gets bypassed.
 */
export function validateEnvelope(env) {
  const errors = [];
  if (!env || typeof env !== "object" || Array.isArray(env)) return ["envelope must be an object"];

  for (const f of REQUIRED) {
    if (env[f] === undefined || env[f] === null || env[f] === "") errors.push(`missing required field: ${f}`);
  }

  // Optional enum fields: null and undefined both mean ABSENT and are equally acceptable. Only a
  // non-empty value that is not a member is an error. (First pass checked `!== undefined` only, while
  // makeEnvelope defaults these to null — so the constructor and the validator disagreed about what
  // absent means and every envelope without an explicit origin_class threw. The proofs caught it.)
  const stated = (v) => v !== undefined && v !== null && v !== "";

  if (stated(env.derivation) && !DERIVATION[env.derivation]) {
    errors.push(`unknown derivation: ${String(env.derivation)}`);
  }
  if (stated(env.obs_status) && !OBS_STATUS[env.obs_status]) {
    errors.push(`unknown obs_status: ${String(env.obs_status)}`);
  }
  if (stated(env.origin_class) && !ORIGIN_CLASS[env.origin_class]) {
    errors.push(`unknown origin_class: ${String(env.origin_class)}`);
  }

  // The as-of TRIPLE. Three different facts, and a bare "last updated" conflates all three:
  //   event_date          — when the thing being measured happened
  //   source_published_at — when the source published it
  //   ingested_at         — when we read it
  // A weekly bulletin read today about last Monday has three different answers, and a reader who
  // cannot tell them apart cannot judge whether the number is late or merely about the past.
  if (env.as_of !== undefined && env.as_of !== null) {
    if (typeof env.as_of !== "object" || Array.isArray(env.as_of)) {
      errors.push("as_of must be an object with event_date / source_published_at / ingested_at");
    } else {
      if (!isIsoDate(env.as_of.event_date)) errors.push("as_of.event_date must be an ISO date");
      for (const k of ["source_published_at", "ingested_at"]) {
        if (env.as_of[k] !== undefined && env.as_of[k] !== null && !isIsoDate(env.as_of[k])) {
          errors.push(`as_of.${k} must be an ISO date when present`);
        }
      }
    }
  }

  if (env.n !== undefined && env.n !== null && (!Number.isInteger(env.n) || env.n < 0)) {
    errors.push("n must be a non-negative integer when present");
  }
  if (env.contributor_count !== undefined && env.contributor_count !== null
    && (!Number.isInteger(env.contributor_count) || env.contributor_count < 0)) {
    errors.push("contributor_count must be a non-negative integer when present");
  }

  // A range must be ordered and must bracket the value. An unordered range is a data-entry bug that
  // silently renders as a plausible band.
  const hasLo = env.low !== undefined && env.low !== null;
  const hasHi = env.high !== undefined && env.high !== null;
  if (hasLo !== hasHi) errors.push("low and high must be provided together");
  if (hasLo && hasHi) {
    if (typeof env.low !== "number" || typeof env.high !== "number") errors.push("low and high must be numbers");
    else if (env.low > env.high) errors.push("low must be <= high");
    else if (typeof env.value === "number" && (env.value < env.low || env.value > env.high)) {
      errors.push("value must lie within [low, high]");
    }
  }

  // A missing observation must not carry a value. This is the zero-fill guard: a missing emission
  // factor is M, never 0, and 0 is a real and very wrong number in an emissions product.
  if (env.obs_status !== undefined && isMissing(env.obs_status)
    && env.value !== undefined && env.value !== null) {
    errors.push(`obs_status ${env.obs_status} denotes a missing observation but a value is present (zero-fill guard)`);
  }

  return errors;
}

/**
 * Construct a validated envelope. THROWS on invalid input, by design: the whole point is that an
 * envelope-less or malformed number should be unconstructable, not merely discouraged.
 *
 * `value` may legitimately be null when obs_status denotes a missing observation — that is how absence
 * is represented, and it is why `value` is not in REQUIRED.
 */
export function makeEnvelope(input) {
  const env = {
    value: input?.value ?? null,
    low: input?.low ?? null,
    high: input?.high ?? null,
    unit: input?.unit ?? null,
    currency: input?.currency ?? null,
    fx_date: input?.fx_date ?? null,
    basis: input?.basis ?? null,
    derivation: input?.derivation ?? null,
    obs_status: input?.obs_status ?? "A",
    origin_class: input?.origin_class ?? null,
    as_of: input?.as_of ?? null,
    expected_refresh: input?.expected_refresh ?? null,
    n: input?.n ?? null,
    contributor_count: input?.contributor_count ?? null,
    method: input?.method ?? null,
    method_version: input?.method_version ?? null,
    judgment_note: input?.judgment_note ?? null,
    provenance: input?.provenance ?? null,
  };
  const errors = validateEnvelope(env);
  if (errors.length) throw new TypeError(`invalid number envelope: ${errors.join("; ")}`);
  return Object.freeze(env);
}

/** Cadence names to their nominal period in days. `null` means the source publishes irregularly. */
export const REFRESH_PERIOD_DAYS = Object.freeze({
  realtime: 1,
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 31,
  quarterly: 92,
  biannual: 183,
  annual: 366,
  irregular: null,
});

/**
 * Derive freshness. NEVER ASSERTED, always computed from the as-of triple plus the cadence.
 *
 *   current  — within one nominal period
 *   ageing   — between one and two periods (late, but sources slip)
 *   stale    — beyond two periods
 *   frozen   — beyond four periods: the source has STOPPED PUBLISHING, which is categorically
 *              different from late. This is the state that makes a dead feed stop looking alive.
 *              Operations' regional_data_facts producer is frozen today; without this state the
 *              surface renders it as though data were merely pending.
 *   unknown  — no cadence declared, so no judgment is possible. Not a synonym for current.
 *
 * Measured from `source_published_at` where available, falling back to `event_date`: what matters for
 * staleness is when the SOURCE last spoke, not when the underlying event occurred and not when we
 * happened to read it.
 */
export function stalenessOf(env, nowIso) {
  const cadence = env?.expected_refresh;
  if (!cadence || !(cadence in REFRESH_PERIOD_DAYS)) return "unknown";
  const period = REFRESH_PERIOD_DAYS[cadence];
  if (period === null) return "unknown";

  const ref = env?.as_of?.source_published_at || env?.as_of?.event_date;
  if (!isIsoDate(ref) || !isIsoDate(nowIso)) return "unknown";

  const days = (Date.parse(nowIso) - Date.parse(ref)) / 86_400_000;
  if (days < 0) return "current"; // clock skew or a forward-dated release; never report negative age
  if (days <= period) return "current";
  if (days <= period * 2) return "ageing";
  if (days <= period * 4) return "stale";
  return "frozen";
}

/** True when the derived freshness should be rendered with visible degradation. */
export function isDegraded(env, nowIso) {
  return FRESHNESS[stalenessOf(env, nowIso)]?.degraded === true;
}

/**
 * Significant figures a sample of size `n` honestly supports.
 *
 * Publishing EUR 47.83/tCO2e when the honest read is EUR 45 to 50 is the false-precision failure, and
 * it is the fastest way to lose a professional reader. The ladder is deliberately conservative:
 * n absent or 0 -> 1 sf; n < 5 -> 2 sf; n < 30 -> 3 sf; otherwise 4 sf. Everstream's 0..25 risk scale
 * is the reference for choosing coarseness on purpose.
 */
export function significantFigures(n) {
  if (!Number.isInteger(n) || n <= 0) return 1;
  if (n < 5) return 2;
  if (n < 30) return 3;
  return 4;
}

/** Round a value to the significant figures its sample size supports. Null passes through. */
export function roundToSampleSupport(value, n) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return value;
  return Number(value.toPrecision(significantFigures(n)));
}

/**
 * Format a change with the CORRECT unit. Ratios move in PERCENTAGE POINTS, quantities move in PERCENT.
 *
 * Reporting a load-factor move of "+2%" when it is +2 pp is a tell for an unserious product, and IATA's
 * own air-cargo tables keep the two typographically distinct for exactly this reason. `kind` is
 * required rather than defaulted, because a default here would silently pick a side.
 */
export function formatDelta(delta, kind, digits = 1) {
  if (typeof delta !== "number" || !Number.isFinite(delta)) return null;
  if (kind !== "ratio" && kind !== "quantity") {
    throw new TypeError('formatDelta: kind must be "ratio" (renders pp) or "quantity" (renders %)');
  }
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const mag = Math.abs(delta).toFixed(digits);
  return `${sign}${mag}${kind === "ratio" ? " pp" : "%"}`;
}

/**
 * Roll several envelopes into one, for an aggregate figure.
 *
 * Three propagation rules, all of which exist because the weakest input governs what a reader may do
 * with the result:
 *   - origin_class propagates to the WEAKEST constituent (spec 00 §3.6 rule b);
 *   - derivation propagates to the LEAST contractable constituent, so one modelled input makes the
 *     aggregate non-contractable and says so;
 *   - freshness propagates to the WORST constituent, so one frozen input is visible in the total.
 *
 * Returns the propagated triple plus the constituent count. Callers attach it to their own envelope
 * rather than this function inventing units or a method it cannot know.
 */
export function propagate(envelopes, nowIso) {
  const list = (envelopes || []).filter(Boolean);
  if (!list.length) return { origin_class: null, derivation: null, freshness: "unknown", count: 0 };

  let weakestOrigin = null;
  for (const e of list) {
    const entry = ORIGIN_CLASS[e.origin_class];
    if (!entry) { weakestOrigin = "community"; break; }
    if (weakestOrigin === null || entry.strength < ORIGIN_CLASS[weakestOrigin].strength) {
      weakestOrigin = entry.code;
    }
  }

  let leastContractable = null;
  for (const e of list) {
    const d = DERIVATION[e.derivation];
    if (!d) { leastContractable = "estimated"; break; }
    if (leastContractable === null || d.order > DERIVATION[leastContractable].order) {
      leastContractable = d.code;
    }
  }

  let worstFreshness = "current";
  for (const e of list) {
    const f = stalenessOf(e, nowIso);
    if ((FRESHNESS[f]?.order ?? 0) > (FRESHNESS[worstFreshness]?.order ?? 0)) worstFreshness = f;
  }

  return {
    origin_class: weakestOrigin,
    derivation: leastContractable,
    freshness: worstFreshness,
    count: list.length,
  };
}
