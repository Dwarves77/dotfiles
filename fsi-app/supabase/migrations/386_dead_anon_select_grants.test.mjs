// 386_dead_anon_select_grants.test.mjs -- static proof of migration 386 (lane SEC-9) by parsing the SQL file and the migration
// tree: no database, no SQL parser dependency. The ATTACKS (SET LOCAL ROLE anon, a real SELECT, then SQLSTATE 42501 "permission
// denied for table X") run in the migration's own self-check at apply time inside a rolled back sub-transaction, and the PROOF-4
// attack sec9-anon-select-grants-have-an-anon-policy in scripts/proof/attacks/attacks.json re-proves the catalog invariant on the
// chain stack. This file proves: the anon SELECT grant state of the migration TREE below 386 is re-derived here (every table and
// view created, dropped, renamed, granted or revoked, in file order) and classified against the policy state of the same tree
// (policyState from 381); the three explicit arrays in the migration (revoked, kept by design, kept authenticated-only) equal that
// derivation, so a grant added before 386 and left out fails the build; the classification is complete and disjoint; no revoked
// table is read by a kept policy's subquery; the enumeration assertion and the self-check cover the sets; and the mutation tests
// at the end show the checker is red against the defects it exists to catch.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { policyState, REQUIRES_AUTH } from "./381_write_policies_name_their_role.test.mjs";
import { stripSql } from "./_lib/fixture-inserts.mjs";
import { headerProblems } from "./_lib/applied-status.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FILE = "386_dead_anon_select_grants.sql";
const RAW = readFileSync(join(HERE, FILE), "utf8");
const strip = (raw) => raw.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const tn = (s) => s.replace(/"/g, "").trim().toLowerCase();

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
    if (c === ";") { out.push(cur.trim().replace(/\s+/g, " ")); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim().replace(/\s+/g, " "));
  return out;
}

