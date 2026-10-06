// prediction-scoring.mjs, lane L4-D (l4d-predictions-reliability), 2026-10-05, ADR-044 decision 4, ADR-043
// (propagation_events is append-only), learning-loop-design-2026-09-25.md section 3 (the prediction shape)
// and section 4 (how learning works without changing a published fact).
//
// WHAT THIS IS. A signpost is a prediction the system made: a research assessment stated a dated
// expectation about an entity (assess.mjs assessSignposts) and the producer wrote it as a signposts row.
// This module closes the loop. After the propagation drain has processed a batch of outbox events, it
//   1. matches the events to the unfired signposts whose `watches` is the event's entity,
//   2. decides each by the existing evaluator (signpost-watch.ts evaluateSignpostPredicate),
//   3. fires the ones that fire (signpost-watch.ts fireSignpost: stamps fired_at, writes the outbox row that
//      flows through the same drain on the next run, moves the assessment's lifecycle),
//   4. SCORES the prediction (below), and
//   5. appends one source_reliability_ledger row per source that grounded the assessment.
// Nothing here writes a tier: the ledger is evidence, and src/lib/trust.ts turns a source's tally of
// outcomes into one more delta inside the existing clamp (the admin override always wins).
//
// SCORING RULE (the whole rule, every clause tested in prediction-scoring.test.mjs).
//   - A signpost that FIRES is scored by its direction: confirms -> held, refutes -> refuted, delays ->
//     partial. scored_by is `signpost_watch@1.0.0`, the method id and version that decided it.
//   - A signpost whose predicate carries an expectation date `by` that has passed (the end of that UTC day)
//     without the signpost having fired is scored refuted. It is not fired (fired_at stays null) and the
//     assessment's lifecycle is left alone: nothing happened, so there is nothing to transition.
//   - An event that occurred after `by` is not a firing: it cannot rescue a prediction whose date has gone,
//     it is counted as late. Such a signpost is refuted by the deadline rule in the same run.
//   - A signpost is scored once. outcome IS NOT NULL ends its life; a scored signpost is never re-read.
//   - A signpost that fired but is still unscored (a crash between the two writes, or the outcome columns
//     were not yet present) is scored by direction on the next run without firing again (REPAIR).
//   Order inside one run: events fire first, repairs score second, the deadline sweep last, so an event in
//   this batch always gets its chance before the clock refutes the prediction.
//
// LEDGER JOIN (stated, not guessed). For a scored signpost: signposts.assessment_id ->
// research_assessments.item_id -> section_claim_provenance.intelligence_item_id, claims of kind FACT or LEGAL
// with a non-null source_id (a GAP is the absence of a source; an ANALYSIS carries none). One ledger row per
// DISTINCT source. A scored signpost with no such source writes no ledger row and is counted.
// Ledger first, score second: a crash between them leaves the signpost unscored, so the next run repairs it,
// and the ledger's UNIQUE (source_id, signpost_entity_id) plus the existing-rows read make the retry
// idempotent.
//
// BUILD MODE. Dry by default: dry computes and reports every count and writes nothing anywhere. Apply writes.
// A drain fired by propagation-drain.yml's chained-dry-guard runs dry while scrape_cadence is off, so a
// chained firing reports and changes nothing (CLAUDE.md rule 16).
//
// READERS TOLERATE ABSENT COLUMNS. Until migration 353 is applied, signposts has no outcome columns and the
// ledger table does not exist. The reads fall back to the six base columns; the step still fires (fired_at,
// outbox row, lifecycle) but cannot score, counts `scoring_skipped_columns_absent`, and the REPAIR path
// scores those signposts once the columns exist.
//
// NO EVENT IS LOST. A per-signpost failure caused by an event is returned as that event's id in
// `failed_event_ids`; run-propagation-drain.mjs carries those ids into the same unfinished-events list the
// questions step uses, and the next run replays them. State-based work (repair, deadline) needs no replay:
// it is retried because the signpost is still unscored.
//
// PLAIN ESM. The one .ts import is the existing signpost watcher, the same Node type-stripping import the
// drain runner already makes of drain.ts.

