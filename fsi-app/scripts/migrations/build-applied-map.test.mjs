// build-applied-map.test.mjs: proof of the APPLIED-MAP generator and of the committed map (lane MIG-HIST-1).
// No npm imports. The acceptance check that every recovered file's body is byte-identical to its export file
// reads the 2026-10-07 export directory and so runs only when MIGRATION_EXPORT_DIR names it (a coordinator
// scratch directory, never in the tree); without it that one test reports a skip, the rest always run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { buildAppliedMap, serializeMap, addNeverEntries, NEVER_NOTE_PREFIX, ROW_RULINGS, FILE_RULINGS, MIG_DIR, MAP_PATH, ledgerKeys, fileEntries, fileKey } from "./build-applied-map.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveMap } from "../proof/applied-map.mjs";
import { planReplay, parseInventoryOrder } from "../proof/replay-migrations.mjs";
import { parseAppliedInventory } from "../proof/sync-applied-migrations.mjs";
import { recoveredBody, statusClassOfFile, declaresNotApplied, RECOVERED_BODY_MARKER } from "./migration-compare.mjs";

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
  const ok = build(rec([], [{ file: "299_item_type_required_slots_wave3.sql" }], [], []));
  assert.deepEqual(Object.keys(ok.map), ["never:299_item_type_required_slots_wave3.sql"]);
  const e = ok.map["never:299_item_type_required_slots_wave3.sql"];
  assert.equal(e.class, "never-applied");
  assert.equal(e.file, "299_item_type_required_slots_wave3.sql");
  assert.equal(e.name, "item_type_required_slots_wave3");
  assert.ok(e.note && e.note.length > 0);
  assert.equal("files_without_row" in ok.map, false);
});

