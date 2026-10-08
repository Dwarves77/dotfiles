// 381_write_policies_name_their_role.test.mjs -- static proof of migration 381 (lane SEC-7) by parsing the SQL file and the
// migration tree: no database, no SQL parser dependency. The ATTACKS (SET LOCAL ROLE anon, a valid row, then SQLSTATE 42501
// with the message "permission denied for table X") run in the migration's own self-check at apply time inside a
// rolled-back sub-transaction; the PROOF-4 attacks sec7-* in scripts/proof/attacks/attacks.json re-prove them on the chain
// stack. This file proves: the explicit ALTER list equals the policies the migration TREE leaves with roles {public} and a
// write command (re-derived here, so a policy added before 381 and left out fails the build), every one of them names an
// authenticated actor, the grant hygiene block is 369's verbatim and runs AFTER the ALTERs, the enumeration assertion and the
// out-of-band guard are present, and the self-check fixtures satisfy the live table definitions. Mutation tests at the end
// show the checker is red against the defects it exists to catch.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSchema, parseInserts, parseUpdates, checkFixtures, stripSql } from "./_lib/fixture-inserts.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RAW = readFileSync(join(HERE, "381_write_policies_name_their_role.sql"), "utf8");
const strip = (raw) => raw.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const MIG_369 = readFileSync(join(HERE, "369_privilege_functions_views.sql"), "utf8");

// ---- the policy state of the migration tree below 381 ----------------------------------------------------------------

