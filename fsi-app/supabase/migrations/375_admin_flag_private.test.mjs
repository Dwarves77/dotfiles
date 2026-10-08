// 375_admin_flag_private.test.mjs -- static proof of migration 375 (lane SEC-6) by parsing the SQL file, the whole
// migration tree and the code that reads profiles.is_platform_admin: no database, no SQL parser dependency, node
// builtins only. The ATTACK (SET LOCAL ROLE authenticated / anon / service_role with a fixture jwt sub, then the column
// read, the predicate and one policy per source migration as admin and non-admin) runs in the migration's own
// self-check at apply time inside a rolled-back sub-transaction, and the two sec6-* attacks in
// scripts/proof/attacks/attacks.json re-prove the column refusal and the predicate on the chain stack. This file proves
// the file carries the function, the 22 ALTER POLICY statements (and that those 22 are EXACTLY the live policies the
// migration tree leaves reading the flag), the column revoke, the attack legs and the catalog pass, and that no
// user-session reader in src still selects the column.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDefinerHygiene } from "../../.discipline/fitness/functions/F70-definer-hygiene.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FSI = join(HERE, "..", "..");
const NAME = "375_admin_flag_private.sql";
const RAW = readFileSync(join(HERE, NAME), "utf8");
const strip = (sql) => sql.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const SQL = strip(RAW);

test("header: subject line and APPLIED with the ledger version", () => {
  assert.match(RAW, /^-- subject: Migration 375 /);
  assert.match(RAW, /APPLIED \(production ledger version 20261008131209, as of 2026-10-08\)/);
  assert.doesNotMatch(RAW, /NOT APPLIED/);
});

test("one transaction, BEGIN first and COMMIT last", () => {
  assert.match(SQL.trim(), /^BEGIN;/);
  assert.match(SQL.trim(), /COMMIT;$/);
});

test("is_platform_admin(): boolean, STABLE SECURITY DEFINER, no parameter, pinned path naming pg_temp, caller's own row, false when null", () => {
  const m = /CREATE OR REPLACE FUNCTION public\.is_platform_admin\(\)\s+RETURNS boolean\s+LANGUAGE sql\s+STABLE\s+SECURITY DEFINER\s+SET search_path = public, pg_temp\s+AS \$fn\$([\s\S]*?)\$fn\$;/.exec(SQL);
  assert.ok(m, "function definition not found in the expected shape");
  assert.match(m[1], /coalesce\(\(SELECT p\.is_platform_admin FROM public\.profiles p WHERE p\.id = auth\.uid\(\)\), false\)/);
});

test("is_platform_admin(): class C of migration 371 (REVOKE ALL FROM PUBLIC, then EXECUTE to anon, authenticated and service_role): a policy function must be callable by every role the policy applies to", () => {
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.is_platform_admin\(\) FROM PUBLIC;/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.is_platform_admin\(\) TO anon, authenticated, service_role;/);
  assert.doesNotMatch(SQL, /GRANT[^;]*is_platform_admin\(\)[^;]*\bPUBLIC\b/);
  assert.doesNotMatch(SQL, /REVOKE[^;]*is_platform_admin\(\)[^;]*\banon\b/);
  // 371's class table: class C is "RLS predicates, anon, authenticated and service_role granted explicitly"; the header says so.
  assert.match(RAW, /class C/);
  assert.doesNotMatch(RAW, /class D/);
  // the same-shaped precedents in the tree, so the grant is the house pattern and not a guess
  const m371 = readFileSync(join(HERE, "371_definer_hygiene.sql"), "utf8");
  assert.match(m371, /user_belongs_to_org, user_is_group_admin/);
  assert.match(m371, /C {2}public listing RPCs and RLS predicates, anon, authenticated and service_role granted explicitly/);
});

test("F70 definer-hygiene is satisfied by this file (REVOKE FROM PUBLIC and a pg_temp search_path)", () => {
  assert.deepEqual(checkDefinerHygiene({ filepath: NAME, content: RAW }), []);
});

// ---- the ALTER POLICY list ---------------------------------------------------------------------------------------
const ALTERS = [...SQL.matchAll(/ALTER POLICY (\w+) ON public\.(\w+)\s+([\s\S]*?);/g)].map((m) => ({ pol: m[1], tbl: m[2], body: m[3] }));

test("exactly 22 ALTER POLICY statements, one per policy, none repeated", () => {
  assert.equal(ALTERS.length, 22);
  assert.equal(new Set(ALTERS.map((a) => `${a.tbl}.${a.pol}`)).size, 22);
});

