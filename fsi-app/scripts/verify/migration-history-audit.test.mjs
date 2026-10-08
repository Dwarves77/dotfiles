// migration-history-audit.test.mjs: fixture proof of the migration-history audit (lane MIG-HIST-1).
// Pattern: a clean fixture passes (green); each failure class is then planted as an attack and must be
// named (red). No pg import: the CLI body is driven through its injected `connect`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateHistory, ledgerFromRows, run } from "./migration-history-audit.mjs";
import { RECOVERED_BODY_MARKER } from "../migrations/migration-compare.mjs";

const P = "fsi-app/supabase/migrations/";
const recoveredText = (body) =>
  `-- subject: Recovered x\n-- recovered: 2026-10-07 from supabase_migrations.schema_migrations\n-- ledger version: 900\n-- ledger name: rec\n-- body-sha256: ${createHash("sha256").update(body).digest("hex")}\n${RECOVERED_BODY_MARKER}\n${body}`;

function clean() {
  const files = new Map([
    ["001_a.sql", "-- subject: a\nCREATE TABLE a (id int);\n"],
    ["002_b.sql", "-- subject: b\nCREATE TABLE b (id int);\n"],
    ["003_view.sql", "-- subject: v\nCREATE VIEW v AS SELECT 1;\n"],
    ["004_covering.sql", "-- subject: c\nCREATE TABLE c (id int);\n"],
    ["241_rec.sql", recoveredText("CREATE EXTENSION IF NOT EXISTS pg_net;\n")],
    ["299_never.sql", "/* status: NEVER APPLIED (as of 2026-10-07; see APPLIED-MAP.json) */\n-- subject: n\nSELECT 1;\n"],
  ]);
  const ledger = [
    { version: "001", name: "a", statements: "CREATE TABLE a (id int)" },
    { version: "002", name: "b", statements: null },
    { version: "900", name: "rec", statements: "CREATE EXTENSION IF NOT EXISTS pg_net;" },
    { version: "20260101000000", name: "data_load", statements: "INSERT INTO c VALUES (1);" },
    { version: "20260101000001", name: "view_comment", statements: "COMMENT ON VIEW v IS 'x';" },
  ];
  const map = {
    "001": { name: "a", file: `${P}001_a.sql`, class: "identical" },
    "002": { name: "b", file: `${P}002_b.sql`, class: "statements-null" },
    "900": { name: "rec", file: `${P}241_rec.sql`, class: "recovered" },
    "20260101000000": { name: "data_load", file: null, class: "data-only", superseded_by: `${P}004_covering.sql` },
    "20260101000001": { name: "view_comment", file: null, class: "comment-only", superseded_by: `${P}003_view.sql` },
    files_without_row: [{ file: `${P}299_never.sql`, class: "never-applied", evidence: "x" }],
  };
  return { ledger, files, map };
}
const codes = (r) => r.failures.map((f) => f.code);

test("GREEN: a clean fixture passes", () => {
  const r = evaluateHistory(clean());
  assert.deepEqual(r.failures, []);
  assert.equal(r.ok, true);
});

test("ATTACK LEDGER_ROW_NOT_IN_MAP: an applied row with no file and no map entry", () => {
  const f = clean();
  f.ledger.push({ version: "20260202000000", name: "orphan", statements: "SELECT 1;" });
  assert.ok(codes(evaluateHistory(f)).includes("LEDGER_ROW_NOT_IN_MAP"));
});

test("ATTACK MAP_ROW_NOT_IN_LEDGER: a stale map entry", () => {
  const f = clean();
  f.map["777"] = { name: "ghost", file: `${P}001_a.sql`, class: "identical" };
  assert.ok(codes(evaluateHistory(f)).includes("MAP_ROW_NOT_IN_LEDGER"));
});

test("ATTACK NO_FILE_NO_SUPERSEDER: the mapped file, or the superseder, is gone", () => {
  const f = clean();
  f.files.delete("001_a.sql");
  f.files.delete("004_covering.sql");
  const r = evaluateHistory(f);
  assert.equal(codes(r).filter((c) => c === "NO_FILE_NO_SUPERSEDER").length, 2);
});

test("ATTACK FILE_NOT_ACCOUNTED: a file with no row and no NEVER APPLIED header", () => {
  const f = clean();
  f.files.set("300_loose.sql", "-- subject: loose\nSELECT 1;\n");
  const r = evaluateHistory(f);
  assert.ok(r.failures.some((x) => x.code === "FILE_NOT_ACCOUNTED" && x.key === "300_loose.sql"));
});

test("ATTACK FILE_STATUS_HEADER: the map says never-applied but the file carries no status line", () => {
  const f = clean();
  f.files.set("299_never.sql", "-- subject: n\nSELECT 1;\n");
  assert.ok(codes(evaluateHistory(f)).includes("FILE_STATUS_HEADER"));
});