const tn = (s) => s.replace(/"/g, "").replace(/^public\./i, "").toLowerCase();
const pn = (s) => (s.startsWith('"') ? s.slice(1, -1) : s.toLowerCase());

function splitStmts(text) {
  const out = [];
  let cur = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "'") {
      let j = i + 1;
      while (j < text.length) { if (text[j] === "'" && text[j + 1] === "'") j += 2; else if (text[j] === "'") break; else j++; }
      cur += text.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === ";") { out.push(cur.trim()); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function balanced(s, start) {
  let d = 0;
  let i = start;
  while (i < s.length) {
    const c = s[i];
    if (c === "'") {
      let j = i + 1;
      while (j < s.length) { if (s[j] === "'" && s[j + 1] === "'") j += 2; else if (s[j] === "'") break; else j++; }
      i = j + 1; continue;
    }
    if (c === "(") d++;
    if (c === ")") { d--; if (d === 0) return i; }
    i++;
  }
  return -1;
}

function clause(s, kw) {
  const m = new RegExp(String.raw`\b${kw}\s*\(`, "i").exec(s);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  return s.slice(open + 1, balanced(s, open)).replace(/\s+/g, " ").trim();
}

function parseRoles(s) {
  const m = /\bTO\s+([\w",\s]+?)(?=\s+(?:USING|WITH\s+CHECK)\b|$)/i.exec(s.replace(/\s+/g, " "));
  return m ? m[1].split(",").map((x) => x.trim().replace(/"/g, "").toLowerCase()) : null;
}

/** Final policy state after every CREATE, ALTER, DROP, RENAME and DROP TABLE below `before`, in file order. */
export function policyState(dir, before) {
  const files = readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f) && parseInt(f, 10) < before)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
  const pol = new Map();
  for (const f of files) {
    const text = stripSql(readFileSync(join(dir, f), "utf8"), { keepDollarBodies: true });
    for (const stmt0 of splitStmts(text)) {
      const stmt = stmt0.replace(/\s+/g, " ");
      const re = /(CREATE POLICY|ALTER POLICY|DROP POLICY)\s+(IF EXISTS\s+)?("[^"]+"|\w+)\s+ON\s+((?:public\.)?"?\w+"?)/ig;
      let m;
      while ((m = re.exec(stmt))) {
        const kind = m[1].toUpperCase();
        const name = pn(m[3]);
        const table = tn(m[4]);
        const key = table + "|" + name;
        const rest = stmt.slice(m.index + m[0].length);
        if (kind === "DROP POLICY") { pol.delete(key); continue; }
        if (kind === "CREATE POLICY") {
          const cmd = (/\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(rest) || [, "ALL"])[1].toUpperCase();
          pol.set(key, { table, name, cmd, roles: parseRoles(rest) || ["public"], qual: clause(rest, "USING"), check: clause(rest, "WITH CHECK") });
        } else {
          const p = pol.get(key);
          if (!p) continue; // an out-of-band policy (docs/inventories/out-of-band-objects.md), not in the tree
          const r = /^\s*RENAME TO\s+("[^"]+"|\w+)/i.exec(rest);
          if (r) { pol.delete(key); p.name = pn(r[1]); pol.set(table + "|" + p.name, p); continue; }
          const roles = parseRoles(rest);
          if (roles) p.roles = roles;
          const q = clause(rest, "USING");
          if (q !== null) p.qual = q;
          const c = clause(rest, "WITH CHECK");
          if (c !== null) p.check = c;
        }
      }
      const t = /^DROP TABLE (?:IF EXISTS )?(.*?)(?: CASCADE| RESTRICT)?$/i.exec(stmt);
      if (t) for (const n of t[1].split(",")) { const x = tn(n.trim()); for (const k of [...pol.keys()]) if (k.startsWith(x + "|")) pol.delete(k); }
    }
  }
  return [...pol.values()];
}

/** The JavaScript twin of pg_temp.sec7_requires_auth. */
export const REQUIRES_AUTH = /(auth\.uid\(\)|auth\.jwt\(\)|auth\.role\(\).{0,60}(service_role|authenticated)|user_org_role|user_group_role|user_can_write_in_org|user_belongs_to_org|user_is_group_admin|user_owns_group|user_is_group_member|is_platform_admin)/is;
const requiresAuth = (p) => REQUIRES_AUTH.test(`${p.qual ?? ""} ${p.check ?? ""}`);
const WRITE = new Set(["INSERT", "UPDATE", "DELETE", "ALL"]);
const isPublicOnly = (p) => p.roles.length === 1 && p.roles[0] === "public";

const STATE = policyState(HERE, 381);
const DERIVED = STATE.filter((p) => WRITE.has(p.cmd) && isPublicOnly(p)).map((p) => `${p.table}.${p.name}`).sort();

// ---- the migration file, parsed --------------------------------------------------------------------------------------

/** Everything that can be wrong with a 381 text; [] when nothing is. */
export function verify(raw, derived = DERIVED) {
  const bad = [];
  const sql = strip(raw);
  const alters = [...sql.matchAll(/^ALTER POLICY ("[^"]+"|\w+) ON public\.(\w+) TO authenticated, service_role;$/gm)].map((m) => `${m[2]}.${m[1].replace(/"/g, "")}`).sort();
  if (JSON.stringify(alters) !== JSON.stringify(derived)) {
    const miss = derived.filter((x) => !alters.includes(x));
    const extra = alters.filter((x) => !derived.includes(x));
    bad.push(`ALTER list differs from the tree: missing [${miss.join(", ")}] extra [${extra.join(", ")}]`);
  }
  const arrays = [...raw.matchAll(/(?:v_list|v_pols)\s+text\[\] := ARRAY\[([\s\S]*?)\n  \];/g)].map((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort());
  if (arrays.length !== 2) bad.push(`expected two policy arrays (precondition and self-check), found ${arrays.length}`);
  for (const a of arrays) if (JSON.stringify(a) !== JSON.stringify(derived)) bad.push("a policy array differs from the tree-derived list");
  if (/ALTER POLICY[^;]*\bTO public\b/i.test(sql)) bad.push("an ALTER POLICY sets TO public");
  const alterAt = sql.indexOf("ALTER POLICY");
  const hygieneAt = sql.indexOf("REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon;");
  const lastAlter = sql.lastIndexOf("ALTER POLICY");
  if (alterAt < 0 || hygieneAt < 0 || hygieneAt < lastAlter) bad.push("the grant hygiene block must run after the last ALTER POLICY");
  return bad;
}

test("header: subject line, NOT APPLIED, no applied claim", () => {
  assert.match(RAW, /^-- subject: Migration 381 \(lane SEC-7, 2026-10-08\)/);
  assert.match(RAW, /\bNOT APPLIED\b/);
  assert.doesNotMatch(RAW, /APPLIED \(production ledger/);
  assert.match(RAW.split("\n")[0], /NOT APPLIED\.$/);
});

test("the explicit ALTER list equals the policies the tree leaves with roles {public} and a write command (re-derived here)", () => {
  assert.deepEqual(verify(RAW), []);
  assert.equal(DERIVED.length, 107, "the tree leaves 107 such policies below 381");
  assert.equal([...RAW.matchAll(/^ALTER POLICY /gm)].length, 107);
});

test("every listed policy names an authenticated actor in its tree predicate (a text match, also read by eye), none is a SELECT policy", () => {
  const listed = STATE.filter((p) => DERIVED.includes(`${p.table}.${p.name}`));
  assert.equal(listed.length, 107);
  for (const p of listed) {
    assert.ok(requiresAuth(p), `${p.table}.${p.name} does not name an authenticated actor: ${p.qual} / ${p.check}`);
    assert.ok(WRITE.has(p.cmd), `${p.table}.${p.name}`);
  }
  // no table keeps a write policy anon could satisfy, so no table is excluded from the list
  const tables = new Set(listed.map((p) => p.table));
  for (const t of tables) {
    const open = STATE.filter((p) => p.table === t && WRITE.has(p.cmd) && p.roles.some((r) => r === "public" || r === "anon") && !requiresAuth(p));
    assert.deepEqual(open.map((p) => p.name), [], `${t} keeps a write policy anon could satisfy`);
  }
});

test("the classification idiom matches the deparsed forms pg_policies prints, and rejects a literal true and an anon role test", () => {
  const yes = [
    "(( SELECT auth.role() AS role) = 'service_role'::text)",
    "((auth.role() = 'authenticated'::text) AND (owner_user_id = auth.uid()))",
    "(user_can_write_in_org(org_id) OR (( SELECT auth.role() AS role) = 'service_role'::text))",
    "(( SELECT is_platform_admin() AS is_platform_admin))",
    "(user_org_role(org_id) = ANY (ARRAY['owner'::text, 'admin'::text]))",
  ];
  for (const s of yes) assert.ok(REQUIRES_AUTH.test(s), s);
  for (const s of ["true", "(1 = 1)", "(auth.role() = 'anon'::text)", "(org_id IS NOT NULL)"]) assert.ok(!REQUIRES_AUTH.test(s), s);
  // the SQL source carries the same alternatives as this twin
  const fn = RAW.slice(RAW.indexOf("CREATE FUNCTION pg_temp.sec7_requires_auth"), RAW.indexOf("$f$;", RAW.indexOf("CREATE FUNCTION pg_temp.sec7_requires_auth") + 60));
  for (const alt of ["auth\\.uid\\(\\)", "auth\\.jwt\\(\\)", "auth\\.role\\(\\).{0,60}(service_role|authenticated)", "user_org_role", "user_group_role", "user_can_write_in_org", "user_belongs_to_org", "user_is_group_admin", "user_owns_group", "user_is_group_member", "is_platform_admin"]) {
    assert.ok(fn.includes(alt), `the SQL regex lacks ${alt}`);
  }
});

test("scope: ALL policies are included, reconciler and service_role policies are not, no SELECT policy is altered", () => {
  const all = STATE.filter((p) => p.cmd === "ALL" && isPublicOnly(p));
  assert.ok(all.length >= 15, `ALL policies listed: ${all.length}`);
  for (const p of all) assert.ok(DERIVED.includes(`${p.table}.${p.name}`));
  for (const p of STATE.filter((x) => x.roles.includes("reconciler") || x.roles.includes("service_role") || x.roles.includes("authenticated"))) {
    assert.ok(!DERIVED.includes(`${p.table}.${p.name}`), `${p.table}.${p.name} already names its role`);
  }
  const sql = strip(RAW);
  for (const p of STATE.filter((x) => x.cmd === "SELECT")) assert.doesNotMatch(sql, new RegExp(`ALTER POLICY "?${p.name}"? ON public\\.${p.table}\\b`), `${p.table}.${p.name} is a SELECT policy`);
});

test("the reconciler claim: migration 118 says it connects directly with no JWT, so auth.role() is NULL for it", () => {
  assert.match(readFileSync(join(HERE, "118_provenance_flip_binding.sql"), "utf8"), /reconciler connects directly \(no JWT\) so auth\.role\(\) is NULL/);
});

// ---- the out-of-band policies, the enumeration assertion, the grant hygiene ------------------------------------------

test("part 2: the four out-of-band write policies are the write rows of docs/inventories/out-of-band-objects.md, handled by a guarded block", () => {
  const inv = readFileSync(join(HERE, "..", "..", "..", "docs", "inventories", "out-of-band-objects.md"), "utf8");
  const rows = [...inv.matchAll(/^\| `(\w+)` \| `(\w+)` \| (SELECT|INSERT|UPDATE|DELETE) \|$/gm)].filter((m) => m[3] !== "SELECT").map((m) => `${m[1]}.${m[2]}`).sort();
  assert.deepEqual(rows, ["intelligence_changes.changes_write_service", "intelligence_summaries.summaries_update_service", "intelligence_summaries.summaries_write_service", "sector_contexts.sector_contexts_write_service"]);
  const oob = RAW.slice(RAW.indexOf("DO $oob$"), RAW.indexOf("END $oob$"));
  for (const r of rows) assert.ok(oob.includes(`'${r}'`), r);
  assert.match(oob, /does not exist on this database, skipped/);
  assert.match(oob, /pg_temp\.sec7_requires_auth\(v_row\.pred\)/);
  assert.match(oob, /EXECUTE format\('ALTER POLICY %I ON public\.%I TO authenticated, service_role'/);
  // none of the four is in the tree-derived list (they are in no migration file), so Part 1 never names them
  for (const r of rows) assert.ok(!DERIVED.includes(r), r);
  // migration 259 does alter the two summaries policies, which is the tree's only trace of them
  assert.match(readFileSync(join(HERE, "259_rls_initplan_and_policy_destack.sql"), "utf8"), /ALTER POLICY summaries_write_service ON public\.intelligence_summaries/);
});

test("part 3: the enumeration assertion reads pg_policies for roles {public} write policies on auth-only tables and aborts naming them", () => {
  const e = RAW.slice(RAW.indexOf("DO $enum$"), RAW.indexOf("END $enum$"));
  assert.match(e, /p\.cmd IN \('INSERT', 'UPDATE', 'DELETE', 'ALL'\)/);
  assert.match(e, /p\.roles @> ARRAY\['public'\]::name\[\] AND p\.roles <@ ARRAY\['public'\]::name\[\]/);
  assert.match(e, /q\.roles && ARRAY\['anon', 'public'\]::name\[\]/);
  assert.match(e, /NOT pg_temp\.sec7_requires_auth/);
  assert.match(e, /RAISE EXCEPTION 'ABORT: write policies with roles \{public\}/);
});

test("part 4: the grant hygiene block is 369's section 3 statements, repeated verbatim, after the ALTERs", () => {
  const block = (t) => {
    const a = t.indexOf("  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon;");
    const b = t.indexOf("  v_sel_after");
    return t.slice(a, t.indexOf("RAISE NOTICE", b)).split("\n").map((l) => l.trimEnd()).join("\n");
  };
  const mine = block(RAW);
  assert.ok(mine.length > 1500, "block found");
  assert.equal(mine, block(MIG_369), "the REVOKE/GRANT/invariant statements differ from 369");
  // and it precedes nothing that depends on the old grants: no GRANT to anon besides the policy-driven loop
  const sql = strip(RAW);
  assert.deepEqual([...sql.matchAll(/GRANT [A-Z, ]+ ON [\w.%]+ TO anon/g)].map((m) => m[0]), ["GRANT INSERT ON public.%I TO anon", "GRANT UPDATE ON public.%I TO anon", "GRANT DELETE ON public.%I TO anon"]);
  assert.equal(verify(RAW).length, 0);
});

// ---- the self-check ---------------------------------------------------------------------------------------------------

test("self-check: attacks every table as anon for all three commands, requires the TABLE message, covers the three helper families, rolls back", () => {
  const sql = strip(RAW);
  assert.match(sql, /SET LOCAL ROLE anon;/);
  assert.match(sql, /SET LOCAL ROLE service_role;/);
  assert.match(sql, /set_config\('request\.jwt\.claims'/);
  assert.match(sql, /RAISE EXCEPTION 'sec7_381_selfcheck_rollback'/);
  assert.match(sql, /'err:42501:permission denied for table %'/);
  assert.match(sql, /FOREACH v_cmd IN ARRAY ARRAY\['INSERT', 'UPDATE', 'DELETE'\]/);
  assert.match(sql, /CASE WHEN v_cmd = 'DELETE' THEN has_table_privilege\('anon', v_oid, v_cmd\) ELSE has_any_column_privilege\('anon', v_oid, v_cmd\) END/);
  for (const t of ["org_watchlist", "workspace_tags", "portfolios", "org_memberships", "community_group_members", "user_watchlist"]) {
    assert.ok(sql.includes(`'err:42501:permission denied for table ${t}'`) || sql.includes(`'err:42501:permission denied for table ${t}', 'err:42501:permission denied for function%'`), t);
  }
  // the helper-denied message is rejected explicitly on the INSERT legs of the three families
  assert.ok((sql.match(/'err:42501:permission denied for function%'/g) || []).length >= 5);
  // controls: the real principals still succeed, and the policy (not the grant) still refuses a viewer and a foreign row
  assert.ok((sql.match(/'ok:1'/g) || []).length >= 10, "at least ten both-directions controls");
  assert.ok(sql.includes("'err:42501:new row violates row-level security%'"));
  assert.match(RAW, /DROP FUNCTION pg_temp\.sec7_try\(text, uuid, text\);/);
  assert.match(RAW, /DROP FUNCTION pg_temp\.sec7_expect\(text, text, text, text\);/);
  assert.match(RAW, /DROP FUNCTION pg_temp\.sec7_requires_auth\(text\);/);
});

test("self-check: the table array is the distinct tables of the list plus the three out-of-band tables, and every one exists in the tree", () => {
  const m = /v_tables text\[\] := ARRAY\[([\s\S]*?)\n  \];/.exec(RAW);
  const tables = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  const expected = [...new Set([...DERIVED.map((x) => x.split(".")[0]), "intelligence_changes", "intelligence_summaries", "sector_contexts"])].sort();
  assert.deepEqual([...tables].sort(), expected);
  assert.equal(tables.length, 50);
  const schema = buildSchema(HERE, { before: 381 });
  for (const t of tables) assert.ok(schema.tables.has(t), `${t} is defined by the migration tree`);
});

// ---- the self-check fixtures against the live definitions in the migration tree -------------------------------------------

const FIXTURE_SQL = stripSql(RAW);
const SCHEMA = buildSchema(HERE, { before: 381 });
const EXTERNAL = { "auth.users": { columns: ["id", "aud", "role", "email", "created_at", "updated_at"], required: ["id"] } };
const INSERTS = parseInserts(FIXTURE_SQL);
const UPDATES = parseUpdates(FIXTURE_SQL);

test("fixtures: every INSERT and UPDATE literal in the self-check satisfies the table definitions rebuilt from the tree (NOT NULL, defaults, IN-list CHECKs, columns)", () => {
  assert.ok(INSERTS.length >= 15, "found " + INSERTS.length + " inserts, direct and in format()");
  assert.deepEqual(checkFixtures({ inserts: INSERTS, updates: UPDATES, schema: SCHEMA, external: EXTERNAL }), []);
});

test("fixtures: the parser sees the nine tables the self-check writes, so a table dropped from the scan is a failure", () => {
  const tables = [...new Set(INSERTS.map((i) => i.schemaName + "." + i.table))].sort();
  assert.deepEqual(tables, [
    "auth.users", "public.community_group_members", "public.community_groups", "public.org_memberships", "public.org_watchlist",
    "public.organizations", "public.portfolios", "public.profiles", "public.user_watchlist", "public.workspace_tags",
  ]);
  // org_watchlist is UNIQUE (org_id, item_type, item_id): the rows differ in item_id; item_type is vocabulary ('reg')
  const rows = INSERTS.filter((i) => i.table === "org_watchlist").flatMap((i) => i.rows.map((r) => Object.fromEntries(i.cols.map((c, k) => [c, r[k]]))));
  assert.equal(rows.length, 3);
  for (const r of rows) assert.deepEqual([r.item_type.kind, r.item_type.value], ["string", "reg"]);
  assert.equal(new Set(rows.map((r) => r.item_id.value)).size, 3);
  // user_watchlist is UNIQUE (user_id, item_type, item_id): three rows, three keys
  const uw = INSERTS.filter((i) => i.table === "user_watchlist").flatMap((i) => i.rows.map((r) => Object.fromEntries(i.cols.map((c, k) => [c, r[k]]))));
  assert.equal(uw.length, 3);
  assert.equal(new Set(uw.map((r) => r.item_id.value)).size, 3);
});

test("fixtures: foreign-key order: users, profiles, organization, memberships, group, group member, then the legs", () => {
  const at = (needle, from = 0) => { const i = FIXTURE_SQL.indexOf(needle, from); assert.ok(i >= 0, needle); return i; };
  const users = at("INSERT INTO auth.users");
  const profiles = at("INSERT INTO public.profiles", users);
  const orgs = at("INSERT INTO public.organizations", profiles);
  const members = at("INSERT INTO public.org_memberships", orgs);
  const groups = at("INSERT INTO public.community_groups", members);
  const gm = at("INSERT INTO public.community_group_members", groups);
  assert.ok(at("C1 anon INSERT org_watchlist", gm) > gm);
});

// ---- mutation tests: the checker is red against the defects it exists to catch -------------------------------------------

test("red: dropping one ALTER from the list, adding an unknown one, or moving the grant block before the ALTERs is reported", () => {
  const lines = RAW.split("\n");
  const first = lines.findIndex((l) => l.startsWith("ALTER POLICY "));
  const missing = [...lines.slice(0, first), ...lines.slice(first + 1)].join("\n");
  assert.match(verify(missing).join("|"), /missing \[admin_action_cooldowns\.service role full access\]/);
  const extra = RAW.replace("DO $oob$", "ALTER POLICY ghost_policy ON public.ghost TO authenticated, service_role;\nDO $oob$");
  assert.match(verify(extra).join("|"), /extra \[ghost\.ghost_policy\]/);
  const hyg = "  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon;";
  const moved = RAW.replace(hyg, "-- moved").replace("-- ---- Part 1: the explicit list", hyg.trim() + "\n-- ---- Part 1: the explicit list");
  assert.match(verify(moved).join("|"), /grant hygiene block must run after the last ALTER POLICY/);
  const toPublic = RAW.replace("DO $oob$", "ALTER POLICY x ON public.y TO public;\nDO $oob$");
  assert.match(verify(toPublic).join("|"), /sets TO public/);
});

test("red: the tree derivation catches a new TO public write policy and ignores a narrowed one (synthetic tree, in memory)", () => {
  const synthetic = policyStateFromText([
    "CREATE POLICY a_write ON public.t FOR INSERT WITH CHECK (auth.uid() = user_id);",
    "CREATE POLICY b_write ON public.t FOR UPDATE TO authenticated USING (auth.uid() = user_id);",
    "CREATE POLICY c_read ON public.t FOR SELECT USING (true);",
    "CREATE POLICY d_all ON public.u FOR ALL USING (auth.role() = 'service_role');",
    "ALTER POLICY d_all ON public.u TO authenticated, service_role;",
    'CREATE POLICY "e quoted" ON public.v FOR DELETE USING (auth.uid() = user_id);',
    "CREATE POLICY f_open ON public.w FOR INSERT WITH CHECK (true);",
  ]);
  const names = synthetic.filter((p) => WRITE.has(p.cmd) && isPublicOnly(p)).map((p) => `${p.table}.${p.name}`).sort();
  assert.deepEqual(names, ["t.a_write", "v.e quoted", "w.f_open"]);
  // f_open is TO public and names no actor: the classification refuses it, which is what the apply-time precondition does
  assert.ok(!requiresAuth(synthetic.find((p) => p.name === "f_open")));
  assert.ok(requiresAuth(synthetic.find((p) => p.name === "a_write")));
});

function policyStateFromText(statements) {
  // run the same parser over an in-memory migration by writing nothing to disk: reuse the statement walker directly
  const pol = new Map();
  for (const stmt0 of statements) {
    const stmt = stmt0.replace(/;$/, "").replace(/\s+/g, " ");
    const m = /(CREATE POLICY|ALTER POLICY)\s+("[^"]+"|\w+)\s+ON\s+((?:public\.)?"?\w+"?)/i.exec(stmt);
    const kind = m[1].toUpperCase();
    const name = pn(m[2]);
    const table = tn(m[3]);
    const rest = stmt.slice(m.index + m[0].length);
    if (kind === "CREATE POLICY") {
      const cmd = (/\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(rest) || [, "ALL"])[1].toUpperCase();
      pol.set(table + "|" + name, { table, name, cmd, roles: parseRoles(rest) || ["public"], qual: clause(rest, "USING"), check: clause(rest, "WITH CHECK") });
    } else {
      const p = pol.get(table + "|" + name);
      const roles = parseRoles(rest);
      if (roles) p.roles = roles;
    }
  }
  return [...pol.values()];
}

test("no JWT literal and no section-sign or dash glyph in the new file", () => {
  assert.doesNotMatch(RAW, /eyJ/);
  const banned = [0xa7, 0x2013, 0x2014].map((c) => String.fromCharCode(c));
  for (const g of banned) assert.ok(!RAW.includes(g), `glyph U+${g.charCodeAt(0).toString(16)} present`);
  for (const ch of RAW) assert.ok(ch.charCodeAt(0) < 128, "non-ASCII character " + ch.charCodeAt(0));
});
