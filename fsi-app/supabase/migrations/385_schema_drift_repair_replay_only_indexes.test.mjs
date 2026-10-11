// 385_schema_drift_repair_replay_only_indexes.test.mjs -- static proof of migration 385 (lane DRIFT-1): the five CREATE INDEX statements equal the
// definitions in the files that create them (009 and 271), are all IF NOT EXISTS (idempotent), and nothing else is written. The behavioural proof is
// the self-check plus the migration-proof job, which applies the file twice on a local stack.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { headerProblems } from "./_lib/applied-status.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FILE = "385_schema_drift_repair_replay_only_indexes.sql";
const RAW = readFileSync(join(HERE, FILE), "utf8");
const strip = (raw) => raw.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const SQL = strip(RAW);
const norm = (s) => s.replace(/\s+/g, " ").replace(/\bpublic\./g, "").replace(/\s*\(\s*/g, "(").replace(/\s*\)/g, ")").replace(/\s*,\s*/g, ",").trim().toLowerCase();
const indexesOf = (text) => new Map([...strip(text).matchAll(/CREATE INDEX IF NOT EXISTS (\w+)\s+ON\s+([\w.]+)\s*(\([^)]*\))/g)].map((m) => [m[1], norm(`${m[2]}${m[3]}`)]));

const EXPECTED = ["assumption_register_subsystem_idx", "idx_intel_changes_detected_at", "idx_intel_changes_item_id", "idx_intel_summaries_item_id", "idx_intel_summaries_sector"];

test("header: a subject line, NOT APPLIED, agrees with the applied-status record, and says it changes production", () => {
  assert.match(RAW, /^-- subject: Migration 385 /);
  assert.match(RAW, /^-- NOT APPLIED\./m);
  assert.deepEqual(headerProblems(RAW, FILE), []);
  assert.match(RAW, /THIS ONE CHANGES PRODUCTION/);
});

test("exactly the five indexes the oracle reported, each IF NOT EXISTS, each equal to its creating file's definition", () => {
  const mine = indexesOf(RAW);
  assert.deepEqual([...mine.keys()].sort(), EXPECTED);
  assert.equal((SQL.match(/CREATE INDEX/g) ?? []).length, 5);
  const created = new Map([...indexesOf(readFileSync(join(HERE, "009_capture_undeclared_tables.sql"), "utf8")), ...indexesOf(readFileSync(join(HERE, "271_assumption_register.sql"), "utf8"))]);
  for (const name of EXPECTED) assert.equal(mine.get(name), created.get(name), `${name} equals the creating file's definition`);
  assert.match(SQL, /idx_intel_changes_detected_at ON public\.intelligence_changes \(detected_at DESC\)/);
});

test("nothing else is written: no data statement, no drop, one transaction, a self-check that names each miss", () => {
  assert.doesNotMatch(SQL, /\b(INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|TRUNCATE|DROP\s+\w+|ALTER\s+TABLE)\b/i);
  assert.doesNotMatch(SQL, /CONCURRENTLY/i, "CONCURRENTLY cannot run in a transaction");
  assert.match(SQL, /^BEGIN;$/m);
  assert.match(SQL, /^COMMIT;$/m);
  assert.match(SQL, /pg_indexes/);
  assert.match(SQL, /index\(es\) missing after the create/);
});
