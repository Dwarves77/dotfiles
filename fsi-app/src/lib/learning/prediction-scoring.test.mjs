// prediction-scoring.test.mjs, lane L4-D (2026-10-05). Fixture proof of the scoring rule, the event match,
// the ledger join and the dry guarantee. No database, no network: the step runs over an in-memory fake of
// its deps. Plain `node --test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  outcomeForDirection, deadlineMs, isDeadlinePassed, scorePatch, buildLedgerRows, watchedRowForEvent,
  matchEventsToSignposts, runSignpostStep, signpostMetrics, buildSignpostStepDeps, hydrateEventRows, SCORED_BY, OUTCOME_BY_DIRECTION,
} from "./prediction-scoring.mjs";
import { nextLifecycleState } from "../propagation/methods/signpost-watch.ts";

const NOW = new Date("2026-10-05T12:00:00Z");
const ENTITY = "cl:instrument:00000000000000aa";

const signpost = (over = {}) => ({
  entity_id: "cl:signpost:0000000000000001",
  assessment_id: "assess-1",
  watches: ENTITY,
  predicate: { op: "date_passed", field: "occurred_at", by: "2027-01-01" },
  direction: "confirms",
  fired_at: null,
  outcome: null,
  ...over,
});
const event = (over = {}) => ({
  eventId: 10, tableName: "derived_values", rowPk: "dv-1", entityId: ENTITY, changeKind: "update",
  occurredAt: "2026-10-05T10:00:00Z", newRow: { value: 1 }, ...over,
});

/** In-memory fake of every dep, recording every write. */
function fakeDeps({ signposts = [signpost()], assessments, grounding, ledger = {}, columnsAbsent = false, failScoreFor = null, failFire = false, lifecycleAbsent = false, failStamp = false, failApplyFor = null } = {}) {
  const log = { fired: [], ledgerWrites: [], scored: [], stamped: [], applied: [] };
  const asMap = assessments ?? new Map([["assess-1", { item_id: "item-1", lifecycle_state: "emerging" }]]);
  const gMap = grounding ?? new Map([["item-1", ["src-a", "src-b"]]]);
  const open = () => signposts.filter((s) => !s.outcome);
  return {
    log,
    deps: {
      columnsAbsent: () => columnsAbsent,
      lifecycleAbsent: () => lifecycleAbsent,
      // Migration 374: the lifecycle step is stamped after fire (fireSignpost moved the lifecycle), and a fired
      // signpost never stamped is repaired by applying nextLifecycleState once.
      markLifecycleApplied: async (id, now) => {
        if (failStamp) throw new Error("stamp boom");
        log.stamped.push(id);
        signposts.find((s) => s.entity_id === id).lifecycle_applied_at = now.toISOString();
      },
      readLifecycleUnapplied: async () => signposts.filter((s) => s.fired_at && !s.lifecycle_applied_at),
      applyLifecycle: async ({ signpost: sp, from, to, now }) => {
        if (failApplyFor === sp.entity_id) throw new Error("apply boom");
        log.applied.push({ id: sp.entity_id, from, to });
        asMap.get(sp.assessment_id).lifecycle_state = to;
        sp.lifecycle_applied_at = now.toISOString();
      },
      readSignpostsWatching: async (ids) => open().filter((s) => !s.fired_at && ids.includes(s.watches)),
      readFiredUnscored: async () => open().filter((s) => s.fired_at),
      readDeadlineCandidates: async () => open().filter((s) => !s.fired_at),
      readAssessments: async (ids) => new Map([...asMap].filter(([k]) => ids.includes(k))),
      readGroundingSources: async (ids) => new Map([...gMap].filter(([k]) => ids.includes(k))),
      readLedgerSources: async (id) => ledger[id] ?? [],
      fire: async (a) => {
        if (failFire) throw new Error("fire boom");
        log.fired.push(a);
        const sp = signposts.find((s) => s.entity_id === a.signpost.entityId);
        sp.fired_at = a.now.toISOString();
        return {};
      },
      writeLedger: async (rows) => { log.ledgerWrites.push(...rows); },
      scoreSignpost: async (id, patch) => {
        if (failScoreFor === id) throw new Error("score boom");
        log.scored.push({ id, patch });
        Object.assign(signposts.find((s) => s.entity_id === id), patch);
      },
    },
  };
}

// ── The scoring rule ──────────────────────────────────────────────────────────────────────────────────

test("direction scores the outcome: confirms held, refutes refuted, delays partial", () => {
  assert.equal(outcomeForDirection("confirms"), "held");
  assert.equal(outcomeForDirection("refutes"), "refuted");
  assert.equal(outcomeForDirection("delays"), "partial");
  assert.equal(outcomeForDirection("sideways"), null);
  assert.deepEqual(Object.keys(OUTCOME_BY_DIRECTION).sort(), ["confirms", "delays", "refutes"]);
});

test("scored_by is the method id and version; the patch carries outcome, time and scorer", () => {
  assert.equal(SCORED_BY, "signpost_watch@1.0.0");
  assert.deepEqual(scorePatch("held", NOW), { outcome: "held", outcome_assessed_at: "2026-10-05T12:00:00.000Z", scored_by: "signpost_watch@1.0.0" });
});

