// Run: node --test scripts/maintenance/regen-quarantined.test.mjs — no DB, a fake `sb`/`readAll`/`verifyItem`.
// verify-item's own decision core is proven in src/lib/sources/verify-item.test.mjs; this file tests the
// wrapper's mode->apply mapping, --only scoping, and summary shape only (verifyItem itself is faked).
import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "./regen-quarantined.mjs";

const ITEMS = [
  { id: "aaaaaaaa-1", legacy_id: "it-042", title: "Verified-cheap candidate", item_type: "regulation" },
  { id: "bbbbbbbb-2", legacy_id: "it-043", title: "Stale one", item_type: "regulation" },
  { id: "cccccccc-3", legacy_id: "it-044", title: "Held research type", item_type: "research_finding" },
];

function deps({ outcomeFor = () => "verified_cheap" } = {}) {
  const rpcCalls = [];
  const provStatus = new Map(); // id -> provenance_status after RPC
  const sb = {
    from(table) {
      return {
        select() { return this; },
        eq(col, val) { this._id = table === "intelligence_items" ? val : this._id; return this; },
        async single() {
          if (table === "intelligence_items") return { data: { provenance_status: provStatus.get(this._id) ?? "quarantined" } };
          return { data: null };
        },
      };
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      provStatus.set(args.p_item_id, "verified"); // simulate the trigger flipping it
      return { data: null };
    },
  };
  const readAll = async (table, cols, opts) => {
    assert.equal(table, "intelligence_items");
    return ITEMS;
  };
  const verifyItem = async (_sb, id) => ({ outcome: outcomeFor(id) });
  return { sb, readAll, verifyItem, rpcCalls };
}

test("dry: decides but never calls the RPC", async () => {
  const d = deps();
  const s = await main({ mode: "dry" }, d);
  assert.equal(s.step, "regen-quarantined");
  assert.equal(d.rpcCalls.length, 0);
  assert.equal(s.counts.quarantined, 3);
  assert.equal(s.counts.held_q2_gate, 1, "research_finding is HOLD_TYPES");
  assert.equal(s.counts.eligible, 2);
  assert.equal(s.applied, 0);
  assert.equal(s.exitCode, 0);
});

test("apply: verified_cheap items flip via the $0 RPC and are counted applied", async () => {
  const d = deps({ outcomeFor: () => "verified_cheap" });
  const s = await main({ mode: "apply" }, d);
  assert.equal(d.rpcCalls.length, 2, "one $0 validate call per eligible item");
  assert.equal(s.applied, 2);
  assert.equal(s.read_back.flipped_to_verified, 2);
});

test("apply: --only scopes to the named legacy_id", async () => {
  const d = deps({ outcomeFor: () => "verified_cheap" });
  const s = await main({ mode: "apply", arg: "it-042" }, d);
  assert.equal(d.rpcCalls.length, 1);
  assert.equal(s.counts.decided, 1);
});

test("dry: stale_flag / needs_acquire items are reported, never applied", async () => {
  const d = deps({ outcomeFor: (id) => (id.startsWith("bbb") ? "stale_flag" : "needs_acquire") });
  const s = await main({ mode: "apply" }, d);
  assert.equal(s.counts.stale_snapshot, 1);
  assert.equal(s.counts.needs_acquire_locked, 1);
  assert.equal(s.applied, 0);
  assert.equal(d.rpcCalls.length, 0);
});
