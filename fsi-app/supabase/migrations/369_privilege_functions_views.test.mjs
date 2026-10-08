// 369_privilege_functions_views.test.mjs -- static proof of migration 369 (lane SEC-3a) by parsing the SQL file, the
// code that calls what it closes, and the PROOF-4 attack manifest: no database, no SQL parser dependency. The ATTACKS
// (SET LOCAL ROLE anon / authenticated / service_role, then a real call, a real INSERT through a view, a real write to a
// table, each requiring SQLSTATE 42501 for the closed role) run in the migration's own self-check at apply time inside a
// block that always rolls back. This file proves the migration carries each closure, the self-check attacks it, and that
// no legitimate caller in src, scripts or the proof manifest is cut off by it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { headerProblems } from "./_lib/applied-status.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FSI = join(HERE, "..", "..");
const SQL_FILE = join(HERE, "369_privilege_functions_views.sql");
const RAW = existsSync(SQL_FILE) ? readFileSync(SQL_FILE, "utf8") : "";
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const read = (...p) => readFileSync(join(FSI, ...p), "utf8");

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

test("header: subject line, applied status as the map says, and the file exists", () => {
  assert.ok(RAW.length > 0, "migration file exists");
  assert.match(RAW, /^-- subject: Migration 369 /);
  assert.deepEqual(headerProblems(RAW, "369_privilege_functions_views.sql"), []);
});

test("the migration number is unique", () => {
  const same = readdirSync(HERE).filter((n) => n.startsWith("369_") && n.endsWith(".sql"));
  assert.deepEqual(same, ["369_privilege_functions_views.sql"]);
});

test("rule 022 and 012: ASCII only, no dash glyphs, no section sign, no user-home path", () => {
  assert.doesNotMatch(RAW, /[^\x00-\x7f]/);
  assert.doesNotMatch(RAW, /[A-Za-z]:[\\/]Users[\\/]/);
});

test("functions: the four named writers are revoked from PUBLIC, anon, authenticated and granted to service_role", () => {
  for (const sig of [
    "public.admin_set_judgement_drain(text, text)",
    "public.admin_set_pause_state(text, boolean, text, date, boolean)",
    "public.item_corrections_note(uuid, jsonb)",
    "public.item_corrections_patch(uuid, text, jsonb)",
  ]) assert.ok(SQL.includes(`'${sig}'`), `${sig} is in the service-only list`);
  assert.match(SQL, /REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION %s TO service_role/);
});

test("functions: the ruled extension list is guarded by to_regprocedure so an absent out-of-repo function does not abort, and gate_a_health_refresh is not in it", () => {
  for (const sig of [
    "public.item_corrections_latest(uuid, text)",
    "public.item_corrections_span_is_verbatim(uuid, uuid, text)",
    "public.item_corrections_pair_tombstoned(uuid, uuid)",
    "public.move_override_notes_to_item_notes()",
  ]) assert.ok(SQL.includes(`'${sig}'`), `${sig} is listed`);
  assert.ok(!RAW.includes("gate_a_health_refresh"), "gate_a_health_refresh is not mentioned anywhere in the migration (F47 allowlists it)");
  assert.match(SQL, /IF to_regprocedure\(v_sig\) IS NULL THEN\s+RAISE NOTICE[^;]*skipped[^;]*;\s+CONTINUE;/);
});

