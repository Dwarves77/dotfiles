// 353_prediction_scoring_and_reliability_ledger.test.mjs -- static proof of migration 353 (lane L4-D) by
// parsing the SQL file: no database, no SQL parser dependency. The attack on the append-only guard runs in
// the migration's own self-check at apply time; this file proves the file carries it and the shape the
// scorer (src/lib/learning/prediction-scoring.mjs) and trust.ts read.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAW = readFileSync(fileURLToPath(new URL("./353_prediction_scoring_and_reliability_ledger.sql", import.meta.url)), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");

test("header: subject line, APPLIED, the ledger never writes a tier", () => {
  assert.match(RAW, /^-- subject: Migration 353 /);
  assert.match(RAW, /APPLIED \(production ledger version \d+/);
  assert.match(RAW, /never writes a tier/);
});

test("signposts gains exactly the four prediction columns, nullable, outcome constrained to held|refuted|partial", () => {
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS inference_record_id uuid REFERENCES public\.inference_records\(inference_id\)/);
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS outcome text CHECK \(outcome IN \('held', 'refuted', 'partial'\)\)/);
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS outcome_assessed_at timestamptz/);
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS scored_by text/);
  assert.doesNotMatch(SQL, /outcome text NOT NULL/);
  assert.match(SQL, /signposts_score_columns_together/);
});

test("the ledger has the stated columns, one row per source per signpost, and FKs to sources, signposts and assessments", () => {
  const body = /CREATE TABLE IF NOT EXISTS public\.source_reliability_ledger \(([\s\S]*?)\n\);/.exec(SQL)[1];
  for (const col of ["source_id", "signpost_entity_id", "assessment_id", "outcome", "scored_at", "scored_by"]) assert.match(body, new RegExp(`\\b${col}\\b`));
  assert.match(body, /source_id\s+uuid NOT NULL REFERENCES public\.sources\(id\)/);
  assert.match(body, /signpost_entity_id\s+text NOT NULL REFERENCES public\.signposts\(entity_id\)/);
  assert.match(body, /assessment_id\s+uuid NOT NULL REFERENCES public\.research_assessments\(id\)/);
  assert.match(body, /UNIQUE \(source_id, signpost_entity_id\)/);
  assert.match(body, /scored_by\s+text NOT NULL/);
});

test("append-only: a BEFORE UPDATE OR DELETE trigger raises; RLS is enabled and no policy is created", () => {
  assert.match(SQL, /CREATE TRIGGER source_reliability_ledger_append_only_trg\s+BEFORE UPDATE OR DELETE ON public\.source_reliability_ledger/);
  assert.match(SQL, /RAISE EXCEPTION '% is append-only/);
  assert.match(SQL, /ALTER TABLE public\.source_reliability_ledger ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(SQL, /CREATE POLICY/i);
});

test("the self-check attacks the guard (UPDATE and DELETE must be refused) and rolls its fixture back", () => {
  assert.match(SQL, /the append-only guard let an UPDATE through/);
  assert.match(SQL, /the append-only guard let a DELETE through/);
  assert.match(SQL, /RAISE EXCEPTION 'l4d_353_selfcheck_rollback'/);
  assert.match(SQL, /IF SQLERRM <> 'l4d_353_selfcheck_rollback' THEN RAISE; END IF/);
});

test("no tier is written and no event_type is added: nothing here touches sources or source_trust_events", () => {
  assert.doesNotMatch(SQL, /UPDATE\s+public\.sources/i);
  assert.doesNotMatch(SQL, /effective_tier/i);
  assert.doesNotMatch(SQL, /source_trust_events/i);
});

test("runs inside one transaction", () => {
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /^\s*COMMIT;/m);
});
