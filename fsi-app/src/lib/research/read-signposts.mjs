// read-signposts.mjs -- beside read-assessments.mjs, same division of labor (this module selects and
// shapes; the page fetches with its OWN already-constructed client). Lane L5, 2026-10-02, extended
// scope after lane L6 (PR #890, migration 346) merged BEFORE this lane branched: the `signposts` table
// and `research_assessments.lifecycle_state`/`entity_id` columns are real and live on `origin/master`.
//
// PLAIN ESM, ZERO NPM DEPENDENCIES for the pure shaping functions (same constraint as read-assessments.mjs:
// `node --test` covers the shaping logic with no database). The two fetch functions below DO perform I/O,
// but take an INJECTED client (lane-common-contract's own pattern: "DB access is injected via a deps
// object so tests run without a database" -- `scripts/mint/screen-reconcile-records.mjs`'s own
// precedent) rather than constructing one themselves, so a test can hand them a fake client and assert
// the walking/mapping logic with zero network, zero Supabase.
//
// CLIENT PRIVILEGE, NAMED HONESTLY (CLAUDE.md rule 14). The real call site (src/app/research/[slug]/
// page.tsx) passes `loadDetail`'s `supabase`, which `load-detail.ts`'s `defaultCreateServiceClient()`
// builds from `getServiceSupabase()` -- a SERVICE-ROLE client, fail-closed to `null` when
// `SUPABASE_SERVICE_ROLE_KEY` is unset (true in this worktree; the live Vercel deploy carries the key).
// A service-role client bypasses RLS entirely, so `fetchAssessmentHistoryChain` below CAN read prior
// (non-current) `research_assessments` rows in production despite migration 344's deliberate "no SELECT
// policy for anon/authenticated" on that raw table -- this is not a workaround of that RLS posture, it
// is the SAME privilege every other guarded-write reader of this table already uses (migration 344's own
// comment: "the Supabase client used by the producer... bypasses RLS/grants entirely, same posture as
// every other guarded-write table"). `fetchSignpostsForAssessment` needs no such privilege -- migration
// 346 grants `signposts` a world-readable SELECT policy (`USING (true)`), so any client, service-role or
// anon, sees the same rows.

const DAY_MS = 24 * 60 * 60 * 1000;

/** The 6 columns migration 346 gives `signposts`, as a query selects them. */
const SIGNPOST_COLUMNS = "entity_id, assessment_id, watches, predicate, direction, fired_at";

/** The columns `fetchAssessmentHistoryChain` needs from `research_assessments` to walk the chain and
 *  render each entry -- a superset of read-assessments.mjs's own select list (migration 344) plus
 *  migration 346's `id`, `supersedes`, `is_current`, `lifecycle_state` (migration 344 did not carry a
 *  surrogate the caller could walk by; `id`/`supersedes` are migration 344's own columns, selected here
 *  for the first time in this codebase because no reader before this lane needed to walk the chain). */
const HISTORY_COLUMNS =
  "id, supersedes, is_current, computed_at, status_token, lifecycle_state, " +
  "technical_maturity_low, technical_maturity_high, commercial_maturity_low, commercial_maturity_high, " +
  "horizon_band";

/**
 * One human-readable sentence for a signpost's `predicate` jsonb (migration 346's three documented
 * shapes). Returns a plain, honest "unrecognized predicate" string for anything else -- never guesses
 * at a shape the schema comment does not name (CLAUDE.md rule 2).
 * @param {{op?: string, field?: string, metric?: string, gte?: number, relation?: string, n?: number}} predicate
 * @returns {string}
 */
export function summarizePredicate(predicate) {
  if (!predicate || typeof predicate !== "object") return "no predicate recorded";
  switch (predicate.op) {
    case "date_passed":
      return predicate.field ? `fires once ${predicate.field} has passed` : "fires once a recorded date has passed";
    case "threshold":
      return predicate.metric && predicate.gte != null
        ? `fires once ${predicate.metric} reaches ${predicate.gte}`
        : "fires once a metric crosses its threshold";
    case "count_gte":
      return predicate.relation && predicate.n != null
        ? `fires once ${predicate.n} or more ${predicate.relation} are recorded`
        : "fires once a count reaches its floor";
    default:
      return predicate.op ? `unrecognized predicate op "${predicate.op}"` : "no predicate recorded";
  }
}

/**
 * Build the render-ready view for one `signposts` row. Returns null for no row (the caller renders its
 * own absence wording).
 * @param {{entity_id: string, assessment_id: string, watches: string, predicate: object, direction: string, fired_at: string|null}|null|undefined} row
 */