test("a date-only expectation date runs to the end of that UTC day; a timestamp is that instant; none or garbage is no deadline", () => {
  assert.equal(deadlineMs({ by: "2026-10-05" }), Date.parse("2026-10-06T00:00:00Z"));
  assert.equal(deadlineMs({ by: "2026-10-05T08:00:00Z" }), Date.parse("2026-10-05T08:00:00Z"));
  assert.equal(deadlineMs({ op: "date_passed" }), null);
  assert.equal(deadlineMs({ by: "not a date" }), null);
  assert.equal(deadlineMs(null), null);
  assert.equal(isDeadlinePassed({ by: "2026-10-05" }, new Date("2026-10-05T23:59:59Z")), false, "still the last day");
  assert.equal(isDeadlinePassed({ by: "2026-10-05" }, new Date("2026-10-06T00:00:00Z")), true);
});

// ── The event match ───────────────────────────────────────────────────────────────────────────────────

test("a drained event on the watched entity fires the signpost; an event on another entity does not", () => {
  const m = matchEventsToSignposts([event({ eventId: 1, entityId: "cl:instrument:00000000000000bb" }), event({ eventId: 2 })], [signpost()], NOW);
  assert.equal(m.fires.length, 1);
  assert.equal(m.fires[0].event.eventId, 2);
  assert.equal(m.eventsMatched, 1);
});

test("a signpost fires once, on the oldest satisfying event", () => {
  const m = matchEventsToSignposts([event({ eventId: 5, occurredAt: "2026-10-05T11:00:00Z" }), event({ eventId: 4, occurredAt: "2026-10-05T09:00:00Z" })], [signpost()], NOW);
  assert.equal(m.fires.length, 1);
  assert.equal(m.fires[0].event.eventId, 4);
});

test("an event that occurred after the expectation date is late: it cannot fire the signpost", () => {
  const sp = signpost({ predicate: { op: "date_passed", field: "occurred_at", by: "2026-10-04" } });
  const m = matchEventsToSignposts([event()], [sp], NOW);
  assert.equal(m.fires.length, 0);
  assert.equal(m.late, 1);
});

test("an already fired signpost is never matched again; a firing's own outbox row (table signposts) is skipped and counted", () => {
  const m = matchEventsToSignposts([event({ eventId: 3, tableName: "signposts" }), event({ eventId: 4, entityId: null })], [signpost({ fired_at: "2026-10-01T00:00:00Z" })], NOW);
  assert.equal(m.fires.length, 0);
  assert.equal(m.signpostOriginEvents, 1);
  assert.equal(m.eventsNoEntity, 1);
});

test("a threshold predicate reads the changed row the outbox recorded", () => {
  const sp = signpost({ predicate: { op: "threshold", metric: "value", gte: 10 } });
  assert.equal(matchEventsToSignposts([event({ newRow: { value: 9 } })], [sp], NOW).fires.length, 0);
  assert.equal(matchEventsToSignposts([event({ newRow: { value: 12 } })], [sp], NOW).fires.length, 1);
  assert.equal(watchedRowForEvent(event()).occurred_at, "2026-10-05T10:00:00Z");
});

// ── The step: fire, score by direction, one ledger row per grounding source ────────────────────────────

test("ACCEPTANCE: a drained event on the watched entity fires the signpost once, scores it by direction, writes one ledger row per grounding source", async () => {
  const { deps, log } = fakeDeps();
  const r = await runSignpostStep({ mode: "apply", events: [event()], now: NOW, deps });
  assert.equal(log.fired.length, 1);
  assert.equal(log.fired[0].signpost.entityId, "cl:signpost:0000000000000001");
  assert.equal(log.fired[0].signpost.watches, ENTITY, "the watched entity travels to fireSignpost, which writes it as the outbox entity_id");
  assert.equal(log.fired[0].currentLifecycleState, "emerging");
  assert.deepEqual(log.scored.map((s) => s.patch.outcome), ["held"]);
  assert.equal(log.scored[0].patch.scored_by, "signpost_watch@1.0.0");
  assert.deepEqual(log.ledgerWrites.map((l) => [l.source_id, l.outcome, l.signpost_entity_id, l.assessment_id, l.scored_by]), [
    ["src-a", "held", "cl:signpost:0000000000000001", "assess-1", "signpost_watch@1.0.0"],
    ["src-b", "held", "cl:signpost:0000000000000001", "assess-1", "signpost_watch@1.0.0"],
  ]);
  assert.equal(r.counts.signposts_fired, 1);
  assert.equal(r.counts.scored, 1);
  assert.equal(r.counts.scored_held, 1);
  assert.equal(r.counts.scored_by_event, 1);
  assert.equal(r.counts.ledger_rows_written, 2);
  assert.deepEqual(r.failed_event_ids, []);

  // A re-run over the same state fires and scores nothing: the signpost is scored.
  const again = await runSignpostStep({ mode: "apply", events: [event()], now: NOW, deps });
  assert.equal(log.fired.length, 1);
  assert.equal(again.counts.scored, 0);
});

