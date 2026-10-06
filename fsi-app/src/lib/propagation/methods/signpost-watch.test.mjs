// signpost-watch.test.mjs -- proves signpost-watch.ts's two halves (see that file's own header):
// 1. computeSignpostWatch (the registered, pure MethodFn) -- registration + predicate evaluation.
// 2. fireSignpost (the sb-driven write path) -- the brief's own acceptance test, verbatim: "a fixture
//    signpost with a date_passed predicate fires when its watched entity's date is seeded past; the
//    firing writes a propagation_events row and transitions the parent assessment's lifecycle state ...
//    zero editorial-approval affordance exists anywhere in the firing path (grepped and asserted, not
//    merely absent by omission)."
//
// Fake client pattern mirrors drain.test.mjs's own hand-rolled in-memory fake (no real database, no
// supabase-js, zero npm dependency at module scope).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { METHODS } from "./index.ts";
import {
  computeSignpostWatch,
  evaluateSignpostPredicate,
  nextLifecycleState,
  fireSignpost,
  METHOD_ID,
  METHOD_VERSION,
} from "./signpost-watch.ts";

// ── Registration ─────────────────────────────────────────────────────────────────────────────────────

test("registers itself in METHODS at import time (via methods/index.ts's side-effect import)", () => {
  assert.ok(METHODS.has(METHOD_ID, METHOD_VERSION), "signpost_watch@1.0.0 should be registered");
  assert.equal(METHODS.get(METHOD_ID, METHOD_VERSION), computeSignpostWatch);
});

// ── evaluateSignpostPredicate (pure) ─────────────────────────────────────────────────────────────────

test("date_passed fires when the watched field's date has passed", () => {
  const r = evaluateSignpostPredicate(
    { op: "date_passed", field: "first_deadline" },
    { first_deadline: "2026-01-01T00:00:00Z" },
    new Date("2026-06-01T00:00:00Z"),
  );
  assert.equal(r.fired, true);
});

test("date_passed does not fire when the watched field's date is still in the future", () => {
  const r = evaluateSignpostPredicate(
    { op: "date_passed", field: "first_deadline" },
    { first_deadline: "2027-01-01T00:00:00Z" },
    new Date("2026-06-01T00:00:00Z"),
  );
  assert.equal(r.fired, false);
});

test("date_passed refuses (never throws) when the watched row cannot be resolved", () => {
  const r = evaluateSignpostPredicate({ op: "date_passed", field: "first_deadline" }, null, new Date());
  assert.equal(r.fired, false);
  assert.match(r.reason, /could not be resolved/);
});

test("threshold fires when the metric clears gte", () => {
  const r = evaluateSignpostPredicate({ op: "threshold", metric: "eua_eur_t", gte: 100 }, { eua_eur_t: 104 }, new Date());
  assert.equal(r.fired, true);
});

test("threshold does not fire below gte", () => {
  const r = evaluateSignpostPredicate({ op: "threshold", metric: "eua_eur_t", gte: 100 }, { eua_eur_t: 80 }, new Date());
  assert.equal(r.fired, false);
});

test("count_gte fires when the named relation count clears n", () => {
  const r = evaluateSignpostPredicate({ op: "count_gte", relation: "implements", n: 3 }, { implements_count: 4 }, new Date());
  assert.equal(r.fired, true);
});

test("an unrecognised op refuses rather than throwing", () => {
  const r = evaluateSignpostPredicate({ op: "bogus" }, { x: 1 }, new Date());
  assert.equal(r.fired, false);
  assert.match(r.reason, /unrecognised predicate op/);
});

// ── computeSignpostWatch (pure MethodFn) ─────────────────────────────────────────────────────────────

const firedSignpost = {
  entityId: "cl:signpost:abc",
  assessmentId: "11111111-1111-1111-1111-111111111111",
  watches: "cl:obligation:def",
  predicate: { op: "date_passed", field: "first_deadline" },
  direction: "confirms",
  firedAt: null,
};

test("computeSignpostWatch returns ok:true when the predicate fires", async () => {
  const ctx = {
    entityId: null,
    inputs: [{ table: "obligations", pk: "cl:obligation:def", version: null, row: { first_deadline: "2020-01-01" } }],
    priorValue: firedSignpost,
    now: new Date("2026-01-01"),
  };
  const r = await computeSignpostWatch(ctx);
  assert.equal(r.ok, true);
});

test("computeSignpostWatch returns ok:false when the predicate does not fire", async () => {
  const ctx = {
    entityId: null,
    inputs: [{ table: "obligations", pk: "cl:obligation:def", version: null, row: { first_deadline: "2099-01-01" } }],
    priorValue: firedSignpost,
    now: new Date("2026-01-01"),
  };
  const r = await computeSignpostWatch(ctx);
  assert.equal(r.ok, false);
});

test("computeSignpostWatch refuses when no signpost row is supplied as priorValue", async () => {
  const r = await computeSignpostWatch({ entityId: null, inputs: [], priorValue: null, now: new Date() });
  assert.equal(r.ok, false);
});

