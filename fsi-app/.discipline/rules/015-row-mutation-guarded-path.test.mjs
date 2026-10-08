// Fire-tests for rule 015 (row-mutation guarded path).
// Run: node --test fsi-app/.discipline/rules/015-row-mutation-guarded-path.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './015-row-mutation-guarded-path.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

const RAW = 'const sb = createClient(u, k);\nawait sb.from("intelligence_items").update({ x: 1 }).eq("id", id);\n';
const GUARDED = 'import { guardedUpdate } from "./lib/db.mjs";\nawait guardedUpdate("intelligence_items", qb => qb.eq("id", id), { x: 1 }, { cite });\n';

test('015 trigger: fires on scripts/*.mjs, skips _diag + lib', () => {
  assert.equal(rule.trigger(buildContextFromFixture({
    message: 'x', files: [{ path: 'fsi-app/scripts/foo.mjs', additions: 5, deletions: 0 }],
  })), true);
  assert.equal(rule.trigger(buildContextFromFixture({
    message: 'x', files: [{ path: 'fsi-app/scripts/_diag/foo.mjs', additions: 5, deletions: 0 }],
  })), false);
});

test('015 trigger: skips proof files that fake a client (.test/.npmtest/.selftest/.golden.mjs)', () => {
  for (const name of ['foo.test.mjs', 'foo.npmtest.mjs', 'foo.selftest.mjs', 'foo.golden.mjs']) {
    assert.equal(rule.trigger(buildContextFromFixture({
      message: 'x', files: [{ path: `fsi-app/scripts/turns/${name}`, additions: 5, deletions: 0 }],
    })), false, name);
  }
});

test('015 check: FAIL — raw .update() outside the guarded path', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: write', files: [{ path: 'fsi-app/scripts/foo.mjs', additions: 5, deletions: 0 }],
    fileContents: { 'fsi-app/scripts/foo.mjs': RAW },
  });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.remediation.includes('db.mjs'));
});

