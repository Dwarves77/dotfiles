// 367_profiles_status_columns.test.mjs -- static proof of migration 367 (lane SEC-2) by parsing the SQL file and the code
// that writes profiles: no database, no SQL parser dependency. The ATTACK (SET LOCAL ROLE authenticated with a fixture jwt
// sub, then UPDATE/INSERT of the four status columns, requiring SQLSTATE 42501 from the column privilege and, with the
// grants restored, from the trigger; then the request_verification() state machine and its anon/no-sub refusals) runs in
// the migration's own self-check at apply time inside a rolled-back sub-transaction. This file proves the file carries the
// revoke, the extension of the migration 364 guard function (no second function, no second trigger), the SECURITY DEFINER
// RPC with the vocabulary of migration 075, the attack self-check, and that no user-session writer in src touches the four
// columns any more (UserProfilePage uses the RPC, the LinkedIn callback uses the service-role client).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RAW = readFileSync(join(HERE, "367_profiles_status_columns.sql"), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const read = (name) => readFileSync(join(HERE, name), "utf8");
const SRC = join(HERE, "..", "..", "src");
const readSrc = (...p) => readFileSync(join(SRC, ...p), "utf8");
const FOUR = ["verifier_status", "verification_tier", "membership_tier", "contribution_score"];
const SEC1 = ["is_platform_admin", "role", "org_id", "workspace_role"];

test("header: subject line and NOT APPLIED, and it names migration 364 as its prerequisite", () => {
  assert.match(RAW, /^-- subject: Migration 367 /);
  assert.match(RAW, /NOT APPLIED/);
  assert.match(RAW, /REQUIRES migration 364/);
});

test("the four columns exist, created by 007 (tiers, score) and 075 (verifier_status), and no migration drops them", () => {
  const m007 = read("007_community_layer.sql");
  assert.match(m007, /ADD COLUMN IF NOT EXISTS verification_tier TEXT DEFAULT 'unverified'/);
  assert.match(m007, /ADD COLUMN IF NOT EXISTS membership_tier TEXT DEFAULT 'free'/);
  assert.match(m007, /ADD COLUMN IF NOT EXISTS contribution_score INTEGER DEFAULT 0/);
  assert.match(read("075_profiles_consolidation_phase1.sql"), /ADD COLUMN IF NOT EXISTS verifier_status text NOT NULL DEFAULT 'none'/);
  for (const f of readdirSync(HERE).filter((n) => n.endsWith(".sql"))) {
    const t = read(f).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    for (const c of FOUR) assert.doesNotMatch(t, new RegExp(`DROP COLUMN[^;]*\\b${c}\\b`, "i"), `${f} drops ${c}`);
  }
  for (const c of FOUR) assert.ok(SQL.includes(`'${c}'`), `precondition names ${c}`);
});

test("preconditions abort unless 364 is in effect (guard function, enabled trigger, no table-level grant left)", () => {
  assert.match(SQL, /to_regprocedure\('public\.profiles_privilege_guard\(\)'\) IS NULL/);
  assert.match(SQL, /tgname = 'profiles_privilege_guard_trg' AND tgenabled <> 'D'/);
  assert.match(SQL, /has_table_privilege\('authenticated', 'public\.profiles', 'UPDATE'\)/);
  assert.match(SQL, /has_table_privilege\('authenticated', 'public\.profiles', 'INSERT'\)/);
  assert.ok(SQL.includes("migration 364 (profiles_privilege_guard and profiles_privilege_guard_trg) must be applied before 367"));
});

test("layer 1: column-level REVOKE of INSERT and UPDATE on exactly the four columns, from PUBLIC, anon, authenticated", () => {
  const list = FOUR.join(", ");
  assert.ok(SQL.includes(`REVOKE INSERT (${list})\n  ON public.profiles FROM PUBLIC, anon, authenticated;`));
  assert.ok(SQL.includes(`REVOKE UPDATE (${list})\n  ON public.profiles FROM PUBLIC, anon, authenticated;`));
  assert.doesNotMatch(SQL, /REVOKE[^;]*\bservice_role\b/);
  assert.doesNotMatch(SQL.replace(/GRANT (INSERT|UPDATE) \([^)]*\) ON public\.profiles TO authenticated;/g, ""), /GRANT[^;]*ON public\.profiles/);
});