// ── nextLifecycleState (pure) -- spec 08 S3.1's table + this lane's named extensions ─────────────────

test("refutes always transitions to falsified, from any non-terminal state (spec 08 S3.1's own table)", () => {
  for (const current of ["emerging", "strengthening", "corroborated", "verified", "stalled"]) {
    assert.equal(nextLifecycleState(current, "refutes"), "falsified");
  }
});

test("confirms advances one step toward corroborated, never past it", () => {
  assert.equal(nextLifecycleState("emerging", "confirms"), "strengthening");
  assert.equal(nextLifecycleState("strengthening", "confirms"), "corroborated");
  assert.equal(nextLifecycleState("corroborated", "confirms"), "corroborated", "confirms must never auto-promote to verified");
  assert.equal(nextLifecycleState("verified", "confirms"), "verified");
});

test("delays moves to stalled (named extension; not literally in spec 08's table)", () => {
  assert.equal(nextLifecycleState("emerging", "delays"), "stalled");
  assert.equal(nextLifecycleState("strengthening", "delays"), "stalled");
});

test("falsified, superseded and obsolete are terminal -- no direction moves them again", () => {
  for (const current of ["falsified", "superseded", "obsolete"]) {
    for (const direction of ["confirms", "refutes", "delays"]) {
      assert.equal(nextLifecycleState(current, direction), current, `${current} + ${direction} must stay terminal`);
    }
  }
});

// ── fireSignpost -- the brief's own acceptance test ───────────────────────────────────────────────────

/** Minimal in-memory fake satisfying SignpostFireClient -- narrower than drain.test.mjs's own fake (this
 *  module only ever calls .update().eq() and .insert()), same no-npm-dependency posture. */
function fakeFireClient() {
  const state = { signposts: [], propagation_events: [], research_assessments: [] };
  const calls = [];

  function builder(table) {
    return {
      update(values) {
        return {
          async eq(col, value) {
            calls.push({ table, op: "update", values, col, value });
            for (const row of state[table]) {
              if (row[col] === value) Object.assign(row, values);
            }
            return { data: null, error: null };
          },
        };
      },
      async insert(values) {
        calls.push({ table, op: "insert", values });
        state[table].push({ ...values });
        return { data: null, error: null };
      },
      select() {
        return { async eq() { return { data: state[table], error: null }; } };
      },
    };
  }

  return { from: builder, state, calls };
}

test("ACCEPTANCE: a fixture signpost with a date_passed predicate fires when its watched entity's date is seeded past; firing writes a propagation_events row and transitions the parent assessment's lifecycle_state", async () => {
  const signpost = {
    entityId: "cl:signpost:test-001",
    assessmentId: "22222222-2222-2222-2222-222222222222",
    watches: "cl:obligation:test-001",
    predicate: { op: "date_passed", field: "first_deadline" },
    direction: "confirms",
    firedAt: null,
  };
  const watchedRow = { first_deadline: "2026-01-01T00:00:00Z" }; // seeded PAST relative to `now` below
  const now = new Date("2026-06-01T00:00:00Z");

  // Step A: the pure predicate evaluator (what a caller runs before deciding to fire at all).
  const verdict = evaluateSignpostPredicate(signpost.predicate, watchedRow, now);
  assert.equal(verdict.fired, true, "the seeded-past date must fire the date_passed predicate");

  // Step B: fire it, with the parent assessment starting at the honest default lifecycle_state.
  const client = fakeFireClient();
  const result = await fireSignpost(client, { signpost, currentLifecycleState: "emerging", now });

  assert.equal(result.fired, true);
  assert.equal(result.propagationEventWritten, true, "firing must write a propagation_events row");
  assert.equal(result.previousLifecycleState, "emerging");
  assert.equal(result.newLifecycleState, "strengthening", "a confirms-direction firing advances emerging -> strengthening");

  // Verify the actual writes landed, not just the returned summary.
  const eventWrites = client.calls.filter((c) => c.table === "propagation_events" && c.op === "insert");
  assert.equal(eventWrites.length, 1);
  assert.equal(eventWrites[0].values.table_name, "signposts");
  assert.equal(eventWrites[0].values.row_pk, signpost.entityId);

  const assessmentWrites = client.calls.filter((c) => c.table === "research_assessments" && c.op === "update");
  assert.equal(assessmentWrites.length, 1);
  assert.equal(assessmentWrites[0].values.lifecycle_state, "strengthening");
  assert.equal(assessmentWrites[0].value, signpost.assessmentId);

  const signpostWrites = client.calls.filter((c) => c.table === "signposts" && c.op === "update");
  assert.equal(signpostWrites.length, 1, "signposts.fired_at must be stamped");
});

