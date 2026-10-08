// 358_workspace_item_notes.test.mjs -- static proof of migration 358 (lane S8-A) by parsing the SQL file: no database,
// no SQL parser dependency (same convention as 353's and 356's tests). The ATTACKS (an outsider reads nothing and
// cannot insert, a second member cannot edit the author's note, a plain member cannot soft delete, the author can edit)
// run in the migration's own self-check at apply time on live rows inside a rolled-back subtransaction; the
// handler-level attacks run against a fake database in src/lib/workspace/item-collab.test.mjs. This file proves the SQL
// carries each rule and each attack.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAW = readFileSync(fileURLToPath(new URL("./358_workspace_item_notes.sql", import.meta.url)), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const policy = (name) => new RegExp(`CREATE POLICY ${name} ON public\\.item_notes([\\s\\S]*?);\\n\\n`).exec(SQL)?.[1] ?? "";

test("header: subject line, NOT APPLIED, external data only (ADR-042, ADR-043), two-track data move", () => {
  assert.match(RAW, /^-- subject: Migration 358 /);
  assert.match(RAW, /NOT APPLIED/);
  assert.match(RAW, /ADR-042, ADR-043/);
  assert.match(RAW, /two-track/);
});

test("item_notes has the stated columns; org_id and item_id cascade; body is non-blank and capped", () => {
  const body = /CREATE TABLE IF NOT EXISTS public\.item_notes \(([\s\S]*?)\n\);/.exec(SQL)[1];
  for (const col of ["id", "org_id", "item_id", "author_user_id", "body", "created_at", "edited_at", "deleted_at", "legacy_override_id"]) {
    assert.match(body, new RegExp(`\\b${col}\\b`));
  }
  assert.match(body, /org_id\s+uuid\s+NOT NULL REFERENCES public\.organizations\(id\) ON DELETE CASCADE/);
  assert.match(body, /item_id\s+uuid\s+NOT NULL REFERENCES public\.intelligence_items\(id\) ON DELETE CASCADE/);
  assert.match(body, /author_user_id\s+uuid\s+REFERENCES public\.profiles\(id\) ON DELETE SET NULL/);
  assert.match(body, /btrim\(body\) <> '' AND char_length\(body\) <= 20000/);
  assert.match(body, /legacy_override_id\s+uuid\s+UNIQUE REFERENCES public\.workspace_item_overrides\(id\)/);
});

test("RLS is on; anon has nothing; authenticated cannot DELETE; there is no DELETE policy", () => {
  assert.match(SQL, /ALTER TABLE public\.item_notes ENABLE ROW LEVEL SECURITY/);
  assert.match(SQL, /REVOKE ALL ON public\.item_notes FROM anon/);
  assert.match(SQL, /REVOKE DELETE ON public\.item_notes FROM authenticated/);
  assert.doesNotMatch(SQL, /CREATE POLICY \w+ ON public\.item_notes\s+FOR DELETE/);
});

test("read is org members only (user_belongs_to_org), never open; insert is as yourself, role-gated, undeleted", () => {
  const read = policy("item_notes_read_org");
  assert.match(read, /FOR SELECT/);
  assert.match(read, /public\.user_belongs_to_org\(org_id\)/);
  assert.doesNotMatch(read, /USING \(true\)/);
  const ins = policy("item_notes_insert_member");
  assert.match(ins, /FOR INSERT/);
  assert.match(ins, /author_user_id = auth\.uid\(\)/);
  assert.match(ins, /deleted_at IS NULL/);
  assert.match(ins, /m\.org_id = item_notes\.org_id/, "the role check ties back to the row's own org (F64)");
  assert.match(ins, /m\.role IN \('owner', 'admin', 'member'\)/, "a viewer cannot write");
});