test("a file with no row and no ruling whose own header says NOT APPLIED is never-applied (derived, not ruled)", () => {
  const r = build(rec([], [{ file: "888_loose.sql", header_says_not_applied: true, header_line: "-- NOT APPLIED. Authored by lane X." }], [], []));
  assert.equal(r.problems.some((p) => p.includes("888_loose.sql")), false);
  assert.equal(r.map["never:888_loose.sql"].class, "never-applied");
  assert.ok(r.map["never:888_loose.sql"].note.includes("NOT APPLIED"));
  const keyed = build(rec([], [{ file: "888_loose.sql", header_says_not_applied: false }], [], []));
  assert.ok(keyed.problems.some((p) => p.includes("888_loose.sql")), "no header and no ruling is still a problem");
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

// ---- --add-never: a new NOT APPLIED migration gets its keyed entry without an export (lane SEC-6) ---------------------------
// Every lane that adds a migration runs `node fsi-app/scripts/migrations/build-applied-map.mjs --add-never --write`.
const NEW_FILE = "375_admin_flag_private.sql";
const SUBJECT = "-- subject: Migration 375 (lane SEC-6, 2026-10-08): profiles.is_platform_admin becomes readable by nobody but the system and, through two definer functions, its owner. A SECURITY DEFINER predicate";
const addFixture = {
  "001_x.sql": "-- subject: x\nCREATE TABLE x (id int);\n",
  "002_covered.sql": "-- subject: c\nSELECT 1;\n",
  "003_super.sql": "-- subject: s\nSELECT 1;\n",
  "004_keyed.sql": "-- subject: k\nSELECT 1;\n",
  [NEW_FILE]: `${SUBJECT}\n-- 375 -- x\n--\n-- NOT APPLIED. Authored by lane SEC-6.\nBEGIN;\nCOMMIT;\n`,
};
const baseMap = () => ({
  "001": { name: "x", file: "001_x.sql", class: "identical" },
  "20260101000000": { name: "y", file: "002_covered.sql", class: "identical" },
  "20260101000001": { name: "z", file: null, class: "superseded-by", superseded_by: "003_super.sql", note: "n" },
  "never:004_keyed.sql": { name: "keyed", file: "004_keyed.sql", class: "never-applied", note: "kept" },
});
const runAdd = (map, fx = addFixture) => addNeverEntries({ map, listFiles: Object.keys(fx), readFile: (f) => fx[f] });

test("--add-never: one new NOT APPLIED file gains exactly one keyed entry in the existing shape, nothing else changes", () => {
  const before = baseMap();
  const r = runAdd(before);
  assert.deepEqual(r.refused, []);
  assert.deepEqual(r.added, [NEW_FILE]);
  assert.deepEqual(Object.keys(r.map).filter((k) => !(k in before)), [`never:${NEW_FILE}`]);
  assert.deepEqual(r.map[`never:${NEW_FILE}`], {
    name: "admin_flag_private",
    file: NEW_FILE,
    class: "never-applied",
    note: `${NEVER_NOTE_PREFIX}${SUBJECT.slice(0, 160)}`,
  });
  for (const k of Object.keys(before)) assert.deepEqual(r.map[k], before[k], `${k} must be untouched`);
  assert.deepEqual(before, baseMap(), "the input map is not mutated");
});

test("--add-never: the note is the shape the committed never-applied entries carry (prefix plus the subject line cut at 160 characters)", () => {
  const committed = JSON.parse(readFileSync(MAP_PATH, "utf8"));
  // Whichever derived never-applied entries the committed map carries now (an entry leaves when its migration is applied).
  for (const k of Object.keys(committed).filter((x) => x.startsWith("never:") && String(committed[x].note).startsWith(NEVER_NOTE_PREFIX))) {
    const e = committed[k];
    const text = readFileSync(join(MIG_DIR, e.file), "utf8").replace(/\r\n/g, "\n");
    const subject = text.split("\n").find((l) => l.startsWith("-- subject:"));
    assert.equal(e.note, `${NEVER_NOTE_PREFIX}${subject.slice(0, 160)}`, k);
    assert.equal(e.name, e.file.replace(/\.sql$/, "").replace(/^\d+_/, ""), k);
  }
});

test("--add-never: a file already named by a ledger row, a superseded_by or a keyed entry is untouched, and a second run adds nothing", () => {
  const first = runAdd(baseMap());
  const again = runAdd(first.map);
  assert.deepEqual(again.added, []);
  assert.deepEqual(again.refused, []);
  assert.deepEqual(again.map, first.map);
  const noNew = { ...addFixture };
  delete noNew[NEW_FILE];
  const r = runAdd(baseMap(), noNew);
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.map, baseMap());
});

test("--add-never: a file with no entry whose header does not say NOT APPLIED is refused, named, and the map is returned unchanged", () => {
  const fx = { ...addFixture, "376_no_header.sql": "-- subject: Migration 376 (lane X)\nBEGIN;\nCOMMIT;\n", "377_late.sql": `${"-- filler\n".repeat(40)}-- NOT APPLIED. beyond line 30\n` };
  const r = runAdd(baseMap(), fx);
  assert.deepEqual(r.refused.map((x) => x.file), ["376_no_header.sql", "377_late.sql"]);
  for (const x of r.refused) assert.match(x.reason, /NOT APPLIED/);
  assert.equal(`never:376_no_header.sql` in r.map, false);
  assert.equal(`never:377_late.sql` in r.map, false);
  assert.deepEqual(r.added, [NEW_FILE], "the valid file is still reported, the CLI decides not to write when anything is refused");
});

test("--add-never: serializeMap reproduces the committed map byte for byte, so a write touches only the added lines", () => {
  const text = readFileSync(MAP_PATH, "utf8").replace(/\r\n/g, "\n");
  assert.equal(serializeMap(JSON.parse(text)), text);
});

test("--add-never CLI (dry): on the committed tree it prints a map equal to the committed one (nothing to add), exit 0", () => {
  const script = fileURLToPath(new URL("./build-applied-map.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [script, "--add-never"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.replace(/\r\n/g, "\n"), readFileSync(MAP_PATH, "utf8").replace(/\r\n/g, "\n"));
  assert.match(r.stderr, /add-never: 0 added/);
});

// ---- the committed map against the committed directory ----------------------------------------------------
const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));
const versions = ledgerKeys(map);
const sqlFiles = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql"));
const base = (p) => p;
// Files that some ledger row names (as its file or its superseder).
const namedByRows = new Set();
for (const v of versions) { if (map[v].file) namedByRows.add(map[v].file); if (map[v].superseded_by) namedByRows.add(map[v].superseded_by); }
// The never-applied set as the FILES say it, not as a list kept here: no ledger row names the file, and
// either its first-line status is NEVER APPLIED or it has no first-line status and its own header carries the
// two-track line "-- NOT APPLIED". A migration that lands NOT APPLIED changes this set and the map together
// (the generator derives the same way), so only a real mismatch fails.
const headerNeverApplied = sqlFiles.filter((f) => {
  if (namedByRows.has(f)) return false;
  const text = readFileSync(join(MIG_DIR, f), "utf8");
  const cls = statusClassOfFile(text);
  return cls === "never-applied" || (cls == null && declaresNotApplied(text));
}).sort();

test("the map covers all 365 ledger rows, every value has name and class, and every named file exists", () => {
  assert.equal(versions.length, 365);
  for (const v of versions) {
    const e = map[v];
    assert.ok(typeof e.name === "string" && typeof e.class === "string", v);
    if (e.file) assert.ok(sqlFiles.includes(base(e.file)), `${v}: ${e.file}`);
    if (e.superseded_by) assert.ok(sqlFiles.includes(base(e.superseded_by)), `${v}: ${e.superseded_by}`);
    if (e.file == null) assert.ok(e.superseded_by, `${v}: no file and no superseded_by`);
  }
});

test("every repo .sql file is named by an entry (ledger row, superseder or keyed file entry), and its first-line status matches", () => {
  const named = namedByRows;
  const without = new Map(fileEntries(map).map((f) => [base(f.file), f]));
  const wantStatus = { "never-applied": "never-applied", "outside-ledger": "outside-ledger", "duplicate-prefix": "duplicate-prefix" };
  for (const f of sqlFiles) {
    assert.ok(named.has(f) || without.has(f), `${f} is not accounted for`);
    const cls = statusClassOfFile(readFileSync(join(MIG_DIR, f), "utf8"));
    if (without.has(f)) {
      const w = without.get(f);
      if (w.class === "never-applied" && cls == null) assert.ok(declaresNotApplied(readFileSync(join(MIG_DIR, f), "utf8")), `${f}: no first-line status and no NOT APPLIED header`);
      else assert.equal(cls, wantStatus[w.class], `${f}: first-line status`);
    }
    else if (cls) assert.equal(cls, "applied-under-ledger", `${f}: carries ${cls} but has no keyed file entry`);
  }
  const neverInMap = [...without.keys()].filter((f) => without.get(f).class === "never-applied").sort();
  assert.deepEqual(neverInMap, headerNeverApplied, "the map's never-applied entries equal the set the files' own headers declare");
  assert.ok(headerNeverApplied.includes("299_item_type_required_slots_wave3.sql"), "the set is not vacuous: 299 carries a first-line NEVER APPLIED status");
  const classCount = (c) => [...without.values()].filter((w) => w.class === c).length;
  assert.equal(classCount("duplicate-prefix"), 0, "ruling 2026-10-08: no file is skipped as a duplicate prefix any more");
  assert.equal(classCount("outside-ledger"), 10);
  for (const f of ["006_rls_multi_tenant.sql", "007_full_brief.sql", "007_rls_community.sql"]) assert.equal(without.get(f).class, "outside-ledger", f);
  assert.match(without.get("007_full_brief.sql").note, /^replay run 37779804328: 035 depends on intelligence_items\.full_brief, created only in 007_full_brief; siblings by the same shape$/);
  assert.equal(without.size, 10 + neverInMap.length);
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
test("CONFORMANCE: the committed map resolves through the replay reader with no error, no unreferenced file, and its never-applied skips are exactly the header-declared set", () => {
  const ledger = parseAppliedInventory(readFileSync(resolve(MIG_DIR, "..", "..", "docs", "inventories", "applied-migrations.json"), "utf8"));
  assert.equal(ledger.length, versions.length, "applied-migrations.json and the map hold the same ledger rows");
  const inventoryRows = parseInventoryOrder(readFileSync(resolve(MIG_DIR, "..", "..", "..", "docs", "inventories", "migrations.md"), "utf8"));
  const r = resolveMap({ ledger, map, diskFiles: sqlFiles, orderFiles: inventoryRows.map((x) => x.file) });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.unreferenced, []);
  assert.deepEqual(r.skipped.filter((x) => x.class === "never-applied").map((x) => x.file).sort(), headerNeverApplied);
  const plan = planReplay(inventoryRows, sqlFiles, ledger, readFileSync(MAP_PATH, "utf8"));
  assert.deepEqual(plan.errors, []);
});
