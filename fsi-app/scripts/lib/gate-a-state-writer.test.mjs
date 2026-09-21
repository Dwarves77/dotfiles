import { test } from "node:test";
import assert from "node:assert/strict";
import { readGateAStateRow, upsertGateAState } from "./gate-a-state-writer.mjs";

function fakeRc(row) {
  return {
    from(table) {
      assert.equal(table, "item_gate_a_state");
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: row, error: null }; },
      };
    },
  };
}

function fakeRcError() {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: null, error: { message: "boom" } }; },
      };
    },
  };
}

test("readGateAStateRow returns null when no row exists", async () => {
  const rc = fakeRc(null);
  const row = await readGateAStateRow(rc, "item-1");
  assert.equal(row, null);
});

test("readGateAStateRow returns the row when one exists", async () => {
  const rc = fakeRc({ intelligence_item_id: "item-1", gate_a_version: "2026-09-04.1", orphan_count: 0, scanned_hash: "abc" });
  const row = await readGateAStateRow(rc, "item-1");
  assert.deepEqual(row, { intelligence_item_id: "item-1", gate_a_version: "2026-09-04.1", orphan_count: 0, scanned_hash: "abc" });
});

test("readGateAStateRow throws on a real query error, never swallows it", async () => {
  await assert.rejects(() => readGateAStateRow(fakeRcError(), "item-1"), /readGateAStateRow failed: boom/);
});

test("upsertGateAState routes to guardedUpdate/guardedInsert per module import (shape check only)", async () => {
  // This module delegates to db.mjs's guardedUpdate/guardedInsert, which require a live write client and
  // are exercised by db.mjs's own test suite + provenance-heal's apply-mode tests. Here we assert only
  // that the exported function exists with the expected arity/shape so a signature drift is caught.
  assert.equal(typeof upsertGateAState, "function");
  assert.equal(upsertGateAState.length, 2);
});
