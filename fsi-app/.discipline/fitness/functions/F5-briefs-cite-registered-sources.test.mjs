import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction } from './F5-briefs-cite-registered-sources.mjs';

test('F5: PASS when intelligence_items insert includes source_id', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("intelligence_items").insert({ title: "x", urgency_score: 5, source_id: "abc" });'
  );
  assert.deepEqual(v, []);
});

test('F5: PASS when insert includes sources_used array', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("intelligence_items").insert({ title: "x", urgency_score: 5, sources_used: ["abc"] });'
  );
  assert.deepEqual(v, []);
});

test('F5: FAIL when intelligence_items insert has no source reference', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("intelligence_items").insert({ title: "x", urgency_score: 5, body: "y" });'
  );
  assert.equal(v.length, 1);
  assert.match(v[0].message, /source-reference/);
});

test('F5: PASS when spread operator present (cannot verify statically)', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("intelligence_items").insert({ ...item, title: "x" });'
  );
  assert.deepEqual(v, []);
});

test('F5: PASS when insert(variable) — cannot statically inspect variable contents', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("intelligence_items").insert(seedRow);'
  );
  assert.deepEqual(v, []);
});

test('F5: PASS when insert(obj.property) — also variable-shaped', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("intelligence_items").insert(built.payload);'
  );
  assert.deepEqual(v, []);
});

test('F5: PASS when not touching intelligence_items or briefs', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("sources").insert({ name: "x" });'
  );
  assert.deepEqual(v, []);
});

test('F5: FAIL on briefs insert without source reference', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("briefs").insert({ title: "x", body: "y" });'
  );
  assert.equal(v.length, 1);
});

test('F5: PASS with override comment', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'supabase.from("intelligence_items").insert({ title: "x", urgency_score: 5 }); // fitness-allow: F5 (manual operator entry; source_id linked via separate join table downstream)'
  );
  assert.deepEqual(v, []);
});

test('F5: has required metadata fields', () => {
  assert.equal(fitnessFunction.id, 'F5');
  assert.ok(fitnessFunction.source.length > 0);
});
