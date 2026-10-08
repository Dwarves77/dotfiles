// Tests for F13 (single mint chokepoint) — the DEMONSTRATED FAILING MODE (dispatch §2).
// Run: node --test fsi-app/.discipline/fitness/functions/F13-single-mint-chokepoint.test.mjs
//
// Fixtures build the trigger string by concatenation so this test file does not itself
// match the rule (it is excluded by enumerate anyway, but belt-and-suspenders).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction, isMintBypass } from './F13-single-mint-chokepoint.mjs';

const FROM = '.from("intelligence_items")';
const INSERT = '.insert(seedRow)';

// RED: a direct INSERT into intelligence_items outside the chokepoint is caught.
test('F13: FAIL — direct single-line INSERT into intelligence_items (simulated bypass)', () => {
  const bypass = `await supabase${FROM}${INSERT}.select("id").single();`;
  const v = fitnessFunction.check('fsi-app/src/app/api/worker/some-route/route.ts', bypass);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /mintIntelligenceItem/);
});

// RED: the wrapped form (from() and insert() on separate lines) is also caught.
test('F13: FAIL — wrapped INSERT (from + insert across lines)', () => {
  const bypass = `  await supabase\n    ${FROM}\n    ${INSERT}\n    .select("id");`;
  const v = fitnessFunction.check('fsi-app/src/lib/some/mint.ts', bypass);
  assert.equal(v.length, 1);
});

// GREEN: reads/updates/deletes on intelligence_items are not mints — not flagged.
test('F13: PASS — select/update on intelligence_items is not an INSERT', () => {
  const clean = `await sb${FROM}.select("id");\nawait sb${FROM}.update({ status: "x" }).eq("id", id);`;
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/x.ts', clean), []);
});

// GREEN: going through the chokepoint (no direct INSERT) is not flagged.
test('F13: PASS — a caller that routes through mintIntelligenceItem()', () => {
  const clean = `const res = await mintIntelligenceItem(supabase, { seed, origin: "first_fetch" });`;
  assert.deepEqual(fitnessFunction.check('fsi-app/src/app/api/worker/drain-first-fetch/route.ts', clean), []);
});

// GREEN: the chokepoint file itself is exempt (it IS the sanctioned INSERT site).
test('F13: PASS — the chokepoint file is exempt', () => {
  const chokepointInsert = `await sb${FROM}${INSERT}.select("id").single();`;
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/intake/mint-item.ts', chokepointInsert), []);
});

// GREEN: override comment suppresses (escape hatch, must carry a reason).
test('F13: PASS — override comment', () => {
  const bypass = `await supabase${FROM}${INSERT}; // fitness-allow: F13 (one-shot backfill migration script)`;
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/x.ts', bypass), []);
});

// enumerate excludes the chokepoint + tests.
test('F13: enumerate excludes the chokepoint and test files', () => {
  const files = fitnessFunction.enumerate();
  assert.equal(files.includes('fsi-app/src/lib/intake/mint-item.ts'), false);
  for (const f of files) {
    assert.equal(/\.test\.(ts|tsx|mjs)$/.test(f), false, `enumerate should not return test files; got ${f}`);
    assert.equal(f.includes('/__tests__/'), false, `enumerate should not return __tests__ files; got ${f}`);
  }
});

test('F13: isMintBypass helper is direct-usable and metadata present', () => {
  assert.equal(isMintBypass(`x${FROM}${INSERT}`).length, 1);
  assert.equal(fitnessFunction.id, 'F13');
});

// ---- lane GATE-8 (2026-10-08): the honest forms the AUD-AT-4 register found ACCEPTED, red then green ----

test('F13 B1-13: a URL earlier on the line does not hide the insert', () => {
  const src = `const u = "https://example.com/x"; await sb${FROM}${INSERT};`;
  assert.equal(fitnessFunction.check('fsi-app/src/lib/x.ts', src).length, 1);
});

test('F13 B1-14: .upsert( is a mint the same way .insert( is', () => {
  const src = `await sb${FROM}.upsert(row, { onConflict: "id" });`;
  assert.equal(fitnessFunction.check('fsi-app/src/lib/x.ts', src).length, 1);
});

test('F13 B1-15: the table named through a constant is still intelligence_items', () => {
  const src = `const T = "intelligence_items";\nawait sb.from(T).insert(row);`;
  assert.equal(fitnessFunction.check('fsi-app/src/lib/x.ts', src).length, 1);
});

test('F13 B1-16: an insert more than three lines down the chain is still the same call', () => {
  const src = `await sb${FROM}\n  .select("id")\n  .eq("a", 1)\n  .eq("b", 2)\n  .insert(row);`;
  assert.equal(fitnessFunction.check('fsi-app/src/lib/x.ts', src).length, 1);
});

test('F13 B1-17: a template literal table name is read', () => {
  const src = 'await sb.from(`intelligence_items`).insert(row);';
  assert.equal(fitnessFunction.check('fsi-app/src/lib/x.ts', src).length, 1);
});

test('F13 B1-18 B1-19: scripts and non-.ts files are in scope', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(files.some((f) => f.startsWith('fsi-app/scripts/')), 'scripts are enumerated');
  const globbed = fitnessFunction.enumerate.toString();
  assert.match(globbed, /cjs/);
  assert.match(globbed, /\bjs\b/);
});

test('F13 B1-21: an override marker inside a string literal is not an override', () => {
  const src = `const note = "// fitness-allow: F13 (forged)"; await sb${FROM}${INSERT};`;
  assert.equal(fitnessFunction.check('fsi-app/src/lib/x.ts', src).length, 1);
});

test('F13: a real trailing comment marker still overrides a chain that wraps', () => {
  const src = `await sb${FROM}\n  .insert(row); // fitness-allow: F13 (one-shot repair)\n`;
  // the marker is on the insert line, not the from line: the override belongs to the from line only
  assert.equal(fitnessFunction.check('fsi-app/src/lib/x.ts', src).length, 1);
  const onFrom = `await sb${FROM} // fitness-allow: F13 (one-shot repair)\n  .insert(row);`;
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/x.ts', onFrom), []);
});

test('F13: raw SQL INSERT INTO intelligence_items in a string is a mint', () => {
  const src = 'await client.query("INSERT INTO intelligence_items (id) VALUES ($1)", [id]);';
  assert.equal(fitnessFunction.check('fsi-app/scripts/x.mjs', src).length, 1);
});

test('F13: a mention in a comment is not a mint', () => {
  const src = `// we never do sb${FROM}${INSERT} here\n/* sb${FROM}.upsert(x) */\nconst a = 1;`;
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/x.ts', src), []);
});

test('F13: every sanctioned adversarial script still exists and still carries an insert (a stale entry is red)', async () => {
  const { SANCTIONED_ADVERSARIAL_SCRIPTS } = await import('./F13-single-mint-chokepoint.mjs');
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { getRepoRoot } = await import('../../lib/context.mjs');
  for (const [path, reason] of SANCTIONED_ADVERSARIAL_SCRIPTS) {
    assert.ok(reason.length > 10, `${path} carries a reason`);
    assert.ok(existsSync(join(getRepoRoot(), path)), `${path} exists`);
    assert.ok(isMintBypass(readFileSync(join(getRepoRoot(), path), 'utf8')).length > 0, `${path} still has an insert, or its entry is stale`);
  }
});
