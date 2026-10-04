// 349_external_data_only.test.mjs -- static proof of migration 349 (ADR-042, external data only), by
// parsing the SQL file directly: no database, no SQL parser dependency. Same discipline as
// 348_community_social_only.test.mjs. It proves the migration drops exactly the seven tables ADR-042
// names (children before parents), deletes only the benchmark policy row, keeps the objects ADR-042 keeps,
// and carries a self-check that would abort on a half-applied state.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAW = readFileSync(
  fileURLToPath(new URL("./349_external_data_only.sql", import.meta.url)),
  "utf8",
);

/** The executable SQL: every `--` line comment removed. */
const SQL = RAW.split("\n")
  .map((l) => {
    const i = l.indexOf("--");
    return i === -1 ? l : l.slice(0, i);
  })
  .join("\n");

const DROPPED = [
  "community_benchmark_responses",
  "community_benchmark_instruments",
  "surcharge_audits",
  "tce_data_quality",
  "eudr_plot_claims",
  "custody_chains",
  "planning_assumption_register",
];

test("header carries a subject line, cites ADR-042, names the BREAK-RISKY class and the apply order", () => {
  assert.match(RAW, /^-- subject: Migration 349 /);
  assert.match(RAW, /ADR-042/);
  assert.match(RAW, /BREAK-RISKY/);
  assert.match(RAW, /ADR-011/);
  assert.match(RAW, /applied AFTER the EXTERNAL-ONLY PR merges/);
});

test("runs in one transaction", () => {
  assert.equal((SQL.match(/^BEGIN;/gm) ?? []).length, 1);
  assert.equal((SQL.match(/^COMMIT;/gm) ?? []).length, 1);
  assert.ok(SQL.indexOf("BEGIN;") < SQL.indexOf("COMMIT;"));
});

test("drops exactly the seven ADR-042 tables, with plain DROP (no CASCADE)", () => {
  const dropped = [...SQL.matchAll(/^DROP TABLE IF EXISTS public\.(\w+);/gm)].map((m) => m[1]);
  assert.deepEqual([...dropped].sort(), [...DROPPED].sort());
  assert.equal((SQL.match(/^DROP TABLE/gm) ?? []).length, DROPPED.length);
  assert.doesNotMatch(SQL, /CASCADE/i);
});

test("drops the benchmark responses table before its parent instruments table", () => {
  const child = SQL.indexOf("DROP TABLE IF EXISTS public.community_benchmark_responses;");
  const parent = SQL.indexOf("DROP TABLE IF EXISTS public.community_benchmark_instruments;");
  assert.ok(child >= 0 && parent >= 0);
  assert.ok(child < parent);
});

test("deletes only the community_benchmark_responses row from sensitive_field_policy", () => {
  const deletes = SQL.match(/^DELETE FROM [^;]+;/gm) ?? [];
  assert.equal(deletes.length, 1);
  assert.match(deletes[0], /DELETE FROM public\.sensitive_field_policy WHERE table_name IN \('community_benchmark_responses'\);/);
});

test("does not drop or alter the objects ADR-042 keeps", () => {
  for (const kept of [
    "sensitive_field_policy",
    "aggregate_query_log",
    "community_contributions",
    "auxiliary_energy_profiles",
    "indexation_clauses",
    "assumption_register",
  ]) {
    assert.doesNotMatch(SQL, new RegExp(`DROP TABLE[^;]*\\b${kept}\\b`), `${kept} must not be dropped`);
    assert.doesNotMatch(SQL, new RegExp(`ALTER TABLE[^;]*\\b${kept}\\b`), `${kept} must not be altered`);
  }
  assert.doesNotMatch(SQL, /DROP FUNCTION/i);
});

test("self-check asserts all seven tables are gone, the policy row is gone, and the kept objects survive", () => {
  const block = /DO \$\$([\s\S]*?)END \$\$;/.exec(SQL);
  assert.ok(block, "self-check DO block not found");
  for (const t of DROPPED) assert.ok(block[1].includes(`'${t}'`), `self-check must name ${t}`);
  assert.match(block[1], /still exists after DROP TABLE/);
  assert.match(block[1], /sensitive_field_policy row\(s\) for community_benchmark_responses remain/);
  assert.match(block[1], /publish_aggregate/);
  for (const kept of ["sensitive_field_policy", "aggregate_query_log", "auxiliary_energy_profiles", "indexation_clauses"]) {
    assert.ok(block[1].includes(`'${kept}'`), `self-check must assert ${kept} survives`);
  }
});