/** "public.x" or "x" -> "x"; any other schema -> null. */
const pub = (n) => {
  const s = n.replace(/"/g, "").trim().toLowerCase();
  if (!s) return null;
  const parts = s.split(".");
  if (parts.length === 1) return parts[0];
  return parts.length === 2 && parts[0] === "public" ? parts[1] : null;
};

/**
 * The public relations (tables, views) that exist after the migrations below `before`, each with whether anon holds a table-level
 * SELECT. Supabase's default privileges give anon every privilege on a new public relation, so a relation starts granted; a
 * REVOKE or GRANT of SELECT or ALL (table-level, not column-level) to anon or PUBLIC moves it; a DROP removes it; a RENAME moves it.
 */
export function anonSelectState(dir, before) {
  const files = readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f) && parseInt(f, 10) < before)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
  const rel = new Map(); // name -> { kind, anon }
  for (const f of files) {
    const text = stripSql(readFileSync(join(dir, f), "utf8"), { keepDollarBodies: true });
    for (const s of splitStmts(text)) {
      let m;
      if ((m = /\bCREATE (?:UNLOGGED |TEMP(?:ORARY)? )?TABLE (?:IF NOT EXISTS )?("?[\w.]+"?)\s*(?:\(|PARTITION|AS\b)/i.exec(s))) {
        const n = pub(m[1]);
        if (n && !/\bTEMP/i.test(m[0]) && !rel.has(n)) rel.set(n, { kind: "table", anon: true });
        continue;
      }
      if ((m = /\bCREATE (?:OR REPLACE )?(MATERIALIZED )?VIEW ("?[\w.]+"?)/i.exec(s))) {
        const n = pub(m[2]);
        if (n && !rel.has(n)) rel.set(n, { kind: m[1] ? "matview" : "view", anon: true });
        continue;
      }
      if ((m = /\bDROP (?:TABLE|VIEW|MATERIALIZED VIEW) (?:IF EXISTS )?(.*?)(?: CASCADE| RESTRICT)?$/i.exec(s))) {
        for (const x of m[1].split(",")) { const n = pub(x); if (n) rel.delete(n); }
        continue;
      }
      if ((m = /\bALTER (?:TABLE|VIEW|MATERIALIZED VIEW) (?:IF EXISTS )?("?[\w.]+"?) RENAME TO ("?\w+"?)$/i.exec(s))) {
        const a = pub(m[1]);
        const b = tn(m[2]);
        if (a && rel.has(a)) { rel.set(b, rel.get(a)); rel.delete(a); }
        continue;
      }
      m = /\b(REVOKE|GRANT)\s+(.+?)\s+ON\s+(?:TABLE\s+)?(.+?)\s+(?:FROM|TO)\s+(.+)$/i.exec(s);
      if (m && !/\b(FUNCTION|SEQUENCE|SCHEMA|ROUTINE|PROCEDURE|DEFAULT)\b/i.test(s.slice(0, m.index + m[0].length - m[4].length))) {
        const privs = m[2].toUpperCase();
        if (/\(/.test(privs) || !/\b(SELECT|ALL)\b/.test(privs)) continue;
        const grantees = m[4].toLowerCase().replace(/\bwith grant option\b|\bcascade\b|\brestrict\b/g, "").split(",").map((x) => x.trim());
        if (!grantees.includes("anon") && !grantees.includes("public")) continue;
        const on = m[1].toUpperCase() === "GRANT";
        const target = m[3].trim();
        if (/^ALL TABLES IN SCHEMA public$/i.test(target)) { for (const r of rel.values()) r.anon = on; continue; }
        for (const x of target.split(",")) { const n = pub(x); if (n && rel.has(n)) rel.get(n).anon = on; }
      }
    }
  }
  return rel;
}

/** A policy that applies to anon (the role is named, or the implicit {public}) for reads. */
const isAnonRead = (p) => (p.cmd === "SELECT" || p.cmd === "ALL") && p.roles.some((r) => r === "anon" || r === "public");
/** A policy an unauthenticated request can satisfy: its predicate does not need an authenticated identity, or it names a public branch. */
const anonSatisfiable = (p) => !p.oob && (!REQUIRES_AUTH.test(p.qual ?? "") || /\bprivacy = 'public'/.test(p.qual ?? ""));

/**
 * Live SELECT policies the migration tree does not hold (docs/inventories/out-of-band-objects.md, "Policies"). AUD-AT-1
 * (docs/audits/aud-at1-rls-grants-attacked-2026-10-08.md lines 152 and 195) probed both tables live: anon S=R0/pp1, that is a
 * policy applies to anon or public and answers anon zero rows, while authenticated reads every row (2040 and 15). So each is a
 * kept grant behind an authenticated-only predicate, never a by-design one; the migration's precondition re-checks it live.
 */
export const OUT_OF_BAND_ANON_POLICIES = [
  { table: "intelligence_summaries", name: "summaries_read_authenticated", cmd: "SELECT", roles: ["public"], qual: null, oob: true },
  { table: "sector_contexts", name: "sector_contexts_read_authenticated", cmd: "SELECT", roles: ["public"], qual: null, oob: true },
];

/** The classification of every anon SELECT grant of the tree below `before`. */
export function classify(dir = HERE, before = 386) {
  const rel = anonSelectState(dir, before);
  const treePols = policyState(dir, before);
  // Once the drift reconciliation migrations (384, 385) put these policies into the tree, the tree answers and the stand-ins drop out.
  const standIns = OUT_OF_BAND_ANON_POLICIES.filter((o) => !treePols.some((p) => p.table === o.table && isAnonRead(p)));
  const pols = [...treePols, ...standIns];
  const held = [...rel].filter(([, v]) => v.anon).map(([k]) => k).sort();
  const adm = (t) => pols.filter((p) => p.table === t && isAnonRead(p));
  const design = held.filter((t) => adm(t).some(anonSatisfiable));
  const authOnly = held.filter((t) => adm(t).length > 0 && !adm(t).some(anonSatisfiable));
  const dead = held.filter((t) => adm(t).length === 0);
  return { rel, pols, held, design, authOnly, dead, adm };
}

const C = classify();

/** The three explicit arrays of the migration: v_dead, v_design, v_authonly. */
function arrays(raw) {
  const grab = (name) => {
    const m = new RegExp(String.raw`${name} text\[\] := ARRAY\[([\s\S]*?)\n  \];`).exec(raw);
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort() : null;
  };
  return { dead: grab("v_dead"), design: grab("v_design"), authOnly: grab("v_authonly") };
}

const same = (a, b) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());

