// 372_profiles_read.test.mjs -- static proof of migration 372 (lane SEC-5) by parsing the SQL file and the code that
// reads profiles: no database, no SQL parser dependency. The ATTACK (anon, authenticated across organisations, email
// column, the two definer functions, default-anonymous identity) runs in the migration's own self-check at apply time
// inside a rolled-back sub-transaction, and in the chain-proof attacks sec5-* (scripts/proof/attacks/attacks.json).
// This file proves the migration carries the policy swap, the column grants, the two functions with the right
// hardening, the attack legs, and that no user-session read of another user's profile or of email is left in src.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SRC = join(HERE, "..", "..", "src");
const RAW = readFileSync(join(HERE, "372_profiles_read.sql"), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const read293 = () => readFileSync(join(HERE, "293_community_identity_and_guard.sql"), "utf8");
const src = (rel) => readFileSync(join(SRC, rel), "utf8");

test("header: subject line and NOT APPLIED", () => {
  assert.match(RAW, /^-- subject: Migration 372 /);
  assert.match(RAW, /NOT APPLIED/);
});

test("policy: Public read is dropped; one SELECT policy TO authenticated: own row or a row sharing an organisation", () => {
  assert.match(SQL, /DROP POLICY IF EXISTS "Public read" ON public\.profiles;/);
  assert.match(SQL, /CREATE POLICY profiles_select_own_or_shared_org\s+ON public\.profiles\s+FOR SELECT\s+TO authenticated/);
  assert.match(SQL, /id = \(SELECT auth\.uid\(\)\)/);
  assert.match(SQL, /m\.user_id = profiles\.id\s+AND public\.user_belongs_to_org\(m\.org_id\)/);
  assert.doesNotMatch(SQL, /CREATE POLICY[^;]*TO anon/);
  assert.doesNotMatch(SQL, /USING \(true\)/i);
});

test("the Public read policy being replaced is the migration 002 policy, and the anon column grant being removed is migration 165", () => {
  assert.match(readFileSync(join(HERE, "002_rls.sql"), "utf8"), /CREATE POLICY "Public read" ON profiles FOR SELECT USING \(true\)/);
  assert.match(readFileSync(join(HERE, "165_profiles_self_write_and_anon_pii.sql"), "utf8"), /GRANT SELECT \([\s\S]*?\) ON public\.profiles TO anon;/);
});

test("anon: table-level revoke and a per-column revoke loop (a table revoke does not remove column grants)", () => {
  assert.match(SQL, /REVOKE SELECT ON TABLE public\.profiles FROM PUBLIC, anon;/);
  assert.match(SQL, /REVOKE SELECT \(%I\) ON public\.profiles FROM PUBLIC, anon/);
  assert.doesNotMatch(SQL, /GRANT[^;]*ON (TABLE )?public\.profiles TO[^;]*\banon\b/);
});

test("authenticated: table-level SELECT replaced by a column grant built from pg_attribute minus exactly email", () => {
  assert.match(SQL, /REVOKE SELECT ON TABLE public\.profiles FROM authenticated;/);
  assert.match(SQL, /attname <> 'email'/);
  assert.match(SQL, /GRANT SELECT \(%s\) ON public\.profiles TO authenticated/);
});

test("is_platform_admin is deliberately kept readable, and the migration says why (policies on other tables read it as the caller)", () => {
  assert.doesNotMatch(SQL, /attname[^;]*is_platform_admin/);
  assert.match(RAW, /DEVIATION FROM THE BRIEF/);
  assert.match(SQL, /authenticated lost SELECT on profiles\.is_platform_admin/);
  // the claim in the header: the policies are real and read the flag as the caller
  for (const m of ["249_platform_admin_rls_alignment_2026_08_09.sql", "195_error_events.sql", "355_vocabulary_terms.sql"]) {
    assert.match(readFileSync(join(HERE, m), "utf8"), /p\.is_platform_admin = true|is_platform_admin = true/);
  }
});

function fn(name) {
  const i = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(i >= 0, `${name} is created`);
  const end = SQL.indexOf("$fn$;", SQL.indexOf("$fn$", SQL.indexOf("AS $fn$", i) + 7));
  return SQL.slice(i, end);
}

test("both functions: SECURITY DEFINER, pinned search_path, EXECUTE revoked from PUBLIC and anon, granted to authenticated and service_role only", () => {
  for (const name of ["my_profile", "community_identity"]) {
    const body = fn(name);
    assert.match(body, /SECURITY DEFINER/);
    assert.match(body, /SET search_path = public, pg_temp/);
  }
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.my_profile\(\) FROM PUBLIC, anon;/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.my_profile\(\) TO authenticated, service_role;/);
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.community_identity\(uuid\[\], text\) FROM PUBLIC, anon;/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.community_identity\(uuid\[\], text\) TO authenticated, service_role;/);
});

test("my_profile takes no argument and filters on auth.uid() only", () => {
  const body = fn("my_profile");
  assert.match(body, /my_profile\(\)\s+RETURNS SETOF public\.profiles/);
  assert.match(body, /WHERE p\.id = auth\.uid\(\)/);
});