import { evaluateSignpostPredicate, fireSignpost, METHOD_ID, METHOD_VERSION } from "../propagation/methods/signpost-watch.ts";
import { fetchAllRows, fetchAllByIdChunks } from "../db/paginate.mjs";

export const CITE = Object.freeze({
  skill: "learning-loop-design-2026-09-25",
  reason:
    "Lane L4-D (2026-10-05): ADR-044 decision 4. Scores a signpost (a prediction an assessment stated) when " +
    "the watched entity changes or its expectation date passes, and appends one source_reliability_ledger " +
    "row per source that grounded the assessment. The ledger is evidence; it never writes a tier.",
});

/** direction -> outcome. The scoring rule's first clause. */
export const OUTCOME_BY_DIRECTION = Object.freeze({ confirms: "held", refutes: "refuted", delays: "partial" });

export const OUTCOMES = Object.freeze(["held", "refuted", "partial"]);

/** scored_by recorded on a scored signpost and on its ledger rows: the method id and version. */
export const SCORED_BY = `${METHOD_ID}@${METHOD_VERSION}`;

/** Claim kinds whose source counts as grounding the assessment (a GAP has no source, an ANALYSIS carries none). */
export const GROUNDING_CLAIM_KINDS = Object.freeze(["FACT", "LEGAL"]);

/** Bound on signposts read by the state-based paths (repair, deadline). A signpost leaves them once scored. */
export const STATE_READ_CAP = 5000;

const DAY_MS = 24 * 60 * 60 * 1000;

const SIGNPOST_BASE_COLUMNS = "entity_id,assessment_id,watches,predicate,direction,fired_at";
const SIGNPOST_SCORED_COLUMNS = `${SIGNPOST_BASE_COLUMNS},outcome`;

// ── Pure rules ──────────────────────────────────────────────────────────────────────────────────────

/** @param {string} direction @returns {"held"|"refuted"|"partial"|null} */
export function outcomeForDirection(direction) {
  return OUTCOME_BY_DIRECTION[direction] ?? null;
}

/** The instant after which an expectation date has passed, as epoch ms, or null. A date-only `by` runs to the
 *  end of that UTC day; a `by` with a time part is that exact instant. PURE. @param {object|null} predicate */
export function deadlineMs(predicate) {
  const by = predicate && typeof predicate === "object" ? predicate.by : null;
  if (typeof by !== "string" || !by) return null;
  const t = new Date(by).getTime();
  if (Number.isNaN(t)) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(by) ? t + DAY_MS : t;
}

/** True when the signpost's expectation date has passed at `now`. PURE. */
export function isDeadlinePassed(predicate, now) {
  const d = deadlineMs(predicate);
  return d !== null && d <= now.getTime();
}

/** The score columns written on a signpost. PURE. @param {"held"|"refuted"|"partial"} outcome @param {Date} now */
export function scorePatch(outcome, now) {
  return { outcome, outcome_assessed_at: now.toISOString(), scored_by: SCORED_BY };
}

/** One ledger row per distinct grounding source. PURE. Order is the order sources are first seen. */
export function buildLedgerRows({ signpostEntityId, assessmentId, outcome, sourceIds, now }) {
  const seen = new Set();
  const rows = [];
  for (const sid of sourceIds ?? []) {
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    rows.push({
      source_id: sid,
      signpost_entity_id: signpostEntityId,
      outcome,
      scored_at: now.toISOString(),
      scored_by: SCORED_BY,
      assessment_id: assessmentId,
    });
  }
  return rows;
}

/** The row a signpost predicate is evaluated against for one outbox event: the changed row the outbox
 *  recorded, plus the event's own facts (so a `date_passed` on `occurred_at` reads the event time). PURE. */
export function watchedRowForEvent(event) {
  return { ...(event.newRow && typeof event.newRow === "object" ? event.newRow : {}), occurred_at: event.occurredAt, change_kind: event.changeKind ?? null, table_name: event.tableName };
}

