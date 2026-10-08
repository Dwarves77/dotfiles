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
  "dup:008_dup.sql": { name: "dup", file: "008_dup.sql", class: "duplicate-prefix" },
};
const ORDER = FILES;
// 007 is in no map entry and says NOT APPLIED in its own header: never-applied by derivation (lane MIGTEST-1).
const TEXTS = { "007_never.sql": "-- subject: n\n--\n-- NOT APPLIED. Authored by lane X.\nSELECT 1;\n" };
const readFile = (f) => TEXTS[f] ?? "-- subject: plain\nSELECT 1;\n";
const run = (over = {}) => resolveMap({ ledger: LEDGER, map: { ...MAP, ...over.map }, diskFiles: over.diskFiles ?? FILES, orderFiles: over.orderFiles ?? ORDER, readFile: "readFile" in over ? over.readFile : readFile });

test("the class list is the ruled one", () => {
  assert.deepEqual([...CLASSES].sort(), ["apply-record-stub", "code-differs", "comment-only", "comments-only", "data-only", "duplicate-prefix", "identical", "outside-ledger", "recovered", "statements-null", "superseded-by"]);
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

test("a duplicate-prefix entry, and an unmapped file whose own header says NOT APPLIED, are skipped and listed, not applied", () => {
  const r = run();
  assert.deepEqual(r.skipped.map((s) => [s.file, s.class]), [["007_never.sql", "never-applied"], ["008_dup.sql", "duplicate-prefix"]]);
  assert.ok(!r.toApply.some((t) => ["007_never.sql", "008_dup.sql"].includes(t.file)));
});

test("a file on disk that no entry references and whose header does not say NOT APPLIED is listed as unreferenced, not an error", () => {
  const r = run({ diskFiles: [...FILES, "010_orphan.sql"] });
  assert.deepEqual(r.unreferenced, ["004_d.sql", "010_orphan.sql"]);
  assert.deepEqual(r.errors, []);
});

test("a never-applied file is derived from its header only: no readFile or a header without NOT APPLIED leaves it unreferenced (the one failure), and no map entry ever names it", () => {
  assert.ok(run({ readFile: undefined }).unreferenced.includes("007_never.sql"), "without readFile nothing can be derived");
  assert.ok(run({ readFile: () => "-- subject: x\nSELECT 1;\n" }).unreferenced.includes("007_never.sql"), "no NOT APPLIED header: unreferenced");
  assert.equal(run().unreferenced.includes("007_never.sql"), false, "a NOT APPLIED header: accounted for, no entry needed");
  assert.equal("never:007_never.sql" in MAP, false, "the fixture map carries no never: entry");
});

test("a first-line NEVER APPLIED status also derives never-applied", () => {
  const r = run({ readFile: (f) => (f === "007_never.sql" ? "/* status: NEVER APPLIED (as of 2026-10-07) */\n-- subject: n\nSELECT 1;\n" : readFile(f)) });
  assert.deepEqual(r.skipped.filter((s) => s.class === "never-applied").map((s) => s.file), ["007_never.sql"]);
});

test("ERROR: a committed never-applied entry is refused (such files are derived from the header, never committed in the map)", () => {
  const r = run({ map: { "never:007_never.sql": { name: "never", file: "007_never.sql", class: "never-applied" } } });
  assert.ok(r.errors.some((e) => e.kind === "never_entry_committed" && e.key === "never:007_never.sql"));
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
  const r = run({ map: { "dup:001": { name: "x", file: "001_a.sql", class: "duplicate-prefix" } } });
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

test("statements-null and apply-record-stub: the file is the only text there is, so it is applied like identical", () => {
  const r = run({ map: {
    "001": { name: "a", file: "001_a.sql", class: "statements-null" },
    "002": { name: "b", file: "002_b.sql", class: "apply-record-stub" },
  } });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.toApply.map((t) => [t.file, t.class]).slice(0, 2), [["001_a.sql", "statements-null"], ["002_b.sql", "apply-record-stub"]]);
});

test("ERROR: statements-null with a null file is refused like any apply class; an invented class is still refused", () => {
  const r = run({ map: { "001": { name: "a", file: null, class: "statements-null" }, "002": { name: "b", file: "002_b.sql", class: "statements-unknown" } } });
  assert.ok(r.errors.some((e) => e.kind === "entry_needs_file" && e.key === "001"));
  assert.ok(r.errors.some((e) => e.kind === "class_unknown" && e.key === "002"));
});