test("every ALTER calls the predicate and reads no column; the five policies whose WITH CHECK read the flag restate it", () => {
  const WITH_CHECK = new Set([
    "ingest_rejections_update_platform_admin", "pjr_update_platform_admin", "source_tier_opinions_update_platform_admin",
    "integrity_flags_admin_update", "canonical_source_candidates_admin_write",
  ]);
  for (const a of ALTERS) {
    assert.match(a.body, /\(SELECT public\.is_platform_admin\(\)\)/, `${a.pol} must call the predicate`);
    assert.doesNotMatch(a.body.replace(/public\.is_platform_admin\(\)/g, ""), /is_platform_admin/, `${a.pol} still names the column`);
    assert.equal(/WITH CHECK/.test(a.body), WITH_CHECK.has(a.pol), `${a.pol}: WITH CHECK restated exactly where the old one read the flag`);
  }
  assert.equal(WITH_CHECK.size, 5);
});

test("the policy list the preconditions and the catalog pass use is the same 22 as the ALTER statements", () => {
  const listBlock = /INSERT INTO _sec6_policy_list \(tbl, pol, has_check\) VALUES([\s\S]*?);/.exec(SQL)[1];
  const listed = [...listBlock.matchAll(/\('(\w+)', '(\w+)', (true|false)\)/g)].map((m) => `${m[1]}.${m[2]}`);
  assert.deepEqual([...listed].sort(), ALTERS.map((a) => `${a.tbl}.${a.pol}`).sort());
  const checks = [...listBlock.matchAll(/\('(\w+)', '(\w+)', true\)/g)].map((m) => m[2]).sort();
  assert.deepEqual(checks, ["canonical_source_candidates_admin_write", "ingest_rejections_update_platform_admin", "integrity_flags_admin_update", "pjr_update_platform_admin", "source_tier_opinions_update_platform_admin"]);
});

