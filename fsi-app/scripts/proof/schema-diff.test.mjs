/** Tests for scripts/proof/schema-diff.mjs, the schema oracle gate (lane PROOF-1). Fixture catalogs; names only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { diffCatalogs, readCatalog, catalogOnly, summarizeDiff, CATALOG_QUERY, CATEGORIES } from "./schema-diff.mjs";

const CATALOG = {
  tables: { items: "t1", sources: "t2" },
  columns: { "items.id": "c1", "items.title": "c2", "sources.id": "c3" },
  constraints: { "items.items_pkey": "k1", "sources.sources_pkey": "k2" },
  indexes: { "items.items_pkey": "i1", "items.items_title_idx": "i2" },
  functions: { "f(a integer)": "f1", "g()": "f2" },
  triggers: { "items.t1": "g1" },
  policies: { "items.read": "p1" },
  grants: { "relation:items -> anon": "a1", "relation:items -> authenticated": "a2", "function:f(a integer) -> PUBLIC": "a3" },
};
const clone = () => JSON.parse(JSON.stringify(CATALOG));

test("identical catalogs (the oracle dump equals the replay) are an empty diff", () => {
  const d = diffCatalogs(CATALOG, clone());
  assert.equal(d.identical, true);
  assert.equal(d.differing_total, 0);
  assert.match(summarizeDiff(d), /IDENTICAL/);
});

test("one differing column fails and the summary names it", () => {
  const oracle = clone();
  oracle.columns["items.title"] = "c2-changed-type";
  const d = diffCatalogs(CATALOG, oracle);
  assert.equal(d.identical, false);
  assert.equal(d.differing_total, 1);
  assert.deepEqual(d.categories.columns.names_changed, ["items.title"]);
  const text = summarizeDiff(d);
  assert.match(text, /FAILED, 1 differing object/);
  assert.match(text, /columns changed: items\.title/);
});

test("objects only on one side are named per category, on the right side", () => {
  const oracle = clone();
  delete oracle.functions["g()"];
  oracle.tables.only_prod = "t9";
  oracle.policies["items.write"] = "p2";
  oracle.triggers["items.t1"] = "different";
  oracle.indexes["items.extra_idx"] = "i9";
  oracle.constraints["items.items_pkey"] = "other";
  const d = diffCatalogs(CATALOG, oracle);
  assert.deepEqual(d.categories.functions.names_only_in_replayed, ["g()"]);
  assert.deepEqual(d.categories.tables.names_only_in_oracle, ["only_prod"]);
  assert.deepEqual(d.categories.policies.names_only_in_oracle, ["items.write"]);
  assert.deepEqual(d.categories.triggers.names_changed, ["items.t1"]);
  assert.deepEqual(d.categories.indexes.names_only_in_oracle, ["items.extra_idx"]);
  assert.deepEqual(d.categories.constraints.names_changed, ["items.items_pkey"]);
  assert.equal(d.differing_total, 6);
});

test("every ruled category is compared: tables, columns, constraints, indexes, functions, triggers, policies, grants", () => {
  assert.deepEqual([...CATEGORIES], ["tables", "columns", "constraints", "indexes", "functions", "triggers", "policies", "grants"]);
  for (const cat of CATEGORIES) {
    const oracle = clone();
    oracle[cat].zz_extra = "x";
    assert.equal(diffCatalogs(CATALOG, oracle).differing_total, 1, cat);
  }
});

test("the report carries counts and names only: no definitions, no hashes, no row data", () => {
  const oracle = clone();
  oracle.columns["items.title"] = "c2-changed";
  const text = JSON.stringify(diffCatalogs(CATALOG, oracle));
  assert.ok(!text.includes("c2-changed") && !text.includes('"c1"'), "a definition hash leaked into the report");
  for (const c of Object.values(diffCatalogs(CATALOG, oracle).categories)) {
    assert.deepEqual(Object.keys(c).sort(), ["changed", "names_changed", "names_only_in_oracle", "names_only_in_replayed", "only_in_oracle", "only_in_replayed", "oracle_count", "replayed_count"]);
  }
});

test("names are capped at 200 per list in the report while the counts stay exact", () => {
  const big = { tables: Object.fromEntries(Array.from({ length: 450 }, (_, i) => [`t${i}`, "x"])) };
  const d = diffCatalogs(big, {});
  assert.equal(d.categories.tables.only_in_replayed, 450);
  assert.equal(d.categories.tables.names_only_in_replayed.length, 200);
  assert.match(summarizeDiff(d), /and 410 more/);
});

test("the catalog query is one read-only select over the public schema, and hashes definitions", () => {
  assert.match(CATALOG_QUERY, /^select json_build_object\(/);
  assert.ok(!/\b(insert|update|delete|drop|alter|truncate)\b/i.test(CATALOG_QUERY.replace(/pg_get_\w+/g, "")));
  assert.match(CATALOG_QUERY, /nspname = 'public'/);
  assert.match(CATALOG_QUERY, /md5\(/);
  for (const needle of ["pg_get_functiondef", "pg_get_triggerdef", "pg_get_constraintdef", "pg_indexes", "pg_policies", "format_type", "pg_get_expr", "deptype = 'e'"]) {
    assert.ok(CATALOG_QUERY.includes(needle), needle);
  }
});

test("GRANTS: two catalogs that differ ONLY in one GRANT fail the oracle, naming the object and the grantee", () => {
  const oracle = clone();
  delete oracle.grants["relation:items -> anon"]; // production does not grant anon on items; the replay does
  const d = diffCatalogs(CATALOG, oracle);
  assert.equal(d.identical, false);
  assert.equal(d.differing_total, 1, "nothing but the one grant differs");
  assert.deepEqual(d.categories.grants.names_only_in_replayed, ["relation:items -> anon"]);
  for (const cat of CATEGORIES.filter((c) => c !== "grants")) assert.equal(d.categories[cat].only_in_replayed + d.categories[cat].only_in_oracle + d.categories[cat].changed, 0, cat);
  assert.match(summarizeDiff(d), /grants only in replayed: relation:items -> anon/);
});

test("GRANTS: a changed privilege set for the same object and grantee is reported as changed, and a function grant is compared too", () => {
  const oracle = clone();
  oracle.grants["relation:items -> authenticated"] = "a2-fewer-privileges";
  delete oracle.grants["function:f(a integer) -> PUBLIC"];
  const d = diffCatalogs(CATALOG, oracle);
  assert.deepEqual(d.categories.grants.names_changed, ["relation:items -> authenticated"]);
  assert.deepEqual(d.categories.grants.names_only_in_replayed, ["function:f(a integer) -> PUBLIC"]);
  assert.equal(d.differing_total, 2);
  const extra = clone();
  extra.grants["relation:sources -> anon"] = "a9"; // a grant production has and the replay lacks
  const e = diffCatalogs(CATALOG, extra);
  assert.deepEqual(e.categories.grants.names_only_in_oracle, ["relation:sources -> anon"]);
});

test("GRANTS: the catalog query reads relacl and proacl through aclexplode, names PUBLIC, reads a NULL ACL as the owner default, and stays read only", () => {
  for (const needle of ["aclexplode", "relacl", "proacl", "acldefault", "pg_get_userbyid", "'PUBLIC'", "is_grantable", "'grants'"]) assert.ok(CATALOG_QUERY.includes(needle), needle);
  for (const kind of ["'r', 'p', 'v', 'm', 'S', 'f'"]) assert.ok(CATALOG_QUERY.includes(kind), "tables, views, sequences");
  assert.ok(!/grantor/.test(CATALOG_QUERY), "grantor names are not compared (ownership is stripped from the dump)");
  assert.ok(!/\b(insert|update|delete|drop|alter|truncate)\b/i.test(CATALOG_QUERY.replace(/pg_get_w+/g, "")));
});

test("readCatalog parses psql output into { catalog } and never returns a bare null", () => {
  const ok = readCatalog({ url: "x", spawn: () => ({ status: 0, stdout: JSON.stringify(CATALOG) + "\n" }) });
  assert.deepEqual(ok.catalog, CATALOG);
  assert.equal(ok.error, null);
});

test("PROOF-9: a connection error surfaces its message (redacted of the URL and password), never a bare null", () => {
  const url = "postgresql://postgres:s3cretpw@127.0.0.1:54322/postgres";
  const stderr = `psql: error: connection to server at "127.0.0.1", port 54322 failed: FATAL:  28P01: password authentication failed for user "postgres"
connection to ${url} failed, password s3cretpw rejected
`;
  const r = readCatalog({ url, spawn: () => ({ status: 2, stdout: "", stderr }) });
  assert.equal(r.catalog, null);
  assert.ok(r.error && typeof r.error.message === "string");
  assert.match(r.error.message, /password authentication failed for user "postgres"/);
  assert.equal(r.error.code, "28P01");
  assert.ok(!r.error.message.includes("s3cretpw"), "the password never reaches the log");
  assert.ok(!r.error.message.includes("postgresql://"), "the URL never reaches the log");
});

test("PROOF-9: a wrong role surfaces the pg code (permission denied is 42501, a missing function 42883)", () => {
  const denied = readCatalog({ url: "postgresql://r:p@127.0.0.1:1/d", spawn: () => ({ status: 3, stdout: "", stderr: "ERROR:  42501: permission denied for function pg_get_functiondef\nLOCATION:  aclcheck_error, aclchk.c:2918\n" }) });
  assert.equal(denied.error.code, "42501");
  assert.match(denied.error.message, /permission denied for function pg_get_functiondef/);
  const missing = readCatalog({ url: "x", spawn: () => ({ status: 3, stdout: "", stderr: "ERROR:  42883: function acldefault(text, oid) does not exist\nLINE 9:\n" }) });
  assert.equal(missing.error.code, "42883");
  assert.match(missing.error.message, /acldefault\(text, oid\) does not exist/);
});

test("PROOF-9: psql is asked for verbose errors (the SQLSTATE) and to stop on the first error", () => {
  let args;
  readCatalog({ url: "x", spawn: (_bin, a) => { args = a; return { status: 0, stdout: "{}" }; } });
  assert.ok(args.includes("VERBOSITY=verbose"), "VERBOSITY=verbose puts the SQLSTATE in the error line");
  assert.ok(args.includes("ON_ERROR_STOP=1"));
});

test("PROOF-9: a launch failure, a signal and unparseable output each name themselves", () => {
  const enoent = readCatalog({ url: "x", spawn: () => ({ error: Object.assign(new Error("spawnSync psql ENOENT"), { code: "ENOENT" }), status: null }) });
  assert.match(enoent.error.message, /could not run psql: spawnSync psql ENOENT/);
  const killed = readCatalog({ url: "x", spawn: () => ({ status: null, signal: "SIGTERM", stdout: "", stderr: "" }) });
  assert.match(killed.error.message, /SIGTERM/);
  const silent = readCatalog({ url: "x", spawn: () => ({ status: 1, stdout: "", stderr: "" }) });
  assert.match(silent.error.message, /psql exited with status 1 and printed no error text/);
  const junk = readCatalog({ url: "x", spawn: () => ({ status: 0, stdout: "not json", stderr: "" }) });
  assert.match(junk.error.message, /output was not JSON/);
  for (const r of [enoent, killed, silent, junk]) assert.equal(r.catalog, null);
});

test("PROOF-9: the error text is capped and carries no URL even from a long stderr", () => {
  const r = readCatalog({ url: "x", spawn: () => ({ status: 1, stdout: "", stderr: "ERROR:  XX000: " + "z".repeat(5000) + " postgres://u:p@h:1/d" }) });
  assert.ok(r.error.message.length <= 600);
  assert.ok(!/postgres:\/\//.test(r.error.message));
});

test("PROOF-9 ROOT CAUSE: the catalog query runs on a real server (chain proof fire 8 died on it), so every acldefault type argument is a typed \"char\", never a bare CASE of literals (which resolves to text; no implicit text to \"char\" cast)", () => {
  const calls = CATALOG_QUERY.match(/acldefault\((?:[^()]|\([^()]*\))*\)/g) ?? [];
  assert.equal(calls.length, 2, "the relation and the function grant reads");
  for (const c of calls) {
    const firstArg = c.slice("acldefault(".length).split(/,\s*[a-z]+\.[a-z]+\)$/)[0];
    if (/^case\b/i.test(firstArg)) {
      const branches = [...firstArg.matchAll(/\bthen\s+('[^']*')(::"char")?|\belse\s+('[^']*')(::"char")?/gi)];
      assert.ok(branches.length >= 2);
      for (const b of branches) assert.ok(b[2] || b[4], `a CASE branch feeding acldefault must be cast to "char": ${b[0]}`);
    } else {
      assert.match(firstArg, /^'[a-z]'(::"char")?$/, "a bare literal resolves to \"char\" on its own");
    }
  }
});

test("PROOF-9: the CLI prints the cause of an unreadable side (a launch failure here) and exits 1", () => {
  const script = fileURLToPath(new URL("./schema-diff.mjs", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "schema-diff-"));
  try {
    const r = spawnSync(process.execPath, [script, "--replayed", "postgresql://postgres:pw9@127.0.0.1:54322/postgres", "--oracle", "postgresql://supabase_admin:pw9@127.0.0.1:54399/postgres", "--out", join(dir, "o.json")], { encoding: "utf8", env: { PATH: dir } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /could not read the replayed schema/);
    assert.match(r.stderr, /could not run psql/);
    assert.match(r.stderr, /could not read the oracle schema/, "both sides are read and both causes printed");
    assert.ok(!r.stderr.includes("pw9"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ATTACK: the CLI refuses a non-loopback URL (exit 2) and needs all three arguments", () => {
  const script = fileURLToPath(new URL("./schema-diff.mjs", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "schema-diff-"));
  try {
    const bad = spawnSync(process.execPath, [script, "--replayed", "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres", "--oracle", "postgresql://postgres:postgres@127.0.0.1:54322/oracle_check", "--out", join(dir, "o.json")], { encoding: "utf8" });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /loopback/);
    assert.equal(spawnSync(process.execPath, [script], { encoding: "utf8" }).status, 2);
    assert.ok(readFileSync(script, "utf8").length > 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("PROOF-9: --catalog-only runs the query once and reports counts, or exits 1 with the printed cause", () => {
  const ok = catalogOnly("x", () => ({ catalog: CATALOG, error: null }));
  assert.equal(ok.status, 0);
  assert.match(ok.lines[0], /the catalog query ran on the stack: tables \d+/);
  const bad = catalogOnly("x", () => ({ catalog: null, error: { code: "42883", message: "psql exited with status 3: ERROR:  42883: function acldefault(text, oid) does not exist" } }));
  assert.equal(bad.status, 1);
  assert.match(bad.lines[0], /\(42883\).*acldefault\(text, oid\) does not exist/);
});

test("PROOF-9: the --catalog-only CLI needs --db-url, refuses a non-loopback URL (2), and exits 1 with the cause when psql cannot run", () => {
  const script = fileURLToPath(new URL("./schema-diff.mjs", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "schema-diff-"));
  try {
    assert.equal(spawnSync(process.execPath, [script, "--catalog-only"], { encoding: "utf8" }).status, 2);
    const far = spawnSync(process.execPath, [script, "--catalog-only", "--db-url", "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres"], { encoding: "utf8" });
    assert.equal(far.status, 2);
    assert.match(far.stderr, /loopback/);
    const r = spawnSync(process.execPath, [script, "--catalog-only", "--db-url", "postgresql://postgres:pw9@127.0.0.1:54322/postgres"], { encoding: "utf8", env: { PATH: dir } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /the catalog query failed on the stack.*could not run psql/);
    assert.ok(!r.stderr.includes("pw9"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
