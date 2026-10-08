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
import { headerProblems } from "./_lib/applied-status.mjs";

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

test("header: subject line, applied status as the map says, and the profiles read policy is declared out of this migration", () => {
  assert.match(RAW, /^-- subject: Migration 370 /);
  assert.deepEqual(headerProblems(RAW, "370_privilege_table_policies.sql"), []);
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
  // the membership policies stay (never dropped); the recursion fix ALTERs them to read the role through user_org_role
  assert.doesNotMatch(SQL, /DROP POLICY[^;]*\b(membership_write_admin|membership_update_admin|membership_delete_admin)\b/);
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
  const viewerStatements = SQL.split(";").filter((x) => /ALTER POLICY/.test(x) && /user_can_write_in_org/.test(x));
  const alters = viewerStatements.map((x) => x.match(/ALTER POLICY (\w+) ON public\.(\w+)/)).map((m) => `${m[2]}.${m[1]}`);
  assert.deepEqual(alters.sort(), [
    "item_workspace_tags.item_workspace_tags_org_delete", "item_workspace_tags.item_workspace_tags_org_insert",
    "org_watchlist.org_watchlist_member_delete", "org_watchlist.org_watchlist_member_insert", "org_watchlist.org_watchlist_member_update",
    "portfolio_members.portfolio_members_org_delete", "portfolio_members.portfolio_members_org_insert",
    "portfolios.portfolios_org_delete", "portfolios.portfolios_org_insert", "portfolios.portfolios_org_update",
    "workspace_item_overrides.overrides_delete_org", "workspace_item_overrides.overrides_insert_org", "workspace_item_overrides.overrides_update_org",
    "workspace_tags.workspace_tags_org_delete", "workspace_tags.workspace_tags_org_insert",
  ].sort());
  const statements = viewerStatements;
  assert.equal(statements.length, 15);
  for (const s of statements) {
    assert.match(s, /user_can_write_in_org\(org_id\)/);
    assert.match(s, /\(select auth\.role\(\)\) = 'service_role'/);
    assert.doesNotMatch(s, /user_belongs_to_org/);
  }
  // reads keep user_belongs_to_org: no SELECT policy is touched
  assert.doesNotMatch(SQL, /ALTER POLICY \w+_(org_read|member_read|read_org) /);
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

// ---- The recursion class (42P17): a policy must not read its own table ---------------------------------------------
const MIG = (name) => readFileSync(join(HERE, name), "utf8");
const ADMIN_POLICIES = ["membership_write_admin", "membership_update_admin", "membership_delete_admin"];

test("recursion: migration 006 defines the three admin policies with a subquery on org_memberships itself (the cause)", () => {
  const m006 = MIG("006_rls_multi_tenant.sql");
  for (const name of ADMIN_POLICIES) {
    const at = m006.indexOf(`CREATE POLICY "${name}"`);
    assert.ok(at > 0, name);
    const body = m006.slice(at, m006.indexOf(";", at));
    assert.match(body, /FROM org_memberships m/, `${name} reads org_memberships inside its own policy`);
  }
});

test("recursion: 370 ALTERs each of the three policies to user_org_role and none of the ALTERed text names org_memberships", () => {
  for (const name of ADMIN_POLICIES) {
    const at = SQL.indexOf(`ALTER POLICY ${name} ON public.org_memberships`);
    assert.ok(at > 0, `${name} is ALTERed`);
    const stmt = SQL.slice(at, SQL.indexOf(";", at));
    assert.match(stmt, /public\.user_org_role\(org_id\) IN \('owner', 'admin'\) OR \(select auth\.role\(\)\) = 'service_role'/);
    assert.doesNotMatch(stmt.replace(/ON public\.org_memberships/, ""), /org_memberships/);
  }
});

test("recursion: user_org_role is SECURITY DEFINER, search_path pinned to public, pg_temp, EXECUTE revoked from PUBLIC and granted to authenticated", () => {
  const at = SQL.indexOf("CREATE OR REPLACE FUNCTION public.user_org_role(p_org uuid)");
  assert.ok(at > 0);
  const fn = SQL.slice(at, SQL.indexOf("$fn$;", at + 80));
  assert.match(fn, /SECURITY DEFINER/);
  assert.match(fn, /SET search_path = public, pg_temp/);
  assert.match(fn, /m\.user_id = auth\.uid\(\)/);
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.user_org_role\(uuid\) FROM PUBLIC;/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.user_org_role\(uuid\) TO authenticated, service_role;/);
});

test("recursion: the final policy state of org_memberships (006 policies with 370's ALTERs applied) has no policy naming org_memberships", () => {
  const m006 = MIG("006_rls_multi_tenant.sql");
  const names = [...m006.matchAll(/CREATE POLICY "(\w+)"\s+ON org_memberships/g)].map((m) => m[1]);
  assert.ok(names.length >= 4, `found ${names.join(", ")}`);
  for (const name of names) {
    const altered = SQL.includes(`ALTER POLICY ${name} ON public.org_memberships`);
    const at = m006.indexOf(`CREATE POLICY "${name}"`);
    const original = m006.slice(at, m006.indexOf(";", at));
    const readsOwnTable = /FROM org_memberships/.test(original);
    assert.ok(!readsOwnTable || altered, `${name} reads org_memberships and 370 does not re-point it`);
  }
  // no other migration defines or alters a policy on org_memberships that reads the table
  for (const f of readdirSync(HERE).filter((x) => x.endsWith(".sql") && !x.startsWith("006_") && !x.startsWith("370_"))) {
    const t = MIG(f).split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
    for (const m of t.matchAll(/(CREATE|ALTER) POLICY\s+"?(\w+)"?\s+ON\s+(public\.)?org_memberships\b([^;]*);/gi)) {
      assert.doesNotMatch(m[4], /org_memberships/i, `${f}: policy ${m[2]} on org_memberships reads org_memberships`);
    }
  }
});

test("recursion: community_group_members (migration 029) policies that read the table are re-pointed to user_group_role, with their original meaning", () => {
  const m029 = MIG("029_community_group_members.sql");
  const m046 = MIG("046_community_rls_recursion_fix.sql");
  const names = [...m029.matchAll(/create policy "(\w+)"\s+on community_group_members/gi)].map((m) => m[1]);
  assert.ok(names.includes("community_group_members_insert_admin") && names.includes("community_group_members_update_self_prefs"));
  for (const name of names) {
    const at = m029.indexOf(`create policy "${name}"`);
    const original = m029.slice(at, m029.indexOf(";", at));
    if (!/from community_group_members/i.test(original)) continue;
    const alteredIn370 = SQL.includes(`ALTER POLICY ${name} ON public.community_group_members`);
    const redefinedIn046 = new RegExp(`DROP POLICY IF EXISTS "${name}"`).test(m046);
    assert.ok(alteredIn370 || redefinedIn046, `${name} reads community_group_members and nothing re-points it`);
    if (redefinedIn046) {
      const a = m046.indexOf(`CREATE POLICY "${name}"`);
      assert.doesNotMatch(m046.slice(a, m046.indexOf(";", a)), /FROM community_group_members/i, `${name} (046)`);
    }
  }
  const ins = SQL.slice(SQL.indexOf("ALTER POLICY community_group_members_insert_admin"), SQL.indexOf(";", SQL.indexOf("ALTER POLICY community_group_members_insert_admin")));
  assert.match(ins, /WITH CHECK \(public\.user_group_role\(group_id\) = 'admin'\)/);
  const upd = SQL.slice(SQL.indexOf("ALTER POLICY community_group_members_update_self_prefs"), SQL.indexOf(";", SQL.indexOf("ALTER POLICY community_group_members_update_self_prefs")));
  assert.match(upd, /WITH CHECK \(user_id = auth\.uid\(\) AND role = public\.user_group_role\(group_id\)\)/);
  assert.doesNotMatch(ins.split("WITH CHECK")[1] + upd.split("WITH CHECK")[1], /community_group_members/);
  // user_is_group_admin is true for moderator too, so using it would widen the insert policy: it is not what the insert policy uses
  assert.doesNotMatch(ins, /user_is_group_admin/);
});

test("recursion: user_group_role is SECURITY DEFINER, search_path pinned, EXECUTE revoked from PUBLIC and granted to authenticated and service_role", () => {
  const at = SQL.indexOf("CREATE OR REPLACE FUNCTION public.user_group_role(p_group uuid)");
  assert.ok(at > 0);
  const fn = SQL.slice(at, SQL.indexOf("$fn$;", at + 80));
  assert.match(fn, /SECURITY DEFINER/);
  assert.match(fn, /SET search_path = public, pg_temp/);
  assert.match(fn, /m\.user_id = auth\.uid\(\)/);
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.user_group_role\(uuid\) FROM PUBLIC;/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.user_group_role\(uuid\) TO authenticated, service_role;/);
});