test("community_identity never returns email or is_platform_admin", () => {
  const body = fn("community_identity");
  const returns = body.slice(body.indexOf("RETURNS TABLE"), body.indexOf("LANGUAGE sql"));
  assert.doesNotMatch(returns, /email|is_platform_admin/);
  assert.doesNotMatch(body.slice(body.indexOf("AS $fn$")), /\bemail\b|is_platform_admin/);
  for (const c of ["user_id", "display_name", "company_name", "job_title", "region", "avatar_url", "verified", "anonymous"]) {
    assert.match(returns, new RegExp(`\\b${c}\\b`));
  }
});

test("community_identity applies the per-user half of R8.7: name, company and avatar withheld, verified and anonymous returned", () => {
  const body = fn("community_identity");
  assert.match(body, /CASE WHEN b\.anon THEN NULL ELSE b\.nm END/);
  assert.match(body, /CASE WHEN b\.anon THEN NULL ELSE b\.co END/);
  assert.match(body, /CASE WHEN b\.anon THEN NULL ELSE b\.av END/);
  assert.match(body, /coalesce\(c\.default_anonymous, false\) AS anon/);
  assert.match(body, /coalesce\(c\.verified, false\) AS vf/);
  assert.match(body, /\bb\.vf,\s+b\.anon/);
});

