// 371_definer_hygiene.test.mjs -- static proof of migration 371 (lane SEC-4) by parsing the SQL file, the migration tree,
// the code that calls what it closes, the attack manifest and the fitness registration: no database, no SQL parser
// dependency. The ATTACKS (SET LOCAL ROLE anon / authenticated / service_role, then a real call, a real invitation
// accepted by a real admin) run in the migration's own self-check at apply time inside a block that always rolls back,
// and in the PROOF-4 attack suite (scripts/proof/attacks/attacks.json). This file proves the migration carries each
// class, the self-check attacks it, the class table covers every SECURITY DEFINER function the tree defines (a function
// added below 371 and left out fails here), and that no legitimate caller in src or scripts is cut off by it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findDefinerFunctions } from "../../.discipline/fitness/functions/F70-definer-hygiene.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FSI = join(HERE, "..", "..");
const REPO = join(FSI, "..");
const SQL_FILE = join(HERE, "371_definer_hygiene.sql");
const RAW = existsSync(SQL_FILE) ? readFileSync(SQL_FILE, "utf8") : "";
const strip = (s) => s.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const SQL = strip(RAW);
const read = (...p) => readFileSync(join(FSI, ...p), "utf8");

// The class table, fixed by the brief and by the caller evidence recorded in the session log. Class C membership of the
// four RLS predicates is by caller evidence (see the test below), not by the brief's default.
const CLASS_A = ["_assert_org_membership", "_workspace_active_items"];
const CLASS_C = [
  "get_market_intel_items_public", "get_operations_items_public", "get_research_items_public",
  "get_workspace_intelligence_listings_public", "get_workspace_intelligence_slim_public",
  "user_belongs_to_org", "user_is_group_admin", "user_is_group_member", "user_owns_group",
];
const CLASS_D = [
  "accept_invitation", "create_org_for_self", "decline_invitation", "lookup_invitation", "revoke_invitation",
  "get_all_surface_counts", "get_surface_counts", "get_market_intel_items", "get_operations_items", "get_research_items",
  "get_technology_items", "get_workspace_due_next", "get_workspace_intelligence", "get_workspace_intelligence_aggregates",
  "get_workspace_intelligence_aggregates_scoped", "get_workspace_intelligence_dashboard", "get_workspace_intelligence_listings",
  "get_workspace_intelligence_slim", "get_workspace_recent_changes",
];
const CLASS_E = ["gate_a_health_refresh"];
// Closed by earlier migrations (354, 201, 363, 356, 369, 358, 287, 238, 367); 371 does not touch their grants.
const CLOSED_EARLIER = [
  "admin_set_judgement_drain", "admin_set_pause_state", "capture_worker_fetch", "create_item_correction",
  "item_corrections_latest", "item_corrections_note", "item_corrections_pair_tombstoned", "item_corrections_patch",
  "item_corrections_span_is_verbatim", "move_override_notes_to_item_notes", "publish_aggregate", "reorder_user_list_item",
  "request_verification", "revoke_item_correction",
];

/** The names listed in one class row: ('A', 'revoke list', 'grant list', ARRAY[...]). */
function classRow(label) {
  const re = new RegExp(`\\('${label}',\\s*'([^']*)',\\s*'([^']*)',\\s*ARRAY\\[([^\\]]*)\\]\\)`);
  const m = re.exec(SQL);
  assert.ok(m, `class ${label} row exists`);
  return { revoke: m[1], grant: m[2], names: [...m[3].matchAll(/'([^']+)'/g)].map((x) => x[1]) };
}

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === ".next" || n === "tmp" || n.startsWith(".")) continue;
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(n)) out.push(p);
  }
  return out;
}
const isTest = (f) => /\.(test|npmtest)\.mjs$/.test(f);
const CODE = [...walk(join(FSI, "src")), ...walk(join(FSI, "scripts"))].filter((f) => !isTest(f));

test("header: subject line, NOT APPLIED, and the file exists", () => {
  assert.ok(RAW.length > 0, "migration file exists");
  assert.match(RAW, /^-- subject: Migration 371 /);
  assert.match(RAW, /NOT APPLIED/);
});

test("the migration number is unique", () => {
  const same = readdirSync(HERE).filter((n) => n.startsWith("371_") && n.endsWith(".sql"));
  assert.deepEqual(same, ["371_definer_hygiene.sql"]);
});