test("recursion: one self-check leg per re-pointed community_group_members policy (ok:1 as the intended role, never 42P17), the refusals stay refusals, and the catalog assertion covers the table", () => {
  assert.ok(SQL.includes("'R1 a group admin inserts a member: no 42P17'"));
  assert.ok(SQL.includes("'R2 a member updates their own starred preference: no 42P17'"));
  assert.ok(SQL.includes("'R1 a moderator is not a group admin for the insert policy'"));
  assert.ok(SQL.includes("'R2 a member cannot raise their own group role through the preferences policy'"));
  assert.match(SQL, /tablename = 'community_group_members'\s+AND \(coalesce\(qual, ''\) \|\| coalesce\(with_check, ''\)\) ~\* 'community_group_members'/);
});

test("recursion: notifications_update_self_read (migration 032) reads notifications in its WITH CHECK; 370 moves the lock to the column grant and reduces the policy to the own-row condition", () => {
  const m032 = MIG("032_community_notifications_moderation.sql");
  const at = m032.indexOf('create policy "notifications_update_self_read"');
  assert.ok(at > 0);
  const original = m032.slice(at, m032.indexOf(";", at));
  assert.match(original, /from notifications n/i, "the original reads its own table");
  const stmtAt = SQL.indexOf("ALTER POLICY notifications_update_self_read ON public.notifications");
  assert.ok(stmtAt > 0);
  const stmt = SQL.slice(stmtAt, SQL.indexOf(";", stmtAt));
  assert.match(stmt, /USING \(user_id = auth\.uid\(\)\)\s+WITH CHECK \(user_id = auth\.uid\(\)\)/);
  assert.doesNotMatch(stmt.replace("ALTER POLICY notifications_update_self_read ON public.notifications", ""), /notifications/);
  // the lock is the column grant: UPDATE revoked at table level, granted back on read_at alone, no trigger
  assert.match(SQL, /REVOKE UPDATE ON TABLE public\.notifications FROM PUBLIC, anon, authenticated;/);
  assert.match(SQL, /GRANT UPDATE \(read_at\) ON public\.notifications TO authenticated;/);
  assert.doesNotMatch(SQL, /CREATE TRIGGER[^;]*ON public\.notifications/);
});

