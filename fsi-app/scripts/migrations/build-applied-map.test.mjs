// build-applied-map.test.mjs: proof of the APPLIED-MAP generator and of the committed map (lane MIG-HIST-1).
// No npm imports. The acceptance check that every recovered file's body is byte-identical to its export file
// reads the 2026-10-07 export directory and so runs only when MIGRATION_EXPORT_DIR names it (a coordinator
// scratch directory, never in the tree); without it that one test reports a skip, the rest always run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { buildAppliedMap, serializeMap, ROW_RULINGS, FILE_RULINGS, MIG_DIR, MAP_PATH, ledgerKeys, fileEntries, fileKey } from "./build-applied-map.mjs";
import { resolveMap } from "../proof/applied-map.mjs";
import { planReplay, parseInventoryOrder } from "../proof/replay-migrations.mjs";
import { parseAppliedInventory } from "../proof/sync-applied-migrations.mjs";
import { recoveredBody, statusClassOfFile, RECOVERED_BODY_MARKER } from "./migration-compare.mjs";
import { ledgerCount, accountFor, neverAppliedFiles } from "../../supabase/migrations/_lib/applied-status.mjs";

// ---- the generator on fixtures ------------------------------------------------------------------------
const rec = (a, b, c, d) => ({ a, b, c, d });
const files = {
  "001_x.sql": "-- subject: x\nCREATE TABLE x (id int);\n",
  "225_gate_a_criterion7.sql": "-- subject: g\nSELECT 1;\n",
  "273_coverage_gap_candidates_live_ddl_catchup.sql": "-- subject: c\nSELECT 1;\n",
  "299_never.sql": "/* status: NEVER APPLIED (x) */\n-- subject: n\nSELECT 1;\n",
};
const stored = { "001|x": "CREATE TABLE x (id int)", "20260726195325|gate_a_criterion_7": "SELECT 2" };
const build = (reconciliation, extra = {}) =>
  buildAppliedMap({
    reconciliation,
    readStored: (v, n) => stored[`${v}|${n}`] ?? null,
    readFile: (f) => files[f],
    listFiles: Object.keys(files),
    ...extra,
  });

test("a matched pair is classified by the shared comparison; a paired row compares against its file", () => {
  const r = build(rec(
    [{ version: "20260726195325", name: "gate_a_criterion_7" }],
    [],
    [],
    [{ version: "001", applied_name: "x", file: "001_x.sql" }],
  ));
  assert.equal(r.map["001"].class, "identical");
  assert.equal(r.map["20260726195325"].class, "code-differs");
  assert.equal(r.map["20260726195325"].file, "225_gate_a_criterion7.sql", "file names are bare, as the reader compares them with the directory listing");
});

test("a row with no ruling is a problem (no silent guess)", () => {
  const r = build(rec([{ version: "99999999999999", name: "mystery" }], [], [], []));
  assert.ok(r.problems.some((p) => p.includes("no ruling for applied row 99999999999999")));
});

test("a ruling for a version the reconciliation does not hold is a problem", () => {
  const r = build(rec([], [], [], []));
  assert.ok(r.problems.some((p) => p.startsWith("ruling for a version not in set a")));
});

test("a file with no ledger row and no ruling is a problem; with a ruling it is its own keyed entry in the reader form", () => {
  const bad = build(rec([], [{ file: "888_loose.sql" }], [], []));
  assert.ok(bad.problems.some((p) => p.includes("888_loose.sql")));
  const ok = build(rec([], [{ file: "202_standard_own_body_floor.sql" }], [], []));
  assert.deepEqual(Object.keys(ok.map), ["outside:202_standard_own_body_floor.sql"]);
  const e = ok.map["outside:202_standard_own_body_floor.sql"];
  assert.equal(e.class, "outside-ledger");
  assert.equal(e.file, "202_standard_own_body_floor.sql");
  assert.equal(e.name, "standard_own_body_floor");
  assert.ok(e.note && e.note.length > 0);
  assert.equal("files_without_row" in ok.map, false);
});