test("rule 022 and 012: ASCII only, no dash glyphs, no section sign, no user-home path", () => {
  assert.doesNotMatch(RAW, /[^\x00-\x7f]/);
  assert.doesNotMatch(RAW, /[A-Za-z]:[\\/]Users[\\/]/);
});

test("one transaction, a rolled-back self-check, and no table is created (a probe table would trip F47 and F64)", () => {
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /^\s*COMMIT;/m);
  assert.match(SQL, /RAISE EXCEPTION 'sec4_371_selfcheck_rollback'/);
  assert.match(SQL, /CREATE TEMP TABLE sec4_class [^;]*ON COMMIT DROP/);
  assert.doesNotMatch(SQL, /CREATE\s+TABLE/i);
  assert.match(SQL, /DROP FUNCTION pg_temp\.sec4_attempt\(text, text\);/);
  assert.match(SQL, /DROP FUNCTION pg_temp\.sec4_accept\(uuid, uuid, text, text\);/);
});

test("class A and class E: internal helpers and the cache writer are service_role only", () => {
  const a = classRow("A");
  assert.deepEqual(a.names, CLASS_A);
  assert.equal(a.revoke, "PUBLIC, anon, authenticated");
  assert.equal(a.grant, "service_role");
  const e = classRow("E");
  assert.deepEqual(e.names, CLASS_E);
  assert.equal(e.revoke, "PUBLIC, anon, authenticated");
  assert.equal(e.grant, "service_role");
});

test("class C: public listing RPCs and the RLS predicates keep anon, authenticated and service_role explicitly", () => {
  const c = classRow("C");
  assert.deepEqual(c.names, CLASS_C);
  assert.equal(c.revoke, "PUBLIC");
  assert.equal(c.grant, "anon, authenticated, service_role");
});

test("class D: everything else callable is revoked from PUBLIC and anon and granted to authenticated and service_role", () => {
  const d = classRow("D");
  assert.deepEqual(d.names, CLASS_D);
  assert.equal(d.revoke, "PUBLIC, anon");
  assert.equal(d.grant, "authenticated, service_role");
});

test("class B: every trigger function that is SECURITY DEFINER is found at apply time from pg_proc and revoked from PUBLIC, anon, authenticated", () => {
  assert.match(SQL, /p\.prosecdef AND p\.prorettype IN \('trigger'::regtype, 'event_trigger'::regtype\)/);
  assert.match(SQL, /REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated/);
  assert.match(RAW, /EXECUTE on a trigger function is checked at CREATE TRIGGER, never at fire time/);
});

test("the grant loop resolves each name from pg_proc at apply time (every overload, no hand-typed signature) and skips an absent function with a NOTICE", () => {
  assert.match(SQL, /LEFT JOIN pg_proc p ON p\.pronamespace = 'public'::regnamespace AND p\.proname = c\.fname/);
  assert.match(SQL, /REVOKE EXECUTE ON FUNCTION %s FROM %s/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION %s TO %s/);
  assert.match(SQL, /IF r\.sig IS NULL THEN\s+RAISE NOTICE[^;]*skipped[^;]*;\s+CONTINUE;/);
});

test("catch-all: a SECURITY DEFINER function still holding PUBLIC EXECUTE after the classes is revoked from PUBLIC only, with the implicit default ACL counted", () => {
  assert.match(SQL, /aclexplode\(coalesce\(p\.proacl, acldefault\('f', p\.proowner\)\)\)/);
  assert.match(SQL, /REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'/);
});

test("completeness: the class table covers every callable SECURITY DEFINER function the migration tree defines, and nothing else", () => {
  const dir = HERE;
  const files = readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f) && parseInt(f, 10) < 371)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
  const live = new Map();
  for (const f of files) {
    const t = strip(readFileSync(join(dir, f), "utf8"));
    const ev = findDefinerFunctions(t).map((d) => ({ line: d.line, k: "c", d }));
    for (const m of t.matchAll(/DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([A-Za-z0-9_]+)"?/gi)) {
      ev.push({ line: t.slice(0, m.index).split("\n").length, k: "d", n: m[1].toLowerCase() });
    }
    ev.sort((x, y) => x.line - y.line);
    for (const e of ev) { if (e.k === "c") live.set(e.d.name, e.d); else live.delete(e.n); }
  }
  const callable = [...live.values()].filter((d) => !d.returnsTrigger).map((d) => d.name).sort();
  const triggers = [...live.values()].filter((d) => d.returnsTrigger).map((d) => d.name).sort();
  const classed = [...CLASS_A, ...CLASS_C, ...CLASS_D, ...CLASS_E, ...CLOSED_EARLIER].sort();
  assert.deepEqual(callable, classed);
  assert.equal(new Set(classed).size, classed.length, "no function sits in two classes");
  assert.equal(triggers.length, 12, "twelve trigger definers: class B is dynamic, so the count is a tripwire not a list");
  assert.equal(callable.length, 45);
});

