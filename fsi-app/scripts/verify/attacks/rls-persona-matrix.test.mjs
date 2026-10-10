// Proof of the RLS persona matrix runner on a scripted fake database (lane TESTS-1, 2026-10-09). No database, no pg import.
// The fake models just enough of the stack for the runner to complete: a catalog of public tables, per-role grants for the
// matrix cells, and organisation-scoped workspace_tags rows for the seeded-row attacks. A LEAKY variant of the same fake
// lets one forbidden action through, and the runner must go red (the attack on the attacker, rule 15).
//
// Run: node --test fsi-app/scripts/verify/attacks/rls-persona-matrix.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMMANDS, MIN_TABLES, PROBE_BROKEN, LIST_TABLES_SQL, UPDATE_COLUMNS_SQL,
  cellSql, classify, indexUpdateColumns, evaluateMatrix, summarize, runMatrix, runAll, cliMain,
} from "./rls-persona-matrix.mjs";
import { TARGETED_ATTACKS } from "./rls-persona-attacks.mjs";
import { PERSONAS, PERSONA_IDS, personaContext } from "../fixtures/rls-personas.mjs";
import { FIXTURE_IDS } from "../../proof/attacks/fixtures.mjs";

const TABLES = Array.from({ length: 121 }, (_, i) => `t${String(i).padStart(3, "0")}`);

// ---- pure functions ---------------------------------------------------------------------------------------------

test("cellSql: one statement per command, identifiers quoted, UPDATE needs an assignable column", () => {
  assert.equal(cellSql("SELECT", "t1"), 'SELECT count(*)::int AS n FROM public."t1"');
  assert.equal(cellSql("INSERT", "t1"), 'INSERT INTO public."t1" DEFAULT VALUES');
  assert.equal(cellSql("UPDATE", "t1", "c"), 'UPDATE public."t1" SET "c" = "c"');
  assert.equal(cellSql("UPDATE", "t1", null), null);
  assert.equal(cellSql("DELETE", "t1"), 'DELETE FROM public."t1"');
  assert.equal(cellSql("TRUNCATE", "t1"), 'TRUNCATE public."t1"');
  assert.equal(cellSql("SELECT", 'we"ird'), 'SELECT count(*)::int AS n FROM public."we""ird"', "a quote in a table name cannot break out of the identifier");
  assert.throws(() => cellSql("MERGE", "t1"), /unknown command/);
  assert.deepEqual([...COMMANDS], ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]);
});

test("classify: refusal, zero rows, admitted, constraint-after-policy, other errors", () => {
  assert.equal(classify("SELECT", { errored: true, code: "42501" }), "R");
  assert.equal(classify("INSERT", { errored: true, code: "23502" }), "C");
  assert.equal(classify("TRUNCATE", { errored: true, code: "0A000" }), "C");
  assert.equal(classify("DELETE", { errored: true, code: "40001" }), "E:40001");
  assert.equal(classify("SELECT", { errored: false, rows: [{ n: 0 }] }), "Z");
  assert.equal(classify("SELECT", { errored: false, rows: [{ n: 3 }] }), "A");
  assert.equal(classify("UPDATE", { errored: false, rows: [], rowCount: 0 }), "Z");
  assert.equal(classify("DELETE", { errored: false, rows: [], rowCount: 2 }), "A");
  assert.equal(classify("TRUNCATE", { errored: false, rows: [], rowCount: null }), "A");
});

test("indexUpdateColumns keys on table and role", () => {
  const m = indexUpdateColumns([{ name: "a", role: "anon", col: "x" }, { name: "a", role: "authenticated", col: null }]);
  assert.equal(m.get("a|anon"), "x");
  assert.equal(m.get("a|authenticated"), null);
});

function fullCells(tables, personas, override = () => undefined) {
  const cells = [];
  for (const p of personas) for (const t of tables) for (const c of COMMANDS) {
    const o = override(p, t, c);
    cells.push({ persona: p.id, table: t, command: c, outcome: c === "TRUNCATE" ? "R" : "Z", ...(o ?? {}) });
  }
  return cells;
}

test("evaluateMatrix: a complete matrix whose TRUNCATE cells are all refused holds", () => {
  assert.deepEqual(evaluateMatrix({ cells: fullCells(TABLES, PERSONAS), tables: TABLES }), []);
});

test("evaluateMatrix ATTACK: a persona that can TRUNCATE one table is a violation naming the persona and the table", () => {
  const cells = fullCells(TABLES, PERSONAS, (p, t, c) => (p.id === "P2" && t === "t007" && c === "TRUNCATE" ? { outcome: "A" } : undefined));
  const v = evaluateMatrix({ cells, tables: TABLES });
  assert.equal(v.length, 1);
  assert.match(v[0], /TRUNCATE: persona P2 \(org viewer\)/);
  assert.match(v[0], /t007/);
});

