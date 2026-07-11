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

// ---------------------------------------------------------------------------
// fitness-allow: F6 marker honored on the gap check (the advertised escape hatch).
// The holistic gap/duplicate checks run only on the lowest-numbered migration and
// derive the migration set from enumerate(); stub it so the >10-gap and duplicate
// scenarios are deterministic regardless of the repo's real migration set.
// ---------------------------------------------------------------------------

function withEnumerate(files, fn) {
  const orig = fitnessFunction.enumerate;
  fitnessFunction.enumerate = () => files;
  try { return fn(); } finally { fitnessFunction.enumerate = orig; }
}

test('F6: an UNMARKED lowest migration with a >10 gap FAILS (gap violation present)', () => {
  withEnumerate(
    ['fsi-app/supabase/migrations/001_a.sql', 'fsi-app/supabase/migrations/020_b.sql'], // 18-wide gap
    () => {
      const v = fitnessFunction.check('fsi-app/supabase/migrations/001_a.sql', '-- FSI schema (no marker)\n');
      assert.ok(v.some((vio) => /numbering gaps/.test(vio.message)), 'a >10 gap on an unmarked first line must FAIL');
    },
  );
});

test('F6: a MARKED lowest migration silences the gap violation', () => {
  withEnumerate(
    ['fsi-app/supabase/migrations/001_a.sql', 'fsi-app/supabase/migrations/020_b.sql'], // 18-wide gap
    () => {
      const marked = '/* fitness-allow: F6 (intentional reserved lanes; no migrations dropped) */\n-- FSI schema\n';
      const v = fitnessFunction.check('fsi-app/supabase/migrations/001_a.sql', marked);
      assert.ok(!v.some((vio) => /numbering gaps/.test(vio.message)), 'the fitness-allow marker must silence the gap violation');
    },
  );
});

test('F6: the marker requires a NON-EMPTY reason (empty parenthetical does NOT silence)', () => {
  withEnumerate(
    ['fsi-app/supabase/migrations/001_a.sql', 'fsi-app/supabase/migrations/020_b.sql'],
    () => {
      const emptyReason = '/* fitness-allow: F6 () */\n';
      const v = fitnessFunction.check('fsi-app/supabase/migrations/001_a.sql', emptyReason);
      assert.ok(v.some((vio) => /numbering gaps/.test(vio.message)), 'an empty-reason marker must NOT silence — the reason must be documented');
    },
  );
});

test('F6: duplicate-number violations are NOT silenceable by the marker', () => {
  withEnumerate(
    ['fsi-app/supabase/migrations/001_a.sql', 'fsi-app/supabase/migrations/001_b.sql'], // duplicate 001
    () => {
      const marked = '/* fitness-allow: F6 (trying to silence a duplicate — must not work) */\n';
      const v = fitnessFunction.check('fsi-app/supabase/migrations/001_a.sql', marked);
      assert.ok(v.some((vio) => /Duplicate migration number/.test(vio.message)),
        'duplicate-number violations must remain non-silenceable regardless of the marker');
    },
  );
});