test("a file with no row and no ruling whose own header says NOT APPLIED gets NO map entry and is not a problem (never-applied is derived, not committed)", () => {
  const readFile = (f) => (f === "888_loose.sql" ? "-- subject: s\n--\n-- NOT APPLIED. Authored by lane X.\nSELECT 1;\n" : files[f]);
  const r = build(rec([], [{ file: "888_loose.sql" }], [], []), { readFile });
  assert.equal(r.problems.some((p) => p.includes("888_loose.sql")), false);
  assert.deepEqual(Object.keys(r.map), [], "no never: entry: the map is not appended to by a new migration");
  const first = build(rec([], [{ file: "889_first.sql" }], [], []), { readFile: (f) => (f === "889_first.sql" ? "/* status: NEVER APPLIED (as of 2026-10-07) */\n-- subject: n\nSELECT 1;\n" : files[f]) });
  assert.equal(first.problems.some((p) => p.includes("889_first.sql")), false, "a first-line NEVER APPLIED status derives it too");
  const headerless = build(rec([], [{ file: "888_loose.sql" }], [], []), { readFile: () => "-- subject: s\nSELECT 1;\n" });
  assert.ok(headerless.problems.some((p) => p.includes("888_loose.sql")), "no header and no ruling is still a problem");
});

test("a recovered file is never a matched pair and never a file without a row, however the reconciliation placed it", () => {
  const recText = (v) => "-- subject: r\n-- recovered: 2026-10-07 from schema_migrations\n-- ledger version: " + v + "\n-- ledger name: n\nSELECT 1;\n";
  const recFiles = { ...files, "242_rec.sql": recText("20260801201905"), "243_rec.sql": recText("20260802153524") };
  const run = (reconciliation) => buildAppliedMap({ reconciliation, readStored: () => null, readFile: (f) => recFiles[f], listFiles: Object.keys(recFiles) });
  // 242 matched its row by name (set d); 243 was listed in set b; both must come out as recovered rows
  const r = run(rec(
    [],
    [{ file: "243_rec.sql" }],
    [],
    [{ version: "20260801201905", applied_name: "n", file: "242_rec.sql" }],
  ));
  const rowProblems = r.problems.filter((p) => !p.includes("ruling for a version not in set a") && !p.includes("ruling for a file not in set b") && !p.includes("no ruling for applied row"));
  assert.deepEqual(rowProblems, []);
  assert.equal(r.map["20260801201905"].class, "recovered");
  assert.equal(r.map["20260801201905"].file, "242_rec.sql");
  assert.equal(Object.keys(r.map).some((k) => k.includes("243_rec.sql")), false, "a recovered file in set b gets no file entry");
});

test("serializeMap is deterministic, valid JSON, one entry per line, ledger versions before keyed file entries", () => {
  const r = build(rec([], [], [], [{ version: "001", applied_name: "x", file: "001_x.sql" }]));
  const text = serializeMap(r.map);
  const parsed = JSON.parse(text);
  assert.deepEqual(Object.keys(parsed), ["001"]);
  const mixed = serializeMap({ "never:299_never.sql": { name: "n", file: "299_never.sql", class: "never-applied" }, "20260101000000": { name: "a", file: "001_x.sql", class: "identical" }, "001": { name: "x", file: "001_x.sql", class: "identical" } });
  assert.deepEqual(Object.keys(JSON.parse(mixed)).sort(), ["001", "20260101000000", "never:299_never.sql"]);
  assert.deepEqual(mixed.split("\n").slice(1, 4).map((l) => l.trim().split(":")[0]), ['"001"', '"20260101000000"', '"never']);
  assert.equal(fileKey("outside-ledger", "a.sql"), "outside:a.sql");
  assert.equal(fileKey("duplicate-prefix", "a.sql"), "dup:a.sql");
  assert.equal(serializeMap(r.map), text);
});

test("every ruling carries a class from the fixed vocabulary and a covering file where it has no file", () => {
  const classes = new Set(["recovered", "superseded-by", "data-only", "comment-only"]);
  for (const [v, r] of Object.entries(ROW_RULINGS)) {
    if (r.paired) { assert.ok(r.paired.endsWith(".sql"), v); continue; }
    assert.ok(classes.has(r.class), `${v}: ${r.class}`);
    if (r.class !== "recovered") assert.ok(r.superseded_by && r.note, `${v} needs superseded_by and a note`);
  }
  for (const [f, r] of Object.entries(FILE_RULINGS)) assert.ok(["duplicate-prefix", "outside-ledger", "never-applied"].includes(r.class), f);
});