test("evaluateMatrix ATTACK: a TRUNCATE that stopped at a foreign key (0A000) is a grant that exists, so it is a violation too", () => {
  const cells = fullCells(TABLES, PERSONAS, (p, t, c) => (p.id === "P3" && t === "t001" && c === "TRUNCATE" ? { outcome: "C", code: "0A000" } : undefined));
  assert.match(evaluateMatrix({ cells, tables: TABLES })[0], /TRUNCATE: persona P3/);
});

test("evaluateMatrix ATTACK: a missing cell, an empty catalog and a broken probe each fail the matrix", () => {
  const missing = fullCells(TABLES, PERSONAS).slice(1);
  assert.match(evaluateMatrix({ cells: missing, tables: TABLES })[0], /COVERAGE: persona P1 .* has 604 cells, expected 121 x 5 = 605/);
  const few = TABLES.slice(0, MIN_TABLES - 1);
  assert.match(evaluateMatrix({ cells: fullCells(few, PERSONAS), tables: few })[0], /fewer than the 100 minimum/);
  const broken = fullCells(TABLES, PERSONAS, (p, t, c) => (p.id === "P4" && t === "t002" && c === "SELECT" ? { outcome: "E:42P01", code: "42P01" } : undefined));
  assert.match(evaluateMatrix({ cells: broken, tables: TABLES })[0], /PROBE: persona P4/);
  assert.ok(PROBE_BROKEN.includes("25P02"), "an aborted transaction means the probe broke the savepoint discipline");
});

test("summarize counts outcomes per persona and command", () => {
  const s = summarize(fullCells(TABLES.slice(0, 2), PERSONAS.slice(0, 2)));
  assert.equal(s.P1.SELECT.Z, 2);
  assert.equal(s.P2.TRUNCATE.R, 2);
});

// ---- a scripted fake database -----------------------------------------------------------------------------------

/**
 * A fake pg client. `leak` names one forbidden action the fake lets through. Models: the catalog, grants for the matrix
 * cells (everything refused except an empty SELECT), and organisation-scoped workspace_tags with role-based access.
 */
