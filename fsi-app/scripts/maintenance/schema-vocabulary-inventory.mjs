#!/usr/bin/env node
// schema-vocabulary-inventory.mjs, D7 (docs/plans/defect-fix-plan-2026-09-12.md): read-only maintenance
// step. In dry mode it runs the exact query the plan specifies against pg_constraint (direct Postgres,
// scripts/lib/pg-conn.mjs's shared resolver) and writes fsi-app/docs/inventories/db-check-constraints.json,
// the tracked SoT that check-vocabulary.test.mjs (unit, static) and check-vocabulary-drift.mjs (live drift
// verifier) both read.
//
// READ-ONLY BY DESIGN: this step never writes the database, so a `mode=apply` dispatch is REFUSED before
// any DB connection is even attempted, and exits 0 with a note explaining why, rather than silently
// behaving like dry (this is why the entrypoint below does its own small mode check ahead of building
// deps, instead of the shared runCli/buildDeps ordering every other maintenance step uses, which connects
// unconditionally before main() runs).
//
// The workflow (.github/workflows/maintenance.yml) commits the written JSON back to the run's own branch
// the same way resolve-error-body-gate's worklist is (scripts/maintenance/commit-worklist-artifact.sh) --
// this script only writes the file to disk; it never touches git.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fsiRoot, writeSummary } from "./lib/cli.mjs";
import { buildLiveInventoryEntry } from "./lib/vocab-inventory.mjs";

export const OUTPUT_PATH = resolve(fsiRoot(), "docs/inventories/db-check-constraints.json");

// The exact query the plan specifies (docs/plans/defect-fix-plan-2026-09-12.md, D7).
export const QUERY = `select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def
  from pg_constraint
  where contype = 'c'
    and connamespace = 'public'::regnamespace
    and pg_get_constraintdef(oid) ~ 'ANY \\(ARRAY'
  order by 1, 2`;

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ query?: Function, writeFile?: Function, now?: () => Date }} deps - `query(sql) => Promise<{rows}>`,
 *   required in dry mode; `writeFile`/`now` default to real node:fs / Date, injectable for tests (no DB
 *   needed to exercise either path).
 */
export async function main({ mode = "dry" } = {}, deps = {}) {
  const summary = { step: "schema-vocabulary-inventory", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  if (mode === "apply") {
    summary.note = "schema-vocabulary-inventory is READ-ONLY: it never writes the database. Nothing to apply. Dispatch mode=dry to (re)generate the inventory.";
    return summary;
  }

  const { rows } = await deps.query(QUERY);
  const entries = rows.map((r) => buildLiveInventoryEntry(r));
  const unparsed = entries.filter((e) => e.allowed === null);

  const now = deps.now ?? (() => new Date());
  const doc = { source: "live", generated: now().toISOString(), constraints: entries };

  const writeFile = deps.writeFile ?? ((path, content) => writeFileSync(path, content));
  writeFile(OUTPUT_PATH, JSON.stringify(doc, null, 2) + "\n");

  summary.counts = {
    constraints: entries.length,
    unparsed: unparsed.length,
    tables: new Set(entries.map((e) => e.table)).size,
  };
  summary.read_back = { output_path: "fsi-app/docs/inventories/db-check-constraints.json" };
  if (unparsed.length > 0) {
    summary.note = `${unparsed.length} constraint(s) matched the live query's ANY(ARRAY) filter but could not be parsed to a single column/allowed set (recorded with allowed:null + unparsed, never guessed). See the file itself.`;
  }
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const mode = flag("--mode") ?? (argv.includes("--apply") ? "apply" : "dry");
  const out = flag("--out") ?? null;

  if (mode !== "dry" && mode !== "apply") {
    console.error(`schema-vocabulary-inventory: --mode must be 'dry' or 'apply' (got '${mode}').`);
    process.exit(1);
  }

  let deps = {};
  if (mode === "dry") {
    try {
      process.loadEnvFile(resolve(fsiRoot(), ".env.local"));
    } catch {
      // CI injects env directly; absence here is not fatal on its own.
    }
    const { connectPg } = await import("../lib/pg-conn.mjs");
    const client = await connectPg();
    if (!client) {
      console.error("schema-vocabulary-inventory: no working Postgres connection, cannot verify here (exit 2).");
      process.exit(2);
    }
    deps = { query: (sql, params) => client.query(sql, params) };
  }

  const summary = await main({ mode }, deps);
  console.log(JSON.stringify(summary, null, 2));
  if (out) {
    const file = writeSummary(out, summary);
    console.log(`schema-vocabulary-inventory: wrote ${file}`);
  }
  process.exit(typeof summary?.exitCode === "number" ? summary.exitCode : 0);
}
