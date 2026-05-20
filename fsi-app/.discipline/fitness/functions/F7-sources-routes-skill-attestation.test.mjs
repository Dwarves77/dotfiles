import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction } from './F7-sources-routes-skill-attestation.mjs';

test('F7: PASS when route does not touch sources', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/app/api/health/route.ts',
    'export async function GET() { return Response.json({ok:true}); }'
  );
  assert.deepEqual(v, []);
});

test('F7: PASS when canonical-sources path appears in skill trigger list', () => {
  // canonical-sources is mentioned in source-credibility-model load-trigger rule (trigger #4)
  const v = fitnessFunction.check(
    'fsi-app/src/app/api/admin/canonical-sources/decide/route.ts',
    'supabase.from("sources").select("id, name");'
  );
  assert.deepEqual(v, []);
});

test('F7: PASS with override comment', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/app/api/zzz-unknown-path/route.ts',
    '// fitness-allow: F7 (incidental sources join for liveness; not credibility-affecting)\nsupabase.from("sources").select("id");'
  );
  assert.deepEqual(v, []);
});

test('F7: has required metadata fields', () => {
  assert.equal(fitnessFunction.id, 'F7');
  assert.ok(fitnessFunction.source.length > 0);
});

test('F7: enumerate returns API route paths', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(Array.isArray(files));
  for (const f of files) {
    assert.match(f, /fsi-app\/src\/app\/api\/.*route\.ts$/);
  }
});