/** Normalise a signposts row read from the database into the SignpostRow shape signpost-watch.ts uses. PURE. */
export function toSignpostRow(r) {
  return {
    entityId: r.entity_id,
    assessmentId: r.assessment_id,
    watches: r.watches,
    predicate: r.predicate,
    direction: r.direction,
    firedAt: r.fired_at ?? null,
  };
}

/**
 * Match this run's events to unfired signposts. PURE. Events are taken oldest first (occurredAt, then id) and
 * a signpost fires on the FIRST event that satisfies it. An event that came from a signpost firing
 * (table_name 'signposts') is skipped and counted: it is the outbox row of a firing, not a change to the
 * watched entity's own data, and it flows through the drain on its own.
 * @param {Array<object>} events processed events (drain.ts ProcessedEvent)
 * @param {Array<object>} signposts signposts rows (database column names)
 * @param {Date} now
 * @returns {{fires: Array<{signpost: object, event: object, reason: string}>, evaluated: number, late: number,
 *   signpostOriginEvents: number, eventsNoEntity: number, eventsMatched: number}}
 */
export function matchEventsToSignposts(events, signposts, now) {
  const out = { fires: [], evaluated: 0, late: 0, signpostOriginEvents: 0, eventsNoEntity: 0, eventsMatched: 0 };
  const byEntity = new Map();
  for (const sp of signposts) {
    if (sp.fired_at) continue;
    if (!byEntity.has(sp.watches)) byEntity.set(sp.watches, []);
    byEntity.get(sp.watches).push(sp);
  }
  const ordered = [...events].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime() || Number(a.eventId) - Number(b.eventId));
  const fired = new Set();
  const matchedEvents = new Set();
  for (const ev of ordered) {
    if (ev.tableName === "signposts") { out.signpostOriginEvents += 1; continue; }
    if (!ev.entityId) { out.eventsNoEntity += 1; continue; }
    for (const sp of byEntity.get(ev.entityId) ?? []) {
      if (fired.has(sp.entity_id)) continue;
      matchedEvents.add(ev.eventId);
      const d = deadlineMs(sp.predicate);
      if (d !== null && new Date(ev.occurredAt).getTime() >= d) { out.late += 1; continue; }
      out.evaluated += 1;
      const verdict = evaluateSignpostPredicate(sp.predicate, watchedRowForEvent(ev), now);
      if (verdict.fired) {
        fired.add(sp.entity_id);
        out.fires.push({ signpost: sp, event: ev, reason: verdict.reason });
      }
    }
  }
  out.eventsMatched = matchedEvents.size;
  return out;
}

// ── The step (orchestration over injected deps) ───────────────────────────────────────────────────────

/** An empty counts object. */
function emptyCounts() {
  return {
    events_seen: 0, events_matched: 0, events_no_entity: 0, events_signpost_origin: 0, events_late: 0,
    signposts_evaluated: 0, signposts_fired: 0,
    scored: 0, scored_held: 0, scored_refuted: 0, scored_partial: 0,
    scored_by_event: 0, scored_by_repair: 0, scored_by_deadline: 0,
    ledger_rows_planned: 0, ledger_rows_written: 0, ledger_rows_existing: 0, scored_without_sources: 0,
    scoring_skipped_columns_absent: 0, errors: 0,
  };
}

/**
 * Run the signpost step over the events a drain just processed.
 * @param {{mode: "dry"|"apply", events: Array<object>, now?: Date, sweep?: boolean, deps: {
 *   readSignpostsWatching: (entityIds: string[]) => Promise<Array<object>>,
 *   readFiredUnscored: () => Promise<Array<object>>,
 *   readDeadlineCandidates: () => Promise<Array<object>>,
 *   columnsAbsent: () => boolean,
 *   readAssessments: (ids: string[]) => Promise<Map<string, {item_id: string|null, lifecycle_state: string}>>,
 *   readGroundingSources: (itemIds: string[]) => Promise<Map<string, string[]>>,
 *   readLedgerSources: (signpostEntityId: string) => Promise<string[]>,
 *   fire: (args: {signpost: object, currentLifecycleState: string, now: Date, reason: string}) => Promise<object>,
 *   writeLedger: (rows: object[]) => Promise<unknown>,
 *   scoreSignpost: (entityId: string, patch: object) => Promise<unknown>,
 * }}} args `sweep` (default true) runs the state-based paths (repair and deadline); a replay of old events
 *   passes sweep:false so they run once per run.
 * @returns {Promise<{counts: object, failed_event_ids: Array<number|string>, errors: string[], scored: Array<object>}>}
 */
