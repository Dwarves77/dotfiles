// load-subset.test.mjs -- PROOF-2. Injected client and an injected file reader; no database, no disk.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "node:crypto";
import { join } from "node:path";
import { loadSubset, readSubset, isLoopbackConnString, runCli, CADENCE_ON } from "./load-subset.mjs";

const DIR = "/runner-temp/subset";

function files(tables) {
  const fs = new Map();
  const manifest = { version: 1, tables: [] };
  tables.forEach(([table, rows], i) => {
    const file = `${String(i + 1).padStart(3, "0")}_${table}.jsonl`;
    const body = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
    fs.set(join(DIR, file), body);
    manifest.tables.push({ table, file, rows: rows.length, sha256: hash("sha256", body) });
  });
  fs.set(join(DIR, "manifest.json"), JSON.stringify(manifest));
  return { fs, reader: (p) => { if (!fs.has(p)) throw new Error(`no file ${p}`); return fs.get(p); } };
}

const TABLES = [
  ["institutions", [{ id: "inst1" }]],
  ["sources", [{ id: "s1", institution_id: "inst1" }, { id: "s2", institution_id: "inst1" }]],
  ["intelligence_items", [{ id: "i1", title: "T", generated_col: "x" }]],
];

/** Fake local stack. preseeded: table -> existing row count. Tracks counts and switch state. */
function fakeStack({ preseeded = {}, harnessRuns = 0, halt = 0, role = "origin", dropRows = {} } = {}) {
  const calls = [];
  const counts = { ...preseeded };
  const state = { scrape_cadence: "off", global_processing_paused: true, judgement_drain: "on" };
  let inTx = false;
  let sessionRole = "origin";
  return {
    calls, state,
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, " ").trim();
      calls.push(s);
      if (s === "BEGIN") { inTx = true; return { rows: [] }; }
      if (s === "COMMIT" || s === "ROLLBACK") { inTx = false; sessionRole = "origin"; return { rows: [] }; }
      if (s === "SET LOCAL session_replication_role = replica") { assert.ok(inTx, "SET LOCAL needs a transaction"); sessionRole = "replica"; return { rows: [] }; }
      if (s === "SHOW session_replication_role") return { rows: [{ session_replication_role: role === "origin" ? sessionRole : role }] };
      if (s.includes("information_schema.columns")) {
        // generated_col is a generated column locally: not insertable
        const base = { institutions: ["id"], sources: ["id", "institution_id"], intelligence_items: ["id", "title"] }[params[0]];
        return { rows: (base ?? []).map((column_name) => ({ column_name })) };
      }
      let m = s.match(/^SELECT count\(\*\)::int AS n FROM public\."(\w+)"$/);
      if (m) return { rows: [{ n: counts[m[1]] ?? 0 }] };
      if (s.startsWith("SELECT count(*)::int AS n FROM public.harness_runs")) return { rows: [{ n: harnessRuns }] };
      if (s.includes("FROM public.integrity_flags")) return { rows: [{ n: halt }] };
      m = s.match(/^INSERT INTO public\."(\w+)" \((.*?)\) SELECT/);
      if (m) {
        assert.ok(inTx && sessionRole === "replica", "inserts run inside the replica transaction");
        assert.ok(!m[2].includes("generated_col"), "generated column never inserted");
        const rows = JSON.parse(params[0]);
        const n = rows.length - (dropRows[m[1]] ?? 0);
        counts[m[1]] = (counts[m[1]] ?? 0) + n;
        return { rows: [], rowCount: n };
      }
      if (s.startsWith("SELECT * FROM public.admin_set_pause_state")) { state.global_processing_paused = params[1]; state.scrape_cadence = params[2]; return { rows: [{}] }; }
      if (s.startsWith("SELECT * FROM public.admin_set_judgement_drain")) { state.judgement_drain = params[1]; return { rows: [{}] }; }
      if (s.startsWith("SELECT scrape_cadence")) return { rows: [{ ...state }] };
      throw new Error(`fake stack: unhandled SQL ${s}`);
    },
    end: async () => {},
  };
}

test("load: order honoured, triggers off then on, counts verified, switches only through the RPCs", async () => {
  const { reader } = files(TABLES);
  const client = fakeStack();
  const logs = [];
  const out = await loadSubset({ client, dir: DIR, readFileFn: reader, log: (m) => logs.push(m) });
  const inserts = client.calls.filter((c) => c.startsWith("INSERT INTO")).map((c) => c.match(/public\."(\w+)"/)[1]);
  assert.deepEqual(inserts, ["institutions", "sources", "intelligence_items"], "manifest (FK) order");
  const iReplica = client.calls.indexOf("SET LOCAL session_replication_role = replica");
  const iFirstInsert = client.calls.findIndex((c) => c.startsWith("INSERT INTO"));
  const iCommit = client.calls.indexOf("COMMIT");
  const iShow = client.calls.indexOf("SHOW session_replication_role");
  assert.ok(iReplica < iFirstInsert && iFirstInsert < iCommit && iCommit < iShow, "triggers off before the first insert, back on after commit");
  // switches: RPC calls present, and no direct write to system_state was ever issued
  assert.ok(client.calls.some((c) => c.startsWith("SELECT * FROM public.admin_set_pause_state")));
  assert.ok(client.calls.some((c) => c.startsWith("SELECT * FROM public.admin_set_judgement_drain")));
  assert.ok(client.calls.every((c) => !/^(UPDATE|DELETE|TRUNCATE)\b/i.test(c)), "no UPDATE/DELETE is ever issued");
  assert.ok(client.calls.every((c) => !/(INSERT INTO|UPDATE)\s+public\.system_state/i.test(c)), "system_state is never written directly");
  assert.deepEqual(client.state, { scrape_cadence: CADENCE_ON, global_processing_paused: false, judgement_drain: "off" });
  assert.equal(out.corrections_selfcheck.rerun, false);
  assert.match(out.corrections_selfcheck.reason, /DO block/);
  assert.match(logs.join("\n"), /tables=3 rows=4/);
  assert.ok(!logs.join("\n").includes("generated_col"));
});

