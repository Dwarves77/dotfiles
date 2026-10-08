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

// A NEW file: every line is introduced. (Since lane GATE-1 the rule charges only lines the commit adds;
// a source handed to checkSource is a brand-new script unless a test builds an edit explicitly.)
function newFileCtx(src, path = 'fsi-app/scripts/foo.mjs', message = 'feat: write') {
  const lines = src.endsWith('\n') ? src.slice(0, -1).split('\n') : src.split('\n');
  return buildContextFromFixture({
    message,
    files: [{ path, status: 'A', additions: lines.length, deletions: 0 }],
    changes: [{ path, status: 'A', added: lines }],
    fileContents: { [path]: src },
  });
}

test('015 check: FAIL, raw .update() outside the guarded path', () => {
  const r = rule.check(newFileCtx(RAW));
  assert.equal(r.status, 'FAIL');
  assert.ok(r.remediation.includes('db.mjs'));
});

test('015 check: PASS, uses the guarded helper', () => {
  assert.equal(rule.check(newFileCtx(GUARDED)).status, 'PASS');
});

test('015 check: the Write-Guard-Override trailer is gone: it no longer excuses a raw write', () => {
  const ctx = newFileCtx(RAW, 'fsi-app/scripts/foo.mjs', 'fix: legacy' + String.fromCharCode(10, 10) + 'Write-Guard-Override: legacy edit, no new write');
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(!r.remediation.includes('Write-Guard-Override'), 'the hook message must not offer a trailer that is not honoured');
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
  return rule.check(newFileCtx(src, path));
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

// ---------------------------------------------------------------------------------------------------
// GATE-1 (2026-10-08): introduced-lines scope. A raw write that was already in the file, on a line the
// commit does not add or on an edited line that already carried the call, is not this commit's defect.
// The register measured 4 of 4 firings in 30 days as false positives, all on code the author had not
// written. A write the commit INTRODUCES still fails.
// ---------------------------------------------------------------------------------------------------
const OLD_WRITE = 'await sb.from("intelligence_items").update({ x: 1 }).eq("id", id);';

function editCtx(path, post, hunk) {
  return buildContextFromFixture({
    message: 'fix: edit',
    files: [{ path, status: 'M' }],
    changes: [{ path, ...hunk }],
    fileContents: { [path]: post },
  });
}

test('015 scope: PASS, an untouched pre-existing raw write elsewhere in the file', () => {
  const post = ['import { createClient } from "@supabase/supabase-js";', 'const sb = createClient(u, k);', OLD_WRITE, 'console.log("edited");', ''].join(String.fromCharCode(10));
  const ctx = editCtx('fsi-app/scripts/foo.mjs', post, { removed: ['console.log("old");'], added: ['console.log("edited");'], oldStart: 4, newStart: 4 });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('015 scope: PASS, a line that already carried the write is edited (a value changed, same call)', () => {
  const post = ['const sb = createClient(u, k);', 'await sb.from("intelligence_items").update({ x: 2 }).eq("id", id);', ''].join(String.fromCharCode(10));
  const ctx = editCtx('fsi-app/scripts/foo.mjs', post, {
    removed: [OLD_WRITE], added: ['await sb.from("intelligence_items").update({ x: 2 }).eq("id", id);'], oldStart: 2, newStart: 2,
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('015 scope: PASS, an adjacent line of a multi-line write chain is edited', () => {
  const post = ['await sb', '  .from("x")', '  .update({ a: 1 })', '  .eq("id", 2);', ''].join(String.fromCharCode(10));
  const ctx = editCtx('fsi-app/scripts/foo.mjs', post, { removed: ['  .eq("id", 1);'], added: ['  .eq("id", 2);'], oldStart: 4, newStart: 4 });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('015 scope: PASS, a write line MOVED from another script', () => {
  const post = ['const sb = createClient(u, k);', OLD_WRITE, ''].join(String.fromCharCode(10));
  const ctx = buildContextFromFixture({
    message: 'refactor: move',
    files: [{ path: 'fsi-app/scripts/old.mjs' }, { path: 'fsi-app/scripts/foo.mjs', status: 'A' }],
    changes: [{ path: 'fsi-app/scripts/old.mjs', removed: [OLD_WRITE] }, { path: 'fsi-app/scripts/foo.mjs', status: 'A', added: ['const sb = createClient(u, k);', OLD_WRITE] }],
    fileContents: { 'fsi-app/scripts/foo.mjs': post },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('015 scope: FAIL, a write INTRODUCED into a file that already had one, reported at its own line', () => {
  const post = ['const sb = createClient(u, k);', OLD_WRITE, 'await sb.from("sources").delete().eq("id", 9);', ''].join(String.fromCharCode(10));
  const ctx = editCtx('fsi-app/scripts/foo.mjs', post, { added: ['await sb.from("sources").delete().eq("id", 9);'], oldStart: 2, newStart: 3 });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.deepEqual(r.locations, [{ path: 'fsi-app/scripts/foo.mjs', line: 3 }]);
});

test('015 scope: FAIL, an edit that turns a read into a write', () => {
  const post = ['const sb = createClient(u, k);', 'await sb.from("sources").delete().eq("id", 9);', ''].join(String.fromCharCode(10));
  const ctx = editCtx('fsi-app/scripts/foo.mjs', post, { removed: ['await sb.from("sources").select("id").eq("id", 9);'], added: ['await sb.from("sources").delete().eq("id", 9);'], oldStart: 2, newStart: 2 });
  assert.equal(rule.check(ctx).status, 'FAIL');
});

test('015 scope: a staged script whose diff is not available (stale working tree) falls back to line text, and still fails an introduced write', () => {
  const post = ['// shifted by an unstaged edit', 'const sb = createClient(u, k);', 'await sb.from("sources").delete().eq("id", 9);', ''].join(String.fromCharCode(10));
  const ctx = editCtx('fsi-app/scripts/foo.mjs', post, { added: ['await sb.from("sources").delete().eq("id", 9);'], oldStart: 2, newStart: 2 });
  assert.equal(rule.check(ctx).status, 'FAIL');
});