export async function runSignpostStep({ mode, events, now = new Date(), sweep = true, deps }) {
  const apply = mode === "apply";
  const counts = emptyCounts();
  const errors = [];
  const failedEventIds = new Set();
  const scoredList = [];
  const evs = Array.isArray(events) ? events : [];
  counts.events_seen = evs.length;

  // ---- 1. events -> fires
  const entityIds = [...new Set(evs.filter((e) => e.tableName !== "signposts" && e.entityId).map((e) => e.entityId))];
  const watching = entityIds.length ? await deps.readSignpostsWatching(entityIds) : [];
  const m = matchEventsToSignposts(evs, watching, now);
  counts.events_matched = m.eventsMatched;
  counts.events_no_entity = m.eventsNoEntity;
  counts.events_signpost_origin = m.signpostOriginEvents;
  counts.events_late = m.late;
  counts.signposts_evaluated = m.evaluated;
  counts.signposts_fired = m.fires.length;
  const scoringOff = deps.columnsAbsent();

  /** Work out the per-item context once: assessment rows and grounding sources for every signpost scored. */
  const toScore = []; // {sp (db row), outcome, via, eventId}
  const firedNow = new Set();

  const assessmentIds = [...new Set([...m.fires.map((f) => f.signpost.assessment_id)])];
  const assessments = apply && assessmentIds.length ? await deps.readAssessments(assessmentIds) : new Map();

  for (const f of m.fires) {
    const outcome = outcomeForDirection(f.signpost.direction);
    if (apply) {
      try {
        await deps.fire({
          signpost: toSignpostRow(f.signpost),
          currentLifecycleState: assessments.get(f.signpost.assessment_id)?.lifecycle_state ?? "emerging",
          now,
          reason: f.reason,
        });
      } catch (err) {
        counts.errors += 1;
        errors.push(`fire ${f.signpost.entity_id}: ${err instanceof Error ? err.message : String(err)}`);
        failedEventIds.add(f.event.eventId);
        continue;
      }
    }
    firedNow.add(f.signpost.entity_id);
    if (outcome) toScore.push({ sp: f.signpost, outcome, via: "event", eventId: f.event.eventId });
  }

  if (sweep) {
    // ---- 2. repair: fired earlier, never scored
    const repair = await deps.readFiredUnscored();
    for (const sp of repair) {
      if (firedNow.has(sp.entity_id)) continue;
      const outcome = outcomeForDirection(sp.direction);
      if (outcome) toScore.push({ sp, outcome, via: "repair", eventId: null });
    }
    // ---- 3. deadline: an expectation date passed with no firing
    const candidates = await deps.readDeadlineCandidates();
    for (const sp of candidates) {
      if (sp.fired_at || firedNow.has(sp.entity_id)) continue;
      if (isDeadlinePassed(sp.predicate, now)) toScore.push({ sp, outcome: "refuted", via: "deadline", eventId: null });
    }
  }

  // ---- scoring (ledger first, then the signpost)
  if (toScore.length) {
    if (scoringOff) {
      counts.scoring_skipped_columns_absent = toScore.length;
    } else {
      const scoreAssessmentIds = [...new Set(toScore.map((t) => t.sp.assessment_id))];
      const aMap = await deps.readAssessments(scoreAssessmentIds);
      const itemIds = [...new Set([...aMap.values()].map((a) => a.item_id).filter(Boolean))];
      const grounding = itemIds.length ? await deps.readGroundingSources(itemIds) : new Map();
      for (const t of toScore) {
        const itemId = aMap.get(t.sp.assessment_id)?.item_id ?? null;
        const sourceIds = itemId ? (grounding.get(itemId) ?? []) : [];
        let rows = buildLedgerRows({ signpostEntityId: t.sp.entity_id, assessmentId: t.sp.assessment_id, outcome: t.outcome, sourceIds, now });
        counts.scored += 1;
        counts[`scored_${t.outcome}`] += 1;
        counts[`scored_by_${t.via}`] += 1;
        if (!rows.length) counts.scored_without_sources += 1;
        scoredList.push({ signpost: t.sp.entity_id, outcome: t.outcome, via: t.via, sources: rows.length });
        counts.ledger_rows_planned += rows.length;
        if (!apply) continue; // dry: counted, nothing written
        try {
          if (rows.length) {
            const existing = new Set(await deps.readLedgerSources(t.sp.entity_id));
            const fresh = rows.filter((r) => !existing.has(r.source_id));
            counts.ledger_rows_existing += rows.length - fresh.length;
            if (fresh.length) await deps.writeLedger(fresh);
            counts.ledger_rows_written += fresh.length;
          }
          await deps.scoreSignpost(t.sp.entity_id, scorePatch(t.outcome, now));
        } catch (err) {
          counts.errors += 1;
          errors.push(`score ${t.sp.entity_id}: ${err instanceof Error ? err.message : String(err)}`);
          if (t.eventId != null) failedEventIds.add(t.eventId);
        }
      }
    }
  }

  return { counts, failed_event_ids: [...failedEventIds], errors, scored: scoredList };
}