test("load: a sha256 mismatch stops before any row is inserted", async () => {
  const { fs } = files(TABLES);
  fs.set(join(DIR, "002_sources.jsonl"), JSON.stringify({ id: "tampered" }) + "\n");
  const client = fakeStack();
  await assert.rejects(loadSubset({ client, dir: DIR, readFileFn: (p) => fs.get(p), log: () => {} }), /sha256 mismatch for table sources/);
  assert.ok(client.calls.every((c) => !c.startsWith("INSERT")));
});

test("load: a count mismatch fails (rows silently conflicting away in an empty table)", async () => {
  const { reader } = files(TABLES);
  const client = fakeStack({ dropRows: { sources: 1 } });
  await assert.rejects(loadSubset({ client, dir: DIR, readFileFn: reader, log: () => {} }), /count mismatch for sources: loaded 1, manifest 2/);
});

test("load: a preseeded reference table loads with conflicts tolerated and is reported", async () => {
  const { reader } = files(TABLES);
  const client = fakeStack({ preseeded: { institutions: 1 }, dropRows: { institutions: 1 } });
  const out = await loadSubset({ client, dir: DIR, readFileFn: reader, log: () => {} });
  assert.equal(out.tables.find((t) => t.table === "institutions").preseeded, true);
});

test("load: triggers still off after the load fails the run", async () => {
  const { reader } = files(TABLES);
  const client = fakeStack({ role: "replica" });
  await assert.rejects(loadSubset({ client, dir: DIR, readFileFn: reader, log: () => {} }), /not origin after the load/);
});

test("load: a non-empty harness_runs or an open halt flag fails", async () => {
  const { reader } = files(TABLES);
  await assert.rejects(loadSubset({ client: fakeStack({ harnessRuns: 2 }), dir: DIR, readFileFn: reader, log: () => {} }), /empty ledger/);
  await assert.rejects(loadSubset({ client: fakeStack({ halt: 1 }), dir: DIR, readFileFn: reader, log: () => {} }), /fleet-budget-halt/);
});

test("load: a table missing from the local stack names the table", async () => {
  const { reader } = files([["nonexistent", [{ id: 1 }]]]);
  await assert.rejects(loadSubset({ client: fakeStack(), dir: DIR, readFileFn: reader, log: () => {} }), /table nonexistent does not exist/);
});

test("readSubset rejects a row-count disagreement with the manifest", () => {
  const { fs } = files(TABLES);
  const manifest = JSON.parse(fs.get(join(DIR, "manifest.json")));
  manifest.tables[0].rows = 5;
  fs.set(join(DIR, "manifest.json"), JSON.stringify(manifest));
  assert.throws(() => readSubset(DIR, (p) => fs.get(p)), /manifest says 5/);
});

test("loopback guard: only localhost, 127.0.0.1 and ::1 are accepted (attack: a production URL)", () => {
  assert.equal(isLoopbackConnString("postgresql://postgres:x@127.0.0.1:54322/postgres"), true);
  assert.equal(isLoopbackConnString("postgresql://postgres:x@localhost:54322/postgres"), true);
  assert.equal(isLoopbackConnString("postgresql://postgres:x@[::1]:54322/postgres"), true);
  assert.equal(isLoopbackConnString("postgresql://postgres:x@db.abcdefgh.supabase.co:5432/postgres"), false);
  assert.equal(isLoopbackConnString("postgresql://postgres:x@127.0.0.1.evil.example/postgres"), false);
  assert.equal(isLoopbackConnString("not a url"), false);
});

test("runCli: exit 2 without PROOF_DB_URL; refuses a remote host and never connects; exit 1 without --dir", async () => {
  const errs = [];
  let connected = false;
  const connect = async () => { connected = true; return fakeStack(); };
  assert.equal(await runCli(["--dir", DIR], { env: {}, connect, errorLog: (m) => errs.push(m) }), 2);
  assert.equal(await runCli(["--dir", DIR], { env: { PROOF_DB_URL: "postgresql://u:p@db.x.supabase.co:5432/postgres" }, connect, errorLog: (m) => errs.push(m) }), 1);
  assert.equal(connected, false, "no connection is attempted to a remote host");
  assert.equal(await runCli([], { env: { PROOF_DB_URL: "postgresql://u:p@127.0.0.1:54322/postgres" }, connect, errorLog: (m) => errs.push(m) }), 1);
  assert.ok(errs.every((m) => !m.includes("p@")), "no connection string is printed");
});
