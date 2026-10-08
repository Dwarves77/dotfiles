// build-applied-map.test.mjs: proof of the APPLIED-MAP generator and of the committed map (lane MIG-HIST-1).
// No npm imports. The acceptance check that every recovered file's body is byte-identical to its export file
// reads the 2026-10-07 export directory and so runs only when MIGRATION_EXPORT_DIR names it (a coordinator
// scratch directory, never in the tree); without it that one test reports a skip, the rest always run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { buildAppliedMap, serializeMap, ROW_RULINGS, FILE_RULINGS, MIG_DIR, MAP_PATH, REPO_MIG_PREFIX } from "./build-applied-map.mjs";
import { recoveredBody, statusClassOfFile, RECOVERED_BODY_MARKER } from "./migration-compare.mjs";

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
  assert.equal(r.map["20260726195325"].file, `${REPO_MIG_PREFIX}225_gate_a_criterion7.sql`);
});

test("a row with no ruling is a problem (no silent guess)", () => {
  const r = build(rec([{ version: "99999999999999", name: "mystery" }], [], [], []));
  assert.ok(r.problems.some((p) => p.includes("no ruling for applied row 99999999999999")));
});

test("a ruling for a version the reconciliation does not hold is a problem", () => {
  const r = build(rec([], [], [], []));
  assert.ok(r.problems.some((p) => p.startsWith("ruling for a version not in set a")));
});

test("a file with no ledger row and no ruling is a problem; with a ruling it lands in files_without_row", () => {
  const bad = build(rec([], [{ file: "888_loose.sql" }], [], []));
  assert.ok(bad.problems.some((p) => p.includes("888_loose.sql")));
  const ok = build(rec([], [{ file: "299_item_type_required_slots_wave3.sql" }], [], []));
  assert.equal(ok.map.files_without_row.length, 1);
  assert.equal(ok.map.files_without_row[0].class, "never-applied");
});

test("serializeMap is deterministic, valid JSON, versions ascending, files_without_row last", () => {
  const r = build(rec([], [], [], [{ version: "001", applied_name: "x", file: "001_x.sql" }]));
  const text = serializeMap(r.map);
  const parsed = JSON.parse(text);
  assert.deepEqual(Object.keys(parsed), ["001", "files_without_row"]);
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
const versions = Object.keys(map).filter((k) => k !== "files_without_row");
const sqlFiles = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql"));
const base = (p) => p.replace(REPO_MIG_PREFIX, "");

test("the map covers all 352 ledger rows, every value has name and class, and every named file exists", () => {
  assert.equal(versions.length, 352);
  for (const v of versions) {
    const e = map[v];
    assert.ok(typeof e.name === "string" && typeof e.class === "string", v);
    if (e.file) assert.ok(sqlFiles.includes(base(e.file)), `${v}: ${e.file}`);
    if (e.superseded_by) assert.ok(sqlFiles.includes(base(e.superseded_by)), `${v}: ${e.superseded_by}`);
    if (e.file == null) assert.ok(e.superseded_by, `${v}: no file and no superseded_by`);
  }
});

test("every repo .sql file is named by an entry or is in files_without_row, and its first-line status matches", () => {
  const named = new Set();
  for (const v of versions) { if (map[v].file) named.add(base(map[v].file)); if (map[v].superseded_by) named.add(base(map[v].superseded_by)); }
  const without = new Map(map.files_without_row.map((f) => [base(f.file), f]));
  const wantStatus = { "never-applied": "never-applied", "outside-ledger": "outside-ledger", "duplicate-prefix": "duplicate-prefix" };
  for (const f of sqlFiles) {
    assert.ok(named.has(f) || without.has(f), `${f} is not accounted for`);
    const cls = statusClassOfFile(readFileSync(join(MIG_DIR, f), "utf8"));
    if (without.has(f)) assert.equal(cls, wantStatus[without.get(f).class], `${f}: first-line status`);
    else if (cls) assert.equal(cls, "applied-under-ledger", `${f}: carries ${cls} but is not in files_without_row`);
  }
  assert.equal(without.size, 11);
});

test("the five applied-under-ledger files each carry the status line naming their ledger version", () => {
  for (const f of ["207_own_body_types_extension.sql", "225_gate_a_criterion7.sql", "248_security_grants_hardening_2026_08_09.sql", "270_widen_org_watchlist_market_series.sql", "317_provisional_sources_status_promoted.sql"]) {
    assert.equal(statusClassOfFile(readFileSync(join(MIG_DIR, f), "utf8")), "applied-under-ledger", f);
  }
});

test("each recovered file: header fields, a body whose hash is its header's, a ledger version the map holds, and no secret", () => {
  const recovered = versions.filter((v) => map[v].class === "recovered");
  assert.equal(recovered.length, 5);
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
