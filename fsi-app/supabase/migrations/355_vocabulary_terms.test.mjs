// 355_vocabulary_terms.test.mjs -- static proof of migration 355 (lane G5-TERMS) by parsing the SQL file:
// no database, no SQL parser dependency. The attack on the constraints runs in the migration's own
// self-check at apply time; this file proves the file carries it and the shape the collector reads.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAW = readFileSync(fileURLToPath(new URL("./355_vocabulary_terms.sql", import.meta.url)), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");

test("header: subject line and NOT APPLIED", () => {
  assert.match(RAW, /^-- subject: Migration 355 /);
  assert.match(RAW, /NOT APPLIED/);
});

test("vocabulary_terms: the six kinds, three statuses, unique (kind, term_key), adopted rows are stamped", () => {
  const body = /CREATE TABLE IF NOT EXISTS public\.vocabulary_terms \(([\s\S]*?)\n\);/.exec(SQL)[1];
  for (const col of ["id", "kind", "term_key", "label", "status", "distinct_items", "distinct_sources", "first_seen_at", "last_seen_at", "adopted_at", "adoption_rule", "evidence"]) {
    assert.match(body, new RegExp(`\\b${col}\\b`));
  }
  assert.match(body, /kind IN \('standard', 'material', 'theme', 'scenario', 'compliance_object', 'term'\)/);
  assert.match(body, /status IN \('proposed', 'adopted', 'retired'\)/);
  assert.match(body, /UNIQUE \(kind, term_key\)/);
  assert.match(body, /status <> 'adopted' OR \(adopted_at IS NOT NULL AND adoption_rule IS NOT NULL\)/);
  assert.match(body, /term_key = lower\(btrim\(term_key\)\)/);
});

test("vocabulary_mentions: unique (term, item, detector), FKs, the five detectors, nullable source", () => {
  const body = /CREATE TABLE IF NOT EXISTS public\.vocabulary_mentions \(([\s\S]*?)\n\);/.exec(SQL)[1];
  assert.match(body, /term_id\s+uuid\s+NOT NULL REFERENCES public\.vocabulary_terms\(id\)/);
  assert.match(body, /item_id\s+uuid\s+NOT NULL REFERENCES public\.intelligence_items\(id\)/);
  assert.match(body, /source_id\s+uuid\s+REFERENCES public\.sources\(id\)/);
  assert.doesNotMatch(body, /source_id\s+uuid\s+NOT NULL/);
  assert.match(body, /detector IN \('entity-link', 'theme-candidate', 'scenario-tag', 'compliance-object', 'brief-terms'\)/);
  assert.match(body, /UNIQUE \(term_id, item_id, detector\)/);
});

test("intelligence_items gains compliance_object_candidates text[]", () => {
  assert.match(SQL, /ALTER TABLE public\.intelligence_items\s+ADD COLUMN IF NOT EXISTS compliance_object_candidates TEXT\[\]/);
});

test("RLS on both tables, an admin SELECT policy on profiles.is_platform_admin, and no write policy", () => {
  assert.match(SQL, /ALTER TABLE public\.vocabulary_terms ENABLE ROW LEVEL SECURITY/);
  assert.match(SQL, /ALTER TABLE public\.vocabulary_mentions ENABLE ROW LEVEL SECURITY/);
  const policies = [...SQL.matchAll(/CREATE POLICY (\w+) ON public\.(\w+)\s+FOR (\w+)/g)];
  assert.equal(policies.length, 2);
  for (const p of policies) assert.equal(p[3], "SELECT");
  assert.equal((SQL.match(/p\.is_platform_admin = true/g) || []).length, 2);
});

test("the self-check attacks the constraints and rolls its fixture back", () => {
  assert.match(SQL, /a duplicate \(kind, term_key\) was accepted/);
  assert.match(SQL, /an unknown kind was accepted/);
  assert.match(SQL, /an unknown status was accepted/);
  assert.match(SQL, /an adopted term without an adoption stamp was accepted/);
  assert.match(SQL, /RAISE EXCEPTION 'g5_355_selfcheck_rollback'/);
  assert.match(SQL, /IF SQLERRM <> 'g5_355_selfcheck_rollback' THEN RAISE; END IF/);
});

test("runs inside one transaction", () => {
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /^\s*COMMIT;/m);
});