test("refutes scores refuted and delays scores partial, each with its ledger rows", async () => {
  for (const [direction, outcome] of [["refutes", "refuted"], ["delays", "partial"]]) {
    const { deps, log } = fakeDeps({ signposts: [signpost({ direction })] });
    await runSignpostStep({ mode: "apply", events: [event()], now: NOW, deps });
    assert.equal(log.scored[0].patch.outcome, outcome);
    assert.ok(log.ledgerWrites.every((l) => l.outcome === outcome));
  }
});

test("ACCEPTANCE: a passed predicate date with no firing scores refuted, by the deadline step; fired_at stays null and no assessment transition is requested", async () => {
  const sp = signpost({ predicate: { op: "date_passed", field: "occurred_at", by: "2026-10-04" } });
  const { deps, log } = fakeDeps({ signposts: [sp] });
  const r = await runSignpostStep({ mode: "apply", events: [], now: NOW, deps });
  assert.equal(r.counts.scored_by_deadline, 1);
  assert.equal(r.counts.scored_refuted, 1);
  assert.deepEqual(log.scored.map((s) => s.patch.outcome), ["refuted"]);
  assert.equal(log.fired.length, 0, "nothing happened, nothing is fired");
  assert.equal(sp.fired_at, null);
  assert.equal(log.ledgerWrites.length, 2);
  assert.ok(log.ledgerWrites.every((l) => l.outcome === "refuted"));
});

test("a date that has not passed is not scored; the deadline day itself is not yet past", async () => {
  const { deps, log } = fakeDeps({ signposts: [signpost({ predicate: { op: "date_passed", field: "occurred_at", by: "2026-10-05" } })] });
  const r = await runSignpostStep({ mode: "apply", events: [], now: NOW, deps });
  assert.equal(r.counts.scored, 0);
  assert.equal(log.scored.length, 0);
});

test("within one run an event gets its chance before the clock refutes: an on-time event holds the prediction", async () => {
  const sp = signpost({ predicate: { op: "date_passed", field: "occurred_at", by: "2026-10-05" } });
  const { deps, log } = fakeDeps({ signposts: [sp] });
  await runSignpostStep({ mode: "apply", events: [event({ occurredAt: "2026-10-05T10:00:00Z" })], now: new Date("2026-10-06T01:00:00Z"), deps });
  assert.deepEqual(log.scored.map((s) => s.patch.outcome), ["held"]);
});

test("a signpost fired earlier but never scored is repaired by direction, without firing again", async () => {
  const sp = signpost({ fired_at: "2026-10-01T00:00:00Z", direction: "delays" });
  const { deps, log } = fakeDeps({ signposts: [sp] });
  const r = await runSignpostStep({ mode: "apply", events: [], now: NOW, deps });
  assert.equal(r.counts.scored_by_repair, 1);
  assert.equal(log.fired.length, 0);
  assert.deepEqual(log.scored.map((s) => s.patch.outcome), ["partial"]);
});

test("one ledger row per DISTINCT source; rows already in the ledger are not written twice; no source writes no ledger row", async () => {
  assert.equal(buildLedgerRows({ signpostEntityId: "s", assessmentId: "a", outcome: "held", sourceIds: ["x", "x", "y", null], now: NOW }).length, 2);
  const { deps, log } = fakeDeps({ ledger: { "cl:signpost:0000000000000001": ["src-a"] } });
  const r = await runSignpostStep({ mode: "apply", events: [event()], now: NOW, deps });
  assert.deepEqual(log.ledgerWrites.map((l) => l.source_id), ["src-b"]);
  assert.equal(r.counts.ledger_rows_existing, 1);

  const none = fakeDeps({ grounding: new Map() });
  const r2 = await runSignpostStep({ mode: "apply", events: [event()], now: NOW, deps: none.deps });
  assert.equal(none.log.ledgerWrites.length, 0);
  assert.equal(r2.counts.scored_without_sources, 1);
  assert.equal(none.log.scored.length, 1, "the prediction is still scored");
});

// ── Dry, columns absent, failures ──────────────────────────────────────────────────────────────────────

test("ACCEPTANCE: dry mode writes nothing anywhere and reports what would happen", async () => {
  const { deps, log } = fakeDeps({ signposts: [signpost(), signpost({ entity_id: "cl:signpost:0000000000000002", predicate: { op: "date_passed", field: "occurred_at", by: "2026-10-04" }, watches: "cl:instrument:00000000000000cc" })] });
  const r = await runSignpostStep({ mode: "dry", events: [event()], now: NOW, deps });
  assert.deepEqual([log.fired.length, log.ledgerWrites.length, log.scored.length], [0, 0, 0]);
  assert.equal(r.counts.signposts_fired, 1, "reported as would-fire");
  assert.equal(r.counts.scored, 2);
  assert.equal(r.counts.ledger_rows_planned, 4);
  assert.equal(r.counts.ledger_rows_written, 0);
});

