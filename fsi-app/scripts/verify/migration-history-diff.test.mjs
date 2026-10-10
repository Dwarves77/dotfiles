// migration-history-diff.test.mjs: proof of the recorded code-differs diff (lane MIG-HIST-2). No npm imports.
// Pattern: the record is computed, planted wrong (attack), and recomputed; the committed map is checked for shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffRecord, sameDiff, annotateMap, storedFromExportDir, DIFF_CLASSES } from "./migration-history-diff.mjs";
import { MAP_PATH, ledgerKeys, serializeMap } from "../migrations/build-applied-map.mjs";

const FILE = "CREATE TABLE a (id int);\nCREATE INDEX a_i ON a (id);\n";

test("diffRecord: identical or comment-only pairs have no record", () => {
  assert.equal(diffRecord("CREATE TABLE a (id int);\nCREATE INDEX a_i ON a (id)", FILE), null);
  assert.equal(diffRecord("CREATE TABLE a (id int);\nCREATE INDEX a_i ON a (id)", `-- c\nBEGIN;\n${FILE}COMMIT;\n`), null);
});

test("diffRecord classes: file-only (H1), changed-in-place (H2), stored-only", () => {
  const h1 = diffRecord("CREATE TABLE a (id int)", FILE);
  assert.equal(h1.class, "file-only");
  assert.equal(h1.file_only, 1);
  assert.equal(h1.stored_only, 0);
  const h2 = diffRecord("CREATE TABLE a (id int);\nCREATE INDEX a_i ON a (other)", FILE);
  assert.equal(h2.class, "changed-in-place");
  assert.equal(h2.file_only, 1);
  assert.equal(h2.stored_only, 1);
  const so = diffRecord("CREATE TABLE a (id int);\nCREATE INDEX a_i ON a (id);\nDROP TABLE zz", FILE);
  assert.equal(so.class, "stored-only");
  assert.equal(so.stored_only, 1);
  for (const r of [h1, h2, so]) assert.ok(DIFF_CLASSES.includes(r.class));
});

test("diffRecord: whitespace, comments and a trailing semicolon do not move the hash; a changed literal does", () => {
  const a = diffRecord("CREATE TABLE a (id int)", FILE);
  const b = diffRecord("CREATE   TABLE a (id int) ;", `-- note\n${FILE}`);
  assert.equal(a.sha256, b.sha256);
  const c = diffRecord("CREATE TABLE a (id int)", FILE.replace("(id)", "(id, id)"));
  assert.notEqual(a.sha256, c.sha256);
  assert.ok(sameDiff(a, b));
  assert.ok(!sameDiff(a, c));
  assert.ok(!sameDiff(null, a));
});

test("annotateMap: writes the record on code-differs entries only and does not mutate the input", () => {
  const map = {
    "001": { name: "a", file: "001_a.sql", class: "code-differs" },
    "002": { name: "b", file: "002_b.sql", class: "identical", diff: { class: "file-only", file_only: 1, stored_only: 0, sha256: "x" } },
  };
  const before = JSON.stringify(map);
  const out = annotateMap(map, new Map([["001", "CREATE TABLE a (id int)"], ["002", "SELECT 1"]]), new Map([["001_a.sql", FILE], ["002_b.sql", "SELECT 1;"]]));
  assert.deepEqual(out.problems, []);
  assert.equal(out.recorded, 1);
  assert.equal(out.map["001"].diff.class, "file-only");
  assert.equal("diff" in out.map["002"], false, "a stale record on a non-differing class is removed");
  assert.equal(JSON.stringify(map), before);
  // idempotent
  const again = annotateMap(out.map, new Map([["001", "CREATE TABLE a (id int)"], ["002", "SELECT 1"]]), new Map([["001_a.sql", FILE], ["002_b.sql", "SELECT 1;"]]));
  assert.equal(serializeMap(again.map), serializeMap(out.map));
});

test("ATTACK annotateMap: a code-differs entry whose text now matches, whose file is gone, or whose ledger row stored nothing is a problem", () => {
  const map = { "001": { name: "a", file: "001_a.sql", class: "code-differs" } };
  assert.match(annotateMap(map, new Map([["001", "CREATE TABLE a (id int);\nCREATE INDEX a_i ON a (id)"]]), new Map([["001_a.sql", FILE]])).problems[0], /no longer differs/);
  assert.match(annotateMap(map, new Map([["001", "SELECT 1"]]), new Map()).problems[0], /not in the repo/);
  assert.match(annotateMap(map, new Map([["001", null]]), new Map([["001_a.sql", FILE]])).problems[0], /no stored statements/);
});

test("storedFromExportDir reads the export format: header line dropped, NULL rows null", () => {
  const dir = mkdtempSync(join(tmpdir(), "mhdiff-"));
  try {
    writeFileSync(join(dir, "index.json"), JSON.stringify([
      { version: "001", name: "a", file: "001_a.sql", statements_null: false },
      { version: "002", name: "b", file: "002_b.sql", statements_null: true },
    ]));
    writeFileSync(join(dir, "001_a.sql"), "-- header\r\nCREATE TABLE a (id int);\r\n");
    writeFileSync(join(dir, "002_b.sql"), "-- header\n");
    const m = storedFromExportDir(dir);
    assert.equal(m.get("001"), "CREATE TABLE a (id int);\n");
    assert.equal(m.get("002"), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CONFORMANCE: every code-differs entry of the committed map carries a well-formed diff record; no other class does", () => {
  const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));
  let n = 0;
  for (const v of ledgerKeys(map)) {
    const e = map[v];
    if (e.class === "code-differs") {
      n++;
      assert.ok(e.diff, `${v} ${e.file}: code-differs without a diff record; run migration-history-diff.mjs --write after the generator`);
      assert.ok(DIFF_CLASSES.includes(e.diff.class), `${v}: diff class`);
      assert.ok(Number.isInteger(e.diff.file_only) && Number.isInteger(e.diff.stored_only), `${v}: counts`);
      assert.ok(e.diff.file_only + e.diff.stored_only > 0, `${v}: a recorded difference has at least one statement`);
      assert.match(e.diff.sha256, /^[0-9a-f]{64}$/, `${v}: sha256`);
      const expect = e.diff.file_only && e.diff.stored_only ? "changed-in-place" : e.diff.file_only ? "file-only" : "stored-only";
      assert.equal(e.diff.class, expect, `${v}: class follows the counts`);
    } else assert.equal("diff" in e, false, `${v}: a ${e.class} entry carries a diff record`);
  }
  assert.ok(n > 0);
});

test("ACCEPTANCE (runs when MIGRATION_EXPORT_DIR names a ledger export): every committed record equals the one recomputed from the export", (t) => {
  const dir = process.env.MIGRATION_EXPORT_DIR;
  if (!dir) { t.skip("MIGRATION_EXPORT_DIR not set: the ledger export lives in a coordinator scratch directory"); return; }
  const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));
  const stored = storedFromExportDir(dir);
  const migDir = MAP_PATH.replace(/APPLIED-MAP\.json$/, "");
  for (const v of ledgerKeys(map)) {
    const e = map[v];
    if (e.class !== "code-differs") continue;
    const rec = diffRecord(stored.get(v), readFileSync(join(migDir, e.file), "utf8").replace(/\r\n/g, "\n"));
    assert.ok(sameDiff(e.diff, rec), `${v} ${e.file}: committed diff differs from the export-derived diff`);
  }
});
