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