/** Everything that can be wrong with a 386 text against a classification; [] when nothing is. */
export function verify(raw, cls = C) {
  const bad = [];
  const sql = strip(raw);
  const a = arrays(raw);
  for (const [key, derived] of [["dead", cls.dead], ["design", cls.design], ["authOnly", cls.authOnly]]) {
    if (!a[key]) { bad.push(`the ${key} array is missing`); continue; }
    if (!same(a[key], derived)) {
      const miss = derived.filter((x) => !a[key].includes(x));
      const extra = a[key].filter((x) => !derived.includes(x));
      bad.push(`the ${key} array differs from the tree: missing [${miss.join(", ")}] extra [${extra.join(", ")}]`);
    }
  }
  const all = [...(a.dead ?? []), ...(a.design ?? []), ...(a.authOnly ?? [])];
  if (new Set(all).size !== all.length) bad.push("a table is in more than one of the three arrays");
  if (!same(all, cls.held)) bad.push("the three arrays together differ from the anon SELECT grants of the tree");
  if (!/REVOKE SELECT ON TABLE public\.%I FROM PUBLIC, anon/.test(sql)) bad.push("the REVOKE of SELECT from PUBLIC and anon is missing");
  if (!/GRANT SELECT ON TABLE public\.%I TO authenticated, service_role/.test(sql)) bad.push("the GRANT back to authenticated and service_role is missing");
  if (/\bREVOKE\b[^;]*\bFROM[^;]*\b(authenticated|service_role)\b/i.test(sql.replace(/GRANT SELECT[^;]*;/g, ""))) bad.push("a REVOKE touches authenticated or service_role");
  if (/ALTER POLICY|DROP POLICY|CREATE POLICY/i.test(sql)) bad.push("this migration changes no policy: grant follows policy only");
  if (/ALTER DEFAULT PRIVILEGES/i.test(sql)) bad.push("default privileges are not this migration's");
  const revokeAt = sql.indexOf("REVOKE SELECT ON TABLE");
  const enumAt = sql.indexOf("$enum$");
  if (revokeAt === -1 || enumAt === -1 || enumAt < revokeAt) bad.push("the enumeration assertion must run after the REVOKE");
  if (!/pg_policies/.test((/DO \$enum\$[\s\S]*?\$enum\$/.exec(sql) || [""])[0])) bad.push("the enumeration assertion does not read pg_policies");
  for (const m of sql.matchAll(/sec9_try\('anon'[^\n]*\n\s*'(err:[^']*|ok:[^']*)'/g)) {
    if (!m[1].startsWith("err:42501:permission denied for ") && !m[1].startsWith("ok:")) bad.push(`an anon leg expects ${m[1]}`);
  }
  if (!/sec9_expect\('B anon SELECT on '/.test(raw)) bad.push("the dead-table anon leg is missing");
  if (!/RAISE EXCEPTION 'sec9_386_selfcheck_rollback'/.test(raw)) bad.push("the self-check does not roll back");
  return bad;
}

// ---- tests ------------------------------------------------------------------------------------------------------------

test("header: subject line, NOT APPLIED status, shared header rules", () => {
  assert.match(RAW, /^-- subject: Migration 386 \(lane SEC-9, 2026-10-10\)/);
  assert.match(RAW, /^-- NOT APPLIED\./m);
  assert.deepEqual(headerProblems(RAW, FILE), []);
});

test("the tree leaves 92 anon SELECT grants below 386, and they classify as 13 + 30 + 49 (re-derived here)", () => {
  assert.equal(C.held.length, 92, "the live count after 382 is 92 (batch2 SEC-9); the tree derivation reproduces it");
  assert.equal(C.design.length, 13);
  assert.equal(C.authOnly.length, 30);
  assert.equal(C.dead.length, 49);
  assert.equal(C.design.length + C.authOnly.length + C.dead.length, C.held.length);
});

test("the two out-of-band policies are in the out-of-band inventory and in AT1 as anon-applicable, zero-row policies", () => {
  const inv = readFileSync(join(HERE, "..", "..", "..", "docs", "inventories", "out-of-band-objects.md"), "utf8");
  const at1 = readFileSync(join(HERE, "..", "..", "..", "docs", "audits", "aud-at1-rls-grants-attacked-2026-10-08.md"), "utf8");
  for (const p of OUT_OF_BAND_ANON_POLICIES) {
    assert.ok(inv.includes(`\`${p.table}\` | \`${p.name}\` | SELECT`), `${p.table}.${p.name} is in the inventory`);
    const row = at1.split("\n").find((l) => l.startsWith(`T|${p.table}|`));
    assert.match(row, /\|anon:S=R0\/pp1,/, `AT1 probed ${p.table}: a policy applies to anon and answers zero rows`);
    assert.ok(C.authOnly.includes(p.table), `${p.table} is a kept authenticated-only grant`);
    assert.ok(!C.dead.includes(p.table) && !C.design.includes(p.table), p.table);
  }
});

test("the explicit arrays equal the classification derived from the tree", () => {
  assert.deepEqual(verify(RAW), []);
});

test("the by-design set is the tables whose policy an unauthenticated request can satisfy (published items and their child tables, public community groups)", () => {
  assert.deepEqual(C.design, [
    "community_groups", "community_posts", "community_thread_entities", "intelligence_changes", "intelligence_item_sections",
    "intelligence_items", "item_changelog", "item_cross_references", "item_disputes", "item_forward_events", "item_supersessions",
    "item_timelines", "obligations",
  ]);
});

test("every revoked relation has no policy that applies to anon or public, and every kept one has one", () => {
  for (const t of C.dead) assert.equal(C.adm(t).length, 0, t);
  for (const t of [...C.design, ...C.authOnly]) assert.ok(C.adm(t).length > 0, t);
});

test("no kept policy reads a revoked table in a subquery (a revoked table inside a policy predicate would turn the kept table's answer into 42501)", () => {
  const dead = new Set(C.dead);
  for (const t of [...C.design, ...C.authOnly]) {
    for (const p of C.adm(t)) {
      for (const d of dead) {
        assert.ok(!new RegExp(String.raw`\b${d}\b`).test(p.qual ?? ""), `${t}.${p.name} reads revoked ${d}`);
      }
    }
  }
});

test("the kept authenticated-only tables with a role-{public} policy are the follow-on (policy rewrite) set, and community_group_members is read by kept policies", () => {
  const reads = C.design.flatMap((t) => C.adm(t).filter(anonSatisfiable)).filter((p) => /\bcommunity_group_members\b/.test(p.qual ?? ""));
  assert.ok(reads.length >= 2, "community_posts and community_thread_entities subquery community_group_members");
  assert.ok(C.authOnly.includes("community_group_members"));
});

test("the five views carry no policy and are revoked (their base tables admit no anon read)", () => {
  const views = [...C.rel].filter(([, v]) => v.anon && v.kind !== "table").map(([k]) => k).sort();
  assert.deepEqual(views, ["census_rollup_by_surface", "derived_values_admissible", "emission_factor_candidates", "licence_clear_sources", "propagation_queue_depth"]);
  for (const v of views) assert.ok(C.dead.includes(v), v);
});

test("research_assessments_current (369), profiles (372) and the 382 set are not in the tree's anon grants", () => {
  for (const t of ["research_assessments_current", "profiles", "sources", "regions", "org_memberships", "organizations", "workspace_settings"]) {
    assert.ok(!C.held.includes(t), t);
  }
});

test("the header lists every one of the 92 tables with its policy or 'no anon policy'", () => {
  const head = RAW.split("\n").filter((l) => l.startsWith("--")).join("\n");
  for (const t of C.held) assert.ok(new RegExp(String.raw`\b${t}\b`).test(head), `${t} is not named in the header`);
  assert.ok((head.match(/no anon policy/g) || []).length >= C.dead.length);
});

test("self-check: dead tables refuse anon 42501, authenticated and the service role still read them; kept tables answer anon as classified; rolls back", () => {
  const sc = /DO \$sc\$[\s\S]*?\$sc\$/.exec(RAW);
  assert.ok(sc, "self-check block present");
  assert.match(sc[0], /sec9_expect\('B anon SELECT on '/);
  assert.match(sc[0], /'err:42501:permission denied for %'/);
  assert.match(sc[0], /sec9_expect\('B service_role SELECT on '/);
  assert.match(sc[0], /sec9_expect\('B control: authenticated SELECT on '/);
  assert.match(sc[0], /sec9_expect\('B anon SELECT on kept /);
  assert.match(sc[0], /sec9_expect_none\(/);
  assert.match(sc[0], /sec9_386_selfcheck_rollback/);
});

test("the attack in attacks.json asserts every anon SELECT grant on a public relation has an anon-or-public SELECT policy", () => {
  const atk = JSON.parse(readFileSync(join(HERE, "..", "..", "scripts", "proof", "attacks", "attacks.json"), "utf8")).attacks.find((x) => x.id === "sec9-anon-select-grants-have-an-anon-policy");
  assert.ok(atk, "attack present");
  const sqls = atk.steps.map((s) => s.sql ?? "").join("\n");
  assert.match(sqls, /has_table_privilege\('anon'/);
  assert.match(sqls, /pg_policies/);
  assert.match(sqls, /roles && ARRAY\['anon', 'public'\]/);
  const attacks = atk.steps.filter((s) => s.kind === "attack");
  assert.ok(attacks.length >= 3);
  const named = atk.steps.map((s) => s.sql ?? "").join(" ");
  for (const t of C.dead) assert.ok(named.includes(`'${t}'`), `the dead-table attack names ${t}`);
});

test("no section-sign or dash glyph, no user-home path, no JWT literal in the new file", () => {
  const banned = [0xa7, 0x2013, 0x2014].map((c) => String.fromCharCode(c));
  for (const g of banned) assert.ok(!RAW.includes(g), `glyph U+${g.charCodeAt(0).toString(16)} present`);
  assert.doesNotMatch(RAW, /C:\\Users|\/Users\/|\/home\//i);
  assert.doesNotMatch(RAW, /eyJ[A-Za-z0-9_-]{10,}/);
});

// ---- red: the checker is red against the defects it exists to catch -----------------------------------------------------

test("red: dropping a table from the dead array, adding an unknown one, or moving one to kept is reported", () => {
  const dropOne = RAW.replace(/\n\s*'admin_action_cooldowns',/, "");
  assert.ok(verify(dropOne).some((b) => /dead array differs/.test(b)), "dropped");
  const addOne = RAW.replace(/(v_dead text\[\] := ARRAY\[)/, "$1\n    'not_a_table',");
  assert.ok(verify(addOne).some((b) => /dead array differs/.test(b)), "extra");
  const moved = RAW.replace(/\n\s*'intelligence_items',/, "").replace(/(v_dead text\[\] := ARRAY\[)/, "$1\n    'intelligence_items',");
  assert.ok(verify(moved).length > 0, "moved a by-design table to the revoke list");
});

test("red: a new anon grant on a table with no policy, or a new policy on a revoked table, changes the classification (synthetic tree)", () => {
  const fake = { ...C, held: [...C.held, "brand_new"], dead: [...C.dead, "brand_new"], design: C.design, authOnly: C.authOnly };
  assert.ok(verify(RAW, fake).some((b) => /dead array differs/.test(b)), "a new ungoverned grant is reported");
  const fake2 = { ...C, dead: C.dead.filter((x) => x !== "raw_fetches"), authOnly: [...C.authOnly, "raw_fetches"] };
  assert.ok(verify(RAW, fake2).length > 0, "a dead table reclassified as governed is reported");
});

test("red: the grant-state parser follows REVOKE, GRANT, DROP and RENAME (synthetic migration tree on disk)", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const d = mkdtempSync(join(tmpdir(), "sec9-"));
  try {
    writeFileSync(join(d, "001_a.sql"), "CREATE TABLE public.t1 (id int); CREATE TABLE public.t2 (id int); CREATE TABLE public.t3 (id int); CREATE VIEW public.v1 AS SELECT 1;");
    writeFileSync(join(d, "002_b.sql"), "REVOKE SELECT ON public.t1 FROM anon; REVOKE ALL ON TABLE public.t2 FROM PUBLIC, anon; GRANT SELECT ON public.t2 TO anon;\nALTER TABLE public.t3 RENAME TO t4; DROP VIEW public.v1; REVOKE SELECT (id) ON public.t4 FROM anon;");
    const rel = anonSelectState(d, 99);
    assert.deepEqual([...rel].map(([k, v]) => `${k}:${v.anon}`).sort(), ["t1:false", "t2:true", "t4:true"]);
  } finally { rmSync(d, { recursive: true }); }
});

test("red: a SELECT-capable policy that names only authenticated does not count as an anon policy", () => {
  const dummy = { table: "x", cmd: "SELECT", roles: ["authenticated"], qual: "true" };
  assert.equal(isAnonRead(dummy), false);
  assert.equal(isAnonRead({ ...dummy, roles: ["public"] }), true);
  assert.equal(isAnonRead({ ...dummy, roles: ["anon", "authenticated"] }), true);
  assert.equal(isAnonRead({ ...dummy, cmd: "INSERT", roles: ["public"] }), false);
  assert.equal(anonSatisfiable({ qual: "user_id = auth.uid()" }), false);
  assert.equal(anonSatisfiable({ qual: "privacy = 'public' OR user_is_group_member(id, auth.uid())" }), true);
  assert.equal(anonSatisfiable({ qual: "EXISTS (SELECT 1 FROM public.intelligence_items i WHERE i.id = x.item_id)" }), true);
});