test("readers tolerate migration 353 being unapplied: it still fires, cannot score, and says so", async () => {
  const { deps, log } = fakeDeps({ columnsAbsent: true });
  const r = await runSignpostStep({ mode: "apply", events: [event()], now: NOW, deps });
  assert.equal(log.fired.length, 1);
  assert.equal(log.scored.length, 0);
  assert.equal(log.ledgerWrites.length, 0);
  assert.equal(r.counts.scoring_skipped_columns_absent, 1);
});

test("a failed firing returns its event id for replay and scores nothing; a failed score does too, and the ledger-first order leaves the signpost retryable", async () => {
  const a = fakeDeps({ failFire: true });
  const ra = await runSignpostStep({ mode: "apply", events: [event({ eventId: 77 })], now: NOW, deps: a.deps });
  assert.deepEqual(ra.failed_event_ids, [77]);
  assert.equal(ra.counts.errors, 1);
  assert.equal(a.log.scored.length, 0);

  const b = fakeDeps({ failScoreFor: "cl:signpost:0000000000000001" });
  const rb = await runSignpostStep({ mode: "apply", events: [event({ eventId: 78 })], now: NOW, deps: b.deps });
  assert.deepEqual(rb.failed_event_ids, [78]);
  assert.ok(b.log.ledgerWrites.length > 0, "ledger rows were written first");
  // Next run: the signpost fired but is unscored, so it is repaired, and the ledger rows are not duplicated.
  const ledger = { "cl:signpost:0000000000000001": b.log.ledgerWrites.map((l) => l.source_id) };
  const retry = fakeDeps({ signposts: [signpost({ fired_at: NOW.toISOString() })], ledger });
  await runSignpostStep({ mode: "apply", events: [], now: NOW, deps: retry.deps });
  assert.equal(retry.log.ledgerWrites.length, 0);
  assert.deepEqual(retry.log.scored.map((s) => s.patch.outcome), ["held"]);
});

test("sweep:false (a replay of old events) runs the event path only, never the repair or the deadline", async () => {
  const { deps, log } = fakeDeps({ signposts: [signpost({ predicate: { op: "date_passed", field: "occurred_at", by: "2026-10-04" } })] });
  await runSignpostStep({ mode: "apply", events: [], now: NOW, sweep: false, deps });
  assert.equal(log.scored.length, 0);
});

test("signpostMetrics flattens the counts under a prefix", () => {
  assert.equal(signpostMetrics({ counts: { signposts_fired: 2 } }).sp_signposts_fired, 2);
  assert.equal(signpostMetrics({ counts: { signposts_fired: 2 } }, "sp_replayed_").sp_replayed_signposts_fired, 2);
  assert.deepEqual(signpostMetrics(null), {});
});

// ── Real wiring against a fake client: the outcome-column fallback ─────────────────────────────────────

test("buildSignpostStepDeps: a read naming the outcome column that fails falls back to the base columns and marks the columns absent", async () => {
  const seen = [];
  const sb = {
    from() {
      const q = {
        select(cols) { seen.push(cols); q.cols = cols; return q; },
        in() { return q; }, is() { return q; }, not() { return q; }, order() { return q; }, range() { return q; },
        then(res, rej) {
          const r = q.cols.includes("outcome")
            ? { data: null, error: { message: "column signposts.outcome does not exist" } }
            : { data: [{ entity_id: "s1", watches: ENTITY, predicate: { op: "date_passed" }, direction: "confirms", fired_at: null, assessment_id: "a" }], error: null };
          return Promise.resolve(r).then(res, rej);
        },
      };
      return q;
    },
  };
  const deps = buildSignpostStepDeps(sb, { readAll: async () => [], guardedInsertMany: async () => ({}), guardedUpdateByIds: async () => ({}) });
  const rows = await deps.readSignpostsWatching([ENTITY]);
  assert.equal(rows.length, 1);
  assert.equal(deps.columnsAbsent(), true);
  assert.deepEqual(await deps.readFiredUnscored(), [], "with the columns absent the state-based reads return nothing");
  assert.ok(seen.some((c) => c.includes("outcome")) && seen.some((c) => !c.includes("outcome")));
});

// ── End to end over an in-memory database: the real deps, the real fireSignpost, guarded-write fakes ───

function memorySb(tables) {
  const calls = [];
  function from(table) {
    const ops = [];
    let pendingUpdate = null;
    const rowsNow = () => (tables[table] ?? []).filter((r) => ops.every(([k, c, v]) => {
      if (k === "in") return v.includes(r[c]);
      if (k === "is") return (r[c] ?? null) === v;
      if (k === "eq") return r[c] === v;
      if (k === "not") return r[c] != null;
      return true;
    }));
    const q = {
      select() { return q; }, order() { return q; }, range() { return q; },
      in(c, v) { ops.push(["in", c, v]); return q; },
      is(c, v) { ops.push(["is", c, v]); return q; },
      not(c) { ops.push(["not", c]); return q; },
      eq(c, v) {
        ops.push(["eq", c, v]);
        if (pendingUpdate) { calls.push({ table, op: "update", values: pendingUpdate, c, v }); for (const r of rowsNow()) Object.assign(r, pendingUpdate); return Promise.resolve({ data: null, error: null }); }
        return q;
      },
      update(values) { pendingUpdate = values; return q; },
      insert(values) { calls.push({ table, op: "insert", values }); (tables[table] ??= []).push({ ...values }); return Promise.resolve({ data: null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: rowsNow(), error: null }).then(res, rej); },
    };
    return q;
  }
  return { from, calls };
}

