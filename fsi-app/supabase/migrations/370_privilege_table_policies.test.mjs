// 370_privilege_table_policies.test.mjs -- static proof of migration 370 (lane SEC-3b) by parsing the SQL file and the
// code that writes the guarded tables: no database, no SQL parser dependency. The ATTACKS (SET LOCAL ROLE authenticated
// with a fixture jwt sub, then the forbidden write, requiring SQLSTATE 42501 from the column privilege and, with the
// grants restored, from the trigger) run in the migration's own self-check at apply time inside a rolled-back
// sub-transaction; the PROOF-4 attacks sec3b-* in scripts/proof/attacks/attacks.json re-prove them on the chain stack.
// This file proves the file carries the revokes, the column-level re-grants that exclude exactly the system-written
// columns, the six guard triggers keyed on current_user, the viewer-gap policies, the attack self-check, and that no
// user-session writer in src touches a system-written column.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RAW = readFileSync(join(HERE, "370_privilege_table_policies.sql"), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const SRC = join(HERE, "..", "..", "src");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.(test|npmtest)\./.test(name)) out.push(p);
  }
  return out;
}
const SRC_FILES = walk(SRC);
const text = (f) => readFileSync(f, "utf8");
const base = (f) => f.split(/[\\/]/).pop();

test("header: subject line, NOT APPLIED, and the profiles read policy is declared out of this migration", () => {
  assert.match(RAW, /^-- subject: Migration 370 /);
  assert.match(RAW, /NOT APPLIED/);
  assert.match(RAW.split("\n")[0], /profiles read policy \(item 5 of the brief\) is NOT in this migration/);
  assert.doesNotMatch(SQL, /Public read/);
  assert.doesNotMatch(SQL, /profiles_public/);
});

test("the sanctioned-writer helper keys on current_user, never a JWT claim, and is SECURITY INVOKER", () => {
  assert.match(SQL, /CREATE OR REPLACE FUNCTION public\.is_sanctioned_writer\(p_rel regclass\)/);
  assert.match(SQL, /current_user IN \('service_role', 'postgres', 'supabase_admin'\)/);
  assert.match(SQL, /pg_get_userbyid\(c\.relowner\)/);
  const hStart = SQL.indexOf("CREATE OR REPLACE FUNCTION public.is_sanctioned_writer");
  const helper = SQL.slice(hStart, SQL.indexOf("$fn$;", hStart + 80));
  assert.doesNotMatch(helper, /SECURITY DEFINER/i);
  assert.doesNotMatch(helper, /current_setting/);
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.is_sanctioned_writer\(regclass\) FROM PUBLIC;/);
});

test("items 1, 2, 4: table-level REVOKE then a column-level re-grant read from pg_attribute that excludes exactly the system-written columns", () => {
  for (const t of ["organizations", "community_member_profiles", "community_posts"]) {
    assert.match(SQL, new RegExp(`REVOKE INSERT, UPDATE ON TABLE public\\.${t} FROM PUBLIC, anon, authenticated;`));
    assert.match(SQL, new RegExp(`GRANT INSERT \\(%s\\) ON public\\.${t} TO authenticated`));
    assert.match(SQL, new RegExp(`GRANT UPDATE \\(%s\\) ON public\\.${t} TO authenticated`));
  }
  assert.match(SQL, /attname <> 'plan'/);
  assert.match(SQL, /attname NOT IN \('verified', 'verified_at', 'verification_method', 'organisation_key'\)/);
  assert.match(SQL, /attname NOT IN \('signed_off_at', 'signed_off_by'\);/);
  assert.match(SQL, /attname NOT IN \('signed_off_at', 'signed_off_by', 'author_user_id'\);/);
  assert.doesNotMatch(SQL, /GRANT[^;]*\bON public\.(organizations|community_member_profiles|community_posts) TO[^;]*\banon\b/);
  assert.doesNotMatch(SQL, /GRANT[^;]*\bON (TABLE )?public\.(organizations|community_member_profiles|community_posts) TO[^;]*\bPUBLIC\b/);
});

