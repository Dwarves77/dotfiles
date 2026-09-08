// @ts-check
// Red-then-green for F40, plus the LIVE CENSUS. The RED cases are the EXACT source text of the
// production defect (src/lib/tags/client.ts before lane TAGS-401), so this test fails if the gate
// ever stops seeing the thing that shipped a dead feature to production.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  fitnessFunction,
  guardedRoutes,
  matchesGuardedRoute,
  stripComments,
  BEARER_BUILDER_ALLOWLIST,
} from './F40-authed-api-fetch.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const TAGS_CLIENT = 'fsi-app/src/lib/tags/client.ts';
// Built by concatenation, never written as a literal `from "..."` in this file: glob-portability.test.mjs
// scans this file's SOURCE for module specifiers and would read a fixture string spelling out the
// helper's import as a real bare-package import of the app tree (which this test never makes).
const HELPER_IMPORT = ['import { authedFetch }', 'from', '"@/lib/api/authed-fetch";'].join(' ');
const HEADERS_IMPORT = ['import { authHeaders }', 'from', '"@/lib/api/authed-fetch";'].join(' ');

// ── rule (b): a guarded fetch without the helper ──────────────────────────────────────────────

test('RED: the shipped defect verbatim — fetch("/api/workspace/tags", { credentials: "include" })', () => {
  const src = 'const res = await fetch("/api/workspace/tags", { credentials: "include" });';
  const v = fitnessFunction.check(TAGS_CLIENT, src);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /guarded by requireAuth/);
});

test('RED: a dynamic segment still resolves — /api/workspace/tags/${tagId}/items', () => {
  const src = 'await fetch(`/api/workspace/tags/${encodeURIComponent(tagId)}/items`, { method: "PUT" });';
  assert.equal(fitnessFunction.check(TAGS_CLIENT, src).length, 1);
});

test('GREEN: the same call through authedFetch', () => {
  const src = HELPER_IMPORT + '\nconst res = await authedFetch("/api/workspace/tags");';
  assert.deepEqual(fitnessFunction.check(TAGS_CLIENT, src), []);
});

test('GREEN: the authHeaders() form (a bare fetch in a file that imports the helper)', () => {
  const src = HEADERS_IMPORT + '\nconst headers = await authHeaders();\nawait fetch("/api/workspace/bootstrap", { headers });';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/hooks/useWorkspaceBootstrap.ts', src), []);
});

test('GREEN: an UNGUARDED route needs nothing — /api/obligations/upcoming is public by design', () => {
  const src = 'await fetch("/api/obligations/upcoming?limit=8", { credentials: "same-origin" });';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/components/x.tsx', src), []);
});

// ── rule (a): no hand-rolled bearer ───────────────────────────────────────────────────────────

test('RED: a hand-rolled header, including the degenerate `|| ""` form that 401s silently', () => {
  const src = 'const h = { Authorization: `Bearer ${session?.access_token || ""}` };';
  const v = fitnessFunction.check('fsi-app/src/components/admin/Anything.tsx', src);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /Hand-rolled/);
});

test('RED: `Bearer ${session?.access_token}` (renders the literal string "Bearer undefined")', () => {
  const src = 'headers: { Authorization: `Bearer ${session?.access_token}` },';
  assert.equal(fitnessFunction.check('fsi-app/src/components/sources/Anything.tsx', src).length, 1);
});

test('GREEN: the shared builder itself, and the server side that consumes a verified token', () => {
  const src = 'return { Authorization: `Bearer ${token}` };';
  for (const f of BEARER_BUILDER_ALLOWLIST) {
    assert.deepEqual(fitnessFunction.check(f, src), [], `${f} must be allowed to build the header`);
  }
  assert.deepEqual(fitnessFunction.check('fsi-app/src/app/api/auth/linkedin/callback/route.ts', src), []);
});

test('GREEN: prose naming the banned shape in a comment is not a violation', () => {
  const src = '// never write `Bearer ${token}` by hand\nconst x = 1;';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/x.ts', src), []);
});

test('override: trailing `// fitness-allow: F40 (reason)` suppresses', () => {
  const src = 'const h = { Authorization: `Bearer ${session?.access_token}` }; // fitness-allow: F40 (legacy, tracked)';
  assert.deepEqual(fitnessFunction.check('fsi-app/src/components/x.tsx', src), []);
});

// ── the route census the whole gate rests on ──────────────────────────────────────────────────

test('guardedRoutes counts a route that CALLS requireAuth, not one that names it in prose', () => {
  const guarded = guardedRoutes();
  assert.ok(guarded.has('workspace/tags'), 'workspace/tags calls requireAuth');
  assert.ok(guarded.has('workspace/tags/[id]/items'), 'the items subroute calls requireAuth');
  assert.equal(
    guarded.has('obligations/upcoming'),
    false,
    'obligations/upcoming only says "Public: no requireAuth" in a comment and must not be counted guarded'
  );
});

test('stripComments removes line and block comments so prose cannot fake a guard', () => {
  assert.doesNotMatch(stripComments('// await requireAuth(request)\nconst x = 1;'), /requireAuth/);
  assert.doesNotMatch(stripComments('/* await requireAuth(r) */\nconst x = 1;'), /requireAuth/);
  assert.match(stripComments('const a = await requireAuth(request);'), /requireAuth/);
});

test('matchesGuardedRoute is segment-wise: arity must agree, dynamic segments match anything', () => {
  const guarded = new Set(['workspace/tags', 'workspace/tags/[id]/items']);
  assert.equal(matchesGuardedRoute('/api/workspace/tags?itemId=x', guarded), 'workspace/tags');
  assert.equal(matchesGuardedRoute('/api/workspace/tags/${id}/items', guarded), 'workspace/tags/[id]/items');
  assert.equal(matchesGuardedRoute('/api/workspace/tagsomething', guarded), null);
  assert.equal(matchesGuardedRoute('/api/workspace', guarded), null);
});

// ── live census ───────────────────────────────────────────────────────────────────────────────

test('LIVE CENSUS: the whole src tree passes F40 — the hand-rolled-header class is dead', () => {
  const offenders = [];
  for (const f of fitnessFunction.enumerate()) {
    let content;
    try { content = readFileSync(resolve(REPO_ROOT, f), 'utf8'); } catch { continue; }
    for (const v of fitnessFunction.check(f, content)) offenders.push(`${f}:${v.line}`);
  }
  assert.deepEqual(offenders, [], `F40 offenders: ${offenders.join(', ')}`);
});

test('LIVE: every workspace-tags fetch in the real client goes through authedFetch', () => {
  const src = readFileSync(resolve(REPO_ROOT, TAGS_CLIENT), 'utf8');
  const bare = src.match(/(?<!authed)\bfetch\(\s*['"`]\/api\//g) || [];
  assert.deepEqual(bare, [], 'src/lib/tags/client.ts must contain no bare fetch of an /api/ path');
  assert.equal((src.match(/authedFetch\(/g) || []).length, 6, 'all six tag fetches are authenticated');
  assert.doesNotMatch(
    stripComments(src),
    /credentials:/,
    'credentials: "include" buys nothing against requireAuth and must not return to the code'
  );
});
