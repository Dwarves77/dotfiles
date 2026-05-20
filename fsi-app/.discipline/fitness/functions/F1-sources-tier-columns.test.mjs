// Tests for F1. Run: node --test fsi-app/.discipline/fitness/functions/F1-sources-tier-columns.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction } from './F1-sources-tier-columns.mjs';

test('F1: PASS when sources select uses base_tier + effective_tier', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'const x = supabase.from("sources").select("id, name, base_tier, effective_tier");'
  );
  assert.deepEqual(v, []);
});

test('F1: FAIL when sources select uses deprecated tier', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'const x = supabase.from("sources").select("id, name, tier, url");'
  );
  assert.equal(v.length, 1);
  assert.match(v[0].message, /deprecated/);
});

test('F1: PASS when file does not touch sources table at all', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'const x = supabase.from("provisional_sources").select("id, tier, name");'
  );
  assert.deepEqual(v, []);
});

test('F1: PASS when tier appears as object key in audit payload (not select string)', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("sources").select("id");\nconst payload = { classification: { tier: body.tier } };'
  );
  assert.deepEqual(v, []);
});

test('F1: PASS when tier_at_creation is used (different column)', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("sources").select("id, tier_at_creation, base_tier");'
  );
  assert.deepEqual(v, []);
});

test('F1: FAIL on embedded sources select with deprecated tier', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'const q = `.from("intelligence_items").select(\'id, source:sources(id, name, tier, url)\');`'
  );
  // The embedded select 'source:sources(id, name, tier, url)' contains deprecated tier
  assert.ok(v.length >= 1);
});

test('F1: FAIL on multi-line .select(`...`) template literal with deprecated tier', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    [
      'const q = supabase.from("sources").select(`',
      '  id,',
      '  name,',
      '  tier,',
      '  url',
      '`);',
    ].join('\n')
  );
  assert.ok(v.length >= 1);
  // Violation should be on the line containing `tier`
  assert.equal(v[0].line, 4);
});

test('F1: PASS when override comment present', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("sources").select("id, tier"); // fitness-allow: F1 (legacy migration script archived; not loaded at runtime)'
  );
  assert.deepEqual(v, []);
});

test('F1: PASS when tier mentioned in line comment but not actually selected', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("sources").select("id, base_tier"); // we removed tier per Q2 split'
  );
  assert.deepEqual(v, []);
});

test('F1: has required metadata fields', () => {
  assert.equal(fitnessFunction.id, 'F1');
  assert.equal(typeof fitnessFunction.name, 'string');
  assert.equal(typeof fitnessFunction.description, 'string');
  assert.ok(fitnessFunction.source.length > 0);
});
