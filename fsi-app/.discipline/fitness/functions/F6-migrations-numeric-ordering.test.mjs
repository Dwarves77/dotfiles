import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction } from './F6-migrations-numeric-ordering.mjs';

test('F6: PASS on properly-named migration', () => {
  const v = fitnessFunction.check('fsi-app/supabase/migrations/099_add_column.sql', '');
  // Note: holistic checks may add gap-warning, but per-file pattern check passes
  const patternViolations = v.filter((vio) => /does not match/.test(vio.message));
  assert.deepEqual(patternViolations, []);
});

test('F6: FAIL on malformed filename (no number prefix)', () => {
  const v = fitnessFunction.check('fsi-app/supabase/migrations/add_column.sql', '');
  assert.ok(v.some((vio) => /does not match/.test(vio.message)));
});

test('F6: FAIL on filename with only 2-digit number', () => {
  const v = fitnessFunction.check('fsi-app/supabase/migrations/99_add.sql', '');
  assert.ok(v.some((vio) => /does not match/.test(vio.message)));
});

test('F6: FAIL on placeholder description', () => {
  const v = fitnessFunction.check('fsi-app/supabase/migrations/099_tmp.sql', '');
  assert.ok(v.some((vio) => /placeholder description/.test(vio.message)));
});

test('F6: FAIL on uppercase description (not snake_case)', () => {
  const v = fitnessFunction.check('fsi-app/supabase/migrations/099_AddColumn.sql', '');
  assert.ok(v.some((vio) => /does not match/.test(vio.message)));
});

test('F6: has required metadata fields', () => {
  assert.equal(fitnessFunction.id, 'F6');
  assert.ok(fitnessFunction.source.length > 0);
});

test('F6: enumerate returns migration paths', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(Array.isArray(files));
  for (const f of files) {
    assert.match(f, /supabase\/migrations\/.*\.sql$/);
  }
});