const GUARDS = [
  ["organizations_plan_guard", "organizations", "BEFORE INSERT OR UPDATE"],
  ["community_member_profiles_verification_guard", "community_member_profiles", "BEFORE INSERT OR UPDATE"],
  ["org_membership_role_guard", "org_memberships", "BEFORE INSERT OR UPDATE OR DELETE"],
  ["community_posts_guard", "community_posts", "BEFORE INSERT OR UPDATE"],
  ["community_post_signoff_requests_guard", "community_post_signoff_requests", "BEFORE INSERT OR UPDATE"],
  ["community_groups_owner_guard", "community_groups", "BEFORE UPDATE"],
];

for (const [fn, table, events] of GUARDS) {
  test(`guard ${fn}: ${events} trigger on ${table}, SECURITY INVOKER, pinned search_path, sanctioned callers by the shared helper, 42501`, () => {
    assert.match(SQL, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(\\)`));
    assert.match(SQL, new RegExp(`CREATE TRIGGER ${fn}_trg\\s+${events} ON public\\.${table}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.${fn}\\(\\)`));
    const body = SQL.slice(SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}()`));
    const fnBody = body.slice(0, body.indexOf("$fn$;", body.indexOf("AS $fn$") + 7));
    assert.doesNotMatch(fnBody, /SECURITY DEFINER/i);
    assert.match(fnBody, /SET search_path = public, pg_temp/);
    assert.match(fnBody, new RegExp(`public\\.is_sanctioned_writer\\('public\\.${table}'::regclass\\)`));
    assert.match(fnBody, /USING ERRCODE = '42501'/);
    assert.doesNotMatch(fnBody, /current_setting\('request\.jwt/);
  });
}

test("item 1: plan guard compares plan on UPDATE and requires free on INSERT", () => {
  assert.match(SQL, /NEW\.plan IS DISTINCT FROM OLD\.plan/);
  assert.match(SQL, /NEW\.plan IS DISTINCT FROM 'free'/);
});

test("item 2: verification guard covers all four columns on UPDATE and INSERT", () => {
  for (const c of ["verified", "verified_at", "verification_method", "organisation_key"]) {
    assert.match(SQL, new RegExp(`NEW\\.${c}\\s+IS DISTINCT FROM OLD\\.${c}`));
  }
  assert.match(SQL, /NEW\.verified IS TRUE/);
  assert.match(SQL, /NEW\.organisation_key IS NOT NULL/);
});

test("item 3: the role guard enforces owner-only owner changes, no self role change, last owner kept, fixed org_id and user_id", () => {
  for (const m of [
    "only an owner may grant the owner role",
    "nobody changes their own role",
    "only an owner may grant or revoke the owner role",
    "the last owner of an organization cannot be demoted",
    "the last owner of an organization cannot be removed",
    "only an owner may remove an owner",
    "org_id and user_id of a membership never change",
  ]) assert.ok(SQL.includes(m), m);
  assert.match(SQL, /m\.role = 'owner' AND m\.id <> OLD\.id/);
  assert.match(SQL, /NEW\.org_id IS DISTINCT FROM OLD\.org_id OR NEW\.user_id IS DISTINCT FROM OLD\.user_id/);
  assert.match(SQL, /RETURN OLD;/);
  // the membership policies stay: this migration never drops or alters them
  assert.doesNotMatch(SQL, /(DROP|ALTER) POLICY[^;]*\b(membership_write_admin|membership_update_admin|membership_delete_admin)\b/);
});

test("item 4: the post guard pins sign-off columns and author, and gates group moves on user_is_group_admin of BOTH groups", () => {
  assert.match(SQL, /NEW\.signed_off_at IS DISTINCT FROM OLD\.signed_off_at OR NEW\.signed_off_by IS DISTINCT FROM OLD\.signed_off_by/);
  assert.match(SQL, /NEW\.author_user_id IS DISTINCT FROM OLD\.author_user_id/);
  assert.match(SQL, /NOT public\.user_is_group_admin\(OLD\.group_id, v_actor\)/);
  assert.match(SQL, /NOT public\.user_is_group_admin\(NEW\.group_id, v_actor\)/);
});

test("item 7: the sign-off guard pins the initial status and refuses a self-decision; the group guard lets only the current owner transfer", () => {
  assert.match(SQL, /NEW\.status IS DISTINCT FROM 'pending'/);
  assert.match(SQL, /NEW\.status IN \('signed_off', 'declined'\)/);
  assert.match(SQL, /v_actor = OLD\.requested_by OR NEW\.verifier_id IS NOT DISTINCT FROM OLD\.requested_by/);
  assert.match(SQL, /NEW\.requested_by IS DISTINCT FROM OLD\.requested_by OR NEW\.post_id IS DISTINCT FROM OLD\.post_id/);
  assert.match(SQL, /OLD\.owner_user_id IS NULL OR OLD\.owner_user_id IS DISTINCT FROM auth\.uid\(\)/);
});

test("item 6: user_can_write_in_org is member/admin/owner, SECURITY DEFINER with a pinned search_path, and 15 write policies switch to it", () => {
  assert.match(SQL, /CREATE OR REPLACE FUNCTION public\.user_can_write_in_org\(p_org uuid\)/);
  assert.match(SQL, /m\.role IN \('member', 'admin', 'owner'\)/);
  const fn = SQL.slice(SQL.indexOf("CREATE OR REPLACE FUNCTION public.user_can_write_in_org"), SQL.indexOf("COMMENT ON FUNCTION public.user_can_write_in_org"));
  assert.match(fn, /SECURITY DEFINER/);
  assert.match(fn, /SET search_path = public, pg_temp/);
  const alters = [...SQL.matchAll(/ALTER POLICY (\w+) ON public\.(\w+)/g)].map((m) => `${m[2]}.${m[1]}`);
  assert.deepEqual(alters.sort(), [
    "item_workspace_tags.item_workspace_tags_org_delete", "item_workspace_tags.item_workspace_tags_org_insert",
    "org_watchlist.org_watchlist_member_delete", "org_watchlist.org_watchlist_member_insert", "org_watchlist.org_watchlist_member_update",
    "portfolio_members.portfolio_members_org_delete", "portfolio_members.portfolio_members_org_insert",
    "portfolios.portfolios_org_delete", "portfolios.portfolios_org_insert", "portfolios.portfolios_org_update",
    "workspace_item_overrides.overrides_delete_org", "workspace_item_overrides.overrides_insert_org", "workspace_item_overrides.overrides_update_org",
    "workspace_tags.workspace_tags_org_delete", "workspace_tags.workspace_tags_org_insert",
  ].sort());
  const statements = SQL.split(";").filter((s) => /ALTER POLICY/.test(s));
  assert.equal(statements.length, 15);
  for (const s of statements) {
    assert.match(s, /user_can_write_in_org\(org_id\)/);
    assert.match(s, /\(select auth\.role\(\)\) = 'service_role'/);
    assert.doesNotMatch(s, /user_belongs_to_org/);
  }
  // reads keep user_belongs_to_org: no SELECT policy is touched
  assert.doesNotMatch(SQL, /ALTER POLICY \w+_(read|member_read|read_org) /);
});

test("self-check ATTACKS as role authenticated and service_role through a fixture jwt sub, requires 42501 on every attack, rolls back", () => {
  assert.match(SQL, /SET LOCAL ROLE authenticated;/);
  assert.match(SQL, /SET LOCAL ROLE service_role;/);
  assert.match(SQL, /set_config\('request\.jwt\.claims'/);
  assert.match(SQL, /RAISE EXCEPTION 'sec3b_370_selfcheck_rollback'/);
  assert.match(SQL, /EXCEPTION WHEN OTHERS THEN\s+RESET ROLE;\s+RETURN 'err:' \|\| SQLSTATE/);
  const attacks = (SQL.match(/'err:42501:/g) || []).length;
  assert.ok(attacks >= 28, `expected at least 28 refusal expectations, found ${attacks}`);
  const controls = (SQL.match(/'ok:1'/g) || []).length;
  assert.ok(controls >= 25, `expected at least 25 both-directions controls, found ${controls}`);
  // layer 1 messages are column privilege denials, layer 2 (grants restored in the rolled-back block) names the trigger
  for (const g of ["organizations_plan_guard", "community_member_profiles_verification_guard", "org_membership_role_guard",
    "community_posts_guard", "community_post_signoff_requests_guard", "community_groups_owner_guard"]) {
    assert.ok(SQL.includes(`'err:42501:%${g}%'`), `a leg requires the ${g} message`);
  }
  assert.ok((SQL.match(/'err:42501:%permission denied%'/g) || []).length >= 6);
  assert.match(SQL, /GRANT UPDATE \(plan\) ON public\.organizations TO authenticated;[\s\S]*REVOKE UPDATE \(plan\) ON public\.organizations FROM authenticated;/);
  assert.match(SQL, /GRANT UPDATE \(signed_off_at, signed_off_by, author_user_id\) ON public\.community_posts TO authenticated;/);
  assert.match(SQL, /REVOKE INSERT \(signed_off_at, signed_off_by\) ON public\.community_posts FROM authenticated;/);
});

test("self-check fixtures: every profile, membership, post and group row rests on an auth.users row the block created; none is an invented bare id", () => {
  assert.match(SQL, /INSERT INTO auth\.users \(id, aud, role, email, created_at, updated_at\)/);
  assert.match(SQL, /INSERT INTO public\.profiles \(id, email, display_name\)[\s\S]*ON CONFLICT \(id\) DO NOTHING/);
  assert.match(SQL, /could not create fixture auth\.users and profiles rows/);
  assert.match(SQL, /public\.intelligence_items is empty, item-dependent viewer legs/);
  // the temporary helpers are dropped
  assert.match(SQL, /DROP FUNCTION pg_temp\.sec3b_try\(text, uuid, text\);/);
  assert.match(SQL, /DROP FUNCTION pg_temp\.sec3b_expect\(text, text, text, text\);/);
});

test("privilege catalog is asserted after the rolled-back block (temporary re-grants gone, legitimate columns kept, six triggers enabled, 15 policies switched, no read policy switched)", () => {
  assert.match(SQL, /has_column_privilege\('authenticated', 'public\.organizations', 'plan', 'UPDATE'\)/);
  assert.match(SQL, /has_column_privilege\('authenticated', 'public\.community_posts', 'author_user_id', 'UPDATE'\)/);
  assert.match(SQL, /has_column_privilege\('authenticated', 'public\.community_posts', 'author_user_id', 'INSERT'\)/);
  assert.match(SQL, /has_table_privilege\('anon', 'public\.organizations', 'UPDATE'\)/);
  assert.match(SQL, /<> 6 THEN/);
  assert.match(SQL, /<> 15 THEN/);
  assert.match(SQL, /cmd = 'SELECT'[\s\S]*<> 0 THEN/);
});

// ---- Consumers: no user-session writer in src touches a system-written column -----------------------------------------
// Writers that use the service-role client (getServiceSupabase / requireAdminRoute's client) are sanctioned.

test("organizations: the only .from('organizations') writer in src is the service-role org route", () => {
  const writers = [];
  for (const f of SRC_FILES) {
    const t = text(f);
    const re = /from\(\s*["']organizations["']\s*\)\s*(?:\/\/[^\n]*\n\s*)*\.(update|insert|upsert|delete)\(/g;
    if (re.test(t)) writers.push(f);
  }
  assert.ok(writers.length >= 1, "expected to find the org route writer");
  for (const f of writers) {
    assert.match(text(f), /getServiceSupabase|requireAdminRoute/, `${f} writes organizations without a service-role client`);
  }
});

test("community_member_profiles: no user-session writer names a verification column; the verify route uses the service-role client", () => {
  const verify = text(join(SRC, "app", "api", "community", "profile", "verify", "route.ts"));
  assert.match(verify, /getServiceSupabase\(\)/);
  assert.match(verify, /service\s*\.from\("community_member_profiles"\)/);
  const profile = text(join(SRC, "app", "api", "community", "profile", "route.ts"));
  const upsert = profile.slice(profile.indexOf(".upsert("), profile.indexOf(".upsert(") + 200);
  for (const c of ["verified", "verified_at", "verification_method", "organisation_key"]) assert.doesNotMatch(upsert, new RegExp(`\\b${c}\\b`));
  for (const f of SRC_FILES) {
    if (base(f) === "route.ts" && f.includes("verify")) continue;
    const t = text(f);
    const re = /from\(\s*["']community_member_profiles["']\s*\)\s*(?:\/\/[^\n]*\n\s*)*\.(update|insert|upsert)\(([^)]{0,300})/g;
    let m;
    while ((m = re.exec(t))) for (const c of ["verified", "verified_at", "verification_method", "organisation_key"]) {
      assert.doesNotMatch(m[2], new RegExp(`\\b${c}\\b`), `${base(f)} writes ${c}`);
    }
  }
});

test("community_posts: the sign-off stamp is written with the service-role client; no user-session writer names signed_off_* or author_user_id in an update", () => {
  const decide = text(join(SRC, "app", "api", "community", "signoff", "[id]", "decide", "route.ts"));
  const stampAt = decide.indexOf("signed_off_at: decidedAt");
  assert.ok(stampAt > 0);
  assert.match(decide.slice(Math.max(0, stampAt - 200), stampAt), /service\s*\.from\("community_posts"\)/);
  for (const f of SRC_FILES) {
    const t = text(f);
    const re = /from\(\s*["']community_posts["']\s*\)\s*(?:\/\/[^\n]*\n\s*)*\.update\(([^)]{0,300})/g;
    let m;
    while ((m = re.exec(t))) {
      if (f.includes("decide")) continue;
      for (const c of ["signed_off_at", "signed_off_by", "author_user_id"]) assert.doesNotMatch(m[1], new RegExp(`\\b${c}\\b`), `${base(f)} updates ${c}`);
    }
  }
});

test("org_memberships: every writer in src is a service-role route", () => {
  for (const f of SRC_FILES) {
    const t = text(f);
    if (!/from\(\s*["']org_memberships["']\s*\)\s*(?:\/\/[^\n]*\n\s*)*\.(insert|update|upsert|delete)\(/.test(t)) continue;
    assert.match(t, /getServiceSupabase|requireAdminRoute|const \{ supabase \} = auth/, `${f} writes org_memberships without a service-role client`);
  }
});

test("community_groups: no code path updates owner_user_id", () => {
  for (const f of SRC_FILES) {
    const t = text(f);
    const re = /from\(\s*["']community_groups["']\s*\)\s*(?:\/\/[^\n]*\n\s*)*\.update\(([^)]{0,300})/g;
    let m;
    while ((m = re.exec(t))) assert.doesNotMatch(m[1], /owner_user_id/, base(f));
  }
});

test("no JWT literal and no section-sign or dash glyph in the new file", () => {
  assert.doesNotMatch(RAW, /eyJ/);
  const banned = [0xa7, 0x2013, 0x2014].map((c) => String.fromCharCode(c));
  for (const g of banned) assert.ok(!RAW.includes(g), `glyph U+${g.charCodeAt(0).toString(16)} present`);
});
