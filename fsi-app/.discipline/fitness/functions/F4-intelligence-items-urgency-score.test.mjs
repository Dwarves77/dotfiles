import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction } from './F4-intelligence-items-urgency-score.mjs';

test('F4: PASS when insert includes urgency_score', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("intelligence_items").insert({ title: "x", urgency_score: 5 });'
  );
  assert.deepEqual(v, []);
});

test('F4: FAIL when insert missing urgency_score', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("intelligence_items").insert({ title: "x", body: "y" });'
  );
  assert.equal(v.length, 1);
  assert.match(v[0].message, /urgency_score/);
});

test('F4: PASS when spread operator used (cannot verify statically)', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("intelligence_items").insert({ ...item, title: "x" });'
  );
  assert.deepEqual(v, []);
});

test('F4: PASS when insert(variable) — cannot statically inspect contents', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("intelligence_items").insert(seedRow);'
  );
  assert.deepEqual(v, []);
});

test('F4: PASS when insert(obj.property) — variable-shaped', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("intelligence_items").insert(built.payload);'
  );
  assert.deepEqual(v, []);
});

test('F4: PASS when not touching intelligence_items', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("sources").insert({ name: "x" });'
  );
  assert.deepEqual(v, []);
});

test('F4: PASS when override comment present on spread case', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("intelligence_items").insert({ ...item, title: "x" }); // fitness-allow: F4 (item is BriefRow which has urgency_score per type contract)'
  );
  assert.deepEqual(v, []);
});

test('F4: PASS for multi-line insert with urgency_score', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    [
      'await supabase.from("intelligence_items").insert({',
      '  title: brief.title,',
      '  body: brief.body,',
      '  urgency_score: brief.urgency,',
      '  source_id: brief.sourceId,',
      '});',
    ].join('\n')
  );
  assert.deepEqual(v, []);
});

test('F4: FAIL for multi-line insert missing urgency_score', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    [
      'await supabase.from("intelligence_items").insert({',
      '  title: brief.title,',
      '  body: brief.body,',
      '});',
    ].join('\n')
  );
  assert.equal(v.length, 1);
});

test('F4: has required metadata fields', () => {
  assert.equal(fitnessFunction.id, 'F4');
  assert.equal(typeof fitnessFunction.name, 'string');
  assert.ok(fitnessFunction.source.length > 0);
});