test('015 check: PASS — uses the guarded helper', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: write', files: [{ path: 'fsi-app/scripts/foo.mjs', additions: 5, deletions: 0 }],
    fileContents: { 'fsi-app/scripts/foo.mjs': GUARDED },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('015 check: PASS — override trailer', () => {
  const ctx = buildContextFromFixture({
    message: 'fix: legacy\n\nWrite-Guard-Override: legacy edit, no new write',
    files: [{ path: 'fsi-app/scripts/foo.mjs', additions: 5, deletions: 0 }],
    fileContents: { 'fsi-app/scripts/foo.mjs': RAW },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('015: metadata', () => { assert.equal(rule.id, '015'); });

// ---------------------------------------------------------------------------------------------------
// RULES-1 (2026-10-07): the raw-write detector is narrowed from "any .update(/.upsert(/.delete(" to
// "a DATABASE write": the call must sit on a query-builder chain (.from(...) in the receiver chain, a
// client factory, a name bound from either, or a supabase-style receiver in a file that uses Supabase).
// Hash updates, Map/Set deletes and other same-named methods pass; real builder writes still fail,
// including multi-line chains and chains split across a variable binding.
// ---------------------------------------------------------------------------------------------------
import * as ruleModule from './015-row-mutation-guarded-path.mjs';

function checkSource(src, path = 'fsi-app/scripts/foo.mjs') {
  return rule.check(buildContextFromFixture({
    message: 'feat: x', files: [{ path, additions: 5, deletions: 0 }], fileContents: { [path]: src },
  }));
}

test('015 narrowing PASS: a hash .update() in a file with no Supabase import', () => {
  const src = 'import { createHash } from "node:crypto";\nconst d = createHash("sha256").update(body).digest("hex");\n';
  assert.equal(checkSource(src).status, 'PASS');
});

test('015 narrowing PASS: a hash bound to a variable, then .update() on it', () => {
  const src = 'import { createHash } from "node:crypto";\nconst h = createHash("sha256");\nh.update(a);\nh.update(b);\nconst d = h.digest("hex");\n';
  assert.equal(checkSource(src).status, 'PASS');
});

test('015 narrowing PASS: Map.prototype.delete and Set.prototype.delete in a file with no Supabase import', () => {
  const src = 'const m = new Map();\nconst s = new Set();\nm.delete("a");\ns.delete("b");\nthis.cache.delete("c");\nreturn Reflect.apply(Object.getPrototypeOf(m).delete, m, ["a"]);\n';
  assert.equal(checkSource(src).status, 'PASS');
});

test('015 narrowing PASS: Map/Set delete and hash update in a file that DOES use Supabase for reads only', () => {
  const src = [
    'import { createClient } from "@supabase/supabase-js";',
    'import { createHash } from "node:crypto";',
    'const sb = createClient(u, k);',
    'const { data } = await sb.from("sources").select("id");',
    'const seen = new Set(data.map((r) => r.id));',
    'seen.delete("x");',
    'const m = new Map();',
    'm.delete("y");',
    'const sig = createHash("sha256").update(JSON.stringify(data)).digest("hex");',
    '',
  ].join('\n');
  assert.equal(checkSource(src).status, 'PASS');
});

test('015 narrowing PASS: a result bound from an awaited read is data, not a builder', () => {
  const src = 'const rows = await sb.from("x").select("id");\nrows.delete(1);\n';
  assert.equal(checkSource(src).status, 'PASS');
});

test('015 narrowing PASS: an HTTP-style client in a file with no Supabase signal', () => {
  const src = 'const client = makeHttp();\nawait client.delete("/thing");\nawait db.update(1);\n';
  assert.equal(checkSource(src).status, 'PASS');
});

test('015 narrowing PASS: the method names inside a comment or a string are not calls', () => {
  const src = '// we never call .update( or .delete( here\n/* sb.from("x").delete() */\nconst msg = "use .upsert( instead";\nconst t = `sb.from("x").update({})`;\n';
  assert.equal(checkSource(src).status, 'PASS');
});

test('015 narrowing FAIL: supabase.from(...).update(...) without the guarded import', () => {
  const r = checkSource('await supabase.from("x").update({ a: 1 }).eq("id", 1);\n');
  assert.equal(r.status, 'FAIL');
  assert.ok(r.remediation.includes('db.mjs'));
});

test('015 narrowing FAIL: a two-line chain through a variable (const q = sb.from("x"); q.delete())', () => {
  assert.equal(checkSource('const q = sb.from("x");\nawait q.delete().eq("id", 1);\n').status, 'FAIL');
});

test('015 narrowing FAIL: a chain split over several lines', () => {
  assert.equal(checkSource('await sb\n  .from("x")\n  .update({ a: 1 })\n  .eq("id", 1);\n').status, 'FAIL');
  assert.equal(checkSource('await sb.from("x")\n  .upsert([{ id: 1 }], { onConflict: "id" });\n').status, 'FAIL');
});

test('015 narrowing FAIL: delete and upsert on a builder, optional chaining, filters before the write', () => {
  assert.equal(checkSource('await sb.from("x").select("id").eq("a", 1).delete();\n').status, 'FAIL');
  assert.equal(checkSource('await client?.from("x")?.upsert({ id: 1 });\n').status, 'FAIL');
});

test('015 narrowing FAIL: a builder derived from another builder variable', () => {
  assert.equal(checkSource('let q = sb.from("x");\nconst q2 = q.eq("a", 1);\nawait q2.update({ b: 2 });\n').status, 'FAIL');
});

test('015 narrowing FAIL: a builder held on an object property', () => {
  assert.equal(checkSource('this.q = sb.from("x");\nawait this.q.delete();\n').status, 'FAIL');
});

test('015 narrowing FAIL: writes through a client factory, the repo\'s own read client and a service client', () => {
  assert.equal(checkSource('await readClient().from("x").delete().eq("id", 1);\n').status, 'FAIL');
  assert.equal(checkSource('const c = getServiceClient();\nawait c.from("x").update({ a: 1 });\n').status, 'FAIL');
  assert.equal(checkSource('const c = createClient(u, k);\nawait c.update({ a: 1 });\n').status, 'FAIL');
});

test('015 narrowing FAIL: a write inside a template literal interpolation', () => {
  assert.equal(checkSource('log(`done ${await sb.from("x").delete()}`);\n').status, 'FAIL');
});

test('015 narrowing FAIL: a supabase-style receiver in a file that uses Supabase', () => {
  assert.equal(checkSource('import { createClient } from "@supabase/supabase-js";\nawait db.delete(1);\n').status, 'FAIL');
});

test('015 narrowing FAIL: a regex literal holding a quote does not blind the scan to a later write', () => {
  assert.equal(checkSource('const re = /["\']/;\nawait sb.from("x").delete();\n').status, 'FAIL');
});

test('015 narrowing: Array.from / Buffer.from receivers are not query builders', () => {
  assert.equal(checkSource('const a = Array.from(xs).update;\nconst h = createHash("md5").update(Buffer.from(s));\nlist.delete(Array.from(m)[0]);\n').status, 'PASS');
});

test('015 narrowing: the guarded import still exempts a real builder write', () => {
  assert.equal(checkSource('import { guardedUpdate } from "./lib/db.mjs";\nawait sb.from("x").update({ a: 1 });\n').status, 'PASS');
});

test('015 narrowing: rawWriteHits reports the line of each database write only', () => {
  const hits = ruleModule.rawWriteHits('const h = createHash("x").update(a);\nawait sb.from("t")\n  .delete();\nm.delete(1);\n');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].method, 'delete');
  assert.equal(hits[0].line, 3);
});
