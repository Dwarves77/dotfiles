#!/usr/bin/env node
// run-fixture-import.mjs: the local, DB-less proof that the operator-rows CSV path actually runs end to
// end for the two kept spec-09 tables (ADR-042: operator-supplied external rows only, never customer
// data): parse (operator-rows-contract.mjs) -> filter accepted rows -> stamp org_id -> guarded insert
// (deps-injected, so this runs with zero DB access under `node --test` per the lane-common-contract's
// "deps object" pattern, screen-reconcile-records.mjs precedent) -> read-back (the injected insert
// returns the rows it "wrote", which this script echoes).
//
// WHY THIS EXISTS. Section 0's "Run" evidence for a component this lane cannot dispatch against the live DB
// (no DB credentials in this worktree, per lane-common-contract): "make the dry run provable locally with
// fixtures." This is that proof, runnable by anyone with `node --test` and no environment at all.
//
// TWO USES:
//   1. `runFixtureImport()` (pure, no fs): imported by run-fixture-import.test.mjs for a fast, hermetic
//      node --test proof.
//   2. `node scripts/spec09/run-fixture-import.mjs [--out <dir>]`: reads the two fixtures off disk and
//      writes a JSON artifact recording exactly what ran, for a human (or the coordinator) to read back.
//      Never touches a real database; `--org-id` is accepted only to make the artifact's org-stamping
//      visible.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OPERATOR_ROW_TABLES, parseOperatorRows } from "./lib/operator-rows-contract.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(HERE, "fixtures");

export const DEFAULT_TEST_ORG_ID = "00000000-0000-0000-0000-0000000000f1";

/** Deterministic fake insert — no DB, no fs. Assigns an incrementing fake id per row and echoes back
 *  exactly what it "inserted" (the read-back). Call signature matches guardedInsertMany's shape closely
 *  enough that a real DB-backed implementation is a drop-in replacement. */
export function fakeInsertMany() {
  let n = 0;
  const inserted = [];
  return {
    inserted,
    async insertMany(table, rows) {
      const withIds = rows.map((r) => ({ id: `fake-${table}-${++n}`, ...r }));
      inserted.push(...withIds);
      return { inserted: withIds.length, rows: withIds };
    },
  };
}

/**
 * Run one table's fixture CSV through the full parse -> org-stamp -> insert -> read-back pipeline.
 * `csvText` and `insertMany` are both injected (no disk, no DB) so this is callable from node --test with
 * zero environment. Mirrors what the producers (scripts/spec09/*-producer.mjs) do per accepted row, so
 * a green result here is a real proof of the shape they run, not a separate reimplementation.
 */
export async function runOneTable({ table, csvText, orgId, insertMany }) {
  const parsed = parseOperatorRows(table, csvText);
  if (!parsed.ok) {
    return { table, ok: false, error: parsed.error, accepted: 0, rejected: 0, inserted: 0 };
  }
  const rowsToInsert = parsed.accepted.map(({ data }) => ({ ...data, org_id: orgId }));
  const res = rowsToInsert.length ? await insertMany(table, rowsToInsert) : { inserted: 0, rows: [] };
  return {
    table,
    ok: true,
    total: parsed.total,
    accepted: parsed.accepted.length,
    rejected: parsed.rejected.length,
    rejectedReasons: parsed.rejected.map((r) => ({ rowNumber: r.rowNumber, errors: r.errors })),
    inserted: res.inserted,
    readBack: res.rows,
  };
}

/** Run every table's fixture (pure — CSV text is passed in, never read from disk here) through
 *  runOneTable, using one fake inserter shared across tables (so the artifact shows every "inserted" row
 *  across the whole run, keyed by its own fake per-table id). */
export async function runFixtureImport({ fixtures, orgId = DEFAULT_TEST_ORG_ID, insertMany } = {}) {
  const fake = insertMany ? null : fakeInsertMany();
  const insert = insertMany ?? fake.insertMany;
  const results = [];
  for (const table of OPERATOR_ROW_TABLES) {
    const csvText = fixtures[table];
    if (csvText === undefined) throw new Error(`runFixtureImport: no fixture text given for table "${table}"`);
    results.push(await runOneTable({ table, csvText, orgId, insertMany: insert }));
  }
  return {
    orgId,
    tables: results,
    totals: {
      accepted: results.reduce((s, r) => s + (r.accepted || 0), 0),
      rejected: results.reduce((s, r) => s + (r.rejected || 0), 0),
      inserted: results.reduce((s, r) => s + (r.inserted || 0), 0),
    },
  };
}

function loadFixturesFromDisk() {
  const fixtures = {};
  for (const table of OPERATOR_ROW_TABLES) {
    fixtures[table] = readFileSync(resolve(FIXTURES_DIR, `${table}.csv`), "utf8");
  }
  return fixtures;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf("--out");
  const outDir = outIdx >= 0 ? argv[outIdx + 1] : resolve(HERE, "..", "_snapshots", "spec09-operator-rows");
  const orgIdIdx = argv.indexOf("--org-id");
  const orgId = orgIdIdx >= 0 ? argv[orgIdIdx + 1] : DEFAULT_TEST_ORG_ID;

  const fixtures = loadFixturesFromDisk();
  const result = await runFixtureImport({ fixtures, orgId });

  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = resolve(outDir, `fixture-import-${stamp}.json`);
  writeFileSync(outFile, JSON.stringify({ ranAt: new Date().toISOString(), note: "fake in-memory insert — no live DB touched", ...result }, null, 2) + "\n");

  console.log(JSON.stringify({ outFile, totals: result.totals }, null, 2));
}