/** The signpost-step counts as flat run-artifact metrics under `prefix` (sp_ for the run's own events,
 *  sp_replayed_ for replayed ones). PURE. A null summary yields {}. */
export function signpostMetrics(summary, prefix = "sp_") {
  if (!summary) return {};
  const out = {};
  for (const [k, v] of Object.entries(summary.counts ?? {})) out[`${prefix}${k}`] = v;
  return out;
}

/**
 * Fill `newRow` on events that lack it (events replayed from the outbox are read without the changed row).
 * One bounded read of propagation_events (append-only, ADR-043). An event the read does not return keeps
 * newRow null. @param {object} sb @param {Array<object>} events */
export async function hydrateEventRows(sb, events) {
  const missing = events.filter((e) => e.newRow === undefined).map((e) => e.eventId);
  if (!missing.length) return events;
  const rows = await fetchAllByIdChunks(missing, async (slice) => {
    // fitness-allow: F39 (slice is one fetchAllByIdChunks chunk, at most 50 ids)
    const { data, error } = await sb.from("propagation_events").select("event_id,new_row").in("event_id", slice);
    if (error) throw new Error(`propagation_events read failed: ${error.message}`);
    return data ?? [];
  });
  const byId = new Map(rows.map((r) => [String(r.event_id), r.new_row ?? null]));
  return events.map((e) => (e.newRow === undefined ? { ...e, newRow: byId.get(String(e.eventId)) ?? null } : e));
}

// ── Real wiring (reads through sb, writes through db.mjs's guarded helpers) ───────────────────────────

const MISSING_COLUMN_RE = /outcome/i; // PostgREST names the missing column: column signposts.outcome does not exist

/**
 * Build the deps runSignpostStep needs, over a Supabase client (reads and fireSignpost's own writes) and the
 * scripts/lib/db.mjs module (guarded writes, rule 015). Reads tolerate migration 353 being unapplied: a read
 * that names the outcome column and fails falls back to the base columns and marks the columns absent.
 * @param {object} sb a Supabase client
 * @param {{readAll: Function, guardedInsertMany: Function, guardedUpdateByIds: Function}} db
 */