test("end to end: the real deps over an in-memory database fire the signpost with a valid outbox row, score it, and append the ledger", async () => {
  const tables = {
    signposts: [signpost()],
    research_assessments: [{ id: "assess-1", item_id: "item-1", lifecycle_state: "emerging" }],
    section_claim_provenance: [
      { intelligence_item_id: "item-1", source_id: "src-a", claim_kind: "FACT" },
      { intelligence_item_id: "item-1", source_id: "src-a", claim_kind: "LEGAL" },
      { intelligence_item_id: "item-1", source_id: "src-b", claim_kind: "FACT" },
    ],
    propagation_events: [],
    source_reliability_ledger: [],
  };
  const sb = memorySb(tables);
  const dbCalls = [];
  const db = {
    readAll: async (table, _cols, { match: _match } = {}) => tables[table] ?? [],
    guardedInsertMany: async (table, rows) => { dbCalls.push({ table, rows }); (tables[table] ??= []).push(...rows); return { inserted: rows.length }; },
    guardedUpdateByIds: async (table, ids, patch, opts) => { dbCalls.push({ table, ids, patch, opts }); for (const r of tables[table]) if (ids.includes(r[opts.idColumn])) Object.assign(r, patch); return { updated: ids.length }; },
  };
  const deps = buildSignpostStepDeps(sb, db);
  const r = await runSignpostStep({ mode: "apply", events: [event()], now: NOW, deps });

  const outbox = tables.propagation_events[0];
  assert.equal(outbox.table_name, "signposts");
  assert.equal(outbox.entity_id, ENTITY, "the watched entity, an entities FK value");
  assert.equal(outbox.change_kind, "update");
  assert.equal(tables.research_assessments[0].lifecycle_state, "strengthening");
  assert.equal(tables.signposts[0].outcome, "held");
  assert.equal(tables.signposts[0].scored_by, "signpost_watch@1.0.0");
  assert.deepEqual(tables.source_reliability_ledger.map((l) => l.source_id).sort(), ["src-a", "src-b"], "one row per distinct grounding source");
  assert.equal(dbCalls.find((c) => c.patch)?.opts.idColumn, "entity_id");
  assert.equal(dbCalls.find((c) => c.patch)?.opts.cite.skill.length > 0, true);
  assert.equal(r.counts.ledger_rows_written, 2);

  // Rule 17: the firing's outbox row is a real event the next drain run will process.
  const next = await runSignpostStep({ mode: "apply", events: [{ ...event({ eventId: 11, tableName: "signposts", rowPk: outbox.row_pk, entityId: outbox.entity_id }) }], now: NOW, deps });
  assert.equal(next.counts.events_signpost_origin, 1);
  assert.equal(next.counts.scored, 0);
});

test("end to end: dry mode over the same database changes no table", async () => {
  const tables = {
    signposts: [signpost()],
    research_assessments: [{ id: "assess-1", item_id: "item-1", lifecycle_state: "emerging" }],
    section_claim_provenance: [{ intelligence_item_id: "item-1", source_id: "src-a", claim_kind: "FACT" }],
    propagation_events: [], source_reliability_ledger: [],
  };
  const before = JSON.stringify(tables);
  const db = { readAll: async () => [], guardedInsertMany: async () => { throw new Error("dry must not write"); }, guardedUpdateByIds: async () => { throw new Error("dry must not write"); } };
  const r = await runSignpostStep({ mode: "dry", events: [event()], now: NOW, deps: buildSignpostStepDeps(memorySb(tables), db) });
  assert.equal(JSON.stringify(tables), before);
  assert.equal(r.counts.signposts_fired, 1);
  assert.equal(r.counts.ledger_rows_planned, 1);
});

test("hydrateEventRows fills newRow only where it is missing", async () => {
  const sb = memorySb({ propagation_events: [{ event_id: 5, new_row: { value: 3 } }] });
  const out = await hydrateEventRows(sb, [{ eventId: 5 }, { eventId: 6, newRow: { value: 9 } }, { eventId: 7 }]);
  assert.deepEqual(out.map((e) => e.newRow), [{ value: 3 }, { value: 9 }, null]);
});

// ── Migration 374: lifecycle_applied_at, the lifecycle retry ───────────────────────────────────────────
// fireSignpost stamps fired_at (step 1), writes the outbox row (step 2) and moves the assessment lifecycle
// (step 3), as three writes. A failure at step 3 leaves fired_at set and the lifecycle unmoved, and a confirms
// transition is not idempotent, so the repair needs a record of whether the lifecycle was applied:
// signposts.lifecycle_applied_at. It is stamped right after a firing's lifecycle update, and the repair pass
// applies nextLifecycleState only where it is NULL, then stamps it.

const SP2 = "cl:signpost:0000000000000002";
const SP3 = "cl:signpost:0000000000000003";