test("recursion: the notification routes write only read_at, with the cookie-bound client (so the column grant cannot break them)", () => {
  for (const f of [["app", "api", "community", "notifications", "[id]", "route.ts"], ["app", "api", "community", "notifications", "route.ts"]]) {
    const t = readFileSync(join(SRC, ...f), "utf8");
    const updates = [...t.matchAll(/\.update\(\{([^}]*)\}\)/g)].map((m) => m[1].trim());
    assert.ok(updates.length >= 1, f.join("/"));
    for (const u of updates) assert.match(u, /^read_at\b/, `${f.join("/")} updates only read_at, got ${u}`);
    assert.match(t, /requireCommunityRoute/);
    assert.doesNotMatch(t, /getServiceSupabase/);
  }
});

test("recursion: the self-check has notification legs (own read_at ok and not 42P17, payload and kind refused by column privilege, another user's row 0 rows) and the catalog assertion covers notifications", () => {
  assert.ok(SQL.includes("'N1 a user marks their own notification read: no 42P17'"));
  assert.ok(SQL.includes("'N2 a user cannot rewrite their own notification payload (column privilege)'"));
  assert.ok(SQL.includes("'N3 a user marking another user notification read updates nothing'"));
  assert.match(SQL, /tablename = 'notifications'\s+AND \(coalesce\(qual, ''\) \|\| coalesce\(with_check, ''\)\) ~\* 'notifications'/);
  assert.match(SQL, /a\.attname <> 'read_at'/);
});

