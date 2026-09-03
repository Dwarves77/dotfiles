// Run: node --test scripts/maintenance/derive-obligations.test.mjs — no DB, deps injected. The derivation
// itself is proven in scripts/obligations/derive-obligations.test.mjs; this tests the wrapper's orchestration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "./derive-obligations.mjs";

const EVENTS = [
  { id: "e1", intelligence_item_id: "i1", event_date: "2026-11-29", date_precision: "day", event_kind: "compliance_deadline" },
  { id: "e2", intelligence_item_id: "i1", event_date: "2027-01-01", date_precision: "day", event_kind: "entry_into_force" },
];
const ITEMS = [{ id: "i1", title: "Regulation (EU) 2024/1257 (Euro 7)", jurisdiction_iso: ["EU"], transport_modes: ["road"], is_archived: false }];

function deps() {
  const inserted = [];
  const store = { obligations: [] };
  return {
    inserted,
    readAll: async (table, cols, opts) => {
      if (table === "item_forward_events") return EVENTS;
      if (table === "intelligence_items") return ITEMS;
      if (table === "obligations") return store.obligations;
      throw new Error(`unexpected table ${table}`);
    },
    guardedInsertMany: async (table, rows, opts) => {
      assert.equal(table, "obligations");
      assert.ok(opts.cite?.skill || opts.cite?.reason, "every write carries a cite");
      inserted.push(...rows);
      store.obligations.push(...rows.map((r, i) => ({ id: `o${i}`, ...r })));
      return { inserted: rows.length, snapshot: "test" };
    },
  };
}

test("dry: derives, writes nothing, reports counts", async () => {
  const d = deps();
  const s = await main({ mode: "dry" }, d);
  assert.equal(s.step, "derive-obligations");
  assert.equal(d.inserted.length, 0);
  assert.equal(s.counts.forward_events, 2);
  assert.equal(s.counts.to_insert, 2);
  assert.equal(s.applied, 0);
  assert.equal(s.exitCode, 0);
});

test("apply: inserts through the guarded path, reads back the register, exit 0 when counts agree", async () => {
  const d = deps();
  const s = await main({ mode: "apply" }, d);
  assert.equal(d.inserted.length, 2);
  assert.equal(s.applied, 2);
  assert.equal(s.read_back.obligations_total, 2);
  assert.equal(s.read_back.active, 2);
  assert.equal(s.exitCode, 0);
});