test("ATTACK FILE_STATUS_HEADER: a file carries a NEVER APPLIED status the map does not list", () => {
  const f = clean();
  f.files.set("300_claims.sql", "/* status: NEVER APPLIED (as of 2026-10-07) */\n-- subject: c\nSELECT 1;\n");
  const r = evaluateHistory(f);
  assert.ok(r.failures.some((x) => x.code === "FILE_STATUS_HEADER" && x.key === "300_claims.sql"));
});

test("ATTACK CODE_DIFFERS: the stored statements differ from the file in one literal", () => {
  const f = clean();
  f.ledger[0].statements = "CREATE TABLE a (id bigint)";
  const r = evaluateHistory(f);
  assert.ok(codes(r).includes("CODE_DIFFERS"));
  assert.equal(r.ok, false);
});

test("a comment-only difference and a BEGIN/COMMIT wrapper are not a CODE_DIFFERS", () => {
  const f = clean();
  f.files.set("001_a.sql", "-- subject: a\nBEGIN;\n-- a new comment\nCREATE TABLE a (id int);\nCOMMIT;\n");
  f.map["001"].class = "comments-only";
  assert.deepEqual(evaluateHistory(f).failures, []);
});

test("ATTACK MAP_CLASS_STALE: the map says statements-null but the ledger now stores SQL", () => {
  const f = clean();
  f.ledger[1].statements = "CREATE TABLE b (id int)";
  assert.ok(codes(evaluateHistory(f)).includes("MAP_CLASS_STALE"));
});

test("ATTACK MAP_CLASS_STALE: the map says code-differs but the text now matches", () => {
  const f = clean();
  f.map["001"].class = "code-differs";
  assert.ok(codes(evaluateHistory(f)).includes("MAP_CLASS_STALE"));
});

test("ATTACK RECOVERED_BODY: the recovered body was edited after its hash was written", () => {
  const f = clean();
  f.files.set("241_rec.sql", recoveredText("CREATE EXTENSION IF NOT EXISTS pg_net;\n").replace("pg_net;", "pg_net CASCADE;"));
  assert.ok(codes(evaluateHistory(f)).includes("RECOVERED_BODY"));
});

test("ATTACK RECOVERED_BODY: the recovered file holds a statement the ledger row never ran", () => {
  const f = clean();
  f.files.set("241_rec.sql", recoveredText("CREATE EXTENSION IF NOT EXISTS pg_net;\nDROP TABLE users;\n"));
  assert.ok(codes(evaluateHistory(f)).includes("RECOVERED_BODY"));
});

test("an outside-ledger file is a FINDING (objects unverified), never a pass and never a failure", () => {
  const f = clean();
  f.files.set("202_out.sql", "/* status: APPLIED OUTSIDE LEDGER (no row; evidence: log) [HYPOTHESIS until objects verified] */\n-- subject: o\nSELECT 1;\n");
  f.map.files_without_row.push({ file: `${P}202_out.sql`, class: "outside-ledger", evidence: "log line 1; no row" });
  const r = evaluateHistory(f);
  assert.deepEqual(r.failures, []);
  assert.ok(r.findings.some((x) => x.startsWith("OBJECTS_UNVERIFIED 202_out.sql")));
});

test("ledgerFromRows joins statement arrays and keeps NULL as null", () => {
  const out = ledgerFromRows([{ version: "1", name: "n", statements: ["A", "B"] }, { version: "2", name: "m", statements: null }]);
  assert.equal(out[0].statements, "A;\nB");
  assert.equal(out[1].statements, null);
});

test("run(): no database connection exits 2 (cannot verify), never a pass", async () => {
  const errs = [];
  const code = await run({ connect: async () => null, err: (m) => errs.push(m), log: () => {} });
  assert.equal(code, 2);
  assert.match(errs[0], /Cannot verify/);
});

test("run(): drives the audit through an injected client; a clean ledger exits 0, a code difference exits 1", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mhaudit-"));
  try {
    const f = clean();
    for (const [name, text] of f.files) writeFileSync(join(dir, name), text);
    writeFileSync(join(dir, "APPLIED-MAP.json"), JSON.stringify(f.map));
    const rowsFor = (ledger) => ledger.map((r) => ({ version: r.version, name: r.name, statements: r.statements == null ? null : [r.statements] }));
    const client = (ledger) => ({ query: async () => ({ rows: rowsFor(ledger) }), end: async () => {} });
    const logs = [];
    assert.equal(await run({ connect: async () => client(f.ledger), migDir: dir, log: (m) => logs.push(m) }), 0);
    const bad = clean().ledger;
    bad[0].statements = "CREATE TABLE a (id bigint)";
    assert.equal(await run({ connect: async () => client(bad), migDir: dir, log: (m) => logs.push(m) }), 1);
    assert.ok(logs.some((l) => l.includes("CODE_DIFFERS")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
