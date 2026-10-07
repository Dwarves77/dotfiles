// 356_item_corrections.test.mjs -- static proof of migration 356 (lane G7-CORR) by parsing the SQL file: no
// database, no SQL parser dependency (same convention as 353's test). The ATTACKS (a correction surviving a
// regeneration write for each target_kind, a revoke letting the next write stand, a non-verbatim span refused,
// a tombstoned edge not re-created, the append-only guard) run in the migration's own self-check at apply time
// inside a rolled-back transaction; this file proves the file carries each of them and the wiring they exercise.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAW = readFileSync(fileURLToPath(new URL("./356_item_corrections.sql", import.meta.url)), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const fn = (name) => new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(([\\s\\S]*?)\\n\\$fn\\$;`).exec(SQL)?.[0] ?? "";

test("header: subject line, NOT APPLIED, the database preserves corrections", () => {
  assert.match(RAW, /^-- subject: Migration 356 /);
  assert.match(RAW, /NOT APPLIED/);
  assert.match(RAW, /DATABASE preserves corrections/);
});

test("item_corrections has the stated columns, reason and created_by NOT NULL, and the kind/op matrix CHECK", () => {
  const body = /CREATE TABLE IF NOT EXISTS public\.item_corrections \(([\s\S]*?)\n\);/.exec(SQL)[1];
  for (const col of ["id", "item_id", "target_kind", "target_ref", "op", "value", "machine_value", "reason", "created_by", "created_at", "revoked_at", "revoked_by"]) {
    assert.match(body, new RegExp(`\\b${col}\\b`));
  }
  assert.match(body, /reason\s+text\s+NOT NULL CHECK \(btrim\(reason\) <> ''\)/);
  assert.match(body, /created_by\s+uuid\s+NOT NULL/);
  assert.match(body, /target_kind IN \('fact', 'tag', 'connection', 'section_text', 'full_brief'\)/);
  assert.match(body, /target_kind = 'fact'\s+AND op IN \('suppress', 'replace'\)/);
  assert.match(body, /target_kind = 'tag'\s+AND op IN \('add', 'remove'\)/);
  assert.match(body, /target_kind = 'connection'\s+AND op IN \('add', 'remove'\)/);
  assert.match(body, /target_kind = 'section_text' AND op = 'replace'/);
  assert.match(body, /target_kind = 'full_brief'\s+AND op = 'replace'/);
});

test("append-only: BEFORE UPDATE OR DELETE trigger; only revoked_* may change; DELETE and re-revoke refused", () => {
  assert.match(SQL, /CREATE TRIGGER item_corrections_append_only_trg\s+BEFORE UPDATE OR DELETE ON public\.item_corrections/);
  const f = fn("item_corrections_append_only");
  assert.match(f, /TG_OP = 'DELETE'/);
  assert.match(f, /OLD\.revoked_at IS NOT NULL/);
  assert.match(f, /to_jsonb\(NEW\) - 'revoked_at' - 'revoked_by' - 'revoked_reason'/);
});

test("latest active wins: item_corrections_latest takes DISTINCT ON target_ref, newest first, active only", () => {
  const f = fn("item_corrections_latest");
  assert.match(f, /DISTINCT ON \(c\.target_ref\)/);
  assert.match(f, /c\.revoked_at IS NULL/);
  assert.match(f, /ORDER BY c\.target_ref, c\.created_at DESC, c\.id DESC/);
});

