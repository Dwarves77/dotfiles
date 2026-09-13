// Proof for scripts/lib/changelog.mjs's recordItemChange (D23 part (a), 2026-09-13). Portable: node:
// builtins only, no npm deps, no database, matching revalidate.test.mjs's own fake-dependency posture.
import test from "node:test";
import assert from "node:assert/strict";
import {
  recordItemChange,
  impactLevelForSeverity,
  detectedByForField,
  IMPACT_LEVEL_BY_SEVERITY,
  DEFAULT_IMPACT_LEVEL,
} from "./changelog.mjs";

/** A minimal fake of the {findExisting, insert} adapter this module asks for, see changelog.mjs's
 *  own header for why that shape, not a raw Supabase client. `rows` is the idempotency ledger this
 *  fake consults; `inserted` captures every row a test can then assert on. */
function fakeClient(rows = [], inserted = []) {
  return {
    async findExisting({ itemId, field, batch }) {
      return rows.some((r) => r.item_id === itemId && r.field === field && r.new_value === batch);
    },
    async insert(row) {
      inserted.push(row);
      rows.push(row);
      return { error: null };
    },
  };
}

test("impactLevelForSeverity maps the five severities per D23(a)'s table, defaults MODERATE", () => {
  assert.equal(impactLevelForSeverity("action_required"), "HIGH");
  assert.equal(impactLevelForSeverity("cost_alert"), "HIGH");
  assert.equal(impactLevelForSeverity("window_closing"), "CRITICAL");
  assert.equal(impactLevelForSeverity("competitive_edge"), "MODERATE");
  assert.equal(impactLevelForSeverity("monitoring"), "LOW");
  assert.equal(impactLevelForSeverity(undefined), DEFAULT_IMPACT_LEVEL);
  assert.equal(impactLevelForSeverity("not-a-real-severity"), DEFAULT_IMPACT_LEVEL);
  assert.equal(Object.keys(IMPACT_LEVEL_BY_SEVERITY).length, 5);
});

test("detectedByForField: full_brief -> record-briefs, timeline -> timeline-backfill", () => {
  assert.equal(detectedByForField("full_brief"), "record-briefs");
  assert.equal(detectedByForField("timeline"), "timeline-backfill");
  assert.equal(detectedByForField("something-else"), "record-briefs", "an unrecognised field still gets an honest, non-null detected_by");
});

test("apply:true writes one row with the mapped impact_level and change_type UPDATED", async () => {
  const inserted = [];
  const client = fakeClient([], inserted);
  const r = await recordItemChange(client, {
    itemId: "g14",
    field: "full_brief",
    batch: "record-briefs-002",
    severity: "action_required",
    note: "Batch record-briefs-002: brief regenerated with 6 claim(s).",
    apply: true,
  });
  assert.equal(r.written, true);
  assert.equal(r.reason, "inserted");
  assert.equal(inserted.length, 1);
  assert.deepEqual(inserted[0], {
    item_id: "g14",
    change_date: r.row.change_date,
    change_type: "UPDATED",
    field: "full_brief",
    new_value: "record-briefs-002",
    impact: "Batch record-briefs-002: brief regenerated with 6 claim(s).",
    impact_level: "HIGH",
    detected_by: "record-briefs",
  });
});

test("a second call for the same item and batch writes nothing (idempotent)", async () => {
  const inserted = [];
  const rows = [];
  const client = fakeClient(rows, inserted);
  const first = await recordItemChange(client, {
    itemId: "g14",
    field: "full_brief",
    batch: "record-briefs-002",
    severity: "monitoring",
    note: "first call",
    apply: true,
  });
  assert.equal(first.written, true);

  const second = await recordItemChange(client, {
    itemId: "g14",
    field: "full_brief",
    batch: "record-briefs-002",
    severity: "monitoring",
    note: "second call, same item + batch",
    apply: true,
  });
  assert.equal(second.written, false);
  assert.equal(second.reason, "already recorded for this item and batch");
  assert.equal(inserted.length, 1, "the second call must not insert a second row");
});

test("a different batch for the SAME item is a distinct change (not deduplicated)", async () => {
  const inserted = [];
  const rows = [];
  const client = fakeClient(rows, inserted);
  await recordItemChange(client, { itemId: "g14", field: "full_brief", batch: "batch-001", note: "n1", apply: true });
  await recordItemChange(client, { itemId: "g14", field: "full_brief", batch: "batch-002", note: "n2", apply: true });
  assert.equal(inserted.length, 2);
});

test("dry (apply omitted / false) writes nothing and reports the row it would write", async () => {
  const inserted = [];
  const client = fakeClient([], inserted);
  const r = await recordItemChange(client, {
    itemId: "g14",
    field: "timeline",
    batch: "timeline-backfill",
    note: "Timeline entry added via timeline-backfill (captured) dated 2026-09-13.",
  });
  assert.equal(r.written, false);
  assert.equal(r.reason, "dry, would insert");
  assert.ok(r.row, "dry mode still reports the row it would have written");
  assert.equal(r.row.field, "timeline");
  assert.equal(r.row.detected_by, "timeline-backfill");
  assert.equal(inserted.length, 0, "dry mode must never call insert");
});

test("dry mode still performs the idempotency read honestly (already-recorded reads as already-recorded, not would-write)", async () => {
  const existing = [{ item_id: "g14", field: "full_brief", new_value: "record-briefs-002" }];
  const client = fakeClient(existing, []);
  const r = await recordItemChange(client, {
    itemId: "g14",
    field: "full_brief",
    batch: "record-briefs-002",
    note: "would this write a duplicate?",
    apply: false,
  });
  assert.equal(r.written, false);
  assert.equal(r.reason, "already recorded for this item and batch");
});

test("missing required fields refuses without touching the client", async () => {
  const inserted = [];
  const client = fakeClient([], inserted);
  const r = await recordItemChange(client, { itemId: "g14", field: "full_brief", batch: "", note: "x", apply: true });
  assert.equal(r.written, false);
  assert.match(r.reason, /missing/);
  assert.equal(inserted.length, 0);
});

test("an insert error is reported, not thrown", async () => {
  const client = {
    async findExisting() {
      return false;
    },
    async insert() {
      return { error: { message: "constraint violation" } };
    },
  };
  const r = await recordItemChange(client, { itemId: "g14", field: "full_brief", batch: "b1", note: "n", apply: true });
  assert.equal(r.written, false);
  assert.match(r.reason, /constraint violation/);
});

test("a findExisting throw is caught and reported, not thrown", async () => {
  const client = {
    async findExisting() {
      throw new Error("connection reset");
    },
    async insert() {
      throw new Error("must not be reached");
    },
  };
  const r = await recordItemChange(client, { itemId: "g14", field: "full_brief", batch: "b1", note: "n", apply: true });
  assert.equal(r.written, false);
  assert.match(r.reason, /connection reset/);
});
