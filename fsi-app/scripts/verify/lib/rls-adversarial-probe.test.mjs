// rls-adversarial-probe.test.mjs -- DATA-1 (2026-10-11). Red-then-green proof of the two audit defects the
// live smoke run 38121705758 reported as ERROR:
//   (1) derivation-edges: one `$1` used for both from_pk (text) and to_value_id (uuid) -> Postgres cannot
//       deduce one type ("inconsistent types deduced for parameter $1").
//   (2) probe() issued BEGIN/ROLLBACK inside the caller's open transaction; Postgres has no nested
//       transactions, so the inner ROLLBACK ended the fixture transaction and the next SAVEPOINT threw
//       "can only be used in transaction blocks" (harness-runs and derivation-edges both).
// The fake client below MODELS those two Postgres behaviours (transaction state, aborted-until-rollback,
// savepoints, parameter type deduction, role privilege denial), so the tests fail against the old code for
// the same reason production did. No pg import: runs in the no-npm test job.
import { test } from "node:test";
import assert from "node:assert/strict";
import { probe } from "./rls-adversarial-probe.mjs";
import { runAudit as runDerivationEdges } from "../derivation-edges-rls-adversarial-audit.mjs";
import { runAudit as runHarnessRuns } from "../harness-runs-rls-adversarial-audit.mjs";

function pgErr(code, message) { const e = new Error(message); e.code = code; return e; }

/** A faithful-enough Postgres session: transaction block state, aborted-until-ROLLBACK-TO, savepoints that
 *  also restore the SET LOCAL role, parameter type deduction on derivation_edges inserts, and privilege
 *  denial (42501) for every write or read of the two audited tables by a role other than service_role. */
function fakePg() {
  const st = { inTx: false, aborted: false, role: "service_role", sps: [], log: [] };
  const fail = (code, msg) => { if (st.inTx) st.aborted = true; throw pgErr(code, msg); };
  async function query(sql, params = []) {
    const q = sql.trim().replace(/\s+/g, " ");
    st.log.push(q);
    if (/^BEGIN$/i.test(q)) { st.inTx = true; return { rows: [] }; }
    if (/^ROLLBACK$/i.test(q)) { st.inTx = false; st.aborted = false; st.sps = []; st.role = "service_role"; return { rows: [] }; }
    let m;
    if ((m = q.match(/^SAVEPOINT (\w+)$/i))) {
      if (!st.inTx) throw pgErr("25P01", "SAVEPOINT can only be used in transaction blocks");
      if (st.aborted) throw pgErr("25P02", "current transaction is aborted");
      st.sps.push({ name: m[1], role: st.role }); return { rows: [] };
    }
    if ((m = q.match(/^ROLLBACK TO SAVEPOINT (\w+)$/i))) {
      const i = st.sps.findIndex((s) => s.name === m[1]);
      if (!st.inTx || i < 0) throw pgErr("3B001", `no such savepoint ${m[1]}`);
      st.role = st.sps[i].role; st.sps.length = i + 1; st.aborted = false; return { rows: [] };
    }
    if ((m = q.match(/^RELEASE SAVEPOINT (\w+)$/i))) {
      const i = st.sps.findIndex((s) => s.name === m[1]);
      if (!st.inTx || i < 0) throw pgErr("3B001", `no such savepoint ${m[1]}`);
      st.sps.length = i; return { rows: [] };
    }
    if (st.aborted) throw pgErr("25P02", "current transaction is aborted, commands ignored until end of transaction block");
    if ((m = q.match(/^SET LOCAL ROLE (\w+)$/i))) { st.role = m[1]; return { rows: [] }; }
    if (/^RESET ROLE$/i.test(q)) { st.role = "service_role"; return { rows: [] }; }
    if (/^SELECT set_config/i.test(q)) return { rows: [{ set_config: "" }] };
    if (/to_regclass/i.test(q)) return { rows: [{ ok: true }] };
    const touchesAudited = /derivation_edges|harness_runs/i.test(q);
    if (touchesAudited && /^(INSERT|UPDATE|DELETE)/i.test(q) && st.role !== "service_role") fail("42501", "permission denied");
    if (/^INSERT INTO public\.derived_values/i.test(q)) return { rows: [{ value_id: "11111111-1111-1111-1111-111111111111" }] };
    if (/^INSERT INTO public\.derivation_edges/i.test(q)) {
      const vals = q.match(/VALUES \((.*)\)$/i)?.[1].split(",").map((x) => x.trim()) ?? [];
      const [fromPk, toValue] = [vals[1], vals[2]];
      if (/^\$\d+$/.test(fromPk) && fromPk === toValue) fail("42P08", `inconsistent types deduced for parameter ${fromPk}`);
      return { rows: [] };
    }
    if (/^SELECT count\(\*\)/i.test(q) && touchesAudited) {
      if (st.role !== "service_role") return { rows: [{ n: 0 }] };
      return { rows: [{ n: 1 }] };
    }
    return { rows: [] };
  }
  return { query, st };
}