test("preservation is a database trigger per table, firing last (zz_ prefix), all calling the ONE apply function", () => {
  assert.match(SQL, /CREATE TRIGGER zz_item_corrections_apply_items_trg\s+BEFORE INSERT OR UPDATE ON public\.intelligence_items/);
  assert.match(SQL, /CREATE TRIGGER zz_item_corrections_apply_sections_trg\s+BEFORE INSERT OR UPDATE ON public\.intelligence_item_sections/);
  assert.match(SQL, /CREATE TRIGGER zz_item_corrections_apply_claims_trg\s+BEFORE INSERT OR UPDATE ON public\.section_claim_provenance/);
  for (const name of ["item_corrections_apply_items", "item_corrections_apply_sections", "item_corrections_apply_claims"]) {
    const f = fn(name);
    assert.match(f, /public\.item_corrections_patch\(/, `${name} must call the one apply function`);
    assert.match(f, /jsonb_populate_record\(NEW, v_patch\)/);
  }
  assert.equal((SQL.match(/CREATE OR REPLACE FUNCTION public\.item_corrections_patch\(/g) ?? []).length, 1, "exactly one apply rule");
});

test("the apply function covers every writable kind: tag add and remove, full_brief, section_text, fact replace", () => {
  const f = fn("item_corrections_patch");
  assert.match(f, /p_table = 'intelligence_items'/);
  assert.match(f, /item_corrections_latest\(p_item_id, 'tag'\)/);
  assert.match(f, /c\.op = 'remove'[\s\S]*array_remove\(v_new, v_tag\)/);
  assert.match(f, /c\.op = 'add'[\s\S]*v_new \|\| v_tag/);
  assert.match(f, /item_corrections_latest\(p_item_id, 'full_brief'\)/);
  assert.match(f, /p_table = 'intelligence_item_sections'[\s\S]*item_corrections_latest\(p_item_id, 'section_text'\)/);
  assert.match(f, /p_table = 'section_claim_provenance'[\s\S]*item_corrections_latest\(p_item_id, 'fact'\)/);
  assert.match(f, /target_ref = \(p_row ->> 'id'\)\s+OR \(machine_value ->> 'claim_text'\) = \(p_row ->> 'claim_text'\)/, "a claim matches by id OR original machine text");
  assert.match(f, /item_corrections_note\(/, "the machine value a writer tried to store is recorded");
});

test("a fact replace is checked against ADR-016 at insert (verbatim span in a held capture) and by the validator itself", () => {
  const span = fn("item_corrections_span_is_verbatim");
  assert.match(span, /position\(lower\(btrim\(p_span\)\) IN lower\(ars\.result_content\)\) > 0/);
  assert.match(span, /ars\.intelligence_item_id = p_item_id/);
  const before = fn("item_corrections_before_insert");
  assert.match(before, /correction_fact_span_not_verbatim/);
  assert.match(before, /item_corrections_span_is_verbatim\(NEW\.item_id, v_sr, v_span\)/);
  const create = fn("create_item_correction");
  assert.match(create, /public\.validate_item_provenance\(p_item_id\)/);
  assert.match(create, /fact_missing_source_span', 'fact_span_not_in_source'/);
  assert.match(create, /RAISE EXCEPTION 'correction_fact_failed_validation/);
});

test("a fact suppress never deletes: no DELETE on section_claim_provenance anywhere in the migration", () => {
  assert.doesNotMatch(SQL, /DELETE\s+FROM\s+public\.section_claim_provenance/i);
  assert.doesNotMatch(SQL, /UPDATE\s+public\.sources/i);
});

test("connections: remove deletes the pair and tombstones it; add writes both directed manual rows with a basis", () => {
  assert.match(SQL, /CREATE TRIGGER item_corrections_block_tombstoned_edge_trg\s+BEFORE INSERT ON public\.item_cross_references/);
  const block = fn("item_corrections_block_tombstoned_edge");
  assert.match(block, /NEW\.origin IS DISTINCT FROM 'manual'/);
  assert.match(block, /RETURN NULL/);
  const create = fn("create_item_correction");
  assert.match(create, /DELETE FROM public\.item_cross_references/);
  assert.match(create, /VALUES \(p_item_id, v_target\), \(v_target, p_item_id\)/);
  assert.match(create, /'manual'/);
  assert.match(create, /'admin_correction'/);
  const pair = fn("item_corrections_pair_tombstoned");
  assert.match(pair, /ORDER BY c\.created_at DESC, c\.id DESC\s+LIMIT 1/);
});

test("create applies the correction now by touching the target row at top level (so every other trigger fires)", () => {
  const create = fn("create_item_correction");
  assert.match(create, /UPDATE public\.intelligence_items SET topic_tags = topic_tags/);
  assert.match(create, /UPDATE public\.intelligence_items SET full_brief = full_brief/);
  assert.match(create, /UPDATE public\.intelligence_item_sections SET content_md = content_md/);
  assert.match(create, /UPDATE public\.section_claim_provenance SET claim_text = claim_text/);
});

test("created_by is a required parameter (the route fills it from the session); reason is mandatory in the function and the table", () => {
  const create = fn("create_item_correction");
  assert.match(create, /p_created_by\s+uuid/);
  assert.match(create, /correction_actor_required/);
  assert.match(create, /correction_reason_required/);
});

test("security: RLS on both tables, one admin SELECT policy, no write policy, functions granted to service_role only", () => {
  assert.match(SQL, /ALTER TABLE public\.item_corrections ENABLE ROW LEVEL SECURITY/);
  assert.match(SQL, /ALTER TABLE public\.item_correction_evidence ENABLE ROW LEVEL SECURITY/);
  assert.match(SQL, /CREATE POLICY item_corrections_admin_read ON public\.item_corrections\s+FOR SELECT TO authenticated/);
  assert.match(SQL, /p\.is_platform_admin = true/);
  assert.doesNotMatch(SQL, /CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/);
  assert.match(SQL, /REVOKE INSERT, UPDATE, DELETE ON public\.item_corrections FROM anon, authenticated/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.create_item_correction\([^)]*\) TO service_role/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.revoke_item_correction\([^)]*\) TO service_role/);
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.create_item_correction\([^)]*\) FROM PUBLIC, anon, authenticated/);
});

test("the self-check attacks each target_kind, the revoke, the span refusal, the tombstone and the append-only guard, then rolls back", () => {
  for (const msg of [
    "a tag add did not survive a machine write that omitted it",
    "a removed tag survived a machine write that re-added it",
    "a revoked tag correction still blocked the next machine write",
    "a full_brief correction did not survive a machine write",
    "a revoked full_brief correction still blocked the next machine write",
    "a section_text correction did not survive a machine write",
    "a revoked section_text correction still blocked the next machine write",
    "a fact replace with a non-verbatim span was accepted",
    "a fact replace did not survive a machine rewrite of the claim",
    "a revoked fact replace still blocked the next machine write",
    "a suppress deleted the claim row",
    "a machine edge insert got past a connection tombstone",
    "a connection add did not write both manual rows",
    "the append-only guard let an UPDATE of reason through",
    "the append-only guard let a DELETE through",
  ]) assert.ok(SQL.includes(msg), `self-check must carry: ${msg}`);
  assert.match(SQL, /RAISE EXCEPTION 'c356_selfcheck_rollback'/);
  assert.match(SQL, /IF SQLERRM <> 'c356_selfcheck_rollback' THEN RAISE; END IF/);
});

test("runs inside one transaction and is not applied by this file", () => {
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /^\s*COMMIT;/m);
});

