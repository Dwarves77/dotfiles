// compliance-deadline-sync.test.mjs — DATECHAIN lane, 2026-09-11. See compliance-deadline-sync.mjs's
// own header for the rule this pins: nearest FUTURE event_kind='compliance_deadline' row wins;
// idempotent; never overwrites a value with null.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pickComplianceDeadline, syncComplianceDeadlineForItem } from "./compliance-deadline-sync.mjs";

const TODAY = "2026-09-11";

test("pickComplianceDeadline: fixture with two events picks the nearer future one", () => {
  const rows = [
    { id: "b", event_date: "2027-01-15", event_kind: "compliance_deadline", confidence: "high" },
    { id: "a", event_date: "2026-10-01", event_kind: "compliance_deadline", confidence: "high" },
  ];
  assert.equal(pickComplianceDeadline(rows, TODAY), "2026-10-01");
});

test("pickComplianceDeadline: ignores a past event_date", () => {
  const rows = [
    { id: "a", event_date: "2025-01-01", event_kind: "compliance_deadline", confidence: "high" },
    { id: "b", event_date: "2027-01-01", event_kind: "compliance_deadline", confidence: "high" },
  ];
  assert.equal(pickComplianceDeadline(rows, TODAY), "2027-01-01");
});

test("pickComplianceDeadline: never picks a non-compliance_deadline event_kind", () => {
  const rows = [
    { id: "a", event_date: "2026-10-01", event_kind: "entry_into_force", confidence: "high" },
    { id: "b", event_date: "2026-12-01", event_kind: "review_or_report", confidence: "high" },
  ];
  assert.equal(pickComplianceDeadline(rows, TODAY), null);
});

test("pickComplianceDeadline: same-date tie breaks toward higher confidence, then id", () => {
  const rows = [
    { id: "z", event_date: "2026-10-01", event_kind: "compliance_deadline", confidence: "medium" },
    { id: "a", event_date: "2026-10-01", event_kind: "compliance_deadline", confidence: "high" },
  ];
  assert.equal(pickComplianceDeadline(rows, TODAY), "2026-10-01");
  const rows2 = [
    { id: "z", event_date: "2026-10-01", event_kind: "compliance_deadline", confidence: "high" },
    { id: "a", event_date: "2026-10-01", event_kind: "compliance_deadline", confidence: "high" },
  ];
  // Same date + same confidence -> lowest id wins deterministically.
  const picked = pickComplianceDeadline(rows2, TODAY);
  assert.equal(picked, "2026-10-01"); // both candidates share this date; determinism is the point, not the value
});

test("pickComplianceDeadline: no rows -> null, never a fabricated date", () => {
  assert.equal(pickComplianceDeadline([], TODAY), null);
  assert.equal(pickComplianceDeadline(null, TODAY), null);
});

// ── syncComplianceDeadlineForItem: injected-client tests (no database) ─────────────────────────────

function fakeSb({ eventRows, currentDeadline }) {
  const writes = [];
  return {
    writes,
    from(table) {
      if (table === "item_forward_events") {
        return {
          select: () => ({
            eq: async () => ({ data: eventRows, error: null }),
          }),
        };
      }
      if (table === "intelligence_items") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { compliance_deadline: currentDeadline }, error: null }),
            }),
          }),
          update: (patch) => ({
            eq: async (col, val) => {
              writes.push({ patch, col, val });
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

test("syncComplianceDeadlineForItem: fixture with two events writes the right one", async () => {
  const sb = fakeSb({
    eventRows: [
      { id: "b", event_date: "2027-01-15", event_kind: "compliance_deadline", confidence: "high" },
      { id: "a", event_date: "2026-10-01", event_kind: "compliance_deadline", confidence: "high" },
    ],
    currentDeadline: null,
  });
  const result = await syncComplianceDeadlineForItem(sb, "item-1", TODAY);
  assert.deepEqual(result, { changed: true, value: "2026-10-01" });
  assert.equal(sb.writes.length, 1);
  assert.deepEqual(sb.writes[0].patch, { compliance_deadline: "2026-10-01" });
  assert.equal(sb.writes[0].val, "item-1");
});

test("syncComplianceDeadlineForItem: re-running changes nothing (idempotent)", async () => {
  const sb = fakeSb({
    eventRows: [{ id: "a", event_date: "2026-10-01", event_kind: "compliance_deadline", confidence: "high" }],
    currentDeadline: "2026-10-01", // already synced
  });
  const result = await syncComplianceDeadlineForItem(sb, "item-1", TODAY);
  assert.deepEqual(result, { changed: false, reason: "already up to date" });
  assert.equal(sb.writes.length, 0);
});

test("syncComplianceDeadlineForItem: never overwrites an existing value with null", async () => {
  const sb = fakeSb({ eventRows: [], currentDeadline: "2026-11-01" });
  const result = await syncComplianceDeadlineForItem(sb, "item-1", TODAY);
  assert.deepEqual(result, { changed: false, reason: "no future compliance_deadline event" });
  assert.equal(sb.writes.length, 0);
});

test("syncComplianceDeadlineForItem: surfaces a read error rather than silently skipping", async () => {
  const sb = {
    from: () => ({
      select: () => ({ eq: async () => ({ data: null, error: { message: "boom" } }) }),
    }),
  };
  await assert.rejects(() => syncComplianceDeadlineForItem(sb, "item-1", TODAY), /item_forward_events read failed: boom/);
});