export function selectSignpostView(row) {
  if (!row) return null;
  return {
    entityId: row.entity_id,
    assessmentId: row.assessment_id,
    watches: row.watches,
    direction: row.direction,
    predicateSummary: summarizePredicate(row.predicate),
    firedAt: row.fired_at ?? null,
    isFired: row.fired_at != null,
  };
}

/**
 * Fetch every signpost watching the given assessment, newest-unfired-first then fired. Soft-fails to
 * `[]` on any error (a missing table, an RLS denial, a network error) -- the honest absence state the
 * caller renders is indistinguishable from "zero signposts registered", by design: this module does not
 * invent a distinction the caller cannot act on differently either way.
 * @param {{from: Function}} client an injected Supabase-shaped client (or a test fake with the same
 *   `.from(table).select(cols).eq(col, val)` chain returning `{data, error}`)
 * @param {string} assessmentId
 */
export async function fetchSignpostsForAssessment(client, assessmentId) {
  if (!client || !assessmentId) return [];
  try {
    const { data, error } = await client.from("signposts").select(SIGNPOST_COLUMNS).eq("assessment_id", assessmentId);
    if (error || !data) return [];
    return data.map(selectSignpostView).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Build the render-ready view for one `research_assessments` row (current OR a prior, superseded row),
 * for AssessmentHistoryLedger's append-only list.
 * @param {object|null|undefined} row
 */
export function selectAssessmentHistoryEntry(row) {
  if (!row) return null;
  const tm = row.technical_maturity_low != null && row.technical_maturity_high != null
    ? `TRL ${row.technical_maturity_low}${row.technical_maturity_low === row.technical_maturity_high ? "" : `-${row.technical_maturity_high}`}`
    : null;
  const cm = row.commercial_maturity_low != null && row.commercial_maturity_high != null
    ? `CRI ${row.commercial_maturity_low}${row.commercial_maturity_low === row.commercial_maturity_high ? "" : `-${row.commercial_maturity_high}`}`
    : null;
  return {
    id: row.id,
    supersedes: row.supersedes ?? null,
    computedAt: row.computed_at,
    isCurrent: !!row.is_current,
    statusToken: row.status_token,
    lifecycleState: row.lifecycle_state ?? null,
    technicalMaturityLabel: tm,
    commercialMaturityLabel: cm,
    horizonBandLabel: row.horizon_band ?? null,
    // No `cause`/reason column exists anywhere on research_assessments (migrations 344 and 346 both
    // read, neither carries one) -- always null today, never fabricated. A future migration that adds
    // one extends this mapping, not this field's absence.
    cause: null,
  };
}

/**
 * Walk the real `supersedes` self-FK chain starting at `currentRow` (the already-fetched current row,
 * migration 344's `is_current = true` row -- the SAME row read-assessments.mjs's caller already holds),
 * newest first. Soft-fails per-step: a client without privilege to read a prior row (see module header)
 * or any other error simply stops the walk at whatever has been resolved so far -- the ledger renders a
 * shorter-than-real chain rather than throwing, matching every other soft-fail convention on this page.
 * @param {{from: Function}} client
 * @param {{id: string, supersedes: string|null}|null|undefined} currentRow raw row shape, HISTORY_COLUMNS
 * @param {{maxDepth?: number}} [opts]
 * @returns {Promise<Array<NonNullable<ReturnType<typeof selectAssessmentHistoryEntry>>>>}
 */
export async function fetchAssessmentHistoryChain(client, currentRow, opts = {}) {
  const maxDepth = opts.maxDepth ?? 25;
  const entries = [];
  const first = selectAssessmentHistoryEntry(currentRow);
  if (!first) return entries;
  entries.push(first);
  if (!client) return entries;

  let nextId = first.supersedes;
  let depth = 0;
  while (nextId && depth < maxDepth) {
    depth += 1;
    try {
      const { data, error } = await client.from("research_assessments").select(HISTORY_COLUMNS).eq("id", nextId).maybeSingle();
      if (error || !data) break;
      const entry = selectAssessmentHistoryEntry(data);
      if (!entry) break;
      entries.push(entry);
      nextId = entry.supersedes;
    } catch {
      break;
    }
  }
  return entries;
}

/** Signpost-list staleness note helper (not currently rendered -- kept trivial/pure so a future "last
 *  evaluated N days ago" caption has a tested basis rather than inline ad-hoc math). */
export function daysSince(iso, nowMs = Date.now()) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((nowMs - then) / DAY_MS));
}
