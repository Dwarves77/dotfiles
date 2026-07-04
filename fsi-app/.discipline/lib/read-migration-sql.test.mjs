// @ts-check
// Red-then-green for the shared migration reader (guard-fix 2b/2c, operator ruling 2026-07-04). The whole
// point: EOL-only normalization makes a CRLF-vs-LF-identical migration compare EQUAL (kills the Windows
// autocrlf false-fail) WHILE a genuine content divergence stays UNEQUAL (the byte-identical guard keeps its
// teeth). Both fixtures live here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEol } from "./read-migration-sql.mjs";

const SQL_LF = "CREATE FUNCTION f()\nRETURNS int\nAS $$ SELECT 1 $$;\n";
const SQL_CRLF = "CREATE FUNCTION f()\r\nRETURNS int\r\nAS $$ SELECT 1 $$;\r\n"; // same content, Windows checkout
const SQL_DIVERGENT = "CREATE FUNCTION f()\nRETURNS bigint\nAS $$ SELECT 1 $$;\n"; // int -> bigint: a REAL change

test("GREEN: a CRLF variant of identical SQL normalizes EQUAL to the LF form (kills the autocrlf false-fail)", () => {
  assert.equal(normalizeEol(SQL_CRLF), normalizeEol(SQL_LF));
  assert.equal(normalizeEol(SQL_CRLF), SQL_LF); // LF is the canonical form
});

test("RED PRESERVED: a genuine content divergence stays UNEQUAL after normalization (guard keeps its teeth)", () => {
  assert.notEqual(normalizeEol(SQL_DIVERGENT), normalizeEol(SQL_LF));
});

test("normalizeEol handles lone CR and is idempotent; EOL-ONLY (no trim/case/whitespace changes)", () => {
  assert.equal(normalizeEol("a\rb"), "a\nb");
  assert.equal(normalizeEol(normalizeEol(SQL_CRLF)), normalizeEol(SQL_CRLF));
  assert.equal(normalizeEol("  KEEP  Spaces And CASE \n"), "  KEEP  Spaces And CASE \n"); // nothing but EOL touched
});