test("recursion: the self-check attacks the class (an admin INSERT, UPDATE and DELETE do not raise 42P17), leg 3A must reach the guard, and the apply fails if a policy names the table", () => {
  assert.ok(SQL.includes("'3 recursion class: an admin UPDATE on org_memberships does not raise 42P17'"));
  assert.ok(SQL.includes("'3 recursion class: an admin INSERT on org_memberships does not raise 42P17'"));
  assert.ok(SQL.includes("'3 recursion class: an admin DELETE on org_memberships does not raise 42P17'"));
  assert.equal((SQL.match(/'err:42P17%'/g) || []).length, 9, "three org_memberships legs, five community_group_members legs and one notifications leg");
  assert.match(SQL, /PERFORM pg_temp\.sec3b_expect\('3A an admin promotes a member to owner',[\s\S]*?'err:42501:%org_membership_role_guard%'\)/);
  assert.match(SQL, /'3 control: the owner grants owner'/);
  assert.match(SQL, /\(coalesce\(qual, ''\) \|\| coalesce\(with_check, ''\)\) ~\* 'org_memberships'/);
  assert.match(SQL, /the three org_memberships admin policies do not all use user_org_role/);
});

// ---- The self-check fixtures against the live definitions in the migration tree -------------------------------------
// Apply 3 of 370 aborted on a fixture row: 23514, org_watchlist.item_type admits source, reg, signal, research,
// operations, market_series (migrations 236 and 270) and the fixture wrote 'item'. Every INSERT (direct, and inside
// format('INSERT ...', args)) and every UPDATE ... SET col = 'literal' in this file is parsed by the shared helper
// _lib/fixture-inserts.mjs (the parser lifted from 372_profiles_read.test.mjs) and checked against the table definition
// REBUILT FROM THE MIGRATION TREE below 370: table and column exist, NOT NULL columns without a default are written, no
// explicit NULL into a NOT NULL column, every literal inside a single-column IN-list CHECK is in the list.
import { buildSchema, parseInserts, parseUpdates, checkFixtures, stripSql, columnLists } from "./_lib/fixture-inserts.mjs";

const FIXTURE_SQL = stripSql(RAW);
const SCHEMA = buildSchema(HERE, { before: 370 });
// auth.users is Supabase-managed, not created by this repo's migrations; the columns below are the ones PROOF-4's fixtures
// (scripts/proof/attacks/fixtures.mjs) insert on the same schema, id being the only one this block relies on being required.
const EXTERNAL = { "auth.users": { columns: ["id", "aud", "role", "email", "created_at", "updated_at"], required: ["id"] } };
const INSERTS = parseInserts(FIXTURE_SQL);
const UPDATES = parseUpdates(FIXTURE_SQL);

test("fixtures: every INSERT and every UPDATE literal in the self-check satisfies the live table definitions (NOT NULL, defaults, IN-list CHECKs, columns)", () => {
  assert.ok(INSERTS.length >= 35, "found " + INSERTS.length + " inserts, direct and in format()");
  assert.ok(UPDATES.length >= 40, "found " + UPDATES.length + " updates");
  assert.deepEqual(checkFixtures({ inserts: INSERTS, updates: UPDATES, schema: SCHEMA, external: EXTERNAL }), []);
});