// ---- the committed map against the committed directory ----------------------------------------------------
const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));
const versions = ledgerKeys(map);
const sqlFiles = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql"));
const base = (p) => p;
// Files that some ledger row names (as its file or its superseder).
const namedByRows = new Set();
for (const v of versions) { if (map[v].file) namedByRows.add(map[v].file); if (map[v].superseded_by) namedByRows.add(map[v].superseded_by); }
const fileTexts = new Map(sqlFiles.map((f) => [f, readFileSync(join(MIG_DIR, f), "utf8").replace(/\r\n/g, "\n")]));
// The never-applied set as the FILES say it (lane MIGTEST-1): a file the map names nowhere whose own header says it is
// not applied. The map carries no never: entry; a new migration adds one file and edits no shared line.
const headerNeverApplied = neverAppliedFiles({ map, files: fileTexts });

test("the map covers every ledger row the committed export holds, every value has name and class, and every named file exists", () => {
  assert.equal(versions.length, ledgerCount(), "the map holds one entry per row of docs/inventories/applied-migrations.json");
  for (const v of versions) {
    const e = map[v];
    assert.ok(typeof e.name === "string" && typeof e.class === "string", v);
    if (e.file) assert.ok(sqlFiles.includes(base(e.file)), `${v}: ${e.file}`);
    if (e.superseded_by) assert.ok(sqlFiles.includes(base(e.superseded_by)), `${v}: ${e.superseded_by}`);
    if (e.file == null) assert.ok(e.superseded_by, `${v}: no file and no superseded_by`);
  }
});

test("every repo .sql file is accounted for (a ledger row, a superseder, a keyed outside-ledger or duplicate-prefix entry, or a NOT APPLIED header), and no never-applied entry is committed", () => {
  const without = new Map(fileEntries(map).map((f) => [base(f.file), f]));
  const wantStatus = { "outside-ledger": "outside-ledger", "duplicate-prefix": "duplicate-prefix" };
  for (const f of sqlFiles) {
    const text = fileTexts.get(f);
    assert.ok(accountFor({ file: f, text, map }).accounted, `${f} is not accounted for: no map entry and its header does not say NOT APPLIED`);
    const cls = statusClassOfFile(text);
    if (without.has(f)) {
      assert.ok(wantStatus[without.get(f).class], `${f}: a committed file entry must be outside-ledger or duplicate-prefix, not ${without.get(f).class}`);
      assert.equal(cls, wantStatus[without.get(f).class], `${f}: first-line status`);
    } else if (cls && cls !== "never-applied") assert.equal(cls, "applied-under-ledger", `${f}: carries ${cls} but has no keyed file entry`);
  }
  assert.deepEqual(fileEntries(map).filter((e) => e.class === "never-applied").map((e) => e.file), [], "never-applied is derived from the header; the map holds no such entry");
  const classCount = (c) => [...without.values()].filter((w) => w.class === c).length;
  assert.equal(classCount("duplicate-prefix"), 0, "ruling 2026-10-08: no file is skipped as a duplicate prefix any more");
  assert.equal(classCount("outside-ledger"), 10);
  for (const f of ["006_rls_multi_tenant.sql", "007_full_brief.sql", "007_rls_community.sql"]) assert.equal(without.get(f).class, "outside-ledger", f);
  assert.match(without.get("007_full_brief.sql").note, /^replay run 37779804328: 035 depends on intelligence_items.full_brief, created only in 007_full_brief; siblings by the same shape$/);
  assert.equal(without.size, 10);
  for (const f of headerNeverApplied) assert.equal(namedByRows.has(f) || without.has(f), false, `${f}: a derived never-applied file is named by no entry`);
});

test("the five applied-under-ledger files each carry the status line naming their ledger version", () => {
  for (const f of ["207_own_body_types_extension.sql", "225_gate_a_criterion7.sql", "248_security_grants_hardening_2026_08_09.sql", "270_widen_org_watchlist_market_series.sql", "317_provisional_sources_status_promoted.sql"]) {
    assert.equal(statusClassOfFile(readFileSync(join(MIG_DIR, f), "utf8")), "applied-under-ledger", f);
  }
});