test("layer 2: the SAME 364 guard function is replaced; no second function and no second trigger", () => {
  assert.equal((SQL.match(/CREATE OR REPLACE FUNCTION public\.profiles_privilege_guard\(\)/g) || []).length, 1);
  assert.doesNotMatch(SQL, /CREATE TRIGGER/);
  const fn = SQL.slice(SQL.indexOf("CREATE OR REPLACE FUNCTION public.profiles_privilege_guard()"), SQL.indexOf("COMMENT ON FUNCTION public.profiles_privilege_guard()"));
  assert.doesNotMatch(fn, /^SECURITY DEFINER$/m); // the attribute line; the phrase also appears inside the error text
  assert.match(fn, /SET search_path = public, pg_temp/);
  assert.match(fn, /current_user IN \('service_role', 'postgres', 'supabase_admin'\)/);
  assert.match(fn, /pg_get_userbyid\(c\.relowner\)/);
  assert.doesNotMatch(fn, /current_setting\('request\.jwt/);
  // the four 364 comparisons are carried over, the four new ones added
  for (const c of [...SEC1, ...FOUR]) assert.match(fn, new RegExp(`NEW\\.${c}\\s+IS DISTINCT FROM OLD\\.${c}`), c);
  // INSERT branch: 364 conditions carried over, defaults of the four new columns enforced
  assert.match(fn, /NEW\.is_platform_admin IS TRUE/);
  assert.match(fn, /NEW\.org_id IS NOT NULL/);
  assert.match(fn, /NEW\.workspace_role IS NOT NULL/);
  assert.match(fn, /NEW\.role IS DISTINCT FROM 'viewer'/);
  assert.match(fn, /NEW\.verifier_status\s+IS DISTINCT FROM 'none'/);
  assert.match(fn, /NEW\.verification_tier\s+IS DISTINCT FROM 'unverified'/);
  assert.match(fn, /NEW\.membership_tier\s+IS DISTINCT FROM 'free'/);
  assert.match(fn, /NEW\.contribution_score IS DISTINCT FROM 0/);
  assert.equal((fn.match(/USING ERRCODE = '42501'/g) || []).length, 2);
});

test("request_verification(): SECURITY DEFINER, pinned search_path, no parameter, auth.uid() only, row locked", () => {
  const fn = SQL.slice(SQL.indexOf("CREATE OR REPLACE FUNCTION public.request_verification()"), SQL.indexOf("COMMENT ON FUNCTION public.request_verification()"));
  assert.match(fn, /CREATE OR REPLACE FUNCTION public\.request_verification\(\)\s+RETURNS text/);
  assert.match(fn, /^SECURITY DEFINER$/m);
  assert.match(fn, /SET search_path = public, pg_temp/);
  assert.match(fn, /v_uid\s+uuid := auth\.uid\(\)/);
  assert.match(fn, /WHERE p\.id = v_uid FOR UPDATE/);
  assert.match(fn, /UPDATE public\.profiles SET verifier_status = 'pending', updated_at = now\(\) WHERE id = v_uid;/);
  assert.doesNotMatch(fn, /current_setting\('request\.jwt/);
  assert.equal((fn.match(/UPDATE public\.profiles/g) || []).length, 1);
});

test("request_verification(): state machine follows the 075 vocabulary (none, pending, active, revoked; no 'rejected')", () => {
  assert.match(read("075_profiles_consolidation_phase1.sql"), /CHECK \(verifier_status IN \('none', 'pending', 'active', 'revoked'\)\)/);
  const fn = SQL.slice(SQL.indexOf("CREATE OR REPLACE FUNCTION public.request_verification()"), SQL.indexOf("COMMENT ON FUNCTION public.request_verification()"));
  assert.doesNotMatch(fn, /rejected/);
  assert.match(fn, /IF v_status = 'pending' THEN\s+RETURN 'pending';/);
  assert.match(fn, /v_status IS NULL OR v_status IN \('none', 'revoked'\)/);
  assert.match(fn, /USING ERRCODE = '55000'/);
  assert.match(fn, /no authenticated user' USING ERRCODE = '42501'/);
  assert.match(fn, /USING ERRCODE = 'P0002'/);
  // the UI offers the request button for exactly none and revoked (the eligible set above)
  assert.match(readSrc("components", "profile", "UserProfilePage.tsx"), /\(status === "none" \|\| status === "revoked"\) &&/);
});

test("request_verification(): EXECUTE revoked from PUBLIC and anon, granted to authenticated only", () => {
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.request_verification\(\) FROM PUBLIC, anon;/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.request_verification\(\) TO authenticated;/);
  assert.doesNotMatch(SQL, /GRANT EXECUTE ON FUNCTION public\.request_verification\(\)[^;]*\b(anon|PUBLIC)\b/);
});

test("self-check ATTACKS as role authenticated with a fixture jwt sub and requires 42501 on every status column, UPDATE and INSERT", () => {
  assert.match(SQL, /SET LOCAL ROLE authenticated;/);
  assert.match(SQL, /set_config\('request\.jwt\.claim\.sub'/);
  assert.match(SQL, /v_cols\s+text\[\] := ARRAY\['verifier_status', 'verification_tier', 'membership_tier', 'contribution_score'\]/);
  assert.match(SQL, /v_vals\s+text\[\] := ARRAY\['''active''', '''staff_verified''', '''premium''', '9999'\]/);
  assert.match(SQL, /UPDATE public\.profiles SET verifier_status = 'active' WHERE id = v_uid;/);
  assert.match(SQL, /INSERT INTO public\.profiles \(id, verifier_status\) VALUES \(v_uid2, 'active'\);/);
  assert.match(SQL, /EXCEPTION WHEN insufficient_privilege THEN/);
  assert.ok(SQL.includes("authenticated could self-authorise verifier_status = active"));
  assert.ok(SQL.includes("authenticated was able to INSERT its own profiles row with verifier_status = active"));
  assert.match(SQL, /RAISE EXCEPTION 'sec2_367_selfcheck_rollback'/);
});

test("self-check proves each layer alone: layer 1 is a column privilege denial, layer 2 (grants restored inside the rolled-back block) names the trigger", () => {
  assert.match(SQL, /position\('permission denied' IN v_msg\)/);
  assert.match(SQL, /GRANT UPDATE \(verifier_status, verification_tier, membership_tier, contribution_score\) ON public\.profiles TO authenticated;/);
  assert.match(SQL, /GRANT INSERT \(verifier_status, verification_tier, membership_tier, contribution_score\) ON public\.profiles TO authenticated;/);
  assert.match(SQL, /position\('profiles_privilege_guard' IN v_msg\) = 0/);
  assert.match(SQL, /the extended guard no longer refuses is_platform_admin/);
});

test("self-check exercises the RPC: none to pending, pending no-op, active refused 55000, revoked to pending, anon refused, no-sub refused, sanctioned with the guard on", () => {
  assert.match(SQL, /request_verification\(\) from none returned/);
  assert.match(SQL, /request_verification\(\) from pending returned % \(expected the no-op pending\)/);
  assert.match(SQL, /EXCEPTION WHEN object_not_in_prerequisite_state THEN/);
  assert.match(SQL, /request_verification\(\) was accepted from active/);
  assert.match(SQL, /request_verification\(\) from revoked returned/);
  assert.match(SQL, /SET LOCAL ROLE anon;/);
  assert.match(SQL, /anon was able to call request_verification\(\)/);
  assert.match(SQL, /position\('no authenticated user' IN v_msg\) = 0/);
  assert.match(SQL, /request_verification\(\) was not sanctioned by the guard/);
});

test("self-check is not over-broad and the sanctioned path stays open: job_title updates, service_role sets all four", () => {
  assert.match(SQL, /UPDATE public\.profiles SET job_title = 'sec2-selfcheck' WHERE id = v_uid;/);
  assert.match(SQL, /INSERT INTO public\.profiles \(id, display_name\) VALUES \(v_uid2, 'sec2-selfcheck'\);/);
  assert.match(SQL, /SET LOCAL ROLE service_role;\s+UPDATE public\.profiles\s+SET verifier_status = 'active', verification_tier = 'staff_verified',\s+membership_tier = 'premium', contribution_score = 5/);
  assert.ok(SQL.includes("'active/staff_verified/premium/5'"));
});

test("privilege catalog is asserted after the rolled-back block (the temporary re-grants must be gone; anon has no EXECUTE)", () => {
  assert.match(SQL, /has_column_privilege\('authenticated', 'public\.profiles', v_attack, 'UPDATE'\)/);
  assert.match(SQL, /has_column_privilege\('authenticated', 'public\.profiles', v_attack, 'INSERT'\)/);
  assert.match(SQL, /has_column_privilege\('anon', 'public\.profiles', v_attack, 'UPDATE'\)/);
  assert.match(SQL, /has_column_privilege\('service_role', 'public\.profiles', v_attack, 'UPDATE'\)/);
  assert.match(SQL, /has_column_privilege\('authenticated', 'public\.profiles', 'is_platform_admin', 'UPDATE'\)/);
  assert.match(SQL, /has_function_privilege\('authenticated', 'public\.request_verification\(\)', 'EXECUTE'\)/);
  assert.match(SQL, /has_function_privilege\('anon', 'public\.request_verification\(\)', 'EXECUTE'\)/);
});

// ---- Consumers: no user-session write in src reaches the four columns ----------------------------------------------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.(test|npmtest)\./.test(name)) out.push(p);
  }
  return out;
}
// ensureProfile writes with the service-role client (sanctioned role) and inserts none of the four columns.
const SERVICE_ROLE_WRITERS = new Set(["provision-personal-workspace.ts"]);

test("no .from('profiles').update/insert/upsert payload in src names verifier_status, verification_tier, membership_tier or contribution_score", () => {
  const offenders = [];
  let writers = 0;
  for (const file of walk(SRC)) {
    const base = file.split(/[\\/]/).pop();
    const text = readFileSync(file, "utf8");
    const re = /from\(\s*["']profiles["']\s*\)\s*(?:\/\/[^\n]*\n\s*)*\.(update|insert|upsert)\(/g;
    let m;
    while ((m = re.exec(text))) {
      writers += 1;
      if (SERVICE_ROLE_WRITERS.has(base)) continue;
      const seg = text.slice(m.index, m.index + 700).split(/\.eq\(|\.match\(|\.select\(/)[0];
      for (const c of FOUR) if (new RegExp(`\\b${c}\\b`).test(seg)) offenders.push(`${base}: ${c}`);
    }
  }
  assert.ok(writers >= 5, `expected to find the known profiles writers, found ${writers}`);
  assert.deepEqual(offenders, []);
});

test("UserProfilePage: verification is requested through the RPC; persist() cannot carry verifier_status (a compile error, not a runtime refusal)", () => {
  const page = readSrc("components", "profile", "UserProfilePage.tsx");
  assert.match(page, /supabase\.rpc\("request_verification"\)/);
  assert.match(page, /onApply=\{requestVerification\}/);
  assert.doesNotMatch(page, /persist\(\{\s*verifier_status/);
  assert.match(page, /type ProfilePatch = Partial<Omit<ProfileRow, "id" \| "verifier_status" \| "verifier_since" \| "created_at">>;/);
  assert.match(page, /const persist = async \(patch: ProfilePatch\)/);
  assert.match(page, /onSave: \(patch: ProfilePatch\) => Promise<boolean>;/);
  // the local state follows the status the RPC returned, and an RPC error is surfaced, not swallowed
  assert.match(page, /if \(data === "pending"\) setProfile/);
  assert.match(page, /const \{ data, error \} = await supabase\.rpc\("request_verification"\);\s+if \(error\) \{\s+setError\(error\.message\);\s+return false;/);
  // every remaining persist({...}) call sends display and scope fields only
  for (const call of [...page.matchAll(/persist\(\{([^}]*)\}\)/g)].map((x) => x[1])) {
    for (const c of [...FOUR, ...SEC1, "verifier_since"]) assert.doesNotMatch(call, new RegExp(`\\b${c}\\b`), call);
  }
});

test("LinkedIn callback: verification_tier is written with the service-role client, never the session client; failure of the client is a handled redirect", () => {
  const route = readSrc("app", "api", "auth", "linkedin", "callback", "route.ts");
  assert.match(route, /import \{ getServiceSupabase \} from "@\/lib\/supabase-service";/);
  assert.match(route, /getServiceSupabase\(\)\.from\("profiles"\)\.update\(update\)\.eq\("id", user\.id\)/);
  assert.doesNotMatch(route, /\bsupabase\s*\.from\("profiles"\)/);
  assert.doesNotMatch(route, /await supabase\s*\n\s*\.from\("profiles"\)/);
  assert.match(route, /verification_tier: "linkedin_verified"/);
  assert.match(route, /service-client-unavailable/);
  assert.match(route, /redirectWithError\(origin, "profile-upsert-failed", "\/onboarding"\)/);
});

test("no JWT literal and no section-sign or dash glyph in the new file", () => {
  assert.doesNotMatch(RAW, /eyJ/);
  const banned = [0xa7, 0x2013, 0x2014].map((c) => String.fromCharCode(c));
  for (const g of banned) assert.ok(!RAW.includes(g), `glyph U+${g.charCodeAt(0).toString(16)} present`);
});
