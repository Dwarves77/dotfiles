// 347_aggregate_floor_adr035.test.mjs -- static assertions on migration 347 (ADR-035 floor at the DB
// aggregate gate). Pure text parsing, no database; same style as 346_research_assessments_entity_spine_signposts.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAW = readFileSync(fileURLToPath(new URL("./347_aggregate_floor_adr035.sql", import.meta.url)), "utf8");
// Executable SQL only: strip `-- ...` line comments.
const SQL = RAW.split("\n").map((l) => (l.indexOf("--") === -1 ? l : l.slice(0, l.indexOf("--")))).join("\n");

test("347 drops the old k_min >= 5 check from migration 287", () => {
  assert.match(SQL, /DROP CONSTRAINT IF EXISTS sensitive_field_policy_k_min_check/i);
});

test("347 raises every row below 10 to 10 and sets the column default to 10", () => {
  assert.match(SQL, /UPDATE public\.sensitive_field_policy SET k_min = 10 WHERE k_min < 10/i);
  assert.match(SQL, /ALTER COLUMN k_min SET DEFAULT 10/i);
});

test("347 adds the ADR-035 check (k_min >= 10)", () => {
  assert.match(SQL, /ADD CONSTRAINT sensitive_field_policy_k_min_adr035 CHECK \(k_min >= 10\)/i);
});

test("347 contains the self-check for k_min < 10 and max_share_pct > 25", () => {
  assert.match(SQL, /DO \$\$/);
  assert.match(SQL, /k_min < 10/);
  assert.match(SQL, /max_share_pct > 25/);
  assert.match(SQL, /RAISE EXCEPTION 'ABORT: migration 347/);
});

test("347 runs in one transaction and drops the old check before adding the new one", () => {
  assert.match(SQL, /BEGIN;/);
  assert.match(SQL, /COMMIT;/);
  assert.ok(SQL.indexOf("DROP CONSTRAINT") < SQL.indexOf("UPDATE public.sensitive_field_policy"));
  assert.ok(SQL.indexOf("UPDATE public.sensitive_field_policy") < SQL.indexOf("ADD CONSTRAINT"));
});
