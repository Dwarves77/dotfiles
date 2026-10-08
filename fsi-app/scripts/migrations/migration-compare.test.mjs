// migration-compare.test.mjs: proof of the shared comparison (lane MIG-HIST-1). No npm imports.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stripSqlComments,
  splitStatements,
  compareStored,
  isApplyRecordStub,
  recoveredBody,
  RECOVERED_BODY_MARKER,
  statementsContained,
  firstLineStatus,
  statusClassOfFile,
} from "./migration-compare.mjs";

test("comments are removed outside quotes and dollar bodies, kept inside string literals", () => {
  const sql = "-- head\nSELECT 'a -- not a comment' /* gone */ AS x; -- tail\n";
  assert.equal(stripSqlComments(sql).includes("gone"), false);
  assert.equal(stripSqlComments(sql).includes("a -- not a comment"), true);
});

test("comments inside a dollar-quoted body are removed too (they differ between file and stored text)", () => {
  const a = "DO $$ BEGIN -- note one\n PERFORM 1; END $$;";
  const b = "DO $$ BEGIN -- another note\n PERFORM 1; END $$;";
  assert.equal(compareStored(a, b).kind, "identical");
});

test("a semicolon inside a dollar body or a string does not split the statement", () => {
  const st = splitStatements("CREATE FUNCTION f() RETURNS int AS $f$ SELECT 1; $f$ LANGUAGE sql; SELECT 'a;b';");
  assert.equal(st.length, 2);
});

test("identical: same statements, different whitespace, comments and trailing semicolons", () => {
  const stored = "ALTER TABLE t ADD COLUMN c int\n;\nCOMMENT ON TABLE t IS 'x'";
  const file = "-- subject: x\nALTER TABLE t\n  ADD COLUMN c int; -- add it\n\nCOMMENT ON TABLE t IS 'x';\n";
  assert.equal(compareStored(stored, file).kind, "identical");
});

test("comments-only: the file carries a BEGIN/COMMIT wrapper the stored statements never had", () => {
  assert.equal(compareStored("SELECT 1;", "BEGIN;\nSELECT 1;\nCOMMIT;\n").kind, "comments-only");
});

test("comments-only: a stored comment fragment (the CLI split a comment containing a semicolon)", () => {
  const stored = "CREATE INDEX i ON t(a);\nthe rest of a comment that was split off\n;\nCREATE INDEX j ON t(b);";
  const file = "CREATE INDEX i ON t(a);\n-- a comment; the rest of a comment that was split off\nCREATE INDEX j ON t(b);";
  assert.equal(compareStored(stored, file).kind, "comments-only");
});

test("ATTACK: code-differs when the file has a statement production never ran", () => {
  const r = compareStored("CREATE INDEX i ON t(a);", "CREATE INDEX i ON t(a);\nDROP TABLE users;");
  assert.equal(r.kind, "code-differs");
  assert.equal(r.fileOnly.length, 1);
});

test("ATTACK: code-differs when production ran a statement the file lacks", () => {
  const r = compareStored("CREATE INDEX i ON t(a);\nDROP TABLE users;", "CREATE INDEX i ON t(a);");
  assert.equal(r.kind, "code-differs");
  assert.equal(r.storedOnly.length, 1);
});

test("ATTACK: code-differs when one literal inside a statement changed", () => {
  assert.equal(compareStored("UPDATE t SET v = 1;", "UPDATE t SET v = 2;").kind, "code-differs");
});

test("an apply-record note is recognised as a stub, not SQL", () => {
  assert.equal(isApplyRecordStub("apply-record: method=mcp; project_ref=x"), true);
  assert.equal(isApplyRecordStub("SELECT 1"), false);
});

test("recoveredBody returns the exact bytes after the marker line, and null with no marker", () => {
  const text = `-- subject: s\n-- ledger version: 1\n${RECOVERED_BODY_MARKER}\nSELECT 1;\n`;
  assert.equal(recoveredBody(text), "SELECT 1;\n");
  assert.equal(recoveredBody("SELECT 1;\n"), null);
});

test("statementsContained: a residue body is contained, a body with an invented statement is not", () => {
  assert.equal(statementsContained("GRANT x TO y;", "COMMENT ON TABLE t IS 'a';\nGRANT x TO y;"), true);
  assert.equal(statementsContained("GRANT x TO z;", "COMMENT ON TABLE t IS 'a';\nGRANT x TO y;"), false);
});

test("first-line status: block-comment and dash forms, each mapped to its class", () => {
  assert.equal(firstLineStatus("/* status: NEVER APPLIED (as of 2026-10-07) */\n-- subject: x"), "NEVER APPLIED (as of 2026-10-07)");
  assert.equal(statusClassOfFile("/* status: NEVER APPLIED (as of 2026-10-07) */\n-- subject: x"), "never-applied");
  assert.equal(statusClassOfFile("/* status: APPLIED OUTSIDE LEDGER (no row) */\n-- subject: x"), "outside-ledger");
  assert.equal(statusClassOfFile("-- status: NO LEDGER ROW, duplicate prefix, unverified\n-- subject: x"), "duplicate-prefix");
  assert.equal(statusClassOfFile("/* status: APPLIED UNDER LEDGER VERSION 5 */\n-- subject: x"), "applied-under-ledger");
  assert.equal(statusClassOfFile("-- subject: x\nSELECT 1;"), null);
});
