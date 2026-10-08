// 364_profiles_privilege_columns.test.mjs -- static proof of migration 364 (lane SEC-1) by parsing the SQL file and
// the code that writes profiles: no database, no SQL parser dependency. The ATTACK (SET LOCAL ROLE authenticated with a
// fixture jwt sub, then UPDATE/INSERT of the four privilege columns, requiring SQLSTATE 42501 from the column
// privilege and, with the grants restored, from the trigger) runs in the migration's own self-check at apply time inside
// a rolled-back sub-transaction; the PROOF-4 attack admin-gate-self-promotion-refused re-proves it on the chain stack.
// This file proves the file carries the revoke, the column-level re-grant that excludes exactly the four columns, the
// guard trigger keyed on current_user, the attack self-check, and that no user-session writer in src touches the four.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RAW = readFileSync(join(HERE, "364_profiles_privilege_columns.sql"), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const read = (name) => readFileSync(join(HERE, name), "utf8");
const FOUR = ["is_platform_admin", "role", "org_id", "workspace_role"];

test("header: subject line and NOT APPLIED", () => {
  assert.match(RAW, /^-- subject: Migration 364 /);
  assert.match(RAW, /NOT APPLIED/);
});

test("the four privilege-bearing columns exist, created by 001 (role), 075 (is_platform_admin), 105 (org_id, workspace_role)", () => {
  assert.match(read("001_schema.sql"), /CREATE TABLE profiles \([\s\S]*?\brole\s+TEXT NOT NULL DEFAULT 'viewer'/);
  assert.match(read("075_profiles_consolidation_phase1.sql"), /ADD COLUMN IF NOT EXISTS is_platform_admin boolean/);
  assert.match(read("105_profiles_projection.sql"), /ADD COLUMN IF NOT EXISTS org_id UUID/);
  assert.match(read("105_profiles_projection.sql"), /ADD COLUMN IF NOT EXISTS workspace_role TEXT/);
  for (const c of FOUR) assert.ok(SQL.includes(`'${c}'`), `precondition/exclusion list names ${c}`);
});

test("layer 1: table-level REVOKE INSERT, UPDATE from PUBLIC, anon, authenticated (a column revoke under a table grant is a no-op)", () => {
  assert.match(SQL, /REVOKE INSERT, UPDATE ON TABLE public\.profiles FROM PUBLIC, anon, authenticated;/);
});

test("layer 1: column-level re-grant to authenticated only, built from pg_attribute minus exactly the four columns", () => {
  assert.match(SQL, /attname NOT IN \('is_platform_admin', 'role', 'org_id', 'workspace_role'\)/);
  assert.match(SQL, /GRANT INSERT \(%s\) ON public\.profiles TO authenticated/);
  assert.match(SQL, /GRANT UPDATE \(%s\) ON public\.profiles TO authenticated/);
  assert.doesNotMatch(SQL, /GRANT[^;]*\bON public\.profiles TO[^;]*\banon\b/);
  assert.doesNotMatch(SQL, /GRANT[^;]*\bON (TABLE )?public\.profiles TO[^;]*\bPUBLIC\b/);
});

test("layer 2: BEFORE INSERT OR UPDATE FOR EACH ROW trigger on profiles, SECURITY INVOKER, pinned search_path", () => {
  assert.match(SQL, /CREATE OR REPLACE FUNCTION public\.profiles_privilege_guard\(\)/);
  assert.match(SQL, /CREATE TRIGGER profiles_privilege_guard_trg\s+BEFORE INSERT OR UPDATE ON public\.profiles\s+FOR EACH ROW EXECUTE FUNCTION public\.profiles_privilege_guard\(\)/);
  assert.doesNotMatch(SQL, /SECURITY DEFINER/i);
  assert.match(SQL, /SET search_path = public, pg_temp/);
});

test("layer 2: sanctioned callers are decided by current_user (service_role, postgres, supabase_admin, table owner), never a JWT claim", () => {
  assert.match(SQL, /current_user IN \('service_role', 'postgres', 'supabase_admin'\)/);
  assert.match(SQL, /pg_get_userbyid\(c\.relowner\)/);
  assert.doesNotMatch(SQL.replace(/set_config\([^;]*;/g, ""), /current_setting\('request\.jwt/);
});

test("layer 2: UPDATE branch compares all four with IS DISTINCT FROM; INSERT branch rejects non-default values; both raise 42501", () => {
  for (const c of FOUR) assert.match(SQL, new RegExp(`NEW\\.${c}\\s+IS DISTINCT FROM OLD\\.${c}`));
  assert.match(SQL, /NEW\.is_platform_admin IS TRUE/);
  assert.match(SQL, /NEW\.org_id IS NOT NULL/);
  assert.match(SQL, /NEW\.workspace_role IS NOT NULL/);
  assert.match(SQL, /NEW\.role IS DISTINCT FROM 'viewer'/);
  assert.equal((SQL.match(/USING ERRCODE = '42501'/g) || []).length, 2);
});

test("self-check ATTACKS as role authenticated with a fixture jwt sub and requires 42501 on every privilege column, UPDATE and INSERT", () => {
  assert.match(SQL, /SET LOCAL ROLE authenticated;/);
  assert.match(SQL, /set_config\('request\.jwt\.claim\.sub'/);
  assert.match(SQL, /UPDATE public\.profiles SET is_platform_admin = true WHERE id = v_uid;/);
  assert.match(SQL, /UPDATE public\.profiles SET role = 'admin' WHERE id = v_uid;/);
  assert.match(SQL, /UPDATE public\.profiles SET workspace_role = 'owner' WHERE id = v_uid;/);
  assert.match(SQL, /UPDATE public\.profiles SET org_id = /);
  assert.match(SQL, /INSERT INTO public\.profiles \(id, is_platform_admin\) VALUES \(v_uid2, true\);/);
  assert.match(SQL, /EXCEPTION WHEN insufficient_privilege THEN/);
  assert.ok(SQL.includes("authenticated was able to UPDATE profiles.% on its own row"));
  assert.ok(SQL.includes("authenticated was able to INSERT its own profiles row with is_platform_admin = true"));
  assert.match(SQL, /RAISE EXCEPTION 'sec1_364_selfcheck_rollback'/);
});

test("self-check proves each layer alone: layer 1 message is a column privilege denial, layer 2 (grants restored in the rolled-back block) names the trigger", () => {
  assert.match(SQL, /position\('permission denied' IN v_msg\)/);
  assert.match(SQL, /GRANT UPDATE \(is_platform_admin, role, org_id, workspace_role\) ON public\.profiles TO authenticated;/);
  assert.match(SQL, /GRANT INSERT \(is_platform_admin, role, org_id, workspace_role\) ON public\.profiles TO authenticated;/);
  assert.match(SQL, /position\('profiles_privilege_guard' IN v_msg\) = 0/);
});

test("self-check is not over-broad: an ordinary own-row column updates, a plain own-row insert succeeds, service_role can flip the flag", () => {
  assert.match(SQL, /UPDATE public\.profiles SET job_title = 'sec1-selfcheck' WHERE id = v_uid;/);
  assert.match(SQL, /INSERT INTO public\.profiles \(id, display_name\) VALUES \(v_uid2, 'sec1-selfcheck'\);/);
  assert.match(SQL, /SET LOCAL ROLE service_role;\s+UPDATE public\.profiles SET is_platform_admin = true WHERE id = v_uid;/);
});

test("privilege catalog is asserted after the rolled-back block (the temporary re-grants must be gone)", () => {
  assert.match(SQL, /has_column_privilege\('authenticated', 'public\.profiles', v_attack, 'UPDATE'\)/);
  assert.match(SQL, /has_column_privilege\('authenticated', 'public\.profiles', v_attack, 'INSERT'\)/);
  assert.match(SQL, /has_column_privilege\('anon', 'public\.profiles', v_attack, 'UPDATE'\)/);
  assert.match(SQL, /has_column_privilege\('service_role', 'public\.profiles', 'is_platform_admin', 'UPDATE'\)/);
});

test("the SECURITY DEFINER RPCs do not write profiles (so no marker is needed and no RPC body changes)", () => {
  for (const f of ["076_org_invitations.sql", "156_org_member_bans.sql"]) {
    assert.doesNotMatch(read(f), /UPDATE\s+(public\.)?profiles\b/i, f);
    assert.doesNotMatch(read(f), /INSERT\s+INTO\s+(public\.)?profiles\b/i, f);
  }
});

// ---- Consumers: every user-session write to profiles in src leaves the four columns alone ------------------------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.(test|npmtest)\./.test(name)) out.push(p);
  }
  return out;
}
const SRC = join(HERE, "..", "..", "src");
// ensureProfile writes with the service-role client (sanctioned role); it inserts role 'member' by design.
const SERVICE_ROLE_WRITERS = new Set(["provision-personal-workspace.ts"]);

test("no user-session .from('profiles').update/insert/upsert payload in src names is_platform_admin, role, org_id or workspace_role", () => {
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
      for (const c of FOUR) {
        if (new RegExp(`\\b${c}\\b`).test(seg)) offenders.push(`${base}: ${c}`);
      }
    }
  }
  assert.ok(writers >= 5, `expected to find the known profiles writers, found ${writers}`);
  assert.deepEqual(offenders, []);
});

test("create-org.mjs builds its profiles patch from job_title and region only; UserProfilePage persist() only ever sends the display and scope fields", () => {
  const createOrg = readFileSync(join(SRC, "lib", "orgs", "create-org.mjs"), "utf8");
  const keys = [...createOrg.matchAll(/profilePatch\.(\w+)/g)].map((x) => x[1]);
  assert.deepEqual([...new Set(keys)].sort(), ["job_title", "region"]);
  const page = readFileSync(join(SRC, "components", "profile", "UserProfilePage.tsx"), "utf8");
  const calls = [...page.matchAll(/persist\(\{([^}]*)\}\)/g)].map((x) => x[1].trim());
  for (const call of calls) for (const c of FOUR) assert.doesNotMatch(call, new RegExp(`\\b${c}\\b`), call);
});

test("no JWT literal and no section-sign or dash glyph in the new file", () => {
  assert.doesNotMatch(RAW, /eyJ/);
  const banned = [0xa7, 0x2013, 0x2014].map((c) => String.fromCharCode(c));
  for (const g of banned) assert.ok(!RAW.includes(g), `glyph U+${g.charCodeAt(0).toString(16)} present`);
});