test("a firing stamps lifecycle_applied_at once its lifecycle update has been made; dry stamps nothing", async () => {
  const a = fakeDeps();
  const ra = await runSignpostStep({ mode: "apply", events: [event()], now: NOW, deps: a.deps });
  assert.deepEqual(a.log.stamped, ["cl:signpost:0000000000000001"]);
  assert.equal(ra.counts.lifecycle_stamped, 1);
  assert.equal(a.log.applied.length, 0, "a firing's own lifecycle update is fireSignpost's, not the repair's");

  const d = fakeDeps();
  const rd = await runSignpostStep({ mode: "dry", events: [event()], now: NOW, deps: d.deps });
  assert.equal(d.log.stamped.length, 0);
  assert.equal(rd.counts.lifecycle_stamped, 0);
});

test("ACCEPTANCE: a signpost with fired_at set and lifecycle_applied_at NULL is repaired once and not twice", async () => {
  const sp = signpost({ fired_at: "2026-10-01T00:00:00Z", lifecycle_applied_at: null, outcome: "held" });
  const { deps, log } = fakeDeps({ signposts: [sp] });
  const first = await runSignpostStep({ mode: "apply", events: [], now: NOW, deps });
  assert.deepEqual(log.applied, [{ id: sp.entity_id, from: "emerging", to: "strengthening" }], "confirms advances emerging one step");
  assert.equal(sp.lifecycle_applied_at, NOW.toISOString(), "stamped in the same repair");
  assert.equal(first.counts.lifecycle_repaired, 1);

  const second = await runSignpostStep({ mode: "apply", events: [], now: NOW, deps });
  assert.equal(log.applied.length, 1, "the second pass does not apply it again");
  assert.equal(second.counts.lifecycle_repaired, 0);
  assert.equal(second.counts.lifecycle_repair_planned, 0);
});

test("a signpost whose lifecycle is already applied is never repaired; one fired in this run is not repaired in it", async () => {
  const done = signpost({ entity_id: SP2, fired_at: "2026-10-01T00:00:00Z", lifecycle_applied_at: "2026-10-01T00:00:01Z" });
  const { deps, log } = fakeDeps({ signposts: [done, signpost()] });
  const r = await runSignpostStep({ mode: "apply", events: [event()], now: NOW, deps });
  assert.equal(log.applied.length, 0);
  assert.equal(r.counts.lifecycle_stamped, 1, "only the firing of this run was stamped");
  assert.deepEqual(log.stamped, ["cl:signpost:0000000000000001"]);
});

test("two unapplied signposts on one assessment chain their transitions in order, each from the state the last left", async () => {
  const a = signpost({ entity_id: SP2, fired_at: "2026-10-01T00:00:00Z" });
  const b = signpost({ entity_id: SP3, fired_at: "2026-10-02T00:00:00Z" });
  const { deps, log } = fakeDeps({ signposts: [a, b] });
  await runSignpostStep({ mode: "apply", events: [], now: NOW, deps });
  assert.deepEqual(log.applied.map((x) => [x.from, x.to]), [["emerging", "strengthening"], ["strengthening", "corroborated"]]);
});

test("a refutes direction repairs to falsified and a terminal assessment repairs to itself, both stamped", async () => {
  const r1 = signpost({ entity_id: SP2, assessment_id: "assess-r", direction: "refutes", fired_at: "2026-10-01T00:00:00Z" });
  const r2 = signpost({ entity_id: SP3, assessment_id: "assess-t", fired_at: "2026-10-01T00:00:00Z" });
  const asMap = new Map([["assess-r", { item_id: "item-1", lifecycle_state: "corroborated" }], ["assess-t", { item_id: "item-1", lifecycle_state: "falsified" }]]);
  const { deps, log } = fakeDeps({ signposts: [r1, r2], assessments: asMap });
  await runSignpostStep({ mode: "apply", events: [], now: NOW, deps });
  assert.deepEqual(log.applied.map((x) => [x.id, x.from, x.to]), [[SP2, "corroborated", "falsified"], [SP3, "falsified", "falsified"]]);
  assert.ok(r1.lifecycle_applied_at && r2.lifecycle_applied_at);
  assert.equal(nextLifecycleState("falsified", "confirms"), "falsified", "the rule applied is nextLifecycleState itself");
});

test("a repair whose assessment cannot be read applies nothing and stays NULL for the next run", async () => {
  const sp = signpost({ fired_at: "2026-10-01T00:00:00Z" });
  const { deps, log } = fakeDeps({ signposts: [sp], assessments: new Map() });
  const r = await runSignpostStep({ mode: "apply", events: [], now: NOW, deps });
  assert.equal(log.applied.length, 0);
  assert.equal(sp.lifecycle_applied_at ?? null, null);
  assert.equal(r.counts.lifecycle_repair_no_assessment, 1);
});