// ---- the census: the 22 are exactly what the migration tree leaves reading the flag --------------------------------
function livePolicies() {
  const files = readdirSync(HERE).filter((f) => f.endsWith(".sql") && Number(/^(\d+)_/.exec(f)?.[1] ?? 1e9) < 375).sort();
  const live = new Map(); // "table.policy" -> definition text
  for (const f of files) {
    const text = strip(readFileSync(join(HERE, f), "utf8"));
    const events = [];
    for (const m of text.matchAll(/CREATE\s+POLICY\s+("[^"]+"|\w+)\s+ON\s+(?:public\.)?"?(\w+)"?([\s\S]*?);/gi)) {
      events.push({ at: m.index, kind: "create", pol: m[1].replace(/"/g, ""), tbl: m[2], def: m[3] });
    }
    for (const m of text.matchAll(/ALTER\s+POLICY\s+("[^"]+"|\w+)\s+ON\s+(?:public\.)?"?(\w+)"?([\s\S]*?);/gi)) {
      events.push({ at: m.index, kind: "alter", pol: m[1].replace(/"/g, ""), tbl: m[2], def: m[3] });
    }
    for (const m of text.matchAll(/DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?("[^"]+"|\w+)\s+ON\s+(?:public\.)?"?(\w+)"?/gi)) {
      events.push({ at: m.index, kind: "drop", pol: m[1].replace(/"/g, ""), tbl: m[2] });
    }
    for (const m of text.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?(\w+)"?/gi)) {
      events.push({ at: m.index, kind: "droptable", tbl: m[1] });
    }
    events.sort((a, b) => a.at - b.at);
    for (const e of events) {
      const key = `${e.tbl}.${e.pol}`;
      if (e.kind === "create" || e.kind === "alter") live.set(key, e.def);
      else if (e.kind === "drop") live.delete(key);
      else for (const k of [...live.keys()]) if (k.startsWith(`${e.tbl}.`)) live.delete(k);
    }
  }
  return live;
}

function treeCensus() {
  return [...livePolicies().entries()].filter(([, def]) => /is_platform_admin/i.test(def)).map(([k]) => k).sort();
}

test("ANON: no table among the 22 policies' tables carries a policy that lets anon read it, so the anon leg of the self-check is the predicate call (returns false, does not raise), not a row read", () => {
  const tables = new Set(ALTERS.map((a) => a.tbl));
  const publicRead = [];
  for (const [key, def] of livePolicies()) {
    const [tbl, pol] = [key.slice(0, key.indexOf(".")), key.slice(key.indexOf(".") + 1)];
    if (!tables.has(tbl)) continue;
    const d = def.replace(/\s+/g, " ");
    if (!/\b(FOR\s+)?(SELECT|ALL)\b/i.test(d)) continue; // an INSERT or UPDATE policy reads nothing for anon
    if (/\bTO\s+(reconciler|authenticated|service_role)\b/i.test(d)) continue; // a named role, not anon
    if (/is_platform_admin|auth\.role\(\)\s*=\s*'service_role'|auth\.uid\(\)/i.test(d)) continue; // a caller-keyed policy
    publicRead.push(pol);
  }
  assert.deepEqual(publicRead, [], "if a table among the 22 gains a public-read policy, the self-check needs an anon row-read leg for it");
});

test("CENSUS: the live policies the migration tree (every file below 375, in order, with DROP POLICY, DROP TABLE and ALTER POLICY applied) leaves reading is_platform_admin are exactly the 22 repointed", () => {
  assert.deepEqual(treeCensus(), ALTERS.map((a) => `${a.tbl}.${a.pol}`).sort());
});

test("CENSUS is non-vacuous: the parse sees the superseded and dropped ones too (post_promotions_select dies with its table, 182 supersedes 032)", () => {
  const all = readdirSync(HERE).filter((f) => f.endsWith(".sql")).map((f) => strip(readFileSync(join(HERE, f), "utf8"))).join("\n");
  assert.match(all, /CREATE POLICY post_promotions_select ON public\.post_promotions/);
  assert.match(all, /DROP TABLE IF EXISTS public\.post_promotions;/);
  assert.ok(!treeCensus().includes("post_promotions.post_promotions_select"));
  assert.ok(!ALTERS.some((a) => a.tbl === "post_promotions"));
});

test("each ALTERed policy exists in its creating migration under the same table name", () => {
  const byFile = new Map();
  for (const f of readdirSync(HERE).filter((x) => x.endsWith(".sql") && Number(/^(\d+)_/.exec(x)[1]) < 375)) byFile.set(f, strip(readFileSync(join(HERE, f), "utf8")));
  const all = [...byFile.values()].join("\n");
  for (const a of ALTERS) {
    assert.match(all, new RegExp(`CREATE\\s+POLICY\\s+"?${a.pol}"?\\s+ON\\s+(?:public\\.)?${a.tbl}\\b`, "i"), `${a.tbl}.${a.pol} is not created anywhere in the tree`);
  }
});

test("the kept arms of the three composite policies are carried over: 153 verifier_status, 166 service_role, 182 reporter and moderator arms", () => {
  const body = (n) => ALTERS.find((a) => a.pol === n).body;
  for (const n of ["signoff_select", "signoff_decide"]) assert.match(body(n), /p\.verifier_status = 'active'/);
  assert.match(body("signoff_select"), /requested_by = auth\.uid\(\)/);
  assert.match(body("provisional_sources_admin_read"), /auth\.role\(\) = 'service_role'/);
  for (const n of ["moderation_reports_select", "moderation_reports_update_admin"]) {
    assert.match(body(n), /target_kind = 'post'/);
    assert.match(body(n), /target_kind = 'group'/);
    assert.match(body(n), /m\.role = ANY \(ARRAY\['admin','moderator'\]\)/);
  }
  assert.match(body("moderation_reports_select"), /reporter_user_id = auth\.uid\(\)/);
  assert.doesNotMatch(body("moderation_reports_update_admin"), /WITH CHECK/, "its WITH CHECK never read the flag and is left untouched");
});

// ---- the revoke --------------------------------------------------------------------------------------------------
test("the column revoke follows the function and every ALTER, names PUBLIC, anon and authenticated, and touches no other column", () => {
  const revoke = /REVOKE SELECT \(is_platform_admin\) ON public\.profiles FROM PUBLIC, anon, authenticated;/.exec(SQL);
  assert.ok(revoke);
  assert.ok(revoke.index > SQL.indexOf("CREATE OR REPLACE FUNCTION public.is_platform_admin()"));
  assert.ok(revoke.index > SQL.lastIndexOf("ALTER POLICY "), "the revoke must come after the last ALTER POLICY");
  assert.doesNotMatch(SQL, /REVOKE SELECT ON TABLE public\.profiles/);
  assert.doesNotMatch(SQL, /GRANT SELECT[^;]*ON public\.profiles TO[^;]*\banon\b/);
});

test("precondition aborts when authenticated holds the table-level SELECT (a column revoke would be a no-op) or when 372 is not applied", () => {
  assert.match(SQL, /has_table_privilege\('authenticated', 'public\.profiles', 'SELECT'\)/);
  assert.match(SQL, /to_regprocedure\('public\.my_profile\(\)'\) IS NULL/);
  assert.match(SQL, /policyname = 'profiles_select_own_or_shared_org'/);
});

// ---- the self-check attacks ---------------------------------------------------------------------------------------
test("self-check runs in a sentinel-rolled-back sub-transaction and skips only on an auth.users insert failure", () => {
  assert.match(SQL, /RAISE EXCEPTION 'sec6_375_selfcheck_rollback'/);
  assert.match(SQL, /IF SQLERRM <> 'sec6_375_selfcheck_rollback' THEN RAISE; END IF;/);
  assert.match(SQL, /could not insert fixture auth\.users rows/);
});

test("self-check attacks: column refused for the non-admin (own and other row) and for the admin's own row, with 42501", () => {
  assert.equal([...SQL.matchAll(/PERFORM p\.is_platform_admin FROM public\.profiles p WHERE p\.id = v_(user|admin);/g)].length, 3);
  assert.match(SQL, /ABORT: a non-admin could SELECT is_platform_admin from its own profiles row/);
  assert.match(SQL, /ABORT: a non-admin could SELECT is_platform_admin from another profiles row/);
  assert.match(SQL, /ABORT: a platform admin could SELECT is_platform_admin from its own profiles row/);
  assert.match(SQL, /EXCEPTION WHEN insufficient_privilege THEN/);
});

test("self-check legs: predicate false for non-admin, true for admin via a session with the admin uid, anon gets false without raising, service_role no-caller false and column read open", () => {
  assert.match(SQL, /is_platform_admin\(\) must be false for a non-admin/);
  assert.match(SQL, /is_platform_admin\(\) must be true for the platform admin/);
  assert.match(SQL, /ABORT: anon could not execute is_platform_admin\(\)/);
  assert.match(SQL, /ABORT: is_platform_admin\(\) must be false for anon/);
  assert.doesNotMatch(SQL, /ABORT: anon could execute is_platform_admin\(\)/);
  assert.match(SQL, /is_platform_admin\(\) must be false when there is no caller/);
  assert.match(SQL, /service_role could not read profiles\.is_platform_admin/);
  assert.match(SQL, /my_profile\(\) must carry is_platform_admin = true/);
  assert.match(SQL, /my_profile\(\) must carry is_platform_admin = false/);
  assert.match(SQL, /json_build_object\('sub', v_admin::text, 'role', 'authenticated'\)/);
});

test("self-check legs: one table per source migration is read as admin (same count as the owner) and as non-admin (0 rows or 42501, never another error)", () => {
  const tables = /v_tables text\[\] := ARRAY\[([\s\S]*?)\];/.exec(SQL)[1].match(/'(\w+)'/g).map((s) => s.replace(/'/g, ""));
  assert.deepEqual(tables, [
    "ingest_rejections", "source_tier_opinions", "community_post_signoff_requests", "provisional_sources",
    "moderation_reports", "error_events", "integrity_flags", "corpus_turn_requests",
    "canonical_source_candidates", "vocabulary_terms", "item_corrections",
  ]);
  // one from each of 082, 099, 153, 166, 182, 195, 249, 277, 342, 355, 356
  const created = { ingest_rejections: "082", source_tier_opinions: "099", community_post_signoff_requests: "153", provisional_sources: "166", moderation_reports: "182", error_events: "195", integrity_flags: "249", corpus_turn_requests: "277", canonical_source_candidates: "342", vocabulary_terms: "355", item_corrections: "356" };
  for (const [t, n] of Object.entries(created)) {
    const f = readdirSync(HERE).find((x) => x.startsWith(`${n}_`) && x.endsWith(".sql"));
    assert.ok(f, `migration ${n} exists`);
    assert.match(strip(readFileSync(join(HERE, f), "utf8")), new RegExp(`\\b${t}\\b`), `${n} mentions ${t}`);
  }
  assert.match(SQL, /ABORT: the platform admin could not read public\.% after the repoint/);
  assert.match(SQL, /ABORT: the platform admin sees % of % rows of public\.% after the repoint/);
  assert.match(SQL, /ABORT: a non-admin sees % rows of public\.%/);
  assert.match(SQL, /neither a row count nor 42501/);
});

// ---- the catalog pass ---------------------------------------------------------------------------------------------
test("catalog pass: no policy in public names the flag as a column (calls and the deparser alias removed first), all 22 name the predicate, the five restate the WITH CHECK", () => {
  assert.match(SQL, /is_platform_admin\\s\*\\\(\\s\*\\\)/);
  assert.match(SQL, /AS\\s\+is_platform_admin/);
  assert.match(SQL, /these policies in public still read the is_platform_admin column/);
  assert.match(SQL, /these policies do not call is_platform_admin\(\) where they must/);
  assert.match(SQL, /\(SELECT count\(\*\) FROM _sec6_policy_list\) <> 22/);
});

test("catalog pass: privileges (anon and authenticated lose the column, service_role keeps it, the rest of the grant stays) and the function shape", () => {
  assert.match(SQL, /has_column_privilege\('service_role', 'public\.profiles', 'is_platform_admin', 'SELECT'\)/);
  assert.match(SQL, /ARRAY\['id', 'display_name', 'full_name', 'avatar_url', 'job_title', 'org_id', 'verifier_status'\]/);
  assert.match(SQL, /has_column_privilege\('authenticated', 'public\.profiles', 'email', 'SELECT'\)/);
  assert.match(SQL, /prosecdef\s+AND provolatile = 's'/);
  assert.match(SQL, /search_path=%pg_temp%/);
  assert.match(SQL, /NOT has_function_privilege\('anon', 'public\.is_platform_admin\(\)', 'EXECUTE'\)/);
  assert.match(SQL, /anon, authenticated and service_role must all be able to execute is_platform_admin\(\)/);
  assert.match(SQL, /a\.grantee = 0 AND a\.privilege_type = 'EXECUTE'/);
});

test("the column-reference matcher of the catalog pass is itself correct: it flags every old form and passes every new form (executed in JS on the same regexes)", () => {
  const flagged = (def) => /is_platform_admin/i.test(def.replace(/is_platform_admin\s*\(\s*\)/gi, "").replace(/AS\s+is_platform_admin/gi, ""));
  for (const old of [
    "(EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_platform_admin = true))))",
    "(EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.is_platform_admin = true))))",
    "((p.verifier_status = 'active'::text) OR p.is_platform_admin)",
  ]) assert.equal(flagged(old), true, old);
  for (const fresh of [
    "( SELECT is_platform_admin() AS is_platform_admin)",
    "( SELECT public.is_platform_admin() AS is_platform_admin)",
    "((auth.role() = 'service_role'::text) OR ( SELECT is_platform_admin() AS is_platform_admin))",
  ]) assert.equal(flagged(fresh), false, fresh);
});

// ---- the code side ------------------------------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory()) { if (n !== "node_modules" && n !== ".next") walk(p, out); } else out.push(p);
  }
  return out;
}

test("CODE: no user-session reader in src selects the is_platform_admin column; the only column selects left are the three service-client reads", () => {
  const ALLOWED_SERVICE_CLIENT = new Set(["src/lib/auth/admin.ts", "src/lib/supabase-server.ts"]);
  const offenders = [];
  const allowedHits = [];
  for (const p of walk(join(FSI, "src")).filter((f) => /\.(ts|tsx|mjs)$/.test(f))) {
    const rel = relative(FSI, p).split(sep).join("/");
    if (/\.(test|npmtest)\.mjs$/.test(rel)) continue;
    const text = readFileSync(p, "utf8");
    for (const m of text.matchAll(/\.select\(\s*(["'`])([^"'`]*)\1/g)) {
      if (!/is_platform_admin/.test(m[2])) continue;
      (ALLOWED_SERVICE_CLIENT.has(rel) ? allowedHits : offenders).push(`${rel}: ${m[2]}`);
    }
  }
  assert.deepEqual(offenders, [], "these read the revoked column through a user session");
  assert.equal(allowedHits.length, 2, "admin.ts isPlatformAdmin and supabase-server.ts isPlatformAdminInline, both service-client");
});

test("CODE: the four own-row readers call the rpc, and the service-client readers say they need the service client", () => {
  const read = (p) => readFileSync(join(FSI, p), "utf8");
  assert.match(read("src/lib/auth/platform-admin-gate.ts"), /rpc\(IS_PLATFORM_ADMIN_RPC\)/);
  assert.match(read("src/lib/auth/platform-admin-gate.ts"), /export const IS_PLATFORM_ADMIN_RPC = "is_platform_admin";/);
  assert.match(read("src/lib/api/server-bootstrap.ts"), /readOwnPlatformAdmin\(supabase\)/);
  assert.match(read("src/lib/community/shell-context.ts"), /readOwnPlatformAdmin\(supabase\)/);
  assert.match(read("src/app/api/community/signoff/[id]/decide/route.ts"), /readOwnPlatformAdmin\(auth\.supabase\)/);
  assert.match(read("src/lib/auth/admin.ts"), /SERVICE-ROLE client only/);
});