test("fixtures: the parser sees the sixteen tables the self-check writes, so a table dropped from the scan is a failure", () => {
  const tables = [...new Set(INSERTS.map((i) => i.schemaName + "." + i.table))].sort();
  assert.deepEqual(tables, [
    "auth.users", "public.community_group_members", "public.community_groups", "public.community_member_profiles",
    "public.community_post_signoff_requests", "public.community_posts", "public.item_workspace_tags", "public.notifications",
    "public.org_memberships", "public.org_watchlist", "public.organizations", "public.portfolio_members", "public.portfolios",
    "public.profiles", "public.workspace_item_overrides", "public.workspace_tags",
  ]);
  for (const t of tables.filter((x) => x.startsWith("public."))) assert.ok(SCHEMA.tables.has(t.slice(7)), t + " is defined in the migration tree");
});

test("fixtures: org_watchlist rows use a vocabulary value ('reg'), never 'item' (the apply-3 abort), and the CHECK list is the one migrations 236 and 270 leave", () => {
  const lists = columnLists(SCHEMA, "org_watchlist", "item_type");
  assert.equal(lists.length, 1);
  assert.deepEqual([...lists[0].values].sort(), ["market_series", "operations", "reg", "research", "signal", "source"]);
  const rows = INSERTS.filter((i) => i.table === "org_watchlist").flatMap((i) => i.rows.map((r) => Object.fromEntries(i.cols.map((c, k) => [c, r[k]]))));
  assert.equal(rows.length, 3, "the seed row and the viewer and member legs");
  for (const r of rows) assert.deepEqual([r.item_type.kind, r.item_type.value], ["string", "reg"]);
  assert.equal(new Set(rows.map((r) => r.item_id.value)).size, 3, "org_watchlist is UNIQUE (org_id, item_type, item_id): the three item ids differ");
});

test("fixtures: the checker catches the apply-3 defect (red): the same insert with 'item' is reported, and a NOT NULL column omitted or set NULL is reported", () => {
  const bad = parseInserts("INSERT INTO public.org_watchlist (org_id, added_by_user_id, item_type, item_id) VALUES (v_org, v_owner, 'item', 'x');");
  assert.match(checkFixtures({ inserts: bad, schema: SCHEMA }).join("|"), /org_watchlist\.item_type: 'item' violates org_watchlist_item_type_check/);
  const omitted = parseInserts("INSERT INTO public.org_watchlist (org_id, item_id) VALUES (v_org, 'x');");
  assert.match(checkFixtures({ inserts: omitted, schema: SCHEMA }).join("|"), /item_type: NOT NULL with no default and not written/);
  const nulled = parseInserts("INSERT INTO public.org_watchlist (org_id, item_type, item_id) VALUES (v_org, NULL, 'x');");
  assert.match(checkFixtures({ inserts: nulled, schema: SCHEMA }).join("|"), /item_type: explicit NULL into a NOT NULL column/);
  const viaFormat = parseInserts("x(format('INSERT INTO public.org_watchlist (org_id, added_by_user_id, item_type, item_id) VALUES (%L, %L, %L, %L)', v_org, v_viewer, 'item', 'y'));");
  assert.match(checkFixtures({ inserts: viaFormat, schema: SCHEMA }).join("|"), /'item' violates/);
});

