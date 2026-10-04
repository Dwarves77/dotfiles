// 350_retire_automate_vs_hire_values.test.mjs -- static proof of migration 350 (ADR-043), by parsing the SQL
// file directly: no database, no SQL parser dependency. Same discipline as 349_external_data_only.test.mjs.
// It proves the migration deletes edges before values (the foreign key order), touches only the
// automate_vs_hire method, leaves the outbox alone, disables nothing, and carries an aborting self-check.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAW = readFileSync(
  fileURLToPath(new URL("./350_retire_automate_vs_hire_values.sql", import.meta.url)),
  "utf8",
);

/** The executable SQL: every `--` line comment removed. */
const SQL = RAW.split("\n")
  .map((l) => {
    const i = l.indexOf("--");
    return i === -1 ? l : l.slice(0, i);
  })
  .join("\n");

test("header carries a subject line, cites ADR-043 and names the apply order", () => {
  assert.match(RAW, /^-- subject: Migration 350 /);
  assert.match(RAW, /ADR-043/);
  assert.match(RAW, /AFTER the NO-TYPED-INPUT PR merges/);
});

test("runs in one transaction", () => {
  assert.equal((SQL.match(/^BEGIN;/gm) ?? []).length, 1);
  assert.equal((SQL.match(/^COMMIT;/gm) ?? []).length, 1);
  assert.ok(SQL.indexOf("BEGIN;") < SQL.indexOf("COMMIT;"));
});

test("deletes the derivation_edges into automate_vs_hire values BEFORE the derived_values rows", () => {
  const edges = SQL.indexOf("DELETE FROM public.derivation_edges");
  const values = SQL.indexOf("DELETE FROM public.derived_values WHERE method_id = 'automate_vs_hire';");
  assert.ok(edges >= 0 && values >= 0);
  assert.ok(edges < values, "edges reference derived_values(value_id), so they go first");
  assert.match(SQL, /to_value_id IN \(SELECT value_id FROM public\.derived_values WHERE method_id = 'automate_vs_hire'\)/);
});

test("exactly two DELETE statements, both scoped to the automate_vs_hire method", () => {
  const deletes = SQL.match(/^DELETE FROM [^;]+;/gm) ?? [];
  assert.equal(deletes.length, 2);
  for (const d of deletes) assert.match(d, /automate_vs_hire/);
});

test("does not touch the outbox, other tables, triggers, policies or functions", () => {
  assert.doesNotMatch(SQL, /propagation_events/);
  assert.doesNotMatch(SQL, /\b(DROP|ALTER|CREATE|TRUNCATE|DISABLE|GRANT|REVOKE)\b/i);
  assert.doesNotMatch(SQL, /UPDATE\s/i);
  assert.doesNotMatch(SQL, /regional_data_facts/);
});

test("self-check aborts on a remaining automate_vs_hire row, a dangling edge, or a changed other-method count", () => {
  const blocks = [...SQL.matchAll(/DO \$\$([\s\S]*?)END \$\$;/g)].map((m) => m[1]);
  assert.equal(blocks.length, 2, "one DO block records the before-count, one asserts after");
  const check = blocks[1];
  assert.match(check, /RAISE EXCEPTION 'ABORT: % derived_values row\(s\) with method_id automate_vs_hire remain'/);
  assert.match(check, /RAISE EXCEPTION 'ABORT: % derivation_edges row\(s\) point at a derived_values row that no longer exists'/);
  assert.match(check, /RAISE EXCEPTION 'ABORT: derived_values rows of other methods changed/);
});
