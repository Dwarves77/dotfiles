// vocab-drift.test.mjs — drift guard for the origin_class/derivation CHECK lists hand-transcribed into
// migrations 296-298 (see 296's header: "hand-transcribed... confirmed byte-for-byte via `node -e`...
// drift-guarded by this test"). Reads the checked-in migration SQL as plain text and asserts each CHECK's
// value list is exactly the canonical vocabulary's own value set, in the module's own key order — the
// same "regenerate and byte-compare" posture corridor-id.mjs's SQL twin uses, applied without a codegen
// script (none is in this lane's write set) by testing the text directly instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ORIGIN_CLASSES } from "../contracts/vocabularies.mjs";
import { DERIVATIONS } from "../contracts/envelope.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MIGRATIONS_DIR = resolve(ROOT, "supabase", "migrations");

/** Strip `-- ...` SQL line comments before scanning — this migration's own header comment QUOTES spec
 *  09's buggy illustrative CHECK text verbatim ("CHECK (origin_class IN ('official','partner'))") as part
 *  of explaining the deviation; an un-stripped scan would misread that quotation as a second, live CHECK
 *  on this table. Keeps everything else (line count, real CHECK text) intact. */
function stripLineComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

function readMigration(name) {
  return stripLineComments(readFileSync(resolve(MIGRATIONS_DIR, name), "utf8"));
}

/** Extract every quoted string list following `CHECK (<column> IN (` in the given SQL text, for the named
 *  column. Pure text scan (no SQL parser) — sufficient because every CHECK this test targets is written
 *  as a single-line, comma-separated, single-quoted list in the migration files themselves. */
export function extractCheckList(sql, column) {
  // (?<!\w) anchors the column name at a real word boundary — without it, `column="derivation"` would
  // also match inside `statutory_derivation IN (...)` (a DIFFERENT, deliberately narrower two-value
  // CHECK on surcharge_audits/indexation), since a plain substring search has no notion of "whole word".
  const re = new RegExp(`(?<!\\w)${column}\\s+IN\\s*\\(([^)]*)\\)`, "g");
  const out = [];
  let m;
  while ((m = re.exec(sql))) {
    const values = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
    out.push(values);
  }
  return out;
}

test("migration 296 origin_class CHECKs match the canonical ORIGIN_CLASSES vocabulary exactly", () => {
  const sql = readMigration("296_spec09_market_tables.sql");
  const lists = extractCheckList(sql, "origin_class");
  assert.ok(lists.length >= 2, "expected an origin_class CHECK on surcharge_audits and oem_tech_roadmaps");
  for (const list of lists) {
    assert.deepEqual(list, [...ORIGIN_CLASSES], "origin_class CHECK list must equal ORIGIN_CLASSES, in order");
  }
});

test("migration 296 derivation CHECKs match the canonical DERIVATIONS vocabulary exactly", () => {
  const sql = readMigration("296_spec09_market_tables.sql");
  const lists = extractCheckList(sql, "derivation");
  assert.ok(lists.length >= 1, "expected a derivation CHECK on carrier_compliance_pools");
  for (const list of lists) {
    assert.deepEqual(list, [...DERIVATIONS], "derivation CHECK list must equal DERIVATIONS, in order");
  }
});

test("migration 297 grid_connection_queues.obs_status CHECK matches the canonical OBS_STATUS codes", async () => {
  const { OBS_STATUS } = await import("../contracts/vocabularies.mjs");
  const sql = readMigration("297_spec09_operations_tables.sql");
  const lists = extractCheckList(sql, "obs_status");
  assert.equal(lists.length, 1);
  assert.deepEqual(lists[0], Object.keys(OBS_STATUS), "obs_status CHECK list must equal OBS_STATUS keys, in order");
});
