/** DRIFT-1 (2026-10-10) tests for scripts/proof/schema-diff.mjs: the canonical comparison, the structural record and the gate's pass condition.
 *  Fixture catalogs; no database. The query itself is proven on a real server by the migration-proof job's --catalog-only step on every PR. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffCatalogs, readCatalog, canonicalise, buildDetail, runGate, detailPathOf, CANONICAL_PGOPTIONS } from "./schema-diff.mjs";

const CATALOG = {
  tables: { items: "rtff" },
  columns: { "items.id": "uuid true gen_random_uuid()" },
  constraints: { "items.items_pkey": "p PRIMARY KEY (id)" },
  indexes: { "items.items_pkey": "CREATE UNIQUE INDEX items_pkey ON public.items USING btree (id)" },
  functions: { "f(a integer)": "CREATE OR REPLACE FUNCTION public.f(a integer) RETURNS integer LANGUAGE sql AS $$ select a $$" },
  triggers: {},
  policies: { "items.read": "SELECT {authenticated} true PERMISSIVE" },
  grants: { "relation:items -> anon": "SELECT" },
};
const clone = () => JSON.parse(JSON.stringify(CATALOG));

test("the read pins the session search_path to pg_catalog on every side (a role's own search_path decides whether auth.users prints qualified)", () => {
  assert.equal(CANONICAL_PGOPTIONS, "-c search_path=pg_catalog");
  let env;
  readCatalog({ url: "x", spawn: (_bin, _a, o) => { env = o.env; return { status: 0, stdout: "{}" }; } });
  assert.equal(env.PGOPTIONS, CANONICAL_PGOPTIONS);
  process.env.PGOPTIONS = "-c search_path=auth,public";
  try {
    readCatalog({ url: "x", spawn: (_bin, _a, o) => { env = o.env; return { status: 0, stdout: "{}" }; } });
    assert.equal(env.PGOPTIONS, CANONICAL_PGOPTIONS, "an ambient PGOPTIONS never wins over the pin");
  } finally { delete process.env.PGOPTIONS; }
});

test("canonicalise: whitespace and the space inside parentheses and after commas are not differences, outside string literals only", () => {
  assert.equal(canonicalise("policies", "ALL  {authenticated,service_role} ( auth.uid()  = user_id )"), canonicalise("policies", "ALL {authenticated, service_role} (auth.uid() = user_id)"));
  assert.notEqual(canonicalise("policies", "( x = 'a ( b' )"), canonicalise("policies", "( x = 'a (b' )"), "a string literal is never touched");
  assert.equal(canonicalise("functions", "begin  return ( 1 );\n end"), "begin return ( 1 ); end", "a function body is collapsed to single spaces and nothing else");
  assert.notEqual(canonicalise("functions", "select ( 1 )"), canonicalise("functions", "select (1)"), "function bodies keep their parenthesis spacing");
});

test("ATTACK (ACL): a reordered privilege list is equal, a different privilege list is not", () => {
  const a = clone();
  const b = clone();
  a.grants["relation:items -> anon"] = "SELECT,INSERT";
  b.grants["relation:items -> anon"] = "INSERT,SELECT";
  const same = diffCatalogs(a, b);
  assert.equal(same.identical, true);
  assert.equal(same.normalised_away_total, 1, "counted as normalised away, not as a difference");
  b.grants["relation:items -> anon"] = "SELECT";
  const diff = diffCatalogs(a, b);
  assert.equal(diff.identical, false);
  assert.deepEqual(diff.categories.grants.names_changed, ["relation:items -> anon"]);
});

test("ATTACK (policy): the same predicate spelled with different spacing is equal, a different predicate is not", () => {
  const a = clone();
  const b = clone();
  a.policies["items.read"] = "SELECT {authenticated} ( (auth.uid() = user_id) ) PERMISSIVE";
  b.policies["items.read"] = "SELECT {authenticated} ((auth.uid() = user_id)) PERMISSIVE";
  assert.equal(diffCatalogs(a, b).identical, true);
  b.policies["items.read"] = "SELECT {authenticated} ((auth.uid() <> user_id)) PERMISSIVE";
  const d = diffCatalogs(a, b);
  assert.equal(d.identical, false);
  assert.deepEqual(d.categories.policies.names_changed, ["items.read"]);
});

test("ATTACK (the gate's pass condition is ZERO): one extra policy on the oracle fails the gate, exit 1, and the log, the report and the record name it", () => {
  const oracle = clone();
  oracle.policies["items.extra_policy"] = "INSERT {public} true PERMISSIVE";
  const files = {};
  const err = [];
  const read = ({ url }) => ({ catalog: url === "replayed" ? CATALOG : oracle, error: null });
  const code = runGate({ replayedUrl: "replayed", oracleUrl: "oracle", out: "/o/replay-schema-diff.json", read, write: (p, t) => { files[p] = t; }, log: { out: () => {}, err: (m) => err.push(m) } });
  assert.equal(code, 1);
  assert.match(err.join("\n"), /policies only in oracle: items\.extra_policy/);
  assert.deepEqual(JSON.parse(files["/o/replay-schema-diff.json"]).categories.policies.names_only_in_oracle, ["items.extra_policy"]);
  const detail = JSON.parse(files["/o/replay-schema-diff-detail.json"]);
  assert.deepEqual(detail.rows.map((r) => [r.category, r.name, r.class]), [["policies", "items.extra_policy", "P"]]);
});

test("identical catalogs pass (exit 0) and write the report with no structural record; an unreadable side is exit 1 and names the cause", () => {
  const files = {};
  const code = runGate({ replayedUrl: "r", oracleUrl: "o", out: "/o/x.json", read: () => ({ catalog: CATALOG, error: null }), write: (p, t) => { files[p] = t; }, log: { out: () => {}, err: () => {} } });
  assert.equal(code, 0);
  assert.deepEqual(Object.keys(files), ["/o/x.json"]);
  const err = [];
  const bad = runGate({ replayedUrl: "r", oracleUrl: "o", out: "/o/x.json", read: ({ url }) => (url === "r" ? { catalog: null, error: { code: "42501", message: "denied" } } : { catalog: CATALOG, error: null }), write: () => { throw new Error("no write"); }, log: { out: () => {}, err: (m) => err.push(m) } });
  assert.equal(bad, 1);
  assert.match(err.join("\n"), /could not read the replayed schema \(42501\): denied/);
  assert.equal(detailPathOf("/o/replay-schema-diff.json"), "/o/replay-schema-diff-detail.json");
  assert.equal(detailPathOf("/o/noext"), "/o/noext-detail.json");
});

test("buildDetail: classes R, P and C, qualification-only versus substantive, identifier tokens, grants' privileges; and NO definition text or string literal", () => {
  const a = clone();
  const b = clone();
  a.indexes["items.only_replayed_idx"] = "CREATE INDEX only_replayed_idx ON public.items USING btree (id)";
  b.policies["items.only_oracle"] = "SELECT {public} (secret_column = 'TOPSECRETLITERAL') PERMISSIVE";
  b.constraints["items.items_pkey"] = "p PRIMARY KEY (id) DEFERRABLE";
  a.columns["items.id"] = "FOREIGN KEY (u) REFERENCES auth.users(id)";
  b.columns["items.id"] = "FOREIGN KEY (u) REFERENCES users(id)";
  b.grants["relation:items -> anon"] = "DELETE,SELECT";
  const d = buildDetail(a, b);
  const by = Object.fromEntries(d.rows.map((r) => [`${r.category}:${r.name}`, r]));
  assert.equal(by["indexes:items.only_replayed_idx"].class, "R");
  assert.equal(by["policies:items.only_oracle"].class, "P");
  assert.equal(by["constraints:items.items_pkey"].class, "C");
  assert.equal(by["constraints:items.items_pkey"].shape, "substantive");
  assert.deepEqual(by["constraints:items.items_pkey"].tokens_only_in_oracle, ["deferrable"]);
  assert.equal(by["columns:items.id"].shape, "qualification-only", "equal once the schema qualifier is stripped: the canonical form's job");
  assert.equal(by["grants:relation:items -> anon"].privileges_replayed, "SELECT");
  assert.equal(by["grants:relation:items -> anon"].privileges_oracle, "DELETE,SELECT");
  assert.deepEqual(d.classes, { R: 1, P: 1, C: 3 });
  const text = JSON.stringify(d);
  assert.ok(!text.includes("TOPSECRETLITERAL"), "a string literal never reaches the record");
  assert.ok(!text.includes("CREATE INDEX"), "a definition never reaches the record");
});

test("buildDetail: a pair equal once canonicalised is not a row, and the record is capped with the true count kept", () => {
  const a = { tables: {} };
  for (let i = 0; i < 1200; i++) a.tables[`t${i}`] = "r";
  const d = buildDetail(a, {});
  assert.equal(d.row_count, 1200);
  assert.equal(d.rows.length, 1000);
  assert.equal(d.truncated, true);
  assert.deepEqual(buildDetail({ grants: { g: "B,A" } }, { grants: { g: "A,B" } }).rows, []);
});