test("functions: every function in the extension list is SECURITY DEFINER and every caller is a SECURITY DEFINER function or the service role", () => {
  const m356 = read("supabase", "migrations", "356_item_corrections.sql");
  const body = (name) => { const i = m356.indexOf(`FUNCTION public.${name}(`); assert.ok(i >= 0, name); return m356.slice(i, i + 700); };
  for (const n of ["item_corrections_latest", "item_corrections_span_is_verbatim", "item_corrections_pair_tombstoned"]) {
    assert.match(body(n), /SECURITY DEFINER/, `${n} is SECURITY DEFINER`);
  }
  for (const caller of ["item_corrections_patch", "item_corrections_before_insert", "item_corrections_block_tombstoned_edge"]) {
    assert.match(body(caller), /SECURITY DEFINER/, `${caller} (a caller) is SECURITY DEFINER`);
  }
  const rpcs = [];
  for (const f of CODE) {
    const t = readFileSync(f, "utf8");
    if (/\.rpc\(\s*["'`](item_corrections_latest|item_corrections_span_is_verbatim|item_corrections_pair_tombstoned|move_override_notes_to_item_notes)["'`]/.test(t)) rpcs.push(relative(FSI, f));
  }
  assert.deepEqual(rpcs, [], "no src or script calls any of the four through rpc");
});

test("publish_aggregate (ruling A): revoked from PUBLIC, anon and authenticated, granted to service_role only, search_path pinned by ALTER (body not restated)", () => {
  assert.match(SQL, /REVOKE EXECUTE ON FUNCTION public\.publish_aggregate\(text, text, jsonb\) FROM PUBLIC, anon, authenticated;/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.publish_aggregate\(text, text, jsonb\) TO service_role;/);
  assert.match(SQL, /ALTER FUNCTION public\.publish_aggregate\(text, text, jsonb\) SET search_path = public, pg_temp;/);
  assert.doesNotMatch(SQL, /CREATE OR REPLACE FUNCTION public\.publish_aggregate/);
  assert.doesNotMatch(SQL, /publish_aggregate\(text, text, jsonb\) TO authenticated/);
});

test("publish_aggregate: every PROOF-4 step that calls it runs as service, or as anon or a member and must be refused 42501; a service step proves the ADR-035 floor refuses", () => {
  const manifest = JSON.parse(read("scripts", "proof", "attacks", "attacks.json"));
  const steps = [];
  const visit = (o) => {
    if (Array.isArray(o)) o.forEach(visit);
    else if (o && typeof o === "object") {
      if (typeof o.sql === "string" && o.sql.includes("publish_aggregate")) steps.push(o);
      Object.values(o).forEach(visit);
    }
  };
  visit(manifest);
  assert.ok(steps.length > 0, "the manifest calls publish_aggregate");
  for (const s of steps) {
    if (s.as === "service") continue;
    assert.ok(s.as === "anon" || String(s.as).startsWith("user:"), `unexpected role ${s.as}`);
    assert.equal(s.expect?.error, "42501", `${s.label}: a non-service caller must be refused 42501`);
  }
  assert.ok(steps.some((s) => s.as === "anon"), "an anon leg exists");
  assert.ok(steps.some((s) => String(s.as).startsWith("user:")), "an authenticated leg exists");
  const floor = steps.find((s) => s.as === "service" && /k-1/.test(s.label));
  assert.ok(floor, "a service leg attacks the floor with k-1 organisations");
  assert.equal(floor.expect.equals.refused, "true");
});

test("functions: every caller of the closed functions uses the service-role client", () => {
  const callers = [];
  for (const f of CODE) {
    const t = readFileSync(f, "utf8");
    if (/\.rpc\(\s*["'`](admin_set_judgement_drain|admin_set_pause_state|item_corrections_note|item_corrections_patch|item_corrections_latest|item_corrections_span_is_verbatim|item_corrections_pair_tombstoned|move_override_notes_to_item_notes|publish_aggregate)["'`]/.test(t)) {
      callers.push(relative(FSI, f).replace(/\\/g, "/"));
    }
  }
  assert.deepEqual(callers, ["src/app/api/admin/sources/pause-global/route.ts"]);
  const route = read("src", "app", "api", "admin", "sources", "pause-global", "route.ts");
  assert.match(route, /requireAdminRoute\(request\)/);
  assert.match(route, /const \{ supabase \} = auth;/);
  const guard = read("src", "lib", "api", "route-guard.ts");
  assert.match(guard, /serviceClient = getServiceSupabase/);
  assert.match(guard, /const supabase = serviceClient\(\);/);
});

test("functions: the proof manifest runs the sanctioned writers as service, never as anon or a member", () => {
  const manifest = JSON.parse(read("scripts", "proof", "attacks", "attacks.json"));
  const bad = [];
  const visit = (o) => {
    if (Array.isArray(o)) o.forEach(visit);
    else if (o && typeof o === "object") {
      if (typeof o.sql === "string" && /admin_set_(judgement_drain|pause_state)\(/.test(o.sql) && o.as !== "service") bad.push(`${o.label} (${o.as})`);
      Object.values(o).forEach(visit);
    }
  };
  visit(manifest);
  assert.deepEqual(bad, []);
});

test("views: every public view is enumerated at apply time, set to security_invoker = on, and loses INSERT, UPDATE, DELETE for PUBLIC, anon, authenticated", () => {
  assert.match(SQL, /c\.relkind = 'v'/);
  assert.match(SQL, /ALTER VIEW public\.%I SET \(security_invoker = on\)/);
  assert.match(SQL, /REVOKE INSERT, UPDATE, DELETE ON public\.%I FROM PUBLIC, anon, authenticated/);
});

test("views: anon SELECT on research_assessments_current is revoked, and the evidence (service-role readers) holds", () => {
  assert.match(SQL, /REVOKE SELECT ON public\.research_assessments_current FROM anon;/);
  assert.match(read("src", "app", "research", "page.tsx"), /getServiceSupabase/);
  assert.match(read("src", "lib", "detail", "load-detail.ts"), /createServiceClient: defaultCreateServiceClient/);
});

test("views: every reader of the flipped views is a known service-role file (a new reader outside this list must be reviewed)", () => {
  const ALLOWED = new Set([
    "src/app/research/page.tsx",
    "src/app/research/[slug]/page.tsx",
    "src/lib/agent/canonical-pipeline.ts",
    "src/lib/propagation/admissible-for.ts",
    "src/lib/propagation/effective-confidence.mjs",
    "src/lib/propagation/methods/superseded-notices.ts",
    "src/lib/propagation/types.ts",
    "src/lib/research/read-assessments.mjs",
    "src/app/api/notices/route.ts",
    "scripts/producers/research/research-assessment-producer.mjs",
  ]);
  const found = [];
  for (const f of CODE) {
    const t = readFileSync(f, "utf8");
    if (/\.from\(\s*["'`](derived_values_admissible|research_assessments_current|propagation_queue_depth)["'`]/.test(t)) {
      found.push(relative(FSI, f).replace(/\\/g, "/"));
    }
  }
  assert.ok(found.length > 0);
  for (const f of found) assert.ok(ALLOWED.has(f), `${f} reads a flipped view and is not in the reviewed list`);
  // the three user-facing readers take a service client
  assert.match(read("src", "app", "api", "notices", "route.ts"), /getServiceSupabase\(\)/);
  assert.match(read("src", "lib", "agent", "canonical-pipeline.ts"), /SUPABASE_SERVICE_ROLE_KEY/);
});

test("views: no later migration restates one of the flipped views without security_invoker (CREATE OR REPLACE VIEW resets the option)", () => {
  const bad = [];
  for (const f of readdirSync(HERE).filter((n) => /^\d{3}_.*\.sql$/.test(n) && Number(n.slice(0, 3)) > 369)) {
    const t = read("supabase", "migrations", f).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    for (const m of t.matchAll(/CREATE OR REPLACE VIEW public\.(derived_values_admissible|research_assessments_current|propagation_queue_depth)\b([\s\S]*?);/gi)) {
      if (!/security_invoker/i.test(m[0])) bad.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("grant hygiene: the six privileges revoked from anon on all public tables, re-granted per command only from pg_policies naming anon or public", () => {
  assert.match(SQL, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon;/);
  assert.match(SQL, /p\.roles && ARRAY\['anon', 'public'\]::name\[\]/);
  assert.match(SQL, /p\.cmd IN \('INSERT', 'UPDATE', 'DELETE', 'ALL'\)/);
  assert.match(SQL, /GRANT INSERT ON public\.%I TO anon/);
  assert.match(SQL, /GRANT UPDATE ON public\.%I TO anon/);
  assert.match(SQL, /GRANT DELETE ON public\.%I TO anon/);
  assert.doesNotMatch(SQL, /GRANT[^;]*(TRUNCATE|REFERENCES|TRIGGER)[^;]*TO anon/);
  assert.match(SQL, /anon SELECT grant count changed/);
});

test("grant hygiene: authenticated loses TRUNCATE, TRIGGER and REFERENCES (not covered by RLS) and keeps INSERT, UPDATE, DELETE (SEC-3b owns the policies)", () => {
  assert.match(SQL, /REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated;/);
  assert.doesNotMatch(SQL, /REVOKE[^;]*\b(INSERT|UPDATE|DELETE)\b[^;]*ON ALL TABLES IN SCHEMA public FROM[^;]*authenticated/);
  assert.doesNotMatch(SQL, /GRANT[^;]*(TRUNCATE|TRIGGER|REFERENCES)[^;]*TO authenticated/);
});

test("grant hygiene: the postgres default privileges for new tables stop granting the six to anon and the three to authenticated", () => {
  assert.match(SQL, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon;/);
  assert.match(SQL, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated;/);
});

test("self-check: the default-privilege change is asserted from pg_default_acl, no table is created (F47 and F64 would flag one)", () => {
  assert.doesNotMatch(SQL, /\bCREATE\s+(TEMP\s+|TEMPORARY\s+)?TABLE\b/i);
  assert.ok(!RAW.includes("sec3a_acl_probe"));
  assert.match(SQL, /FROM pg_default_acl d, aclexplode\(d\.defaclacl\) a/);
  assert.match(SQL, /d\.defaclobjtype = 'r'/);
  assert.match(SQL, /d\.defaclnamespace = 'public'::regnamespace/);
});

test("self-check: a real TRUNCATE as authenticated on a real table must raise 42501", () => {
  assert.match(SQL, /pg_temp\.sec3a_attempt\('authenticated', format\('TRUNCATE public\.%I', v_trunc\)\)/);
  assert.match(SQL, /authenticated TRUNCATE of % got % \(want 42501\)/);
});

test("self-check: attacks as anon, authenticated and service_role, expects 42501, rolls back by sentinel, drops its helper", () => {
  assert.match(SQL, /CREATE FUNCTION pg_temp\.sec3a_attempt/);
  assert.match(SQL, /DROP FUNCTION pg_temp\.sec3a_attempt\(text, text\);/);
  assert.match(SQL, /FOREACH v_role IN ARRAY ARRAY\['anon', 'authenticated'\]/);
  assert.match(SQL, /anon calling publish_aggregate got % \(want 42501\)/);
  assert.match(SQL, /authenticated calling publish_aggregate got % \(want 42501\)/);
  assert.match(SQL, /SET LOCAL ROLE %I/);
  assert.ok((SQL.match(/\(want 42501\)/g) ?? []).length >= 10, "at least ten 42501 expectations");
  for (const needle of [
    "admin_set_judgement_drain", "admin_set_pause_state", "item_corrections_note", "item_corrections_patch",
    "publish_aggregate", "INSERT INTO public.%I DEFAULT VALUES", "DELETE FROM public.%I WHERE false",
    "research_assessments_current", "security_invoker=(on|true)",
  ]) assert.ok(SQL.includes(needle), `self-check names ${needle}`);
  assert.match(SQL, /RAISE EXCEPTION 'sec3a_369_selfcheck_rollback';/);
  assert.match(SQL, /IF SQLERRM <> 'sec3a_369_selfcheck_rollback' THEN RAISE; END IF;/);
  assert.match(SQL, /service_role calling admin_set_judgement_drain got % \(want ok\)/);
});

test("self-check: no fixture row is invented and the only TRUNCATE statement is the one attack run as authenticated", () => {
  assert.doesNotMatch(SQL, /gen_random_uuid\(\)\s*,\s*'selfcheck'/);
  const truncates = SQL.match(/\bTRUNCATE\s+(TABLE\s+)?public\./g) ?? [];
  assert.equal(truncates.length, 1, "exactly one TRUNCATE statement text");
  assert.match(SQL, /pg_temp\.sec3a_attempt\('authenticated', format\('TRUNCATE public\.%I', v_trunc\)\)/);
  assert.doesNotMatch(SQL, /INSERT INTO auth\.users/);
});
