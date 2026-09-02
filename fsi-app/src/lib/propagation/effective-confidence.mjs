// effective-confidence.mjs — the JS mirror of migration 285's SQL `effective_confidence()` (docs/specs/
// 08-flywheel-design.md §3.2, byte-identical formula). Lane DP-ENGINE, system-completion train,
// 2026-09-02.
//
// WHY A MIRROR RATHER THAN ONE SHARED IMPLEMENTATION. The SQL function is what actually computes the
// value the database stores/serves (derived_values_admissible's effective_confidence column); this JS
// function is what admissible-for.ts calls when it is handed a Value object already read out of the DB
// (or a fixture in a test) rather than issuing a second round-trip to ask Postgres to recompute a number
// it could derive locally. The two must AGREE — effective-confidence.test.mjs proves it on fixtures
// (including the exact half-life-arithmetic table ADR-024 §3 works through for the FLOOR ruling), and
// this file's own header states the formula is transcribed, not re-derived, from the SQL text.
//
// PURE. TIME IS INJECTED, NEVER READ (same discipline src/lib/contracts/envelope.mjs states for itself):
// every call takes `nowMs`/`nowIso` explicitly rather than calling Date.now() internally.

/**
 * Mirrors migration 285's `effective_confidence(base, asserted_at, half_life_days, now_ts)` SQL function,
 * which mirrors spec §3.2's own formula: `base * 0.5 ^ (age_days / half_life_days)`, rounded to 3 decimal
 * places. `half_life_days` null/undefined means NO DECAY (spec §3.2: statutory text) — returns `base`
 * unchanged regardless of age, exactly as the SQL function's `CASE WHEN half_life_days IS NULL` branch
 * does.
 *
 * @param {number} base - base_confidence, 0..1
 * @param {string|Date} assertedAt - when the value was asserted (ISO string or Date)
 * @param {number|null|undefined} halfLifeDays - null/undefined = no decay
 * @param {string|Date} now - the current instant, injected
 * @returns {number} effective confidence, rounded to 3 decimal places
 */
export function effectiveConfidence(base, assertedAt, halfLifeDays, now) {
  if (typeof base !== "number" || !Number.isFinite(base)) {
    throw new TypeError(`effectiveConfidence: base must be a finite number (got ${JSON.stringify(base)})`);
  }
  if (halfLifeDays === null || halfLifeDays === undefined) {
    return base;
  }
  if (typeof halfLifeDays !== "number" || !Number.isFinite(halfLifeDays) || halfLifeDays <= 0) {
    throw new TypeError(`effectiveConfidence: halfLifeDays must be null or a positive finite number (got ${JSON.stringify(halfLifeDays)})`);
  }
  const assertedMs = assertedAt instanceof Date ? assertedAt.getTime() : Date.parse(assertedAt);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(assertedMs)) throw new TypeError(`effectiveConfidence: assertedAt is not a parseable date (${JSON.stringify(assertedAt)})`);
  if (!Number.isFinite(nowMs)) throw new TypeError(`effectiveConfidence: now is not a parseable date (${JSON.stringify(now)})`);

  const ageDays = (nowMs - assertedMs) / 86_400_000;
  const raw = base * Math.pow(0.5, ageDays / halfLifeDays);
  // Match SQL's round(numeric, 3): round-half-away-from-zero at the 3rd decimal, not JS's binary-float
  // toFixed (which can round-half-to-even or misround on some inputs). A value ≥ 0 in this domain (a
  // confidence score never negative) makes plain Math.round the correct, simple choice.
  return Math.round(raw * 1000) / 1000;
}

/** Age in days at which `effectiveConfidence` first drops BELOW `floor`, starting from `base=1.0` —
 *  the exact algebra ADR-024 §3's own table works through (`half_life_days * ln(floor) / ln(0.5)`).
 *  Pure convenience for tests/reporting; not used by admissibleFor() itself (which compares the actual
 *  decayed value against FLOOR[use] directly, per spec §3.3). Returns Infinity for a null half-life
 *  (never crosses any floor) and null for floor <= 0 or floor >= 1 (crossed instantly / never, both
 *  degenerate).
 * @param {number} halfLifeDays
 * @param {number} floor
 * @returns {number|null}
 */
export function ageDaysAtFloor(halfLifeDays, floor) {
  if (halfLifeDays === null || halfLifeDays === undefined) return Infinity;
  if (typeof floor !== "number" || !(floor > 0) || !(floor < 1)) return null;
  return (halfLifeDays * Math.log(floor)) / Math.log(0.5);
}