test("fireSignpost with direction=refutes transitions the assessment straight to falsified, regardless of current state", async () => {
  const signpost = {
    entityId: "cl:signpost:test-002",
    assessmentId: "33333333-3333-3333-3333-333333333333",
    watches: "cl:obligation:test-002",
    predicate: { op: "threshold", metric: "eua_eur_t", gte: 100 },
    direction: "refutes",
    firedAt: null,
  };
  const client = fakeFireClient();
  const result = await fireSignpost(client, { signpost, currentLifecycleState: "corroborated", now: new Date() });
  assert.equal(result.newLifecycleState, "falsified");
});

test("fireSignpost is idempotent on fired_at (a signpost already fired is not re-stamped, but still writes a new propagation_events row and re-evaluates lifecycle)", async () => {
  const signpost = {
    entityId: "cl:signpost:test-003",
    assessmentId: "44444444-4444-4444-4444-444444444444",
    watches: "cl:obligation:test-003",
    predicate: { op: "date_passed", field: "x" },
    direction: "delays",
    firedAt: "2026-01-01T00:00:00Z", // already fired once
  };
  const client = fakeFireClient();
  await fireSignpost(client, { signpost, currentLifecycleState: "emerging", now: new Date() });
  const signpostWrites = client.calls.filter((c) => c.table === "signposts" && c.op === "update");
  assert.equal(signpostWrites.length, 0, "an already-fired signpost's fired_at must not be re-stamped");
  const eventWrites = client.calls.filter((c) => c.table === "propagation_events" && c.op === "insert");
  assert.equal(eventWrites.length, 1, "a propagation_events row is still written on this later evaluation");
});

// ── Lane L4-D: the outbox insert must be valid against migration 284's DDL ───────────────────────────

test("L4-D: the propagation_events insert carries change_kind (NOT NULL, in the CHECK set) and the WATCHED entity, never the assessment id", async () => {
  const signpost = {
    entityId: "cl:signpost:test-010",
    assessmentId: "55555555-5555-5555-5555-555555555555",
    watches: "cl:instrument:00000000000000aa",
    predicate: { op: "date_passed", field: "occurred_at", by: "2027-01-01" },
    direction: "confirms",
    firedAt: null,
  };
  const client = fakeFireClient();
  await fireSignpost(client, { signpost, currentLifecycleState: "emerging", now: new Date("2026-10-05T00:00:00Z"), reason: "occurred_at (2026-10-04T00:00:00.000Z) has passed" });
  const ev = client.calls.find((c) => c.table === "propagation_events" && c.op === "insert").values;
  assert.ok(["insert", "update", "delete", "supersede"].includes(ev.change_kind), `change_kind must be set to a CHECK value, got ${ev.change_kind}`);
  assert.equal(ev.change_kind, "update", "fired_at moves NULL to a timestamp: an update of the signpost row");
  assert.equal(ev.entity_id, "cl:instrument:00000000000000aa", "entity_id is the watched entity (an entities FK), not the research_assessments uuid");
  assert.notEqual(ev.entity_id, signpost.assessmentId);
  assert.equal(ev.row_pk, signpost.entityId);
  assert.deepEqual(ev.old_row, { fired_at: null });
  assert.equal(ev.new_row.fired_at, "2026-10-05T00:00:00.000Z");
  assert.equal(ev.new_row.direction, "confirms");
  assert.match(ev.new_row.reason, /has passed/);
});

// ── Zero editorial-approval affordance -- grepped and asserted, not merely absent by omission ────────

test("DOCTRINE (research-is-horizon-scan): signpost-watch.ts's firing path exposes zero editorial-approval affordance", () => {
  const src = readFileSync(fileURLToPath(new URL("./signpost-watch.ts", import.meta.url)), "utf8");

  // Strip comments and string literals before scanning CODE for forbidden identifiers -- this file's own
  // prose (header, JSDoc) discusses the doctrine by name, which must not false-positive the grep. What
  // must be absent is a CODE-LEVEL affordance: a parameter, property, or branch named for approval/
  // rejection/pending-review gating.
  const codeOnly = src
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line.trim())) // drop //-prefixed comment lines
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, ""); // drop /* ... */ blocks

  const forbidden = [/\bapprove\w*\s*[:(]/i, /\breject\w*\s*[:(]/i, /\bpending_?review\b/i, /\bawaiting_?approval\b/i, /\beditorial\w*\s*[:(]/i];
  for (const pattern of forbidden) {
    assert.doesNotMatch(codeOnly, pattern, `found a code-level approval-affordance token matching ${pattern} -- the no-editorial-queue doctrine forbids any approve/reject/pending gate in the firing path`);
  }

  // Positive check: fireSignpost's exported signature takes exactly {signpost, currentLifecycleState,
  // now} -- no gate/approval/decision parameter anywhere in it.
  const sigMatch = /export async function fireSignpost\(\s*sb: SignpostFireClient,\s*args: \{([^}]*)\}/s.exec(src);
  assert.ok(sigMatch, "fireSignpost's signature not found");
  assert.doesNotMatch(sigMatch[1], /approv|reject|pending|gate/i, "fireSignpost's parameter list must carry no approval/gate field");
});
