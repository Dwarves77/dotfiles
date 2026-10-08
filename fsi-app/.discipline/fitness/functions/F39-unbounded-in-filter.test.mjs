// @ts-check
// Red-then-green for F39 (unbounded-in-filter). A NEW `.in(col, X)` call whose X is a runtime value
// (not an array literal, string literal, or SCREAMING_SNAKE_CASE enum constant) is RED unless it lives
// inside the chunking implementation files, or carries a `// fitness-allow: F39 (reason)` marker on the
// same line or the line above. No allowlist, no expiry (unlike F38) — see this function's own header.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  fitnessFunction,
  isBoundedArgShape,
  findUnboundedInCalls,
} from "./F39-unbounded-in-filter.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");

test("RED: .in(col, runtimeVar) with a bare variable second argument is flagged with file:line", () => {
  const src = 'const { data } = await sb.from("x").select("id").in("id", allIds);';
  const v = fitnessFunction.check("fsi-app/src/lib/some-new-file.ts", src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 1);
  assert.match(v[0].message, /\.in\("id", allIds\)/);
  assert.match(v[0].message, /readAllByIds/);
});

test("RED: .in(col, a.map(...)) — a property/method-chain expression — is flagged the same as a bare variable", () => {
  const src = 'q.in("id", off.map((o) => o.id))';
  const v = fitnessFunction.check("fsi-app/src/lib/some-new-file.ts", src);
  assert.equal(v.length, 1);
});

test("GREEN: .in(col, [literal, array]) — an inline enum array — is never flagged", () => {
  const src = 'q.in("dimension", ["labor_markets", "operational_cost"])';
  assert.deepEqual(fitnessFunction.check("fsi-app/src/lib/some-new-file.ts", src), []);
});

test("GREEN: .in(col, SCREAMING_SNAKE_CONST) — a same-file/imported enum constant — is never flagged", () => {
  const src = 'q.in("claim_kind", CLAIM_KIND_FILTER)';
  assert.deepEqual(fitnessFunction.check("fsi-app/src/lib/some-new-file.ts", src), []);
});

test("GREEN: .in(col, \"literal\") — a single string/template literal — is never flagged", () => {
  const src = 'q.in("status", "open")';
  assert.deepEqual(fitnessFunction.check("fsi-app/src/lib/some-new-file.ts", src), []);
});

test("marker: a trailing `// fitness-allow: F39 (reason)` on the SAME line suppresses the violation", () => {
  const src = 'q.in("id", allIds); // fitness-allow: F39 (bounded by assertBound above)';
  assert.deepEqual(fitnessFunction.check("fsi-app/src/lib/some-new-file.ts", src), []);
});

test("marker: a `// fitness-allow: F39 (reason)` on the PRECEDING line also suppresses the violation", () => {
  const src = '// fitness-allow: F39 (chunked, slice is one fetchAllByIdChunks chunk)\nq.in("id", slice);';
  assert.deepEqual(fitnessFunction.check("fsi-app/src/lib/some-new-file.ts", src), []);
});

test("marker: an F38 marker (a different function id) on the same line does NOT suppress an F39 violation", () => {
  const src = 'q.in("id", allIds); // fitness-allow: F38 (irrelevant to this gate)';
  const v = fitnessFunction.check("fsi-app/src/lib/some-new-file.ts", src);
  assert.equal(v.length, 1);
});

test("helper-internal: db.mjs's own chunking implementation is exempt even with a bare-variable .in()", () => {
  const src = 'const qi = q.in(idColumn, slice);\nreturn match ? match(qi) : qi;';
  assert.deepEqual(fitnessFunction.check("fsi-app/scripts/lib/db.mjs", src), []);
});

test("helper-internal: paginate.mjs's fetchAllByIdChunks core is exempt the same way", () => {
  const src = 'q.in(idColumn, slice)';
  assert.deepEqual(fitnessFunction.check("fsi-app/src/lib/db/paginate.mjs", src), []);
});

test("a file with the SAME basename but a different path is NOT exempt (exact path match only)", () => {
  const src = 'q.in("id", allIds)';
  const v = fitnessFunction.check("fsi-app/scripts/maintenance/db.mjs", src);
  assert.equal(v.length, 1);
});

test("a comment mentioning .in(col, var) (documenting history) is never flagged — only live code", () => {
  const src = "// the old bug used to call .in(\"id\", allIds) here\nconst q2 = sb.from(\"x\").select(\"id\");";
  assert.deepEqual(fitnessFunction.check("fsi-app/src/lib/some-new-file.ts", src), []);
});

test("isBoundedArgShape: array literal, string/template literal, and SCREAMING_SNAKE_CASE constant all read as bounded; a variable, property access, or call do not", () => {
  assert.equal(isBoundedArgShape('["a", "b"]'), true);
  assert.equal(isBoundedArgShape('"a"'), true);
  assert.equal(isBoundedArgShape("'a'"), true);
  assert.equal(isBoundedArgShape("`a`"), true);
  assert.equal(isBoundedArgShape("CLAIM_KIND_FILTER"), true);
  assert.equal(isBoundedArgShape("allIds"), false);
  assert.equal(isBoundedArgShape("off.map((o) => o.id)"), false);
  assert.equal(isBoundedArgShape("ids.split(',')"), false);
  assert.equal(isBoundedArgShape("CANONICAL_ROOM_SLUGS as string[]"), false); // trailing cast breaks the exact-const match
});

