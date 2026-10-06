// prediction-scoring.test.mjs, lane L4-D (2026-10-05). Fixture proof of the scoring rule, the event match,
// the ledger join and the dry guarantee. No database, no network: the step runs over an in-memory fake of
// its deps. Plain `node --test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  outcomeForDirection, deadlineMs, isDeadlinePassed, scorePatch, buildLedgerRows, watchedRowForEvent,
  matchEventsToSignposts, runSignpostStep, signpostMetrics, buildSignpostStepDeps, hydrateEventRows, SCORED_BY, OUTCOME_BY_DIRECTION,
} from "./prediction-scoring.mjs";

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
function fakeDeps({ signposts = [signpost()], assessments, grounding, ledger = {}, columnsAbsent = false, failScoreFor = null, failFire = false } = {}) {
  const log = { fired: [], ledgerWrites: [], scored: [] };
  const asMap = assessments ?? new Map([["assess-1", { item_id: "item-1", lifecycle_state: "emerging" }]]);
  const gMap = grounding ?? new Map([["item-1", ["src-a", "src-b"]]]);
  const open = () => signposts.filter((s) => !s.outcome);
  return {
    log,
    deps: {
      columnsAbsent: () => columnsAbsent,
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