test("community_identity query mode: matches the start of ANY whitespace-separated token of the shown name, at least two characters, wildcards escaped, never an anonymous member, capped", () => {
  const body = fn("community_identity");
  assert.match(body, /length\(q\.term\) >= 2/);
  assert.match(body, /NOT b\.anon/);
  // the escaped term is built once, in q
  assert.match(body, /replace\(replace\(replace\(nullif\(btrim\(p_query\), ''\), '\\', '\\\\'\), '%', '\\%'\), '_', '\\_'\) AS esc/);
  // the name is whitespace-normalised once, in base
  assert.match(body, /regexp_replace\(.*'\\s\+', ' ', 'g'\) AS nn/);
  // token-start match: the term at the start of the name, or after a space
  assert.match(body, /b\.nn ILIKE \(q\.esc \|\| '%'\)\s+OR b\.nn ILIKE \('% ' \|\| q\.esc \|\| '%'\)/);
  assert.doesNotMatch(body, /ILIKE \('%' \|\| q\.esc/, "no substring match: a query must start a token");
  assert.match(body, /\[1:200\]/);
  assert.match(body, /LIMIT \(CASE WHEN nullif\(btrim\(p_query\), ''\) IS NULL THEN 200 ELSE 25 END\)/);
  assert.match(body, /auth\.uid\(\) IS NOT NULL/);
});

test("the self-check proves a surname finds the member (token match) and still not the anonymous one", () => {
  assert.ok(SQL.includes("community_identity(NULL, 'Three')"), "a second-token query leg");
  assert.ok(SQL.includes("a surname (second token) query must find u3 and must not find the default-anonymous u2"));
  assert.ok(SQL.includes("a mid-token fragment must not match"));
});

test("column types: community_member_profiles.region is text and profiles.region is text[] (migration 105), so the coalesce converts the array", () => {
  assert.match(read293(), /region\s+text\s+CHECK \(region IS NULL OR region IN/);
  assert.match(readFileSync(join(HERE, "105_profiles_projection.sql"), "utf8"), /region TEXT\[\]/);
  const body = fn("community_identity");
  assert.match(body, /coalesce\(c\.region, nullif\(array_to_string\(p\.region, ', '\), ''\)\) AS rg/);
  assert.doesNotMatch(body, /coalesce\(c\.region, p\.region\)/, "text vs text[] cannot be matched (42804)");
});

test("every other coalesce in community_identity is text with text or boolean with boolean (types read from the creating migrations)", () => {
  const body = fn("community_identity");
  const types = readFileSync(join(HERE, "007_community_layer.sql"), "utf8");
  for (const col of ["full_name", "avatar_url", "job_title"]) assert.match(types, new RegExp("ADD COLUMN IF NOT EXISTS " + col + " TEXT"));
  assert.match(readFileSync(join(HERE, "001_schema.sql"), "utf8"), /display_name TEXT,/);
  assert.match(readFileSync(join(HERE, "006_multi_tenant.sql"), "utf8"), /CREATE TABLE organizations \([\s\S]*?name\s+TEXT NOT NULL/);
  assert.match(read293(), /verified\s+boolean\s+NOT NULL DEFAULT false/);
  assert.match(readFileSync(join(HERE, "336_community_anonymity_opt_in.sql"), "utf8"), /default_anonymous boolean NOT NULL DEFAULT false/);
  // the coalesces present: text/text, text/text/'' , org name text, boolean/boolean x2
  assert.match(body, /coalesce\(nullif\(btrim\(p\.full_name\), ''\), p\.display_name\)/);
  assert.match(body, /coalesce\(nullif\(btrim\(p\.full_name\), ''\), p\.display_name, ''\)/);
  assert.match(body, /coalesce\(c\.verified, false\)/);
  assert.match(body, /coalesce\(c\.default_anonymous, false\)/);
});

test("the self-check proves the region join: a null community region falls back to the joined profiles.region array, and a community region wins", () => {
  assert.ok(SQL.includes("ARRAY['EU', 'UK']"), "a fixture profile with a two-element region array");
  assert.ok(SQL.includes("v_text IS DISTINCT FROM 'EU, UK'"), "asserts the joined string");
  assert.ok(SQL.includes("v_text IS DISTINCT FROM 'APAC'"), "asserts the community region wins");
});

test("self-check attacks as anon, authenticated and service_role with fixture subs, and rolls back", () => {
  assert.match(SQL, /SET LOCAL ROLE anon;/);
  assert.match(SQL, /SET LOCAL ROLE authenticated;/);
  assert.match(SQL, /SET LOCAL ROLE service_role;/);
  assert.match(SQL, /set_config\('request\.jwt\.claim\.sub'/);
  assert.ok(SQL.includes("anon could SELECT id from public.profiles"));
  assert.ok(SQL.includes("authenticated read another organisation''s profiles row directly"));
  assert.ok(SQL.includes("authenticated could SELECT email from its own profiles row"));
  assert.ok(SQL.includes("my_profile() did not return exactly the caller''s own row with its email"));
  assert.ok(SQL.includes("returned a name, company or avatar for a default-anonymous member"));
  assert.ok(SQL.includes("must return anonymous = true and keep verified = true"));
  assert.ok(SQL.includes("must not find the default-anonymous u2"));
  assert.ok(SQL.includes("anon could execute community_identity()"));
  assert.match(SQL, /RAISE EXCEPTION 'sec5_372_selfcheck_rollback'/);
});

test("catalog assertions after the rollback: anon holds nothing, email is not granted, policy and functions are as designed", () => {
  assert.match(SQL, /has_any_column_privilege\('anon', 'public\.profiles', 'SELECT'\)/);
  assert.match(SQL, /has_column_privilege\('authenticated', 'public\.profiles', 'email', 'SELECT'\)/);
  assert.match(SQL, /policyname = 'Public read'/);
  assert.match(SQL, /'public' = ANY \(roles\) OR 'anon' = ANY \(roles\)/);
  assert.match(SQL, /prosecdef AND EXISTS \(SELECT 1 FROM unnest\(proconfig\)/);
});

test("it is one transaction", () => {
  assert.equal((SQL.match(/^BEGIN;/gm) || []).length, 1);
  assert.equal((SQL.match(/^COMMIT;/gm) || []).length, 1);
});

// ---- the code side: no user-session read of another user's profile or of email is left ----------------------------

const SWITCHED_TO_RPC = [
  "app/api/community/posts/route.ts",
  "app/api/community/posts/[id]/route.ts",
  "app/api/community/posts/[id]/replies/route.ts",
  "app/api/community/search/route.ts",
  "app/api/community/groups/[id]/members/route.ts",
  "app/api/community/groups/[id]/invitations/route.ts",
  "app/api/community/groups/[id]/invite-candidates/route.ts",
  "components/community/CouncilMembersRail.tsx",
];

test("the Community routes and the council rail no longer read the profiles table; they call community_identity through identity.mjs", () => {
  for (const f of SWITCHED_TO_RPC) {
    const code = src(f);
    assert.doesNotMatch(code, /\.from\("profiles"\)/, `${f} must not read profiles`);
    assert.match(code, /loadCommunityIdentities/, `${f} reads through community_identity`);
  }
});

test("community/page.tsx reads the caller's own row through my_profile, selects no email from profiles, and reads authors through community_identity", () => {
  const code = src("app/community/page.tsx");
  assert.match(code, /loadMyProfile\(supabase\)/);
  assert.match(code, /loadCommunityIdentities\(supabase, authorIds\)/);
  for (const m of code.matchAll(/\.from\("profiles"\)\s*(?:\/\/[^\n]*\n\s*)?\.select\(\s*"([^"]*)"/g)) {
    assert.doesNotMatch(m[1], /\bemail\b/, "a profiles select in community/page.tsx names email");
  }
});

test("platform-admin reads of other users' profiles go through the service client", () => {
  assert.match(src("app/admin/page.tsx"), /getServiceSupabase\(\)\s*\.from\("org_memberships"\)/);
  assert.match(src("app/community/directory/page.tsx"), /aggregateClient\s*\.from\("profiles"\)/);
  assert.match(src("app/api/admin/users/route.ts"), /user:profiles!user_id\(full_name, display_name, email, avatar_url\)/);
  assert.doesNotMatch(src("components/admin/AdminDashboard.tsx"), /.from("org_memberships")/);
  assert.match(src("components/admin/AdminDashboard.tsx"), /authedFetch\("\/api\/admin\/users"\)/);
});
