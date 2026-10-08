/** Tests for scripts/proof/applied-map.mjs: one fixture per class, and each refusal. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAppliedMap, resolveMap, CLASSES } from "./applied-map.mjs";

const FILES = ["001_a.sql", "002_b.sql", "003_c.sql", "004_d.sql", "005_late.sql", "006_live.sql", "007_never.sql", "008_dup.sql", "009_rec.sql"];
const LEDGER = [
  { version: "001", name: "a" }, { version: "002", name: "b" }, { version: "003", name: "c" }, { version: "20260701000000", name: "retro" },
  { version: "20260702000000", name: "load" }, { version: "20260703000000", name: "cmt" }, { version: "20260704000000", name: "rec" },
];
const MAP = {
  "001": { name: "a", file: "001_a.sql", class: "identical" },
  "002": { name: "b", file: "002_b.sql", class: "comments-only" },
  "003": { name: "c", file: "003_c.sql", class: "code-differs" },
  "20260701000000": { name: "retro", file: null, class: "superseded-by", superseded_by: "005_late.sql" },
  "20260702000000": { name: "load", file: null, class: "data-only" },
  "20260703000000": { name: "cmt", file: null, class: "comment-only" },
  "20260704000000": { name: "rec", file: "009_rec.sql", class: "recovered" },
  "outside:006_live.sql": { name: "live", file: "006_live.sql", class: "outside-ledger" },
  "never:007_never.sql": { name: "never", file: "007_never.sql", class: "never-applied" },
  "dup:008_dup.sql": { name: "dup", file: "008_dup.sql", class: "duplicate-prefix" },
};
const ORDER = FILES;
const run = (over = {}) => resolveMap({ ledger: LEDGER, map: { ...MAP, ...over.map }, diskFiles: over.diskFiles ?? FILES, orderFiles: over.orderFiles ?? ORDER });

test("the class list is the ruled one", () => {
  assert.deepEqual([...CLASSES].sort(), ["code-differs", "comment-only", "comments-only", "data-only", "duplicate-prefix", "identical", "never-applied", "outside-ledger", "recovered", "superseded-by"]);
});

test("identical, comments-only, code-differs and recovered: the file is applied, in inventory order", () => {
  const r = run();
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.toApply.map((t) => [t.file, t.class]), [
    ["001_a.sql", "identical"], ["002_b.sql", "comments-only"], ["003_c.sql", "code-differs"], ["006_live.sql", "outside-ledger"], ["009_rec.sql", "recovered"],
  ]);
});

test("superseded-by, data-only and comment-only: satisfied with no file, counted and listed", () => {
  const r = run();
  assert.deepEqual(r.satisfied.map((s) => [s.key, s.class]), [["20260701000000", "superseded-by"], ["20260702000000", "data-only"], ["20260703000000", "comment-only"]]);
  assert.equal(r.satisfied[0].superseded_by, "005_late.sql");
  assert.ok(!r.toApply.some((t) => t.file === "005_late.sql"), "the superseding file is not applied by this entry");
});

test("outside-ledger files are applied even though no ledger version names them", () => {
  assert.ok(run().toApply.some((t) => t.file === "006_live.sql" && t.class === "outside-ledger"));
});

test("never-applied and duplicate-prefix files are skipped and listed, not applied", () => {
  const r = run();
  assert.deepEqual(r.skipped.map((s) => [s.file, s.class]), [["007_never.sql", "never-applied"], ["008_dup.sql", "duplicate-prefix"]]);
  assert.ok(!r.toApply.some((t) => ["007_never.sql", "008_dup.sql"].includes(t.file)));
});

test("a file on disk that no entry references is listed as unreferenced, not an error", () => {
  const r = run({ diskFiles: [...FILES, "010_orphan.sql"] });
  assert.deepEqual(r.unreferenced, ["004_d.sql", "010_orphan.sql"]);
  assert.deepEqual(r.errors, []);
});

test("ERROR: a ledger version absent from the map", () => {
  const map = { ...MAP };
  delete map["002"];
  const r = resolveMap({ ledger: LEDGER, map, diskFiles: FILES, orderFiles: ORDER });
  assert.deepEqual(r.errors.map((e) => [e.kind, e.key]), [["ledger_version_not_in_map", "002"]]);
});

test("ERROR: a map entry whose file is missing on disk", () => {
  const r = run({ diskFiles: FILES.filter((f) => f !== "003_c.sql") });
  assert.ok(r.errors.some((e) => e.kind === "entry_file_missing" && e.file === "003_c.sql"));
});

test("ERROR: a superseded_by file that is missing on disk", () => {
  const r = run({ diskFiles: FILES.filter((f) => f !== "005_late.sql") });
  assert.ok(r.errors.some((e) => e.kind === "superseded_by_missing"));
});

test("ERROR: an apply class with a null file, and an unknown class", () => {
  const r = run({ map: { "001": { name: "a", file: null, class: "identical" }, "002": { name: "b", file: "002_b.sql", class: "wat" } } });
  assert.ok(r.errors.some((e) => e.kind === "entry_needs_file" && e.key === "001"));
  assert.ok(r.errors.some((e) => e.kind === "class_unknown" && e.key === "002"));
});

test("ERROR: a file claimed both to apply and to skip", () => {
  const r = run({ map: { "dup:001": { name: "x", file: "001_a.sql", class: "never-applied" } } });
  assert.ok(r.errors.some((e) => e.kind === "file_conflict" && e.file === "001_a.sql"));
});

test("ERROR: a file to apply that the migrations inventory does not list (order unknown)", () => {
  const r = run({ orderFiles: ORDER.filter((f) => f !== "009_rec.sql") });
  assert.ok(r.errors.some((e) => e.kind === "apply_file_not_in_inventory" && e.file === "009_rec.sql"));
});

test("parseAppliedMap: absent is an error naming the file and MIG-HIST-1; bad JSON and a non-object are refused", () => {
  assert.match(parseAppliedMap(null).error, /APPLIED-MAP\.json is absent.*MIG-HIST-1/);
  assert.match(parseAppliedMap("{nope").error, /not JSON/);
  assert.match(parseAppliedMap("[]").error, /object keyed by ledger version/);
  assert.deepEqual(parseAppliedMap(JSON.stringify(MAP)).map, MAP);
});
