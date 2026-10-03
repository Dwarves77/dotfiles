import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizePredicate,
  selectSignpostView,
  fetchSignpostsForAssessment,
  selectAssessmentHistoryEntry,
  fetchAssessmentHistoryChain,
  daysSince,
} from "./read-signposts.mjs";

// ── summarizePredicate / selectSignpostView ──────────────────────────────────────────────────────

test("summarizePredicate renders each of migration 346's three documented predicate shapes", () => {
  assert.equal(summarizePredicate({ op: "date_passed", field: "eu_phase_in_date" }), "fires once eu_phase_in_date has passed");
  assert.equal(summarizePredicate({ op: "threshold", metric: "fleet_share_pct", gte: 20 }), "fires once fleet_share_pct reaches 20");
  assert.equal(summarizePredicate({ op: "count_gte", relation: "corroborating_sources", n: 3 }), "fires once 3 or more corroborating_sources are recorded");
});

test("summarizePredicate never guesses at an unrecognized op (CLAUDE.md rule 2)", () => {
  assert.match(summarizePredicate({ op: "something_new" }), /unrecognized predicate/);
  assert.equal(summarizePredicate(null), "no predicate recorded");
  assert.equal(summarizePredicate({}), "no predicate recorded");
});

test("selectSignpostView maps a real row, unfired vs fired", () => {
  const unfired = selectSignpostView({
    entity_id: "sp_1", assessment_id: "a1", watches: "corridor_x", predicate: { op: "date_passed", field: "d" }, direction: "confirms", fired_at: null,
  });
  assert.equal(unfired.isFired, false);
  assert.equal(unfired.direction, "confirms");

  const fired = selectSignpostView({
    entity_id: "sp_2", assessment_id: "a1", watches: "corridor_y", predicate: { op: "threshold", metric: "m", gte: 1 }, direction: "refutes", fired_at: "2026-10-01T00:00:00Z",
  });
  assert.equal(fired.isFired, true);
  assert.equal(fired.firedAt, "2026-10-01T00:00:00Z");
});

test("selectSignpostView returns null for no row (honest absence)", () => {
  assert.equal(selectSignpostView(null), null);
  assert.equal(selectSignpostView(undefined), null);
});

// ── fetchSignpostsForAssessment (injected fake client, no network/DB) ────────────────────────────

function fakeClient({ signpostRows = null, signpostError = null, historyRowsById = {} } = {}) {
  return {
    from(table) {
      if (table === "signposts") {
        return {
          select() {
            return {
              eq() {
                return Promise.resolve({ data: signpostRows, error: signpostError });
              },
            };
          },
        };
      }
      if (table === "research_assessments") {
        return {
          select() {
            return {
              eq(_col, id) {
                return { maybeSingle: () => Promise.resolve({ data: historyRowsById[id] ?? null, error: null }) };
              },
            };
          },
        };
      }
      throw new Error(`fakeClient: unexpected table ${table}`);
    },
  };
}