test("fixtures: facts the migration tree states only inside DO blocks or in compound CHECKs, asserted from their migrations", () => {
  // profiles.verifier_status CHECK (075, inside a DO block): the self-check sets 'active'
  assert.match(readFileSync(join(HERE, "075_profiles_consolidation_phase1.sql"), "utf8"), /CHECK \(verifier_status IN \('none', 'pending', 'active', 'revoked'\)\)/);
  const profileUpdates = UPDATES.filter((u) => u.table === "profiles").flatMap((u) => u.sets);
  assert.ok(profileUpdates.some((s) => s.col === "verifier_status" && s.lit.value === "active"));
  // community_posts_title_shape (030): a top-level post (parent_post_id NULL) needs a title; every fixture post writes one
  assert.match(readFileSync(join(HERE, "030_community_posts.sql"), "utf8"), /parent_post_id is null and title is not null/);
  for (const i of INSERTS.filter((x) => x.table === "community_posts")) assert.ok(i.cols.includes("title") && !i.cols.includes("parent_post_id"), "a top-level post carries a title");
  // community_member_profiles_verified_has_method (293): the only fixture that sets verified = true is refused by the guard before the CHECK, and the service-role leg writes all four
  assert.match(readFileSync(join(HERE, "293_community_identity_and_guard.sql"), "utf8"), /CHECK \(verified = false OR \(verified_at IS NOT NULL AND verification_method IS NOT NULL AND organisation_key IS NOT NULL\)\)/);
  assert.ok(FIXTURE_SQL.includes("SET verified = true, verified_at = now(), verification_method = %L, organisation_key = %L"));
  // text lengths: workspace_tags name <= 60 (313), portfolios name <= 80 (362), not blank
  assert.match(readFileSync(join(HERE, "313_workspace_tags.sql"), "utf8"), /length\(name\) <= 60/);
  assert.match(readFileSync(join(HERE, "362_portfolios.sql"), "utf8"), /length\(name\) <= 80/);
  for (const i of INSERTS.filter((x) => ["workspace_tags", "portfolios"].includes(x.table))) {
    const k = i.cols.indexOf("name");
    for (const r of i.rows) assert.ok(r[k].kind === "string" && r[k].value.trim().length > 0 && r[k].value.length <= 60, i.table + " fixture name");
  }
  // the attack-leg values that must stay valid so the refusal is the one under test: statuses, roles, plans, priorities
  for (const [table, col, value] of [
    ["community_post_signoff_requests", "status", "signed_off"], ["community_post_signoff_requests", "status", "withdrawn"],
    ["org_memberships", "role", "owner"], ["organizations", "plan", "enterprise"], ["workspace_item_overrides", "priority_override", "CRITICAL"],
    ["community_member_profiles", "verification_method", "linkedin"], ["notifications", "kind", "moderation"],
  ]) assert.ok(columnLists(SCHEMA, table, col).every((l) => l.values.has(value)), table + "." + col + " admits " + value);
});

test("fixtures: foreign-key order and uniqueness: each referenced row is inserted before the row that references it", () => {
  const at = (needle, from = 0) => { const i = FIXTURE_SQL.indexOf(needle, from); assert.ok(i >= 0, needle); return i; };
  const users = at("INSERT INTO auth.users");
  const profiles = at("INSERT INTO public.profiles", users);
  const orgs = at("INSERT INTO public.organizations", profiles);
  const members = at("INSERT INTO public.org_memberships", orgs);
  const tags = at("INSERT INTO public.workspace_tags (org_id, name, created_by) VALUES (v_org", members);
  const itemTags = at("INSERT INTO public.item_workspace_tags (tag_id", tags);
  const portfolios = at("INSERT INTO public.portfolios (org_id, name, created_by) VALUES (v_org", members);
  const pm = at("format('INSERT INTO public.portfolio_members", portfolios);
  const groups = at("INSERT INTO public.community_groups", members);
  const gm = at("INSERT INTO public.community_group_members (group_id, user_id, role) VALUES", groups);
  const posts = at("INSERT INTO public.community_posts", gm);
  const req = at("INSERT INTO public.community_post_signoff_requests (post_id, requested_by, status) VALUES (v_p1", posts);
  assert.ok(itemTags > tags && pm > portfolios && req > posts);
  // live FKs the order relies on: org_memberships.user_id -> profiles (075), profiles.id -> auth.users (live), members/posts -> auth.users
  assert.match(readFileSync(join(HERE, "075_profiles_consolidation_phase1.sql"), "utf8"), /org_memberships_user_id_fkey/);
  // UNIQUE (org_id, user_id) on org_memberships: the five fixture memberships are five different users
  const mem = INSERTS.find((i) => i.table === "org_memberships" && i.rows.length === 5);
  assert.ok(mem, "the five-row membership fixture");
  assert.equal(new Set(mem.rows.map((r) => r[1].text)).size, 5);
});

test("no JWT literal and no section-sign or dash glyph in the new file", () => {
  assert.doesNotMatch(RAW, /eyJ/);
  const banned = [0xa7, 0x2013, 0x2014].map((c) => String.fromCharCode(c));
  for (const g of banned) assert.ok(!RAW.includes(g), `glyph U+${g.charCodeAt(0).toString(16)} present`);
});