test("dry mode plans the lifecycle repair and writes nothing", async () => {
  const sp = signpost({ fired_at: "2026-10-01T00:00:00Z" });
  const { deps, log } = fakeDeps({ signposts: [sp] });
  const r = await runSignpostStep({ mode: "dry", events: [], now: NOW, deps });
  assert.equal(r.counts.lifecycle_repair_planned, 1);
  assert.equal(r.counts.lifecycle_repaired, 0);
  assert.deepEqual([log.applied.length, log.stamped.length], [0, 0]);
  assert.equal(sp.lifecycle_applied_at ?? null, null);
});

test("sweep:false (a replay of old events) never runs the lifecycle repair", async () => {
  const sp = signpost({ fired_at: "2026-10-01T00:00:00Z" });
  const { deps, log } = fakeDeps({ signposts: [sp] });
  await runSignpostStep({ mode: "apply", events: [], now: NOW, sweep: false, deps });
  assert.equal(log.applied.length, 0);
});

test("a failed repair is counted and left NULL, so the next run retries it; a failed stamp after a firing does not stop the scoring", async () => {
  const sp = signpost({ fired_at: "2026-10-01T00:00:00Z" });
  const bad = fakeDeps({ signposts: [sp], failApplyFor: sp.entity_id });
  const rb = await runSignpostStep({ mode: "apply", events: [], now: NOW, deps: bad.deps });
  assert.equal(rb.counts.errors, 1);
  assert.equal(rb.counts.lifecycle_repaired, 0);
  assert.equal(sp.lifecycle_applied_at ?? null, null);
  const retry = fakeDeps({ signposts: [sp] });
  const rr = await runSignpostStep({ mode: "apply", events: [], now: NOW, deps: retry.deps });
  assert.equal(rr.counts.lifecycle_repaired, 1);

  const s = fakeDeps({ failStamp: true });
  const rs = await runSignpostStep({ mode: "apply", events: [event()], now: NOW, deps: s.deps });
  assert.equal(rs.counts.errors, 1);
  assert.deepEqual(s.log.scored.map((x) => x.patch.outcome), ["held"], "the prediction is still scored");
  assert.deepEqual(rs.failed_event_ids, [], "the signpost is fired, so replaying the event could not match it again");
});

test("readers tolerate migration 374 being unapplied: it still fires and scores, cannot stamp or repair the lifecycle, and says so", async () => {
  const sp = signpost({ entity_id: SP2, fired_at: "2026-10-01T00:00:00Z" });
  const { deps, log } = fakeDeps({ signposts: [signpost(), sp], lifecycleAbsent: true });
  const r = await runSignpostStep({ mode: "apply", events: [event()], now: NOW, deps });
  assert.equal(log.fired.length, 1);
  assert.equal(log.scored.length, 2, "scoring (migration 353) is unaffected");
  assert.deepEqual([log.stamped.length, log.applied.length], [0, 0]);
  assert.equal(r.counts.lifecycle_skipped_column_absent, 2, "the firing's stamp and the repair are both skipped, and counted");
});

// Real wiring: the 374 column fallback and the guarded writes.

test("buildSignpostStepDeps: a lifecycle read that names lifecycle_applied_at and fails marks that column absent without touching the outcome columns", async () => {
  const sb = {
    from() {
      const q = {
        select(cols) { q.cols = cols; return q; },
        in() { return q; }, is() { return q; }, not() { return q; }, order() { return q; }, range() { return q; },
        then(res, rej) {
          const r = q.cols.includes("lifecycle_applied_at")
            ? { data: null, error: { message: "column signposts.lifecycle_applied_at does not exist" } }
            : { data: [], error: null };
          return Promise.resolve(r).then(res, rej);
        },
      };
      return q;
    },
  };
  const deps = buildSignpostStepDeps(sb, { readAll: async () => [], guardedInsertMany: async () => ({}), guardedUpdateByIds: async () => ({}) });
  assert.equal(deps.lifecycleAbsent(), false);
  assert.deepEqual(await deps.readLifecycleUnapplied(), []);
  assert.equal(deps.lifecycleAbsent(), true);
  assert.equal(deps.columnsAbsent(), false, "migration 353's columns are a separate fact");
  assert.deepEqual(await deps.readFiredUnscored(), [], "an empty read, not a missing-column skip");
});

test("buildSignpostStepDeps: stamping is a guarded signposts write that only sets a NULL; a missing column reads as skipped, any other failure throws", async () => {
  const calls = [];
  let mode = "ok";
  const db = {
    readAll: async () => [],
    guardedInsertMany: async () => ({}),
    guardedUpdateByIds: async (table, ids, patch, opts) => {
      calls.push({ table, ids, patch, opts });
      if (mode === "absent") throw new Error("column \"lifecycle_applied_at\" of relation \"signposts\" does not exist");
      if (mode === "boom") throw new Error("connection reset");
      return { updated: ids.length };
    },
  };
  const deps = buildSignpostStepDeps({ from() { throw new Error("no reads"); } }, db);
  const ok = await deps.markLifecycleApplied("cl:signpost:0000000000000001", NOW);
  assert.deepEqual(ok, { skipped: false });
  assert.equal(calls[0].table, "signposts");
  assert.deepEqual(calls[0].patch, { lifecycle_applied_at: NOW.toISOString() });
  assert.equal(calls[0].opts.idColumn, "entity_id");
  assert.ok(calls[0].opts.cite.skill.length > 0);
  const seen = [];
  calls[0].opts.applyMatch({ is(c, v) { seen.push([c, v]); return this; } });
  assert.deepEqual(seen, [["lifecycle_applied_at", null]], "an already stamped signpost is never stamped again");

  mode = "boom";
  await assert.rejects(() => deps.markLifecycleApplied("x", NOW), /connection reset/);
  assert.equal(deps.lifecycleAbsent(), false);
  mode = "absent";
  assert.deepEqual(await deps.markLifecycleApplied("x", NOW), { skipped: true });
  assert.equal(deps.lifecycleAbsent(), true);
});

