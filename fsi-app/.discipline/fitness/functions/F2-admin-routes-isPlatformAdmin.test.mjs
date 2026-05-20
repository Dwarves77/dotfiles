// Tests for F2. Run: node --test fsi-app/.discipline/fitness/functions/F2-admin-routes-isPlatformAdmin.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction } from './F2-admin-routes-isPlatformAdmin.mjs';

test('F2: PASS when route uses isPlatformAdmin', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/app/api/admin/foo/route.ts',
    'import { isPlatformAdmin } from "../auth";\nexport async function POST() { await isPlatformAdmin(req); }'
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

test('F2: PASS for worker-secret-allowlisted route with x-worker-secret check', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/app/api/admin/recompute-trust/route.ts',
    'const secret = req.headers.get("x-worker-secret");\nif (secret !== process.env.WORKER_SECRET) return new Response("nope", { status: 401 });'
  );
  assert.deepEqual(violations, []);
});

test('F2: FAIL for worker-secret-allowlisted route MISSING x-worker-secret check', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/app/api/admin/recompute-trust/route.ts',
    'export async function POST() { return Response.json({ok:true}); }'
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /x-worker-secret/);
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

test('F2: enumerate returns admin route paths', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(Array.isArray(files));
  // Should include known admin routes if scanning real codebase
  if (files.length > 0) {
    for (const f of files) {
      assert.match(f, /fsi-app\/src\/app\/api\/admin\//);
      assert.ok(f.endsWith('.ts'));
    }
  }
});

test('F2: has required metadata fields', () => {
  assert.equal(fitnessFunction.id, 'F2');
  assert.equal(typeof fitnessFunction.name, 'string');
  assert.equal(typeof fitnessFunction.description, 'string');
  assert.ok(fitnessFunction.source.length > 0);
});