test("class C by caller evidence: the four predicates are evaluated inside RLS policies that name no role, so anon evaluates them", () => {
  // Policies with no TO clause apply to PUBLIC, and PostgreSQL checks EXECUTE on a function used in a policy as the
  // querying role. A class D revoke of anon would turn an anon SELECT on these tables from zero rows into 42501.
  const m006 = read("supabase", "migrations", "006_rls_multi_tenant.sql");
  assert.match(m006, /CREATE POLICY[^;]*FOR SELECT[^;]*user_belongs_to_org\(id\)/is);
  const m046 = read("supabase", "migrations", "046_community_rls_recursion_fix.sql");
  for (const fn of ["user_is_group_member", "user_is_group_admin", "user_owns_group"]) {
    assert.match(m046, new RegExp(`CREATE POLICY[^;]*${fn}\\(`, "is"), `${fn} is used in a 046 policy`);
  }
  for (const fn of ["user_belongs_to_org", "user_is_group_admin", "user_is_group_member", "user_owns_group"]) {
    assert.ok(CLASS_C.includes(fn) && !CLASS_D.includes(fn));
  }
});

test("class A and class E have no caller through rpc in src or scripts, and no class A/D/E caller is a browser client", () => {
  const names = [...CLASS_A, ...CLASS_D, ...CLASS_E];
  const offenders = [];
  for (const f of CODE) {
    const text = readFileSync(f, "utf8");
    for (const n of names) {
      if (!new RegExp(`\\.rpc\\(\\s*["'\`]${n}["'\`]`).test(text)) continue;
      if (CLASS_A.includes(n) || CLASS_E.includes(n)) offenders.push(`${f}: rpc ${n} (service-only function)`);
      if (/supabase-browser|^\s*["']use client["']/m.test(text)) offenders.push(`${f}: rpc ${n} from a browser client`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("search_path: every SECURITY DEFINER function in public lacking one is enumerated from pg_proc at apply time and pinned, default public, pg_temp", () => {
  assert.match(SQL, /p\.pronamespace = 'public'::regnamespace AND p\.prosecdef/);
  assert.match(SQL, /c LIKE 'search_path=%'/);
  assert.match(SQL, /v_path := 'public, pg_temp';/);
  assert.match(SQL, /v_path := 'public, extensions, pg_temp';/);
  assert.match(SQL, /ALTER FUNCTION %s SET search_path = %s/);
  assert.doesNotMatch(SQL, /CREATE OR REPLACE FUNCTION public\.(?!accept_invitation)/);
});

test("search_path is one rule: a path that does not END in pg_temp counts as unpinned, is rebuilt keeping its schemas, and the self-check asserts every definer ends in pg_temp", () => {
  const ends = SQL.match(/c LIKE 'search_path=%' AND c ~ 'pg_temp\$'/g) ?? [];
  assert.ok(ends.length >= 2, "the enumeration and the self-check both test 'ends in pg_temp'");
  assert.match(SQL, /regexp_replace\(v_cur, ',\?\\s\*pg_temp', '', 'g'\) \|\| ', pg_temp'/);
  assert.doesNotMatch(SQL, /NOT EXISTS \(SELECT 1 FROM unnest\(coalesce\(p\.proconfig, '\{\}'::text\[\]\)\) c WHERE c LIKE 'search_path=%'\)/);
  assert.doesNotMatch(RAW, /NOT CLOSED HERE/);
  // the six definers the tree pins to `public` alone are exactly what the rule now repairs
  const six = ["admin_set_judgement_drain", "admin_set_pause_state", "capture_worker_fetch", "enqueue_pending_first_fetch", "move_override_notes_to_item_notes", "reorder_user_list_item"];
  const files = readdirSync(HERE).filter((f) => /^\d+_.*\.sql$/.test(f) && parseInt(f, 10) < 371).sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
  for (const n of six) {
    let last = "";
    for (const f of files) {
      const t = strip(readFileSync(join(HERE, f), "utf8"));
      const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?"?${n}"?\\s*\\(`, "gi");
      let m;
      while ((m = re.exec(t))) last = t.slice(m.index, t.indexOf("$", m.index + 40));
    }
    const pin = /SET\s+search_path\s*(?:=|TO)\s*([^\n]*)/i.exec(last);
    assert.ok(pin, `${n} carries a pin in the tree`);
    assert.doesNotMatch(pin[1], /pg_temp/, `${n} is pinned without pg_temp`);
  }
});

// Same pattern as the migration's v_ext_re; the test fails if the migration's literal drifts from this one.
const EXT_RE = "(^|[^A-Za-z0-9_.])(gen_random_bytes|digest|hmac|crypt|gen_salt|pgp_sym_encrypt|pgp_sym_decrypt|uuid_generate_v[0-9a-z]*|similarity|word_similarity|unaccent)[[:space:]]*[(]";

/** Latest in-tree body of a function, by file order (the migration tree, below 371). */
function latestBody(name) {
  const files = readdirSync(HERE).filter((f) => /^\d+_.*\.sql$/.test(f) && parseInt(f, 10) < 371)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
  let body = null;
  for (const f of files) {
    const t = strip(readFileSync(join(HERE, f), "utf8"));
    const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?"?${name}"?\\s*\\(`, "gi");
    let m;
    while ((m = re.exec(t))) {
      const rest = t.slice(m.index);
      const tag = /\$[A-Za-z_0-9]*\$/.exec(rest);
      if (!tag) continue;
      const bs = tag.index + tag[0].length;
      const be = rest.indexOf(tag[0], bs);
      body = rest.slice(bs, be);
    }
  }
  return body;
}

test("search_path: the extension scan pattern is the one tested here, and the bodies this lane read name no unqualified extension function", () => {
  assert.ok(RAW.includes(`v_ext_re constant text := '${EXT_RE}';`), "the migration's pattern literal equals the tested one");
  const re = new RegExp(EXT_RE.replace("[[:space:]]", "\\s"), "i");
  // The five functions whose latest in-tree definition carries no search_path (272 and 316 reset 160's pin).
  for (const n of ["get_technology_items", "get_workspace_intelligence", "get_workspace_intelligence_dashboard", "get_workspace_intelligence_listings", "get_workspace_intelligence_slim"]) {
    const b = latestBody(n);
    assert.ok(b, `${n} has an in-tree body`);
    assert.doesNotMatch(b, re, `${n} names an unqualified extension function`);
  }
  // The pattern does catch the one real case in the tree (create_org_for_self calls pgcrypto's gen_random_bytes), which
  // already carries `public, extensions, pg_temp` from migration 160.
  assert.match(latestBody("create_org_for_self"), re);
});

test("search_path: the five in-tree definitions lacking a pin are those 272 and 316 left, and 160 pinned the rest", () => {
  const unpinned = [];
  for (const n of ["get_technology_items", "get_workspace_intelligence", "get_workspace_intelligence_dashboard", "get_workspace_intelligence_listings", "get_workspace_intelligence_slim"]) {
    const files = readdirSync(HERE).filter((f) => /^\d+_.*\.sql$/.test(f) && parseInt(f, 10) < 371).sort();
    let lastHeader = "";
    for (const f of files) {
      const t = strip(readFileSync(join(HERE, f), "utf8"));
      const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?"?${n}"?\\s*\\(`, "gi");
      let m;
      while ((m = re.exec(t))) lastHeader = t.slice(m.index, t.indexOf("$", m.index + 40));
    }
    if (!/SET\s+search_path/i.test(lastHeader)) unpinned.push(n);
  }
  assert.equal(unpinned.length, 5);
});

test("accept_invitation: identical to migration 156 except the ON CONFLICT promotion rule, SECURITY DEFINER, search_path = public, pg_temp", () => {
  const m156 = strip(read("supabase", "migrations", "156_org_member_bans.sql"));
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const bodyOf = (t) => {
    const i = t.indexOf("CREATE OR REPLACE FUNCTION public.accept_invitation");
    const tag = /\$[A-Za-z_0-9]*\$/.exec(t.slice(i));
    const bs = i + tag.index + tag[0].length;
    return t.slice(bs, t.indexOf(tag[0], bs));
  };
  const old156 = bodyOf(m156);
  const new371 = bodyOf(SQL);
  const oldClause = "ON CONFLICT (org_id, user_id) DO UPDATE\n    SET role = EXCLUDED.role;";
  assert.ok(old156.includes(oldClause), "156 carries the unconditional demoting clause");
  assert.doesNotMatch(new371, /DO UPDATE\s+SET role = EXCLUDED\.role;/);
  const newClause = /ON CONFLICT \(org_id, user_id\) DO UPDATE\s+SET role = EXCLUDED\.role\s+WHERE \(org_memberships\.role = 'viewer' AND EXCLUDED\.role IN \('member', 'admin'\)\)\s+OR \(org_memberships\.role = 'member' AND EXCLUDED\.role = 'admin'\);/.exec(new371);
  assert.ok(newClause, "371 carries the promotion-only clause");
  assert.equal(norm(new371.replace(newClause[0], oldClause)), norm(old156), "no other change to the body");
  assert.match(SQL, /CREATE OR REPLACE FUNCTION public\.accept_invitation\(p_token text\)\s+RETURNS uuid\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public, pg_temp/);
  assert.match(SQL, /REVOKE EXECUTE ON FUNCTION public\.accept_invitation\(text\) FROM PUBLIC, anon;/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.accept_invitation\(text\) TO authenticated, service_role;/);
  // owner is never granted, so the clause can never produce 'owner' or demote one
  assert.doesNotMatch(newClause[0], /'owner'/);
});

test("self-check: every class is attacked as the refused role and exercised as the intended role, rolled back, against real rows", () => {
  assert.match(SQL, /CREATE FUNCTION pg_temp\.sec4_attempt\(p_role text, p_sql text\) RETURNS text/);
  assert.match(SQL, /DO \$selfcheck\$/);
  // class D: anon refused 42501, authenticated and service_role pass the privilege check
  assert.match(SQL, /sec4_attempt\('anon', 'SELECT \* FROM public\.lookup_invitation\(''sec4-no-such-token''\)'\)/);
  assert.match(SQL, /sec4_attempt\('authenticated', 'SELECT \* FROM public\.lookup_invitation\(''sec4-no-such-token''\)'\)/);
  // class C: anon succeeds (control)
  assert.match(SQL, /sec4_attempt\('anon', 'SELECT count\(\*\) FROM public\.get_market_intel_items_public\(\)'\)/);
  assert.match(SQL, /sec4_attempt\('anon', format\('SELECT public\.user_belongs_to_org\(%L::uuid\)', gen_random_uuid\(\)\)\)/);
  // class A: a real member as authenticated is refused 42501; the service role passes
  assert.match(SQL, /_assert_org_membership/);
  assert.match(SQL, /'sub', v_member_user/);
  // class E: anon and authenticated refused
  assert.match(SQL, /gate_a_health_refresh\(\)/);
  // accept_invitation legs
  assert.match(SQL, /CREATE FUNCTION pg_temp\.sec4_accept\(p_org uuid, p_user uuid, p_email text, p_proposed text\) RETURNS text/);
  assert.match(SQL, /\(1, 'admin',  'viewer', 'admin'\)/);
  assert.match(SQL, /\(3, 'owner',  'viewer', 'owner'\)/);
  assert.match(SQL, /\(4, 'owner',  'admin',  'owner'\)/);
  assert.match(SQL, /\(7, 'member', 'admin',  'admin'\)/);
  assert.match(SQL, /m\.role = v_leg\.have/);
  // catalog assertions
  assert.match(SQL, /aclexplode\(coalesce\(p\.proacl, acldefault\('f', p\.proowner\)\)\)/);
  assert.match(SQL, /a\.grantee = 0 AND a\.privilege_type = 'EXECUTE'/);
  assert.match(SQL, /c LIKE 'search_path=%'/);
  assert.match(SQL, /has_function_privilege\('anon', r\.oid, 'EXECUTE'\)/);
  assert.match(SQL, /has_function_privilege\('authenticated', r\.oid, 'EXECUTE'\)/);
  assert.match(SQL, /has_function_privilege\('service_role', r\.oid, 'EXECUTE'\)/);
  assert.match(SQL, /ON CONFLICT\[\^;\]\*WHERE/);
  // legs that need a live row skip with a NOTICE and never invent one
  assert.match(SQL, /RAISE NOTICE 'migration 371 self-check: no [^']*skipped/);
  // outside accept_invitation's own body (which inserts the membership), no fixture row is invented
  const afterBody = SQL.slice(SQL.indexOf("CREATE TEMP TABLE sec4_class"));
  assert.doesNotMatch(afterBody, /INSERT INTO (public\.)?(organizations|org_memberships|profiles)|INSERT INTO auth\.users/i);
});

test("the F47 allowlist entry for gate_a_health_refresh is gone, because this migration now references the function", () => {
  const f47 = read(".discipline", "fitness", "functions", "F47-db-object-reference.mjs");
  assert.doesNotMatch(f47, /gate_a_health_refresh/);
  assert.match(f47, /functions:\s*\{\s*\},/);
  assert.match(SQL, /'gate_a_health_refresh'/);
});

test("the attack manifest carries the four SEC-4 attacks, each in the existing shape", () => {
  const m = JSON.parse(read("scripts", "proof", "attacks", "attacks.json"));
  const byId = new Map(m.attacks.map((a) => [a.id, a]));
  for (const id of ["sec4-definer-class-d-anon-refused", "sec4-definer-class-a-authenticated-refused", "sec4-definer-class-c-anon-control", "sec4-accept-invitation-keeps-role"]) {
    const a = byId.get(id);
    assert.ok(a, `${id} is in attacks.json`);
    assert.equal(a.kind, "sql");
    assert.equal(a.group, "SEC-4 definer hygiene");
  }
  const sqlOf = (id) => byId.get(id).steps.map((s) => s.sql).join("\n");
  const d = byId.get("sec4-definer-class-d-anon-refused").steps.find((s) => s.kind === "attack");
  assert.equal(d.as, "anon");
  assert.deepEqual(d.expect, { error: "42501" });
  const a = byId.get("sec4-definer-class-a-authenticated-refused").steps.find((s) => s.kind === "attack");
  assert.match(a.as, /^user:/);
  assert.deepEqual(a.expect, { error: "42501" });
  assert.match(a.sql, /_assert_org_membership/);
  const c = byId.get("sec4-definer-class-c-anon-control").steps.find((s) => s.as === "anon");
  assert.deepEqual(c.expect, { ok: true });
  assert.match(sqlOf("sec4-definer-class-c-anon-control"), /get_market_intel_items_public/);
  const k = sqlOf("sec4-accept-invitation-keeps-role");
  assert.match(k, /accept_invitation/);
  assert.match(k, /org_invitations/);
  assert.match(JSON.stringify(byId.get("sec4-accept-invitation-keeps-role").steps), /"equals":\{"role":"owner"\}/);
  assert.match(JSON.stringify(byId.get("sec4-accept-invitation-keeps-role").steps), /"equals":\{"role":"admin"\}/);
});

test("the invariant registry carries RD-93 for F70 and its two proofs, and the migrations inventory lists 371", () => {
  const rd = readFileSync(join(FSI, ".discipline", "governance", "invariants.d", "RD-93-definer-hygiene.mjs"), "utf8");
  assert.match(rd, /'fitness:F70'/);
  assert.match(rd, /F70-definer-hygiene\.test\.mjs/);
  assert.match(rd, /371_definer_hygiene\.test\.mjs/);
  const inv = readFileSync(join(REPO, "docs", "inventories", "migrations.md"), "utf8");
  assert.match(inv, /\| 371 \| 371_definer_hygiene\.sql \|/);
});

test("the rollback note re-opens the holes it reverses and says not to", () => {
  assert.match(RAW, /Rollback \(reversible in intent; do not/);
});
