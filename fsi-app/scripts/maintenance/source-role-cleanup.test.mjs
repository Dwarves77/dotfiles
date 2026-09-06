// Run: node --test scripts/maintenance/source-role-cleanup.test.mjs — no DB, a fake pg-shaped `query`.
// classifySourceRole itself is proven in src/lib/sources/classify-source-role.test.mjs; this file tests
// the wrapper's mode->execute mapping, scope arg, and summary shape only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "./source-role-cleanup.mjs";

const ROWS = [
  { id: "s1", name: "Greenhouse Gas Protocol", url: "https://ghgprotocol.org", source_role: "regulator", category: "gov", status: "suspended" },
  { id: "s2", name: "Reuters", url: "https://reuters.com", source_role: "regulator", category: "gov", status: "active" },
  { id: "s3", name: "US EPA", url: "https://epa.gov", source_role: "publisher", category: "gov", status: "active" }, // already correct-ish, no mismatch below
];

function fakeQuery(rows, classify) {
  const state = new Map(rows.map((r) => [r.id, { ...r }]));
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith("SELECT")) return { rows: [...state.values()] };
    // UPDATE ... WHERE id=$1 AND source_role IS NOT DISTINCT FROM $3 RETURNING source_role, category
    const [id, newRole, oldRole] = params;
    const row = state.get(id);
    if (!row || row.source_role !== oldRole) return { rows: [], rowCount: 0 };
    row.source_role = newRole;
    return { rows: [{ source_role: row.source_role, category: row.category }], rowCount: 1 };
  };
  return { query, calls, state };
}

test("dry: reports mismatches, writes nothing", async () => {
  const d = fakeQuery(ROWS);
  const s = await main({ mode: "dry" }, d);
  assert.equal(s.step, "source-role-cleanup");
  assert.equal(s.mode, "dry");
  assert.equal(d.calls.length, 1, "only the SELECT ran");
  assert.equal(s.counts.scope, "all");
  assert.equal(s.applied, 0);
  assert.equal(s.exitCode, 0);
  assert.ok(s.counts.ghg_protocol, "the GHG Protocol row is surfaced when it mismatches");
});

test("dry: arg=active-only narrows scope (still no write)", async () => {
  const d = fakeQuery(ROWS);
  const s = await main({ mode: "dry", arg: "active-only" }, d);
  assert.equal(s.counts.scope, "active-only");
  assert.equal(d.calls.length, 1);
});

test("apply: writes each confident mismatch through query, verifies read-back", async () => {
  const d = fakeQuery(ROWS);
  const s = await main({ mode: "apply" }, d);
  assert.ok(s.applied >= 1, "at least the GHG Protocol mismatch applied");
  assert.equal(d.calls.slice(1).every((c) => c.sql.startsWith("UPDATE")), true);
  assert.equal(s.read_back.applied, s.applied);
  assert.equal(s.read_back.halted, 0);
});

test("apply: a row whose role changed under us fails read-back and is not counted applied", async () => {
  const d = fakeQuery(ROWS);
  const realQuery = d.query;
  let updateSeen = false;
  d.query = async (sql, params) => {
    if (sql.startsWith("UPDATE") && !updateSeen) {
      updateSeen = true;
      // simulate a concurrent writer: the WHERE clause's source_role guard now misses.
      return { rows: [], rowCount: 0 };
    }
    return realQuery(sql, params);
  };
  const s = await main({ mode: "apply" }, d);
  assert.ok(s.read_back.halted >= 1);
  assert.ok(s.note?.includes("FAILED read-back"));
});
