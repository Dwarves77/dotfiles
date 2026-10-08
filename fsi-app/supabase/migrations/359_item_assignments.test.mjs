// 359_item_assignments.test.mjs -- static proof of migration 359 (lane S8-A) by parsing the SQL file: no database, no SQL
// parser dependency (same convention as 358's and 356's tests). The ATTACKS run in the migration's own self-check at
// apply time on live rows inside a rolled-back subtransaction; the handler-level attacks run against a fake database in
// src/lib/workspace/item-collab.test.mjs. This file proves the SQL carries each rule and each attack.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { headerProblems } from "./_lib/applied-status.mjs";

const RAW = readFileSync(fileURLToPath(new URL("./359_item_assignments.sql", import.meta.url)), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const policy = (name) => new RegExp(`CREATE POLICY ${name} ON public\\.item_assignments([\\s\\S]*?);\\n\\n`).exec(SQL)?.[1] ?? "";

test("header: subject line, applied status as the map says, external data only (ADR-042, ADR-043)", () => {
  assert.match(RAW, /^-- subject: Migration 359 /);
  assert.deepEqual(headerProblems(RAW, "359_item_assignments.sql"), []);
  assert.match(RAW, /ADR-042, ADR-043/);
});

test("item_assignments has the stated columns, state is open or done, one row per org, item and assignee", () => {
  const body = /CREATE TABLE IF NOT EXISTS public\.item_assignments \(([\s\S]*?)\n\);/.exec(SQL)[1];
  for (const col of ["org_id", "item_id", "assignee_user_id", "assigned_by", "due_on", "state", "created_at"]) {
    assert.match(body, new RegExp(`\\b${col}\\b`));
  }
  assert.match(body, /due_on\s+date,/, "the due date is nullable");
  assert.match(body, /state\s+text\s+NOT NULL DEFAULT 'open' CHECK \(state IN \('open', 'done'\)\)/);
  assert.match(body, /UNIQUE \(org_id, item_id, assignee_user_id\)/);
  assert.match(body, /org_id\s+uuid\s+NOT NULL REFERENCES public\.organizations\(id\) ON DELETE CASCADE/);
  assert.match(body, /assignee_user_id\s+uuid\s+NOT NULL REFERENCES public\.profiles\(id\) ON DELETE CASCADE/);
});

test("RLS is on; anon has nothing; read is org members only", () => {
  assert.match(SQL, /ALTER TABLE public\.item_assignments ENABLE ROW LEVEL SECURITY/);
  assert.match(SQL, /REVOKE ALL ON public\.item_assignments FROM anon/);
  const read = policy("item_assignments_read_org");
  assert.match(read, /FOR SELECT/);
  assert.match(read, /public\.user_belongs_to_org\(org_id\)/);
  assert.doesNotMatch(read, /USING \(true\)/);
});

test("insert: as yourself, role-gated, and the assignee must be a member of the SAME org", () => {
  const ins = policy("item_assignments_insert_member");
  assert.match(ins, /FOR INSERT/);
  assert.match(ins, /assigned_by = auth\.uid\(\)/);
  assert.match(ins, /m\.org_id = item_assignments\.org_id/);
  assert.match(ins, /m\.role IN \('owner', 'admin', 'member'\)/, "a viewer cannot assign");
  assert.match(ins, /a\.user_id = item_assignments\.assignee_user_id/);
  assert.match(ins, /a\.org_id = item_assignments\.org_id/, "the assignee's membership is checked in the row's own org");
  assert.match(ins, /a\.role IN \('owner', 'admin', 'member'\)/, "a viewer is not assignable");
});

test("update and delete reach the assignee, the assigner, or an owner or admin of THIS org", () => {
  for (const name of ["item_assignments_update_party", "item_assignments_delete_party"]) {
    const p = policy(name);
    assert.match(p, /assignee_user_id = auth\.uid\(\) OR assigned_by = auth\.uid\(\)/, name);
    assert.match(p, /m\.org_id = item_assignments\.org_id/, `${name}: admin check ties back to the row's org (F64)`);
    assert.match(p, /m\.role IN \('owner', 'admin'\)/, name);
  }
  assert.match(policy("item_assignments_update_party"), /USING \([\s\S]*WITH CHECK \(/);
});

test("the guard trigger lets an authenticated caller change state and nothing else", () => {
  assert.match(SQL, /CREATE TRIGGER item_assignments_guard_trg\s+BEFORE UPDATE ON public\.item_assignments/);
  const f = /CREATE OR REPLACE FUNCTION public\.item_assignments_guard\(\)([\s\S]*?)\n\$fn\$;/.exec(SQL)[1];
  assert.match(f, /auth\.role\(\) = 'service_role' OR auth\.uid\(\) IS NULL/);
  for (const col of ["org_id", "item_id", "assignee_user_id", "assigned_by", "due_on", "created_at"]) {
    assert.match(f, new RegExp(`NEW\\.${col} IS DISTINCT FROM OLD\\.${col}`));
  }
  assert.match(f, /ERRCODE = '42501'/);
});

test("notifications.kind accepts assignment and keeps every earlier value", () => {
  assert.match(SQL, /DROP CONSTRAINT IF EXISTS notifications_kind_check/);
  const add = /ADD CONSTRAINT notifications_kind_check\s+CHECK \(kind = ANY \(ARRAY\[([^\]]*)\]\)\)/.exec(SQL)[1];
  const kinds = [...add.matchAll(/'(\w+)'::text/g)].map((m) => m[1]);
  assert.deepEqual(kinds, ["mention", "reply", "promote", "invite", "moderation", "archive", "assignment"]);
});

test("the self-check attacks on live rows (no fabricated fixture), under each role, and always rolls back", () => {
  const chk = /DO \$check\$([\s\S]*?)\$check\$;/.exec(SQL)[1];
  assert.match(chk, /FROM public\.org_memberships m/);
  assert.match(chk, /FROM public\.profiles p\s+WHERE NOT EXISTS/);
  assert.doesNotMatch(chk, /gen_random_uuid\(\)/);
  assert.equal((chk.match(/SET LOCAL ROLE authenticated/g) ?? []).length, 4, "outsider, viewer assignee, assignee, bystander");
  for (const attack of ["a caller outside the org read", "a caller outside the org inserted", "a viewer was assigned", "the assignee could not mark", "the due date was changed", "a bystander member changed"]) {
    assert.ok(chk.includes(attack), `attack present: ${attack}`);
  }
  assert.match(chk, /item_assignments self-check passed \(rolled back\)/);
  assert.match(chk, /EXCEPTION WHEN raise_exception THEN\s+IF SQLERRM <> 'item_assignments self-check passed \(rolled back\)' THEN\s+RAISE;/);
  assert.match(chk, /RAISE NOTICE 'migration 359 self-check SKIPPED/);
});

test("one transaction, and no dash or section-sign glyph in the file (rule 022)", () => {
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /COMMIT;\s*$/);
  assert.doesNotMatch(RAW, new RegExp(`[${String.fromCharCode(0x2013, 0x2014, 0xa7)}]`));
});