export function buildSignpostStepDeps(sb, db) {
  const state = { columnsAbsent: false };

  /** Run a signposts read with the outcome column; on a missing-column error retry on the base columns. */
  async function readSignposts(build) {
    if (!state.columnsAbsent) {
      try {
        return await build(SIGNPOST_SCORED_COLUMNS, true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!MISSING_COLUMN_RE.test(msg)) throw err;
        state.columnsAbsent = true;
      }
    }
    return build(SIGNPOST_BASE_COLUMNS, false);
  }

  return {
    columnsAbsent: () => state.columnsAbsent,

    readSignpostsWatching: (entityIds) =>
      readSignposts((cols, withOutcome) =>
        fetchAllByIdChunks(entityIds, async (slice) => {
          // fitness-allow: F39 (slice is one fetchAllByIdChunks chunk, at most 50 ids)
          let q = sb.from("signposts").select(cols).in("watches", slice).is("fired_at", null);
          if (withOutcome) q = q.is("outcome", null);
          const { data, error } = await q;
          if (error) throw new Error(error.message);
          return data ?? [];
        }, { manyPerId: true })),

    readFiredUnscored: async () => {
      if (state.columnsAbsent) return [];
      try {
        return await fetchAllRows((a, b) =>
          sb.from("signposts").select(SIGNPOST_SCORED_COLUMNS).not("fired_at", "is", null).is("outcome", null).order("entity_id").range(a, b), { cap: STATE_READ_CAP });
      } catch (err) {
        if (MISSING_COLUMN_RE.test(err instanceof Error ? err.message : String(err))) { state.columnsAbsent = true; return []; }
        throw err;
      }
    },

    readDeadlineCandidates: async () => {
      if (state.columnsAbsent) return [];
      try {
        const rows = await fetchAllRows((a, b) =>
          sb.from("signposts").select(SIGNPOST_SCORED_COLUMNS).is("fired_at", null).is("outcome", null).order("entity_id").range(a, b), { cap: STATE_READ_CAP });
        return rows.filter((r) => deadlineMs(r.predicate) !== null);
      } catch (err) {
        if (MISSING_COLUMN_RE.test(err instanceof Error ? err.message : String(err))) { state.columnsAbsent = true; return []; }
        throw err;
      }
    },

    readAssessments: async (ids) => {
      const rows = await fetchAllByIdChunks(ids, async (slice) => {
        // fitness-allow: F39 (slice is one fetchAllByIdChunks chunk, at most 50 ids)
        const { data, error } = await sb.from("research_assessments").select("id,item_id,lifecycle_state").in("id", slice);
        if (error) throw new Error(`research_assessments read failed: ${error.message}`);
        return data ?? [];
      });
      return new Map(rows.map((r) => [r.id, { item_id: r.item_id ?? null, lifecycle_state: r.lifecycle_state ?? "emerging" }]));
    },

    readGroundingSources: async (itemIds) => {
      const rows = await fetchAllByIdChunks(itemIds, async (slice) => {
        const { data, error } = await sb
          .from("section_claim_provenance")
          .select("intelligence_item_id,source_id")
          // fitness-allow: F39 (slice is one fetchAllByIdChunks chunk, at most 50 ids)
          .in("intelligence_item_id", slice)
          .in("claim_kind", [...GROUNDING_CLAIM_KINDS])
          .not("source_id", "is", null);
        if (error) throw new Error(`section_claim_provenance read failed: ${error.message}`);
        return data ?? [];
      }, { manyPerId: true });
      const map = new Map();
      for (const r of rows) {
        if (!map.has(r.intelligence_item_id)) map.set(r.intelligence_item_id, []);
        const list = map.get(r.intelligence_item_id);
        if (!list.includes(r.source_id)) list.push(r.source_id);
      }
      return map;
    },

    readLedgerSources: async (signpostEntityId) => {
      const rows = await db.readAll("source_reliability_ledger", "source_id", { orderBy: "id", match: (q) => q.eq("signpost_entity_id", signpostEntityId) });
      return (rows ?? []).map((r) => r.source_id);
    },

    fire: ({ signpost, currentLifecycleState, now, reason }) => fireSignpost(sb, { signpost, currentLifecycleState, now, reason }),

    writeLedger: (rows) => db.guardedInsertMany("source_reliability_ledger", rows, { cite: CITE, select: "id" }),

    scoreSignpost: (entityId, patch) =>
      db.guardedUpdateByIds("signposts", [entityId], patch, { cite: CITE, select: "entity_id", idColumn: "entity_id", applyMatch: (q) => q.is("outcome", null) }),
  };
}
