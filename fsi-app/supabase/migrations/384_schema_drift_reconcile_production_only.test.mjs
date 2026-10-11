// 384_schema_drift_reconcile_production_only.test.mjs -- static proof of migration 384 (lane DRIFT-1) by parsing the SQL file and the
// files it cites: no database, no SQL parser dependency. The behavioural proof is the migration's own self-check plus the migration-proof
// job on the PR, which applies the file TWICE on a local stack (the second apply must change nothing). This file proves the file says
// what the lane report says, that every statement is guarded (a no-op on production by construction), that the object lists equal what
// the oracle reported in chain proof fire 9, and that the three policy definitions equal what migrations 259 and 381 set on production.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { headerProblems } from "./_lib/applied-status.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FILE = "384_schema_drift_reconcile_production_only.sql";
const RAW = readFileSync(join(HERE, FILE), "utf8");
const strip = (raw) => raw.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const SQL = strip(RAW);

// The eleven tables fire 9 reported as differing on the table's flags (replay-schema-diff.json, categories.tables.names_changed).
const ORACLE_TABLES = ["agent_run_searches", "gate_a_health_cache", "institutions", "intelligence_item_citations", "intelligence_summaries",
  "item_type_required_slots", "section_claim_provenance", "sector_contexts", "source_bias_tags", "system_state", "system_state_flag_audit"];
const CONSTRAINTS = ["intelligence_changes.intelligence_changes_item_id_fkey", "intelligence_changes.intelligence_changes_change_severity_check",
  "intelligence_changes.intelligence_changes_change_type_check", "intelligence_summaries.intelligence_summaries_item_id_fkey",
  "intelligence_summaries.intelligence_summaries_item_id_sector_key"];
const POLICIES = ["summaries_read_authenticated", "summaries_write_service", "summaries_update_service"];

const treeSql = () => readdirSync(HERE).filter((f) => /^\d+_.*\.sql$/.test(f)).sort().map((f) => [f, readFileSync(join(HERE, f), "utf8")]);

/** Everything that can be wrong with a 384 text; [] when nothing is. */
export function verify(raw) {
  const bad = [];
  const sql = strip(raw);
  if (/\b(INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|TRUNCATE|DROP\s+(TABLE|COLUMN|POLICY|CONSTRAINT|INDEX|FUNCTION)|DISABLE\s+ROW)\b/i.test(sql)) bad.push("a data or destructive statement");
  const adds = (sql.match(/\bADD CONSTRAINT\b/g) ?? []).length;
  const conGuards = (sql.match(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint /g) ?? []).length;
  if (adds !== conGuards) bad.push(`ADD CONSTRAINT ${adds} but pg_constraint guards ${conGuards}`);
  const pols = (sql.match(/\bCREATE POLICY\b/g) ?? []).length;
  const polGuards = (sql.match(/IF NOT EXISTS \(SELECT 1 FROM pg_policies /g) ?? []).length;
  if (pols !== polGuards) bad.push(`CREATE POLICY ${pols} but pg_policies guards ${polGuards}`);
  if (!/REVOKE EXECUTE ON FUNCTION public\.gate_a_health\(\) FROM PUBLIC;/.test(sql) || !/IF to_regprocedure\('public\.gate_a_health\(\)'\) IS NOT NULL THEN\s+REVOKE/.test(sql)) bad.push("the gate_a_health revoke is missing or unguarded");
  if (!/^BEGIN;$/m.test(sql) || !/^COMMIT;$/m.test(sql)) bad.push("not one transaction");
  if (!/DO \$check\$/.test(sql)) bad.push("no self-check");
  return bad;
}

test("header: a subject line, NOT APPLIED, and the header agrees with the applied-status record", () => {
  assert.match(RAW, /^-- subject: Migration 384 /);
  assert.deepEqual(headerProblems(RAW, FILE), []);
  assert.match(RAW, /CHANGES NOTHING ON PRODUCTION BY CONSTRUCTION/);
  for (const owed of ["changes_read_authenticated", "changes_write_service", "sector_contexts_read_authenticated", "sector_contexts_write_service", "urgency_score_check"]) {
    assert.ok(RAW.includes(owed), `the owed object ${owed} is named in the header`);
  }
});

test("the file passes its own verifier (every statement guarded, no data or destructive statement, one transaction, a self-check)", () => {
  assert.deepEqual(verify(RAW), []);
});

test("ATTACK: the verifier is red against an unguarded constraint, an unguarded policy, a delete, and a missing self-check", () => {
  const unguardedCon = RAW.replace("IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.intelligence_changes'::regclass AND conname = 'intelligence_changes_item_id_fkey') THEN", "IF true THEN");
  assert.match(verify(unguardedCon).join(";"), /pg_constraint guards/);
  const unguardedPol = RAW.replace("IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'intelligence_summaries' AND policyname = 'summaries_write_service') THEN", "IF true THEN");
  assert.match(verify(unguardedPol).join(";"), /pg_policies guards/);
  assert.match(verify(RAW.replace("COMMIT;", "DELETE FROM public.system_state;\nCOMMIT;")).join(";"), /destructive/);
  assert.match(verify(RAW.replace("DO $check$", "DO $other$")).join(";"), /self-check/);
});

test("the eleven RLS tables are exactly the eleven the oracle reported, and each is created by a migration file of the tree", () => {
  const m = /FOREACH v_tbl IN ARRAY ARRAY\[([^\]]+)\]/.exec(SQL);
  const listed = [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]);
  assert.deepEqual([...listed].sort(), [...ORACLE_TABLES].sort());
  const tree = treeSql();
  for (const t of ORACLE_TABLES) {
    const re = new RegExp(`CREATE TABLE (IF NOT EXISTS )?(public\\.)?${t}\\b`, "i");
    assert.ok(tree.some(([, text]) => re.test(text)), `${t} is created by a migration file`);
  }
  assert.match(SQL, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(SQL, /FORCE ROW LEVEL SECURITY/, "production has no table with FORCE (AUD-AT-1 section 0)");
});