test("fetchSignpostsForAssessment maps real rows from the injected client", async () => {
  const client = fakeClient({
    signpostRows: [
      { entity_id: "sp_1", assessment_id: "a1", watches: "corridor_x", predicate: { op: "date_passed", field: "d" }, direction: "confirms", fired_at: null },
    ],
  });
  const rows = await fetchSignpostsForAssessment(client, "a1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].watches, "corridor_x");
});

test("fetchSignpostsForAssessment soft-fails to [] on a client error, never throws", async () => {
  const client = fakeClient({ signpostError: { message: "relation does not exist" } });
  const rows = await fetchSignpostsForAssessment(client, "a1");
  assert.deepEqual(rows, []);
});

test("fetchSignpostsForAssessment returns [] with no client or no assessmentId, never calls out", async () => {
  assert.deepEqual(await fetchSignpostsForAssessment(null, "a1"), []);
  assert.deepEqual(await fetchSignpostsForAssessment(fakeClient(), null), []);
});

// ── selectAssessmentHistoryEntry / fetchAssessmentHistoryChain ───────────────────────────────────

test("selectAssessmentHistoryEntry maps maturity corridors, a point value, and never fabricates a cause", () => {
  const entry = selectAssessmentHistoryEntry({
    id: "row_2", supersedes: "row_1", is_current: true, computed_at: "2026-10-02T00:00:00Z", status_token: "CONFIRMED",
    lifecycle_state: "strengthening", technical_maturity_low: 6, technical_maturity_high: 6, commercial_maturity_low: 2, commercial_maturity_high: 4,
    horizon_band: "NEAR",
  });
  assert.equal(entry.technicalMaturityLabel, "TRL 6");
  assert.equal(entry.commercialMaturityLabel, "CRI 2-4");
  assert.equal(entry.cause, null);
  assert.equal(entry.isCurrent, true);
});

test("fetchAssessmentHistoryChain walks supersedes backward, newest first, until the chain ends", async () => {
  const client = fakeClient({
    historyRowsById: {
      row_1: { id: "row_1", supersedes: null, is_current: false, computed_at: "2026-09-01T00:00:00Z", status_token: "HYPOTHESIS", lifecycle_state: "emerging" },
    },
  });
  const current = { id: "row_2", supersedes: "row_1", is_current: true, computed_at: "2026-10-02T00:00:00Z", status_token: "CONFIRMED", lifecycle_state: "strengthening" };
  const chain = await fetchAssessmentHistoryChain(client, current);
  assert.equal(chain.length, 2);
  assert.equal(chain[0].id, "row_2");
  assert.equal(chain[0].isCurrent, true);
  assert.equal(chain[1].id, "row_1");
  assert.equal(chain[1].isCurrent, false);
});

test("fetchAssessmentHistoryChain stops honestly (never throws) when a step cannot be read -- the real-client RLS gap named in the module header", async () => {
  const client = fakeClient({ historyRowsById: {} }); // every lookup resolves to null, as RLS-denied would
  const current = { id: "row_2", supersedes: "row_1", is_current: true, computed_at: "2026-10-02T00:00:00Z", status_token: "CONFIRMED" };
  const chain = await fetchAssessmentHistoryChain(client, current);
  assert.equal(chain.length, 1);
  assert.equal(chain[0].id, "row_2");
});

test("fetchAssessmentHistoryChain returns [] for no current row, and [entry] for no client (no second-step attempted)", async () => {
  assert.deepEqual(await fetchAssessmentHistoryChain(fakeClient(), null), []);
  const current = { id: "row_2", supersedes: "row_1", is_current: true, computed_at: "2026-10-02T00:00:00Z", status_token: "CONFIRMED" };
  const chain = await fetchAssessmentHistoryChain(null, current);
  assert.equal(chain.length, 1);
});

test("fetchAssessmentHistoryChain respects maxDepth as a hard cap against a cyclical/malformed chain", async () => {
  const client = fakeClient({
    historyRowsById: {
      row_a: { id: "row_a", supersedes: "row_b", is_current: false, computed_at: "t", status_token: "HYPOTHESIS" },
      row_b: { id: "row_b", supersedes: "row_a", is_current: false, computed_at: "t", status_token: "HYPOTHESIS" }, // cycle
    },
  });
  const current = { id: "row_start", supersedes: "row_a", is_current: true, computed_at: "t", status_token: "CONFIRMED" };
  const chain = await fetchAssessmentHistoryChain(client, current, { maxDepth: 3 });
  assert.equal(chain.length, 4); // current + 3 steps, never infinite
});

// ── daysSince ─────────────────────────────────────────────────────────────────────────────────────

test("daysSince is pure and honest for null/invalid input", () => {
  assert.equal(daysSince(null), null);
  assert.equal(daysSince("not-a-date"), null);
  assert.equal(daysSince("2026-10-01T00:00:00Z", new Date("2026-10-03T00:00:00Z").getTime()), 2);
});