test("findUnboundedInCalls: multiple .in() calls on one line are each reported", () => {
  const src = 'q.in("a", idsA).in("b", idsB)';
  const sites = findUnboundedInCalls(src);
  assert.equal(sites.length, 2);
  assert.deepEqual(sites.map((s) => s.col), ['"a"', '"b"']);
});

// ── lane GATE-3 (2026-10-08): a list is bounded by SHAPE, so it needs no marker ─────────────────────────

const NEW_FILE = "fsi-app/src/lib/some-new-file.ts";

test("GATE-3 GREEN: .in(col, X.slice(0, N)) with N <= 500 is bounded with no marker; N = 500 is the edge", () => {
  assert.deepEqual(fitnessFunction.check(NEW_FILE, 'q.in("id", ids.slice(0, 100))'), []);
  assert.deepEqual(fitnessFunction.check(NEW_FILE, 'q.in("id", rows.map((r) => r.id).slice(0, 500))'), []);
});

test("GATE-3 RED: a slice past 500, a non-head slice, or a non-literal bound is still unbounded", () => {
  assert.equal(fitnessFunction.check(NEW_FILE, 'q.in("id", ids.slice(0, 501))').length, 1);
  assert.equal(fitnessFunction.check(NEW_FILE, 'q.in("id", ids.slice(10, 20))').length, 1, "only a head slice is a cap");
  assert.equal(fitnessFunction.check(NEW_FILE, 'q.in("id", ids.slice(0, n))').length, 1, "n is a runtime value");
  assert.equal(fitnessFunction.check(NEW_FILE, 'q.in("id", ids.slice(0))').length, 1, "slice(0) is a copy, not a cap");
});

test("GATE-3 GREEN: a copy or spread of a module-level SCREAMING_SNAKE constant is bounded", () => {
  assert.deepEqual(fitnessFunction.check(NEW_FILE, 'q.in("kind", Array.from(EVENT_KINDS))'), []);
  assert.deepEqual(fitnessFunction.check(NEW_FILE, 'q.in("kind", [...EVENT_KINDS])'), []);
  assert.equal(fitnessFunction.check(NEW_FILE, 'q.in("kind", Array.from(eventKinds))').length, 1, "a lower-case variable is runtime data");
});

test("GATE-3 GREEN: a .in() inside the callback of fetchAllByIdChunks or readAllByIds needs no marker; the same call outside is RED", () => {
  const inside = [
    "const rows = await fetchAllByIdChunks(ids, async (slice) => {",
    '  const { data } = await sb.from("x").select("id").in("id", slice);',
    "  return data ?? [];",
    "});",
  ].join("\n");
  assert.deepEqual(fitnessFunction.check(NEW_FILE, inside), []);
  const viaRead = [
    'const rows = await readAllByIds("x", "id", ids, {',
    '  match: (q) => q.in("status", statuses),',
    "});",
  ].join("\n");
  assert.deepEqual(fitnessFunction.check(NEW_FILE, viaRead), []);
  const outside = inside.replace(/\n\}\);$/, "\n});\n") + '\nconst more = await sb.from("x").select("id").in("id", allIds);';
  const v = fitnessFunction.check(NEW_FILE, outside);
  assert.equal(v.length, 1, "only the call after the helper's closing paren is unbounded");
  assert.equal(v[0].line, 6);
});

test("GATE-3: a helper name inside a comment or a string does not open a bounded span", () => {
  const commented = [
    "// see fetchAllByIdChunks(ids, (slice) => { ... for the pattern",
    'const q2 = sb.from("x").select("id").in("id", allIds);',
  ].join("\n");
  assert.equal(fitnessFunction.check(NEW_FILE, commented).length, 1);
  const stringy = 'const note = "readAllByIds(";\nq.in("id", allIds);\nconst more = ")";';
  assert.equal(fitnessFunction.check(NEW_FILE, stringy).length, 1);
});

test("GATE-3: CRLF content maps a call to the right span (line starts are computed over the real text)", () => {
  const crlf = [
    "const rows = await fetchAllByIdChunks(ids, async (slice) => {",
    '  return sb.from("x").select("id").in("id", slice);',
    "});",
    'sb.from("y").select("id").in("id", allIds);',
  ].join("\r\n");
  const v = fitnessFunction.check(NEW_FILE, crlf);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 4);
});

test("GATE-3: isBoundedArgShape reads the truncated slice tail IN_CALL_RE hands it", () => {
  assert.equal(isBoundedArgShape("ids.slice(0, 200"), true);
  assert.equal(isBoundedArgShape("ids.slice( 0 ,500"), true);
  assert.equal(isBoundedArgShape("ids.slice(0, 501"), false);
  assert.equal(isBoundedArgShape("Array.from(KINDS"), true);
  assert.equal(isBoundedArgShape("Array.from(kinds"), false);
});

test("test files and _archive are excluded from enumeration", () => {
  const files = fitnessFunction.enumerate();
  for (const f of files) {
    assert.doesNotMatch(f, /\.(?:test|selftest|npmtest)\.mjs$/);
    assert.doesNotMatch(f, /\/_archive\//);
  }
});

test("LIVE: the whole scoped tree (fsi-app/src + fsi-app/scripts) passes F39 clean as of this lane's fixes", () => {
  const problems = [];
  for (const f of fitnessFunction.enumerate()) {
    const content = readFileSync(resolve(REPO_ROOT, f), "utf8");
    const v = fitnessFunction.check(f, content);
    if (v.length) problems.push(`${f}: ${v.map((x) => `${x.line}: ${x.message}`).join(" | ")}`);
  }
  assert.deepEqual(problems, []);
});