test("the five constraints are the five production names, the foreign keys cascade, and the check lists equal the live-derived inventory", () => {
  const found = [...SQL.matchAll(/ALTER TABLE public\.(\w+) ADD CONSTRAINT (\w+)/g)].map((m) => `${m[1]}.${m[2]}`);
  assert.deepEqual(found, CONSTRAINTS);
  assert.equal((SQL.match(/FOREIGN KEY \(item_id\) REFERENCES public\.intelligence_items\(id\) ON DELETE CASCADE/g) ?? []).length, 2);
  assert.match(SQL, /UNIQUE \(item_id, sector\)/);
  const inv = JSON.parse(readFileSync(join(HERE, "..", "..", "docs", "inventories", "db-check-constraints.json"), "utf8"));
  const rows = (inv.constraints ?? inv).filter((r) => r.table === "intelligence_changes");
  for (const [con, col] of [["intelligence_changes_change_severity_check", "change_severity"], ["intelligence_changes_change_type_check", "change_type"]]) {
    const allowed = rows.find((r) => r.constraint === con)?.allowed;
    assert.ok(allowed?.length, `${con} is in the live-derived inventory`);
    const m = new RegExp(`CHECK \\(${col} IN \\(([^)]+)\\)\\)`).exec(SQL);
    assert.deepEqual([...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]), allowed, `${con} lists the inventory's values in its order`);
  }
});

test("the three policies equal what 259 and 381 set on production: predicates from 259's ALTER POLICY, roles from 381 part 2", () => {
  const norm = (s) => s.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
  const m259 = strip(readFileSync(join(HERE, "259_rls_initplan_and_policy_destack.sql"), "utf8"));
  const alter = (name) => norm(new RegExp(`ALTER POLICY ${name} ON public\\.intelligence_summaries (?:USING|WITH CHECK) (\\(.*?\\));`).exec(m259)?.[1] ?? "");
  const create = (name) => norm(new RegExp(`CREATE POLICY ${name} ON public\\.intelligence_summaries FOR \\w+ TO [\\w, ]+?\\s+(?:USING|WITH CHECK) (\\(.*?\\));`, "s").exec(SQL)?.[1] ?? "");
  const unwrap = (p) => p.replace(/^\((.*)\)$/, "$1").replace(/\(\(SELECT /g, "((select ").replace(/\(SELECT /g, "(select ");
  for (const name of POLICIES) {
    const a = alter(name);
    const c = create(name);
    assert.ok(a && c, `${name} found in 259 and 384`);
    const canon = (p) => p.toLowerCase().replace(/[()\s]/g, "");
    assert.equal(canon(c), canon(a), `${name} predicate equals migration 259's`);
    assert.ok(unwrap(c).length > 0);
  }
  assert.match(SQL, /sector_contexts_read_authenticated ON public\.sector_contexts FOR SELECT TO public\s+USING \(\(\(SELECT auth\.role\(\)\) = 'authenticated'\) OR \(\(SELECT auth\.role\(\)\) = 'service_role'\)\)/);
  assert.match(SQL, /AND tablename = 'sector_contexts' AND policyname = 'sector_contexts_read_authenticated'/, "guarded");
  assert.match(RAW, /AUD-AT-1 line 195/);
  assert.match(SQL, /summaries_read_authenticated ON public\.intelligence_summaries FOR SELECT TO public/);
  assert.match(SQL, /summaries_write_service ON public\.intelligence_summaries FOR INSERT TO authenticated, service_role/);
  assert.match(SQL, /summaries_update_service ON public\.intelligence_summaries FOR UPDATE TO authenticated, service_role/);
  const m381 = readFileSync(join(HERE, "381_write_policies_name_their_role.sql"), "utf8");
  assert.match(m381, /'intelligence_summaries\.summaries_write_service'/);
  assert.match(m381, /'intelligence_summaries\.summaries_update_service'/);
  assert.match(m381, /ALTER POLICY %I ON public\.%I TO authenticated, service_role/);
});

test("the self-check reads the catalog for every object it creates and names each miss", () => {
  for (const needle of ["relrowsecurity", "pg_constraint", "pg_policies", "aclexplode", "a.grantee = 0", "row level security is still off on", "constraint(s) missing", "policy(ies) missing", "still grants EXECUTE to PUBLIC"]) {
    assert.ok(SQL.includes(needle), needle);
  }
});
