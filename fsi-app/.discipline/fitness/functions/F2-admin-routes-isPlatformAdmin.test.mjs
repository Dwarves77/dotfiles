// Tests for F2. Run: node --test fsi-app/.discipline/fitness/functions/F2-admin-routes-isPlatformAdmin.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction } from './F2-admin-routes-isPlatformAdmin.mjs';
import { readFile } from '../lib/file-content.mjs';

test('F2: PASS when route uses isPlatformAdmin', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/app/api/admin/foo/route.ts',
    'import { isPlatformAdmin } from "../auth";\nexport async function POST() { await isPlatformAdmin(req); }'
  );
  assert.deepEqual(violations, []);
});

test('F2: PASS when route uses the shared requireAdminRoute guard (lane L31)', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/app/api/admin/foo/route.ts',
    'const { requireAdminRoute, isRefusal } = guard; // the shared guard, imported in a real route\nexport async function GET(req) { const auth = await requireAdminRoute(req); if (isRefusal(auth)) return auth; }'
  );
  assert.deepEqual(violations, []);
});

test('F2: FAIL when admin route lacks isPlatformAdmin', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/app/api/admin/foo/route.ts',
    'export async function POST(req) { return Response.json({ok:true}); }'
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /isPlatformAdmin/);
});

test('F2: PASS for worker-secret-allowlisted route that CALLS workerAuthGuard', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/app/api/admin/recompute-trust/route.ts',
    'import { workerAuthGuard } from "@/lib/api/worker-auth";\nexport async function POST(request) {\n  const denied = workerAuthGuard(request);\n  if (denied) return denied;\n}'
  );
  assert.deepEqual(violations, []);
});

test('F2: FAIL for worker-secret-allowlisted route MISSING the workerAuthGuard call', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/app/api/admin/recompute-trust/route.ts',
    'export async function POST() { return Response.json({ok:true}); }'
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /workerAuthGuard/);
});

test('F2: PASS when override comment present', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/app/api/admin/foo/route.ts',
    'export async function GET() { return ok; } // fitness-allow: F2 (public read-only endpoint behind a feature flag)'
  );
  assert.deepEqual(violations, []);
});

test('F2: PASS for .test.ts files (test fixtures)', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/app/api/admin/foo/route.test.ts',
    'no isPlatformAdmin here'
  );
  assert.deepEqual(violations, []);
});

test('F2: enumerate returns admin route paths, route.ts only', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(Array.isArray(files));
  // Should include known admin routes if scanning real codebase
  if (files.length > 0) {
    for (const f of files) {
      assert.match(f, /fsi-app\/src\/app\/api\/(admin\/|agent\/run\/|coverage\/entries\/)/);
      assert.ok(f.endsWith('/route.ts'));
    }
  }
});

// BUILDGATE, 2026-09-02 (F34's named residual): a route's pure functions now live in a sibling
// logic.ts, not in route.ts itself. logic.ts is not a route (no request, nothing to gate) and is
// correctly OUT OF SCOPE here — enumerate() must not pick it up, so it never false-positives on
// every route this pattern is applied to.
test('F2: enumerate does not pick up a sibling logic.ts (not a route)', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(!files.some((f) => f.endsWith('/logic.ts')));
});

test('F2: has required metadata fields', () => {
  assert.equal(fitnessFunction.id, 'F2');
  assert.equal(typeof fitnessFunction.name, 'string');
  assert.equal(typeof fitnessFunction.description, 'string');
  assert.ok(fitnessFunction.source.length > 0);
});

// ROUTES-1 (2026-10-08, register finding AT2-6): F2 used to pass an allowlisted worker route whose only
// mention of x-worker-secret was a header comment. The guard must be a CALL in code, never prose.
test('F2: FAIL when the only mention is a line comment (the AT2-6 shape)', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/app/api/admin/recompute-trust/route.ts',
    '// Auth: x-worker-secret header, workerAuthGuard(request) is called below\nexport async function POST() { return Response.json({ok:true}); }'
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /workerAuthGuard/);
});

test('F2: FAIL when the only mention is a block comment', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/app/api/admin/spot-check/recurring/route.ts',
    '/* Worker-secret auth (x-worker-secret). const denied = workerAuthGuard(request); */\nexport async function POST() { return Response.json({ok:true}); }'
  );
  assert.equal(violations.length, 1);
});

test('F2: FAIL when workerAuthGuard is imported but never called', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/app/api/admin/recompute-trust/route.ts',
    'import { workerAuthGuard } from "@/lib/api/worker-auth";\nexport async function POST() { return Response.json({ok:true}); }'
  );
  assert.equal(violations.length, 1);
});

test('F2: FAIL when an admin route mentions requireAdminRoute only in a comment', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/app/api/admin/foo/route.ts',
    '// TODO call requireAdminRoute and isPlatformAdmin here\nexport async function POST(req) { return Response.json({ok:true}); }'
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /isPlatformAdmin/);
});

test('F2: a URL in code does not hide a real guard (// after a colon is not a comment)', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/app/api/admin/foo/route.ts',
    'const u = "https://example.com"; const a = await requireAdminRoute(req);'
  );
  assert.deepEqual(violations, []);
});

// Scope: the two admin-gated routes that live outside the admin/ glob.
test('F2: enumerate includes agent/run and coverage/entries (admin gate outside the admin glob)', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(files.includes('fsi-app/src/app/api/agent/run/route.ts'));
  assert.ok(files.includes('fsi-app/src/app/api/coverage/entries/route.ts'));
});

// Attack on the real tree (ADR-046): every enumerated route passes as committed, and the two real
// worker routes FAIL once their guard call is removed, so the check cannot be satisfied by prose.
test('F2: every enumerated route passes as committed', () => {
  for (const f of fitnessFunction.enumerate()) {
    const content = readFile(f);
    assert.ok(content !== null, f);
    assert.deepEqual(fitnessFunction.check(f, content), [], f);
  }
});

test('F2: the real worker routes fail with their workerAuthGuard call removed but the comments kept', () => {
  for (const f of [
    'fsi-app/src/app/api/admin/recompute-trust/route.ts',
    'fsi-app/src/app/api/admin/spot-check/recurring/route.ts',
  ]) {
    const content = readFile(f);
    assert.match(content, /workerAuthGuard\(/, f);
    const mutated = content.replace(/workerAuthGuard\(/g, 'noGuard(');
    assert.match(mutated, /x-worker-secret/i, f);
    assert.equal(fitnessFunction.check(f, mutated).length, 1, f);
  }
});
