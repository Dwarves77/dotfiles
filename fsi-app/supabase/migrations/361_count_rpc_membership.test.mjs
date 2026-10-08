// 361_count_rpc_membership.test.mjs -- static proof of migration 361 (lane S8-C) by parsing the SQL file: no
// database, no SQL parser dependency. The ATTACK (a non-member, an unauthenticated caller and an authenticated
// NULL-org caller refused; the service role and a real member accepted) runs in the migration's own self-check at
// apply time inside a rolled-back sub-transaction; this file proves the file carries it and the shape the callers rely on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { headerProblems } from "./_lib/applied-status.mjs";

const read = (name) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
const strip = (raw) => raw.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");

const RAW = read("361_count_rpc_membership.sql");
const SQL = strip(RAW);
const OLD = strip(read("148_surface_counts.sql"));

const fnBody = (src, name) => new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$fn\\$;`).exec(src)?.[0] ?? "";
const ONE = fnBody(SQL, "get_surface_counts");
const ALL = fnBody(SQL, "get_all_surface_counts");

test("baseline: migration 148 defines both count RPCs with no membership check (the gap this lane closes)", () => {
  assert.match(OLD, /CREATE OR REPLACE FUNCTION get_surface_counts\(/);
  assert.match(OLD, /CREATE OR REPLACE FUNCTION get_all_surface_counts\(/);
  assert.doesNotMatch(OLD, /_assert_org_membership/);
  assert.doesNotMatch(OLD, /auth\.uid\(\)/);
});

test("header: subject line and applied status as the map says", () => {
  assert.match(RAW, /^-- subject: Migration 361 /);
  assert.deepEqual(headerProblems(RAW, "361_count_rpc_membership.sql"), []);
});

test("precondition: migration 077 gate and migration 148 functions exist before anything is replaced", () => {
  assert.match(SQL, /proname = '_assert_org_membership'/);
  assert.match(SQL, /proname = 'get_surface_counts'/);
  assert.match(SQL, /proname = 'get_all_surface_counts'/);
});

test("both functions are replaced, in one transaction", () => {
  assert.ok(ONE, "get_surface_counts definition not found");
  assert.ok(ALL, "get_all_surface_counts definition not found");
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /COMMIT;\s*$/);
});

for (const [label, body, sig] of [
  ["get_surface_counts", () => ONE, "p_org_id uuid, p_surface text"],
  ["get_all_surface_counts", () => ALL, "p_org_id uuid"],
]) {
  test(`${label}: same signature, jsonb, plpgsql, STABLE SECURITY DEFINER, search_path pinned as migration 160 left it`, () => {
    const b = body();
    assert.ok(b.includes(`public.${label}(${sig})`), "signature changed");
    assert.match(b, /RETURNS jsonb/);
    assert.match(b, /LANGUAGE plpgsql/);
    assert.match(b, /\bSTABLE\b/);
    assert.match(b, /SECURITY DEFINER/);
    assert.match(b, /SET search_path = public, extensions, pg_temp/);
  });
}

test("get_all_surface_counts: the membership gate runs before the query reads anything", () => {
  const begin = ALL.indexOf("BEGIN");
  const gate = ALL.indexOf("PERFORM public._assert_org_membership(p_org_id)");
  const query = ALL.indexOf("WITH scope AS");
  assert.ok(begin > -1 && gate > begin, "gate missing");
  assert.ok(query > gate, "the gate must run before the query reads anything");
});

test("get_surface_counts: a member is checked; a NULL org (the public masthead path, PERF-10) is service role only", () => {
  const nullBranch = ONE.indexOf("IF p_org_id IS NULL THEN");
  const gate = ONE.indexOf("PERFORM public._assert_org_membership(p_org_id)");
  const query = ONE.indexOf("WITH scope AS");
  assert.ok(nullBranch > -1 && gate > nullBranch, "NULL branch must precede the membership call");
  assert.ok(query > gate, "the gate must run before the query reads anything");
  assert.match(ONE, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(ONE, /ERRCODE = '42501'/);
});

test("the gate refuses by RAISE, never by returning an empty bundle", () => {
  assert.doesNotMatch(ONE.slice(0, ONE.indexOf("WITH scope AS")), /\bRETURN\b/);
  assert.doesNotMatch(ALL.slice(0, ALL.indexOf("WITH scope AS")), /\bRETURN\b/);
});

test("the counting bodies are unchanged: verified gate, surface_of SoT, one override LEFT JOIN, five zero-filled buckets", () => {
  assert.match(ONE, /ii\.provenance_status = 'verified'/);
  assert.match(ONE, /surface_of\(ii\.item_type, ii\.domain\) = p_surface/);
  assert.match(ONE, /LEFT JOIN workspace_item_overrides wo\s+ON\s+wo\.item_id = ii\.id\s+AND wo\.org_id\s+= p_org_id/);
  for (const key of ["total_items", "by_priority", "by_severity", "by_band", "by_status", "by_jurisdiction", "total_jurisdictions", "last_updated_at"]) {
    assert.ok(ONE.includes(`'${key}'`), key);
  }
  assert.match(ALL, /\(ii\.provenance_status = 'verified'\)\s+AS is_verified/);
  assert.match(ALL, /VALUES \('regulations'\), \('market'\), \('operations'\), \('research'\), \('uncategorized'\)/);
  assert.match(ALL, /LEFT JOIN workspace_item_overrides wo\s+ON\s+wo\.item_id = ii\.id\s+AND wo\.org_id\s+= p_org_id/);
});

test("the counting SQL equals migration 148 modulo comments, whitespace and the INTO wrapper (nothing silently counts differently)", () => {
  const norm = (t) => t.replace(/\s+/g, " ").trim();
  const old148 = (name) => new RegExp(`CREATE OR REPLACE FUNCTION ${name}\\([\\s\\S]*?\\$\\$;`).exec(OLD)?.[0] ?? "";
  const fromQuery = (b) => b.slice(b.indexOf("WITH scope AS"));
  const mine = (b) => norm(fromQuery(b).replace(/\s+INTO v_result/, "").replace(/;\s*RETURN v_result;[\s\S]*$/, ""));
  const theirs = (b) => norm(fromQuery(b).replace(/\$\$;\s*$/, "").replace(/;\s*$/, ""));
  for (const name of ["get_surface_counts", "get_all_surface_counts"]) {
    assert.ok(old148(name), `${name} not found in 148`);
  }
  assert.equal(mine(ONE), theirs(old148("get_surface_counts")));
  assert.equal(mine(ALL), theirs(old148("get_all_surface_counts")));
});

test("grants are not touched (CREATE OR REPLACE keeps them); no table, no data write", () => {
  assert.doesNotMatch(SQL, /\bGRANT\b|\bREVOKE\b/);
  assert.doesNotMatch(SQL, /\b(INSERT INTO|UPDATE public\.|DELETE FROM|CREATE TABLE|ALTER TABLE)\b/);
});

test("self-check ATTACKS both functions under simulated claims: non-member, unauthenticated, authenticated NULL-org refused; service role and a real member accepted; rolled back", () => {
  assert.match(SQL, /set_config\('request\.jwt\.claims'/);
  assert.match(SQL, /gen_random_uuid\(\)/);
  for (const abort of [
    "get_surface_counts answered a non-member",
    "get_all_surface_counts answered a non-member",
    "get_surface_counts answered a member of a different org",
    "get_all_surface_counts answered a member of a different org",
    "get_surface_counts answered an unauthenticated caller",
    "get_all_surface_counts answered an unauthenticated caller",
    "get_surface_counts answered an authenticated caller with a NULL org",
    "get_surface_counts refused the service role with a NULL org",
    "get_surface_counts refused the service role",
    "get_all_surface_counts refused the service role",
    "get_surface_counts refused a real member",
    "get_all_surface_counts refused a real member",
  ]) {
    assert.ok(SQL.includes(abort), abort);
  }
  assert.match(SQL, /RAISE EXCEPTION 'g361_selfcheck_rollback'/);
  assert.match(SQL, /WHEN insufficient_privilege THEN/);
});

test("self-check: the positive member case reads a live org_memberships row and self-skips, never fabricates one (migration 311 lesson)", () => {
  assert.match(SQL, /FROM public\.org_memberships/);
  assert.match(SQL, /RAISE NOTICE 'SKIP: no live org_memberships row/);
  assert.doesNotMatch(SQL, /INSERT INTO/);
});