test("probe: runs inside the caller's transaction with a SAVEPOINT, never BEGIN or ROLLBACK, and leaves the transaction open", async () => {
  const c = fakePg();
  await c.query("BEGIN");
  const results = [];
  await probe(c, "anon insert denied", "deny", "INSERT INTO public.harness_runs (run_id) VALUES ($1)", ["x"], ["SET LOCAL ROLE anon"], results);
  assert.deepEqual(results.map((r) => r.verdict), ["PASS"]);
  const after = c.st.log.slice(1);
  assert.ok(after.some((q) => /^SAVEPOINT /.test(q)), "uses a savepoint");
  assert.ok(!after.some((q) => /^(BEGIN|ROLLBACK)$/i.test(q)), "never opens or ends the caller's transaction");
  assert.equal(c.st.inTx, true, "the caller's transaction is still open");
  assert.equal(c.st.role, "service_role", "SET LOCAL ROLE was undone by the savepoint rollback");
  // a SECOND probe and a later SAVEPOINT on the same connection still work (the observed ERROR)
  await probe(c, "anon delete denied", "deny", "DELETE FROM public.harness_runs WHERE run_id = $1", ["x"], ["SET LOCAL ROLE anon"], results);
  await c.query("SAVEPOINT probe_e");
  assert.deepEqual(results.map((r) => r.verdict), ["PASS", "PASS"]);
});

test("probe: an allowed write on a 'deny' probe is a FAIL, a wrong-reason error is an ERROR, both leave the transaction usable", async () => {
  const c = fakePg();
  await c.query("BEGIN");
  const results = [];
  await probe(c, "allowed", "deny", "INSERT INTO public.harness_runs (run_id) VALUES ($1)", ["x"], [], results);
  await probe(c, "wrong reason", "deny", "INSERT INTO public.derivation_edges (from_table, from_pk, to_value_id, edge_kind) VALUES ('t', $1, $1, 'i')", ["x"], ["SET LOCAL ROLE anon"], results);
  assert.deepEqual(results.map((r) => r.verdict), ["FAIL", "PASS"], "42501 from the role check wins before the type check in this model");
  await probe(c, "typed", "deny", "INSERT INTO public.derivation_edges (from_table, from_pk, to_value_id, edge_kind) VALUES ('t', $1, $1, 'i')", ["x"], [], results);
  assert.equal(results[2].verdict, "ERROR", "the type-deduction error is surfaced as ERROR, not swallowed");
  assert.match(results[2].note, /42P08/);
  await c.query("SAVEPOINT still_usable");
});

test("harness-runs audit: all six legs run to a verdict on a real transaction model (the nested-ROLLBACK ERROR is gone)", async () => {
  const c = fakePg();
  const out = await runHarnessRuns(c);
  assert.equal(out.skip, undefined);
  assert.equal(out.results.length, 6);
  assert.deepEqual(out.results.filter((r) => r.verdict !== "PASS"), []);
  assert.equal(out.allPass, true);
});

test("derivation-edges audit: the fixture edge insert and every probe use typed parameters and all six legs pass", async () => {
  const c = fakePg();
  const out = await runDerivationEdges(c);
  assert.equal(out.skip, undefined);
  assert.equal(out.results.length, 6);
  assert.deepEqual(out.results.filter((r) => r.verdict !== "PASS"), []);
  assert.equal(out.allPass, true);
  for (const q of c.st.log.filter((x) => /^INSERT INTO public\.derivation_edges/i.test(x))) {
    assert.match(q, /\$1::text, \$1::uuid/, "from_pk is text and to_value_id is uuid: two casts, never one bare $1");
  }
});

test("derivation-edges audit: a leaky grant (anon insert allowed) is a FAIL, proving the audit still attacks", async () => {
  const c = fakePg();
  const orig = c.query;
  c.query = async (sql, params) => {
    // model a leak: anon is allowed to write
    if (/^SET LOCAL ROLE anon$/i.test(sql.trim())) return orig("SET LOCAL ROLE service_role", params);
    return orig(sql, params);
  };
  const out = await runDerivationEdges(c);
  assert.equal(out.allPass, false);
  assert.ok(out.results.some((r) => r.verdict === "FAIL" && /anon/.test(r.label)));
});