function fakeClient({ leak = null, tableList = TABLES } = {}) {
  const log = [];
  let sub = null;
  let role = "owner";
  const orgOf = { [FIXTURE_IDS.owner_a]: "A", [PERSONA_IDS.viewer_a]: "A", [PERSONA_IDS.member_a]: "A", [FIXTURE_IDS.member_b]: "B" };
  const orgIds = { A: FIXTURE_IDS.org_a, B: FIXTURE_IDS.org_b };
  let gotGrant = false;
  const reject = (code, message) => { const e = new Error(message ?? `fake ${code}`); e.code = code; throw e; };
  let verifierStatus = "none";
  const canWrite = () => role === "authenticated" && sub !== PERSONA_IDS.viewer_a && Boolean(orgOf[sub]);
  return {
    log,
    async query(sql, params = []) {
      log.push(sql.split("\n")[0].slice(0, 80));
      const s = sql.trim();
      if (/^ROLLBACK/i.test(s)) { role = "owner"; sub = null; return { rows: [], rowCount: null }; }
      if (/^RESET ROLE/i.test(s)) { role = "owner"; sub = null; return { rows: [], rowCount: null }; }
      if (/^(BEGIN|SAVEPOINT|RELEASE)/i.test(s)) return { rows: [], rowCount: null };
      if (/^SET LOCAL ROLE/i.test(s)) { role = s.split(/\s+/).pop(); return { rows: [], rowCount: null }; }
      if (/set_config\('request\.jwt\.claims'/.test(s)) { sub = JSON.parse(params[0]).sub ?? null; return { rows: [], rowCount: 1 }; }
      if (s === LIST_TABLES_SQL) return { rows: tableList.map((name) => ({ name })), rowCount: tableList.length };
      if (s === UPDATE_COLUMNS_SQL.trim()) return { rows: tableList.flatMap((name) => ["anon", "authenticated"].map((r) => ({ name, role: r, col: "id" }))), rowCount: 0 };
      if (role === "owner" && /^(INSERT INTO (auth\.users|public\.(profiles|organizations|org_memberships|workspace_settings|workspace_tags))|DELETE FROM (public|auth)\.)/.test(s)) return { rows: [], rowCount: 1 };
      // matrix cells
      const cell = s.match(/^(SELECT count\(\*\)::int AS n FROM|INSERT INTO|UPDATE|DELETE FROM|TRUNCATE) public\."(t\d+)"/);
      if (cell) {
        if (cell[1] === "TRUNCATE") { if (leak === "truncate" && role === "authenticated") return { rows: [], rowCount: null }; reject("42501"); }
        if (cell[1].startsWith("SELECT")) return { rows: [{ n: 0 }], rowCount: 1 };
        if (cell[1] === "INSERT INTO") reject("42501");
        return { rows: [], rowCount: 0 };
      }
      // seeded-row attack on the profiles status columns (migration 367)
      if (/public\.profiles/.test(s) || /request_verification/.test(s)) {
        const own = role === "authenticated" && sub === PERSONA_IDS.member_a;
        if (/^SELECT verifier_status/.test(s)) return { rows: [{ s: verifierStatus }], rowCount: 1 };
        if (/^SELECT public\.request_verification/.test(s)) {
          if (!own) reject("42501");
          if (verifierStatus === "active") reject("55000");
          verifierStatus = "pending";
          return { rows: [{ s: "pending" }], rowCount: 1 };
        }
        if (/^UPDATE public\.profiles SET verifier_status = 'active'/.test(s) && role === "owner") { verifierStatus = "active"; return { rows: [], rowCount: 1 }; }
        if (/^GRANT UPDATE \(.*\) ON public\.profiles TO authenticated/.test(s) && role === "owner") { gotGrant = true; return { rows: [], rowCount: null }; }
        if (gotGrant && own && /^UPDATE public\.profiles SET display_name/.test(s)) return { rows: [], rowCount: 1 };
        if (gotGrant && own && /^UPDATE public\.profiles SET (is_platform_admin|org_id|verifier_status)/.test(s)) {
          if (leak === "guard-missing" && /SET org_id/.test(s)) return { rows: [], rowCount: 1 };
          reject("42501", "profiles_privilege_guard: a protected column may not be changed");
        }
        if (/^(UPDATE|INSERT INTO) public\.profiles/.test(s)) {
          if (leak === "status-column" && own && /^UPDATE public\.profiles SET membership_tier/.test(s)) return { rows: [], rowCount: 1 };
          reject("42501");
        }
      }
      // seeded-row attacks on workspace_tags
      if (/public\.workspace_tags/.test(s)) {
        const org = params[0] === orgIds.A ? "A" : "B";
        const mine = role === "owner" ? true : role === "authenticated" && orgOf[sub] === org;
        const visible = mine || (leak === "cross-org-read" && role === "authenticated");
        if (/^SELECT count\(\*\)/.test(s)) return { rows: [{ n: 1 }], rowCount: 1 };
        if (/^SELECT id/.test(s)) return { rows: visible ? [{ id: "x" }] : [], rowCount: visible ? 1 : 0 };
        if (/^UPDATE/.test(s) || /^DELETE/.test(s)) return { rows: [], rowCount: mine && canWrite() ? 1 : 0 };
        if (/^INSERT/.test(s)) {
          const viewerLeak = leak === "viewer-insert" && sub === PERSONA_IDS.viewer_a;
          if (role === "owner" || (mine && canWrite()) || viewerLeak) return { rows: [], rowCount: 1 };
          reject("42501");
        }
      }
      throw new Error(`fake database: unscripted statement ${s.slice(0, 120)}`);
    },
    async end() {},
  };
}

test("runMatrix covers every table by every persona by every command and rolls everything back", async () => {
  const client = fakeClient();
  const cells = await runMatrix({ client, tables: TABLES.slice(0, 3), updateColumns: indexUpdateColumns(TABLES.slice(0, 3).flatMap((name) => ["anon", "authenticated"].map((r) => ({ name, role: r, col: "id" })))), ctx: personaContext() });
  assert.equal(cells.length, PERSONAS.length * 3 * COMMANDS.length);
  assert.equal(client.log.filter((l) => l === "BEGIN").length, 1);
  assert.equal(client.log.at(-1), "ROLLBACK", "the matrix transaction is always rolled back");
  assert.ok(cells.filter((c) => c.command === "TRUNCATE").every((c) => c.outcome === "R"));
});

test("runMatrix records a table with no assignable column as not applicable, still one cell per command", async () => {
  const client = fakeClient();
  const cells = await runMatrix({ client, tables: ["t000"], updateColumns: new Map(), ctx: personaContext() });
  assert.equal(cells.length, PERSONAS.length * COMMANDS.length);
  assert.equal(cells.filter((c) => c.outcome === "N").length, PERSONAS.length);
});

test("runAll on a database that holds: 121 x 5 cells per persona, every seeded-row attack held, no violation", async () => {
  const report = await runAll({ client: fakeClient() });
  assert.equal(report.fixtures.created, true);
  assert.equal(report.tables, 121);
  assert.equal(report.cells.length, 121 * 5 * 4);
  for (const p of PERSONAS) assert.equal(report.cells.filter((c) => c.persona === p.id).length, 605, `${p.id} has 605 cells`);
  assert.deepEqual(report.violations, []);
  assert.equal(report.targeted.length, TARGETED_ATTACKS.length);
  assert.equal(TARGETED_ATTACKS.length, 6, "the four tag attacks, the profiles status-column attack and the guard-trigger-alone attack");
  assert.ok(report.targeted.every((t) => t.status === "pass"), JSON.stringify(report.targeted));
});

test("ATTACK on the attacker: a database that lets a viewer insert a tag turns the run red, naming the persona attack", async () => {
  const report = await runAll({ client: fakeClient({ leak: "viewer-insert" }) });
  assert.equal(report.violations.length, 1);
  assert.match(report.violations[0], /ATTACK rls-persona-p2-viewer-is-read-only \(P2\) did not hold/);
});

test("ATTACK on the attacker: a database that lets a member write their own membership_tier turns the run red, naming the status-column attack", async () => {
  const report = await runAll({ client: fakeClient({ leak: "status-column" }) });
  assert.equal(report.violations.length, 1, report.violations.join("; "));
  assert.match(report.violations[0], /ATTACK rls-persona-status-columns-self-authorise-refused \(P4\) did not hold/);
  assert.match(report.violations[0], /membership_tier/);
});

test("ATTACK on the attacker: a database whose guard trigger is gone (grant restored, update lands) turns the run red, naming the trigger-alone attack", async () => {
  const report = await runAll({ client: fakeClient({ leak: "guard-missing" }) });
  assert.equal(report.violations.length, 1, report.violations.join("; "));
  assert.match(report.violations[0], /ATTACK rls-persona-profiles-guard-trigger-stands-alone \(P4\) did not hold/);
  assert.match(report.violations[0], /org_id/);
});

test("ATTACK on the attacker: a database that lets another org read org A's tags turns the run red", async () => {
  const report = await runAll({ client: fakeClient({ leak: "cross-org-read" }) });
  assert.ok(report.violations.some((v) => /rls-persona-p3-member-of-another-org-denied/.test(v)), report.violations.join("\n"));
});

test("ATTACK on the attacker: a database that lets an authenticated persona TRUNCATE turns the run red", async () => {
  const report = await runAll({ client: fakeClient({ leak: "truncate" }) });
  assert.ok(report.violations.some((v) => /^TRUNCATE: persona P2/.test(v)), report.violations.join("\n"));
});

test("runAll tears the persona fixtures down even when the matrix throws", async () => {
  const client = fakeClient();
  const real = client.query.bind(client);
  client.query = async (sql, params) => { if (sql === LIST_TABLES_SQL) throw new Error("catalog unreadable"); return real(sql, params); };
  await assert.rejects(() => runAll({ client }), /catalog unreadable/);
  assert.ok(client.log.some((l) => /DELETE FROM auth\.users/.test(l)), "teardown ran");
});

// ---- the CLI ----------------------------------------------------------------------------------------------------

const LOCAL_ENV = { CHAIN_PROOF_LOCAL: "1", SUPABASE_DB_URL: "postgresql://postgres:x@127.0.0.1:54322/postgres", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" };

test("cliMain refuses (exit 2) any environment that is not the local stack, before it connects", async () => {
  let connected = false;
  const log = [];
  const code = await cliMain({ argv: [], env: { ...LOCAL_ENV, SUPABASE_DB_URL: "postgresql://postgres:x@db.abcd.supabase.co:5432/postgres" }, connect: async () => { connected = true; return fakeClient(); }, log: (s) => log.push(s) });
  assert.equal(code, 2);
  assert.equal(connected, false);
  assert.match(log.join("\n"), /REFUSED/);
});

test("cliMain: no connection is exit 2, never a pass", async () => {
  assert.equal(await cliMain({ argv: [], env: LOCAL_ENV, connect: async () => null, log: () => {} }), 2);
});

test("cliMain: held is exit 0 and writes the report; a leak is exit 1", async () => {
  const written = {};
  const io = { writeFile: (p, t) => { written[p] = t; }, makeDir: () => {}, log: () => {} };
  assert.equal(await cliMain({ argv: ["--out-dir", "out"], env: LOCAL_ENV, connect: async () => fakeClient(), ...io }), 0);
  const body = JSON.parse(Object.values(written)[0]);
  assert.equal(body.suite, "rls-persona-matrix");
  assert.equal(body.cells.length, 121 * 5 * 4);
  assert.ok(Object.keys(written)[0].endsWith("rls-persona-matrix-report.json"));
  assert.equal(await cliMain({ argv: [], env: { ...LOCAL_ENV, CP_OUT_DIR: "out" }, connect: async () => fakeClient({ leak: "viewer-insert" }), ...io }), 1);
});

test("cliMain rejects an unknown argument with exit 2", async () => {
  assert.equal(await cliMain({ argv: ["--nope"], env: LOCAL_ENV, connect: async () => fakeClient(), log: () => {} }), 2);
});