test("update reaches the author and an owner or admin of THIS org only; the admin check ties back to the row's org", () => {
  const upd = policy("item_notes_update_author_or_admin");
  assert.match(upd, /FOR UPDATE/);
  assert.match(upd, /USING \([\s\S]*WITH CHECK \(/);
  assert.match(upd, /author_user_id = auth\.uid\(\)/);
  assert.match(upd, /m\.org_id = item_notes\.org_id/);
  assert.match(upd, /m\.role IN \('owner', 'admin'\)/);
});

test("the guard trigger: author-only body edit, admin-only soft delete, identity columns immutable, deleted is final", () => {
  assert.match(SQL, /CREATE TRIGGER item_notes_guard_trg\s+BEFORE UPDATE ON public\.item_notes/);
  const f = /CREATE OR REPLACE FUNCTION public\.item_notes_guard\(\)([\s\S]*?)\n\$fn\$;/.exec(SQL)[1];
  assert.match(f, /auth\.role\(\) = 'service_role' OR auth\.uid\(\) IS NULL/, "trusted contexts pass; the routes enforce the same rules in code");
  assert.match(f, /NEW\.org_id IS DISTINCT FROM OLD\.org_id/);
  assert.match(f, /NEW\.author_user_id IS DISTINCT FROM OLD\.author_user_id/);
  assert.match(f, /OLD\.deleted_at IS NOT NULL/);
  assert.match(f, /OLD\.author_user_id IS NULL OR OLD\.author_user_id <> auth\.uid\(\)/);
  assert.match(f, /NEW\.edited_at := now\(\)/);
  assert.match(f, /m\.role IN \('owner', 'admin'\)/);
  assert.equal((f.match(/ERRCODE = '42501'/g) ?? []).length, 4, "every refusal is insufficient_privilege");
});

test("the data move is an idempotent, service-role-only function that never truncates and never deletes the source", () => {
  const f = /CREATE OR REPLACE FUNCTION public\.move_override_notes_to_item_notes\(\)([\s\S]*?)\n\$fn\$;/.exec(SQL)[1];
  assert.match(f, /FROM public\.workspace_item_overrides o/);
  assert.match(f, /btrim\(o\.notes\) <> ''/);
  assert.match(f, /char_length\(btrim\(o\.notes\)\) <= 20000/);
  assert.match(f, /ON CONFLICT \(legacy_override_id\) DO NOTHING/);
  assert.doesNotMatch(f, /\bDELETE\b|\bUPDATE\b|\bleft\(/i);
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.move_override_notes_to_item_notes\(\) FROM PUBLIC/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.move_override_notes_to_item_notes\(\) TO service_role/);
  assert.doesNotMatch(SQL, /SELECT public\.move_override_notes_to_item_notes\(\);/, "the function is staged, never run by the migration");
});

test("the self-check attacks on live rows (no fabricated fixture), under each role, and always rolls back", () => {
  const chk = /DO \$check\$([\s\S]*?)\$check\$;/.exec(SQL)[1];
  assert.match(chk, /FROM public\.org_memberships m/);
  assert.match(chk, /FROM public\.profiles p\s+WHERE NOT EXISTS/);
  assert.doesNotMatch(chk, /gen_random_uuid\(\)/, "no fabricated user or org id (migration 311's unappliable proof)");
  assert.equal((chk.match(/SET LOCAL ROLE authenticated/g) ?? []).length, 3, "outsider, second member, author");
  assert.match(chk, /request\.jwt\.claims/);
  for (const attack of ["a caller outside the org read", "a caller outside the org inserted", "a second member edited", "the author could not edit", "a plain member soft deleted"]) {
    assert.ok(chk.includes(attack), `attack present: ${attack}`);
  }
  assert.match(chk, /item_notes self-check passed \(rolled back\)/);
  assert.match(chk, /EXCEPTION WHEN raise_exception THEN\s+IF SQLERRM <> 'item_notes self-check passed \(rolled back\)' THEN\s+RAISE;/);
  assert.match(chk, /RAISE NOTICE 'migration 358 self-check SKIPPED/);
});

test("one transaction, and no dash or section-sign glyph in the file (rule 022)", () => {
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /COMMIT;\s*$/);
  assert.doesNotMatch(RAW, new RegExp(`[${String.fromCharCode(0x2013, 0x2014, 0xa7)}]`));
});