test("rule 022: the migration carries no dash glyph and no section-sign glyph", () => {
  assert.doesNotMatch(RAW, new RegExp("[\u2013\u2014\u00a7]"));
});

test("revoke RESTORES per target_kind in the same transaction: evidence value else machine_value, through the normal row write", () => {
  const f = fn("revoke_item_correction");
  assert.match(f, /SET revoked_at = now\(\)[\s\S]*RETURNING \* INTO c/, "revokes first, so the triggers see the correction as inactive when the restore write runs");
  assert.match(f, /FROM public\.item_correction_evidence e WHERE e\.correction_id = c\.id/);
  assert.match(f, /IF COALESCE\(v_has_ev, false\) THEN v_mv := v_ev; ELSE v_mv := c\.machine_value; END IF/, "latest machine value, else the captured one");
  // tag: membership put back to what the machine had, written through UPDATE of the column
  assert.match(f, /c\.target_kind = 'tag'[\s\S]*array_remove\(v_cur, v_tag\)[\s\S]*UPDATE public\.intelligence_items SET %I = \$1/);
  assert.match(f, /v_in_machine AND NOT \(v_tag = ANY \(v_cur\)\)[\s\S]*v_cur \|\| v_tag/, "a removed tag is put back");
  // full_brief and section_text: the machine text
  assert.match(f, /c\.target_kind = 'full_brief'[\s\S]*UPDATE public\.intelligence_items SET full_brief = \(v_mv #>> '\{\}'\)/);
  assert.match(f, /c\.target_kind = 'section_text'[\s\S]*UPDATE public\.intelligence_item_sections SET content_md = \(v_mv #>> '\{\}'\)/);
  // fact replace: claim fields put back on the claim row
  assert.match(f, /c\.target_kind = 'fact' AND c\.op = 'replace'[\s\S]*UPDATE public\.section_claim_provenance[\s\S]*source_span = v_mv ->> 'source_span'[\s\S]*search_result_id = NULLIF\(v_mv ->> 'search_result_id', ''\)::uuid/);
  // connection add: the pair is replaced by the captured rows; connection remove writes nothing
  assert.match(f, /c\.target_kind = 'connection' AND c\.op = 'add'[\s\S]*DELETE FROM public\.item_cross_references[\s\S]*jsonb_populate_recordset\(NULL::public\.item_cross_references/);
  assert.doesNotMatch(f, /c\.op = 'remove'[\s\S]{0,200}INSERT INTO public\.item_cross_references/, "a revoked tombstone must not re-create the edge");
  assert.match(RAW, /REVOKE RESTORES/);
});

test("the self-check attacks the restore itself for every target_kind, not only that the next machine write stands", () => {
  for (const msg of [
    "revoking a tag remove did not put the machine tag back",
    "revoking a tag add did not take the added tag back out",
    "revoking a full_brief correction did not restore the machine brief",
    "revoking a section_text correction did not restore the machine text",
    "revoking a fact replace did not restore the machine claim",
    "revoking a connection remove re-created the edge",
    "revoking a connection add did not restore the pair to the machine state",
  ]) assert.ok(SQL.includes(msg), `self-check must carry: ${msg}`);
});
