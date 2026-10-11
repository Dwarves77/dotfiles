// layer-c-insert-gate-proof.test.mjs -- DATA-1 (2026-10-11). The proof exited 2 on every live-smoke run
// ("need SUPABASE_DB_URL or DATABASE_URL") because it read the connection string from the environment
// itself instead of the shared connectPg resolver (which derives the pooler from the secrets the lane does
// inject). RED: the old file had no runProof export and read the env directly. GREEN: the connection comes
// from connectPg, and the six legs run against an injected client that models the migration-240 guard.
// No pg import: runs in the no-npm test job.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runProof } from "./layer-c-insert-gate-proof.mjs";

/** A client that models guard_data_audit_block: an open block bounces an insert unless a waiver action with a
 *  future `until` is on it, or the transaction-local override marker is set. */
function fakeGuardClient() {
  const st = { block: false, actions: null, override: false, log: [] };
  return {
    st,
    async query(sql, params = []) {
      const q = sql.trim().replace(/\s+/g, " ");
      st.log.push(q);
      if (/^INSERT INTO _lcig_probe/.test(q)) {
        if (st.block && !st.override) {
          const a = st.actions;
          const waived = a && a.action === "waiver" && a.until > new Date().toISOString().slice(0, 10);
          if (!waived) throw new Error("layer-c-insert-gate: open data-audit block without a current dated waiver");
        }
        return { rows: [] };
      }
      if (/^INSERT INTO public\.integrity_flags/.test(q)) { st.block = true; st.actions = null; return { rows: [{ id: "blk-1" }] }; }
      let m;
      if ((m = q.match(/^UPDATE public\.integrity_flags SET recommended_actions = jsonb_build_array\(jsonb_build_object\('action','(\w+)','until',\$1::text\)\)/))) {
        st.actions = { action: m[1], until: params[0] }; return { rows: [] };
      }
      if (/^UPDATE public\.integrity_flags SET recommended_actions = '\[\]'/.test(q)) { st.actions = null; return { rows: [] }; }
      if (/^SELECT set_config\('app\.data_audit_override'/.test(q)) { st.override = true; return { rows: [] }; }
      return { rows: [] };
    },
  };
}

test("runProof: all six legs pass against a client that models the guard, and the transaction is always rolled back", async () => {
  const c = fakeGuardClient();
  const out = await runProof(c, { log: () => {} });
  assert.equal(out.pass, true);
  assert.deepEqual(Object.values(out.legs), [true, true, true, true, true, true]);
  assert.equal(c.st.log[0], "BEGIN");
  assert.equal(c.st.log.at(-1), "ROLLBACK");
});

test("runProof: a guard that bounces nothing (a bricked gate) fails the RED legs, so the proof still attacks", async () => {
  const c = fakeGuardClient();
  const orig = c.query;
  c.query = async (sql, params) => (/^INSERT INTO _lcig_probe/.test(sql.trim()) ? { rows: [] } : orig(sql, params));
  const out = await runProof(c, { log: () => {} });
  assert.equal(out.pass, false);
  assert.deepEqual([out.legs.red1, out.legs.red2, out.legs.red3], [false, false, false]);
});

test("runProof: a rollback runs even when a leg throws unexpectedly", async () => {
  const c = fakeGuardClient();
  const orig = c.query;
  c.query = async (sql, params) => { if (/CREATE TEMP TABLE/.test(sql)) throw new Error("boom"); return orig(sql, params); };
  await assert.rejects(() => runProof(c, { log: () => {} }), /boom/);
  assert.equal(c.st.log.at(-1), "ROLLBACK");
});

test("the CLI resolves its connection through connectPg, not a hand-read env var (the exit-2-on-every-run defect)", () => {
  const src = readFileSync(fileURLToPath(new URL("./layer-c-insert-gate-proof.mjs", import.meta.url)), "utf8");
  assert.match(src, /import \{ connectPg \} from "\.\.\/lib\/pg-conn\.mjs"/);
  assert.doesNotMatch(src, /process\.env\.SUPABASE_DB_URL/);
  assert.doesNotMatch(src, /process\.env\.DATABASE_URL/);
  assert.doesNotMatch(src, /import pg from "pg"/);
});