test("each recovered file: header fields, a body whose hash is its header's, a ledger version the map holds, and no secret", () => {
  const recovered = versions.filter((v) => map[v].class === "recovered");
  assert.equal(recovered.length, 4);
  for (const v of recovered) {
    const name = base(map[v].file);
    const text = readFileSync(join(MIG_DIR, name), "utf8").replace(/\r\n/g, "\n");
    assert.ok(text.startsWith("-- subject: Recovered 2026-10-07 from supabase_migrations.schema_migrations"), name);
    assert.ok(text.includes(`-- ledger version: ${v}\n`), `${name}: ledger version`);
    assert.ok(text.includes(`-- ledger name: ${map[v].name}\n`), `${name}: ledger name`);
    assert.ok(/-- applied status: APPLIED/.test(text) && /-- removal: /.test(text), `${name}: status and removal lines`);
    const body = recoveredBody(text);
    assert.ok(body && body.length > 0, name);
    const sha = /-- body-sha256: ([0-9a-f]{64})/.exec(text)[1];
    assert.equal(createHash("sha256").update(body).digest("hex"), sha, `${name}: body hash`);
    assert.ok(text.includes(RECOVERED_BODY_MARKER));
    assert.equal(/eyJ[A-Za-z0-9_-]{10,}/.test(text), false, `${name}: contains a token-shaped string`);
  }
});

test("a recovered file number is unique among migration files (F51 check 3 for the new files)", () => {
  const nums = new Map();
  for (const f of sqlFiles) { const n = /^(\d+)_/.exec(f)[1]; nums.set(n, [...(nums.get(n) ?? []), f]); }
  for (const v of versions.filter((x) => map[x].class === "recovered")) {
    const n = /^(\d+)_/.exec(base(map[v].file))[1];
    assert.equal(nums.get(n).length, 1, `${n} is shared: ${nums.get(n)}`);
  }
});

test("ACCEPTANCE: each recovered body is byte-identical to the export file body (whole), or a verbatim slice of it (residue)", (t) => {
  const dir = process.env.MIGRATION_EXPORT_DIR;
  if (!dir || !existsSync(dir)) { t.skip("MIGRATION_EXPORT_DIR not set: the export lives in a coordinator scratch directory"); return; }
  for (const v of versions.filter((x) => map[x].class === "recovered")) {
    const text = readFileSync(join(MIG_DIR, base(map[v].file)), "utf8").replace(/\r\n/g, "\n");
    const body = recoveredBody(text);
    const exportText = readFileSync(resolve(dir, `${v}_${map[v].name}.sql`), "utf8").replace(/\r\n/g, "\n");
    const exportBody = exportText.slice(exportText.indexOf("\n") + 1);
    if (/-- scope: FULL/.test(text)) assert.equal(body, exportBody, `${v}: whole body must be byte-identical`);
    else assert.ok(exportBody.includes(body), `${v}: residue must be a verbatim slice of the stored statements`);
  }
});

// ---- the committed map through the reader the replay uses (PROOF-1 applied-map.mjs) --------------------------
test("CONFORMANCE: the committed map resolves through the replay reader with no error, no unreferenced file, and its never-applied skips are exactly the header-derived set", () => {
  const ledger = parseAppliedInventory(readFileSync(resolve(MIG_DIR, "..", "..", "docs", "inventories", "applied-migrations.json"), "utf8"));
  assert.equal(ledger.length, versions.length, "applied-migrations.json and the map hold the same ledger rows");
  const inventoryRows = parseInventoryOrder(readFileSync(resolve(MIG_DIR, "..", "..", "..", "docs", "inventories", "migrations.md"), "utf8"));
  const r = resolveMap({ ledger, map, diskFiles: sqlFiles, orderFiles: inventoryRows.map((x) => x.file), readFile: (f) => fileTexts.get(f) });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.unreferenced, []);
  assert.deepEqual(r.skipped.filter((x) => x.class === "never-applied").map((x) => x.file).sort(), headerNeverApplied);
  const plan = planReplay(inventoryRows, sqlFiles, ledger, readFileSync(MAP_PATH, "utf8"), (f) => fileTexts.get(f));
  assert.deepEqual(plan.errors, []);
});
