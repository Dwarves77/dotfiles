// 382_read_policies_name_their_role.test.mjs -- static proof of migration 382 (lane SEC-8) by parsing the SQL file, the migration
// tree and the one src file whose readers moved: no database, no SQL parser dependency. The ATTACKS (SET LOCAL ROLE anon, a valid
// row, then SQLSTATE 42501 "permission denied for table X") run in the migration's own self-check at apply time inside a rolled
// back sub-transaction, and the PROOF-4 attack sec8-reference-reads-closed-to-anon in scripts/proof/attacks/attacks.json re-proves
// them on the chain stack. This file proves: the explicit ALTER list equals the policies the migration TREE leaves as a SELECT
// policy with roles {public} and the literal true predicate (re-derived here, so a policy added before 382 and left out fails the
// build), the precondition array, the REVOKE list and the self-check table array all equal that list, the identity-table revoke
// never widens profiles, nothing is held back from the enumeration assertion, the anon expectations are refusals (42501), the
// self-check fixtures satisfy the table definitions, and the four src readers of sources and source_citations read through the
// service client. Mutation tests at the end show the checker is red against the defects it exists to catch.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { policyState } from "./381_write_policies_name_their_role.test.mjs";
import { buildSchema, parseInserts, parseUpdates, checkFixtures, stripSql } from "./_lib/fixture-inserts.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RAW = readFileSync(join(HERE, "382_read_policies_name_their_role.sql"), "utf8");
const SERVER_SRC = readFileSync(join(HERE, "..", "..", "src", "lib", "supabase-server.ts"), "utf8");
const strip = (raw) => raw.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");

// ---- the policy state of the migration tree below 382 ----------------------------------------------------------------------

const STATE = policyState(HERE, 382);
const isPublicOnly = (p) => p.roles.length === 1 && p.roles[0] === "public";
const DERIVED = STATE.filter((p) => (p.cmd === "SELECT" || p.cmd === "ALL") && isPublicOnly(p) && p.qual === "true")
  .map((p) => `${p.table}.${p.name}`).sort();
const IDENTITY = ["org_memberships", "organizations", "workspace_settings"];