test("buildSignpostStepDeps: applyLifecycle moves the assessment only if it is still in the state read, then stamps; a terminal state writes no assessment", async () => {
  const calls = [];
  let updatedForAssessment = 1;
  const db = {
    readAll: async () => [],
    guardedInsertMany: async () => ({}),
    guardedUpdateByIds: async (table, ids, patch, opts) => { calls.push({ table, ids, patch, opts }); return { updated: table === "research_assessments" ? updatedForAssessment : ids.length }; },
  };
  const deps = buildSignpostStepDeps({ from() { throw new Error("no reads"); } }, db);
  const sp = { entity_id: "cl:signpost:0000000000000001", assessment_id: "assess-1" };

  await deps.applyLifecycle({ signpost: sp, from: "emerging", to: "strengthening", now: NOW });
  assert.deepEqual(calls.map((c) => c.table), ["research_assessments", "signposts"], "lifecycle first, stamp second");
  assert.deepEqual(calls[0].patch, { lifecycle_state: "strengthening" });
  assert.deepEqual(calls[0].ids, ["assess-1"]);
  const eqs = [];
  calls[0].opts.applyMatch({ eq(c, v) { eqs.push([c, v]); return this; } });
  assert.deepEqual(eqs, [["lifecycle_state", "emerging"]], "guarded against the assessment having moved since it was read");

  calls.length = 0;
  await deps.applyLifecycle({ signpost: sp, from: "falsified", to: "falsified", now: NOW });
  assert.deepEqual(calls.map((c) => c.table), ["signposts"], "no transition, no assessment write, but the signpost is stamped");

  calls.length = 0;
  updatedForAssessment = 0;
  await assert.rejects(() => deps.applyLifecycle({ signpost: sp, from: "emerging", to: "strengthening", now: NOW }), /moved/);
  assert.deepEqual(calls.map((c) => c.table), ["research_assessments"], "a lifecycle that did not move is never stamped");
});

test("end to end: the repair over an in-memory database moves the lifecycle once and stamps; a firing's stamp lands after its lifecycle update", async () => {
  const tables = {
    signposts: [signpost({ fired_at: "2026-10-01T00:00:00Z", lifecycle_applied_at: null })],
    research_assessments: [{ id: "assess-1", item_id: "item-1", lifecycle_state: "emerging" }],
    section_claim_provenance: [], propagation_events: [], source_reliability_ledger: [],
  };
  const order = [];
  const db = {
    readAll: async (table) => tables[table] ?? [],
    guardedInsertMany: async (table, rows) => { (tables[table] ??= []).push(...rows); return { inserted: rows.length }; },
    guardedUpdateByIds: async (table, ids, patch, opts) => {
      order.push([table, Object.keys(patch)[0], tables.research_assessments[0].lifecycle_state]);
      for (const r of tables[table]) if (ids.includes(r[opts.idColumn])) Object.assign(r, patch);
      return { updated: ids.length };
    },
  };
  const deps = buildSignpostStepDeps(memorySb(tables), db);
  await runSignpostStep({ mode: "apply", events: [], now: NOW, deps });
  assert.equal(tables.research_assessments[0].lifecycle_state, "strengthening");
  assert.equal(tables.signposts[0].lifecycle_applied_at, NOW.toISOString());
  const afterRepair = order.length;
  await runSignpostStep({ mode: "apply", events: [], now: NOW, deps });
  assert.equal(order.length, afterRepair, "the second run writes nothing");
  assert.equal(tables.research_assessments[0].lifecycle_state, "strengthening", "not advanced twice");

  // A firing: fireSignpost moves the lifecycle, then the stamp is written.
  const fresh = { signposts: [signpost()], research_assessments: [{ id: "assess-1", item_id: "item-1", lifecycle_state: "emerging" }], section_claim_provenance: [], propagation_events: [], source_reliability_ledger: [] };
  Object.assign(tables, fresh);
  order.length = 0;
  await runSignpostStep({ mode: "apply", events: [event()], now: NOW, deps: buildSignpostStepDeps(memorySb(tables), db) });
  const stamp = order.find((o) => o[1] === "lifecycle_applied_at");
  assert.ok(stamp, "the firing was stamped");
  assert.equal(stamp[2], "strengthening", "the lifecycle had already moved when the stamp was written");
  assert.equal(tables.research_assessments[0].lifecycle_state, "strengthening", "and the repair did not move it a second time");
});