/** Everything that can be wrong with a 382 text; [] when nothing is. */
export function verify(raw, derived = DERIVED) {
  const bad = [];
  const sql = strip(raw);
  const alters = [...sql.matchAll(/^ALTER POLICY ("[^"]+"|\w+) ON public\.(\w+) TO authenticated, service_role;$/gm)].map((m) => `${m[2]}.${m[1].replace(/"/g, "")}`).sort();
  if (JSON.stringify(alters) !== JSON.stringify(derived)) {
    const miss = derived.filter((x) => !alters.includes(x));
    const extra = alters.filter((x) => !derived.includes(x));
    bad.push(`ALTER list differs from the tree: missing [${miss.join(", ")}] extra [${extra.join(", ")}]`);
  }
  const pre = (/v_pols text\[\] := ARRAY\[([\s\S]*?)\n  \];/.exec(raw) || [, ""])[1];
  const preList = [...pre.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  if (JSON.stringify(preList) !== JSON.stringify(derived)) bad.push("the precondition array differs from the tree-derived list");
  const tables = derived.map((x) => x.split(".")[0]).sort();
  const rev = /REVOKE SELECT ON TABLE\n([\s\S]*?)\n  FROM PUBLIC, anon;/.exec(sql);
  const gr = /GRANT SELECT ON TABLE\n([\s\S]*?)\n  TO authenticated, service_role;/.exec(sql);
  const names = (m) => (m ? [...m[1].matchAll(/public\.(\w+)/g)].map((x) => x[1]).sort() : []);
  if (JSON.stringify(names(rev)) !== JSON.stringify(tables)) bad.push("the REVOKE list differs from the tables of the ALTER list");
  if (JSON.stringify(names(gr)) !== JSON.stringify(tables)) bad.push("the GRANT-back list differs from the tables of the ALTER list");
  const sc = (/DO \$sc\$\nDECLARE\n  v_tables text\[\] := ARRAY\[([\s\S]*?)\n  \];/.exec(raw) || [, ""])[1];
  const scList = [...sc.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  if (JSON.stringify(scList) !== JSON.stringify(tables)) bad.push("the self-check table array differs from the tables of the ALTER list");
  const ident = /REVOKE SELECT ON TABLE public\.org_memberships, public\.organizations, public\.workspace_settings FROM PUBLIC, anon;/.test(sql);
  if (!ident) bad.push("the identity-table revoke (org_memberships, organizations, workspace_settings) is missing or changed");
  if (/REVOKE[^;]*\bpublic\.profiles\b|GRANT[^;]*\bpublic\.profiles\b/.test(sql)) bad.push("profiles must not be revoked or granted at table level (372 owns its column grants)");
  if (/NOT IN \(/.test((/DO \$enum\$[\s\S]*?\$enum\$/.exec(sql) || [""])[0])) bad.push("the enumeration assertion holds a table back");
  if (/ALTER POLICY[^;]*\bTO public\b/i.test(sql)) bad.push("an ALTER POLICY sets TO public");
  const lastAlter = sql.lastIndexOf("ALTER POLICY");
  const revokeAt = sql.indexOf("REVOKE SELECT ON TABLE");
  if (revokeAt < lastAlter) bad.push("the grant block must run after the last ALTER POLICY");
  for (const m of sql.matchAll(/sec8_try\('anon'[^\n]*\n\s*'(err:[^']*|ok:[^']*)'/g)) {
    if (!m[1].startsWith("err:42501:permission denied for table")) bad.push(`an anon leg expects ${m[1]} instead of a table-level refusal`);
  }
  return bad;
}

test("header: subject line, states APPLIED with the ledger version", () => {
  assert.match(RAW, /^-- subject: Migration 382 \(lane SEC-8, 2026-10-09\)/);
  assert.match(RAW, /APPLIED \(production ledger version 20261009105343, as of 2026-10-09\)/);
  assert.doesNotMatch(RAW, /NOT APPLIED/);
  assert.match(RAW.split("\n")[0], /APPLIED \(production ledger version 20261009105343, as of 2026-10-09\)\.$/);
});

test("the explicit ALTER list equals the SELECT policies the tree leaves with roles {public} and the literal true (re-derived here)", () => {
  assert.deepEqual(verify(RAW), []);
  assert.equal(DERIVED.length, 18, "the tree leaves 18 such policies below 382");
  assert.equal([...RAW.matchAll(/^ALTER POLICY /gm)].length, 18);
  for (const t of ["sources", "source_citations", "signposts"]) assert.ok(DERIVED.some((d) => d.startsWith(t + ".")), t);
});

test("every listed policy is a SELECT policy on a table with no write path through it, and none is already narrowed in the tree", () => {
  const listed = STATE.filter((p) => DERIVED.includes(`${p.table}.${p.name}`));
  assert.equal(listed.length, 18);
  for (const p of listed) {
    assert.equal(p.cmd, "SELECT", p.table);
    assert.deepEqual(p.roles, ["public"], p.table);
    assert.equal(p.qual, "true", p.table);
  }
});

test("identity tables: org_memberships, organizations and workspace_settings are org scoped in the tree, so no anon read is lost", () => {
  for (const t of IDENTITY) {
    const sel = STATE.filter((p) => p.table === t && (p.cmd === "SELECT" || p.cmd === "ALL") && p.roles.includes("public"));
    assert.ok(sel.length >= 1, t);
    for (const p of sel) assert.match(p.qual ?? "", /user_belongs_to_org|auth\.role\(\)|auth\.uid\(\)/, `${t}.${p.name}`);
  }
});

test("self-check: catalog, per-table anon refusal on the GRANT, authenticated and service_role controls, the second organization, rollback", () => {
  const sql = strip(RAW);
  assert.match(sql, /has_any_column_privilege\('anon', v_oid, 'SELECT'\)/);
  assert.match(sql, /'B anon SELECT on ' \|\| v_tbl/);
  assert.match(sql, /'B control: authenticated SELECT on ' \|\| v_tbl/);
  assert.match(sql, /C attack: a member of org B reads the profile of the org A owner/);
  assert.match(sql, /C attack: anon reads the org A organization/);
  assert.match(sql, /C attack: anon reads org A workspace settings/);
  assert.match(sql, /RAISE EXCEPTION 'sec8_382_selfcheck_rollback'/);
  assert.match(sql, /v_ident\s+text\[\] := ARRAY\['org_memberships', 'organizations', 'workspace_settings', 'profiles'\]/);
});

// ---- the self-check fixtures against the live definitions in the migration tree -------------------------------------------

const FIXTURE_SQL = stripSql(RAW);
const SCHEMA = buildSchema(HERE, { before: 382 });
const EXTERNAL = { "auth.users": { columns: ["id", "aud", "role", "email", "created_at", "updated_at"], required: ["id"] } };
const INSERTS = parseInserts(FIXTURE_SQL);
const UPDATES = parseUpdates(FIXTURE_SQL);

test("fixtures: every INSERT literal in the self-check satisfies the table definitions rebuilt from the tree", () => {
  assert.ok(INSERTS.length >= 4, "found " + INSERTS.length + " inserts");
  assert.deepEqual(checkFixtures({ inserts: INSERTS, updates: UPDATES, schema: SCHEMA, external: EXTERNAL }), []);
});

test("fixtures: the parser sees the four tables the self-check writes, in foreign-key order", () => {
  const tables = [...new Set(INSERTS.map((i) => i.schemaName + "." + i.table))].sort();
  assert.deepEqual(tables, ["auth.users", "public.org_memberships", "public.organizations", "public.profiles"]);
  const at = (needle, from = 0) => { const i = FIXTURE_SQL.indexOf(needle, from); assert.ok(i >= 0, needle); return i; };
  const users = at("INSERT INTO auth.users");
  const profiles = at("INSERT INTO public.profiles", users);
  const orgs = at("INSERT INTO public.organizations", profiles);
  at("INSERT INTO public.org_memberships", orgs);
});

// ---- src: the readers of sources and source_citations no longer use the anon key ---------------------------------------------

function bodyOf(name) {
  const start = SERVER_SRC.search(new RegExp(String.raw`(?:^|\n)(?:export )?async function ${name}\b`));
  assert.ok(start >= 0, `function ${name} exists`);
  const rest = SERVER_SRC.slice(start + 10);
  const next = rest.search(/\n(?:export )?(?:async )?function \w+/);
  const body = next === -1 ? rest : rest.slice(0, next);
  return body.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
}

for (const fn of ["fetchSources", "fetchResearchSourceCoverage", "fetchSourceCitationStatsByIds", "fetchResearchPipelineRows"]) {
  test(`src: ${fn} reads through the service client, never the anon key`, () => {
    const body = bodyOf(fn);
    assert.match(body, /getServiceSupabase\(\)/, `${fn} uses getServiceSupabase()`);
    assert.doesNotMatch(body, /getSupabase\(\)/, `${fn} must not use getSupabase()`);
  });
}

test("src: no remaining getSupabase() site embeds or reads sources, source_citations or the SECURITY INVOKER source RPCs", () => {
  const sites = [...SERVER_SRC.matchAll(/getSupabase\(\)/g)].map((m) => m.index).filter((i) => SERVER_SRC.slice(Math.max(0, i - 3), i) !== "ion ");
  assert.ok(sites.length >= 1);
  for (const i of sites) {
    const tail = SERVER_SRC.slice(i, i + 3000);
    const stop = tail.search(/\n(?:export )?(?:async )?function \w+/);
    const scope = stop === -1 ? tail : tail.slice(0, stop);
    assert.doesNotMatch(scope, /from\("(sources|source_citations)"\)|source:sources\(|get_source_citation_stats|get_research_source_coverage/, `getSupabase() site at ${i}`);
  }
});

test("no JWT literal and no section-sign or dash glyph in the new file", () => {
  assert.doesNotMatch(RAW, /eyJ[A-Za-z0-9_-]{20,}/);
  const banned = [0xa7, 0x2013, 0x2014].map((c) => String.fromCharCode(c));
  for (const g of banned) assert.ok(!RAW.includes(g), `glyph U+${g.charCodeAt(0).toString(16)} present`);
});

// ---- mutation tests: the checker is red against the defects it exists to catch -------------------------------------------

test("red: a dropped ALTER, an unknown ALTER, a held-back table, a loosened anon leg and a profiles grant are each reported", () => {
  const first = RAW.search(/^ALTER POLICY /m);
  const lineEnd = RAW.indexOf("\n", first);
  assert.match(verify(RAW.slice(0, first) + RAW.slice(lineEnd + 1)).join("|"), /ALTER list differs from the tree: missing/);
  assert.match(verify(RAW.replace("DO $pre$", "ALTER POLICY ghost_policy ON public.ghost TO authenticated, service_role;\nDO $pre$")).join("|"), /extra \[ghost\.ghost_policy\]/);
  assert.match(verify(RAW.replace("     AND p.qual = 'true';", "     AND p.qual = 'true'\n     AND p.tablename NOT IN ('sources');")).join("|"), /holds a table back/);
  assert.match(verify(RAW.replace("'err:42501:permission denied for table %');\n      PERFORM pg_temp.sec8_expect('C attack: anon reads the org A organization'", "'ok:0');\n      PERFORM pg_temp.sec8_expect('C attack: anon reads the org A organization'")).join("|"), /anon leg expects ok:0/);
  assert.match(verify(RAW.replace("FROM PUBLIC, anon;\nGRANT SELECT ON TABLE public.org_memberships", "FROM PUBLIC, anon;\nGRANT SELECT ON TABLE public.profiles, public.org_memberships")).join("|"), /profiles must not be revoked or granted/);
});

test("red: the tree derivation sees a new literal-true public SELECT policy and ignores a narrowed one", () => {
  const extraTree = [...DERIVED, "new_table.new_table_read"].sort();
  assert.match(verify(RAW, extraTree).join("|"), /missing \[new_table\.new_table_read\]/);
});
