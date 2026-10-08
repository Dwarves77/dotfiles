// Tests for F8. Run: node --test fsi-app/.discipline/fitness/functions/F8-client-server-tier-boundary.test.mjs
//
// Test fixtures use string concatenation to avoid the test file itself matching
// the rule's content patterns (defense-in-depth against self-trigger).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction } from './F8-client-server-tier-boundary.mjs';

const TIER_ASSIGN = 'body.tier' + ' = tier;';
const BASE_TIER_ASSIGN = 'body.base_tier' + ' = tier;';
const EFFECTIVE_TIER_ASSIGN = 'body.effective_tier' + ' = tier;';

test('F8: FAIL on direct body.tier assignment in component', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/components/sources/Foo.tsx',
    `if (decision === 'approve') { ${TIER_ASSIGN} body.url = url; }`
  );
  assert.equal(v.length, 1);
  assert.match(v[0].message, /tier/);
});

test('F8: FAIL on body.base_tier assignment', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/components/sources/Foo.tsx',
    BASE_TIER_ASSIGN
  );
  assert.equal(v.length, 1);
  assert.match(v[0].message, /base_tier/);
});

test('F8: FAIL on body.effective_tier assignment', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/components/sources/Foo.tsx',
    EFFECTIVE_TIER_ASSIGN
  );
  assert.equal(v.length, 1);
});

test('F8: PASS for clean client code', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/components/sources/Foo.tsx',
    'body.assignedTier = tier;\nbody.url = url;'
  );
  assert.deepEqual(v, []);
});

test('F8: PASS when override comment present', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/components/sources/Foo.tsx',
    `${TIER_ASSIGN} // fitness-allow: F8 (legacy admin flow during ADR-XX transition; removed by date)`
  );
  assert.deepEqual(v, []);
});

test('F8: FAIL on object literal with tier near fetch call', () => {
  const fetchBody = '{ tier' + ': 3, url: "x" }';
  const v = fitnessFunction.check(
    'fsi-app/src/components/sources/Foo.tsx',
    `await fetch('/api/foo', { method: 'POST', body: JSON.stringify(${fetchBody}) });`
  );
  assert.ok(v.length >= 1);
});

test('F8: PASS on object literal with tier when NO fetch nearby', () => {
  const objLit = '{ tier' + ': 3 }';
  const v = fitnessFunction.check(
    'fsi-app/src/components/sources/Foo.tsx',
    `const config = ${objLit};\n// Used for local-only computation; never sent to server.`
  );
  assert.deepEqual(v, []);
});

test('F8: PASS for app/api files (server, allowed to dual-write)', () => {
  // F8's enumerate() excludes app/api/, but if check() were called directly on
  // such a file, the assignment would still be flagged. The enumerate() filter
  // is what protects server code. So this test just verifies enumerate filters.
  const files = fitnessFunction.enumerate();
  for (const f of files) {
    assert.equal(f.startsWith('fsi-app/src/app/api/'), false, `enumerate should not return server files; got ${f}`);
  }
});

test('F8: PASS when tier mentioned in line comment but not assigned', () => {
  const v = fitnessFunction.check(
    'fsi-app/src/components/sources/Foo.tsx',
    'body.assignedTier = tier; // server dual-writes to base_tier + effective_tier'
  );
  assert.deepEqual(v, []);
});

test('F8: has required metadata fields', () => {
  assert.equal(fitnessFunction.id, 'F8');
  assert.ok(fitnessFunction.source.includes('OBS-62'));
});

// ---- lane GATE-8 (2026-10-08): the honest forms the AUD-AT-4 register found ACCEPTED, red then green ----

const CLIENT = 'fsi-app/src/components/sources/Foo.tsx';

test('F8 B1-07: a URL string earlier on the line does not truncate the scan', () => {
  const src = 'const u = "https://example.com/a"; ' + TIER_ASSIGN;
  assert.equal(fitnessFunction.check(CLIENT, src).length, 1);
});

test('F8 B1-08: a bracket-key assignment is the same write', () => {
  assert.equal(fitnessFunction.check(CLIENT, 'body["base_' + 'tier"] = x;').length, 1);
  assert.equal(fitnessFunction.check(CLIENT, "body['effective_" + "tier'] = x;").length, 1);
});

test('F8 B1-09: a multi-line object literal with the tier key on its own line', () => {
  const src = 'await fetch("/api/x", {\n  method: "POST",\n  body: JSON.stringify({\n    url,\n    tier' + ': 3,\n  }),\n});';
  assert.equal(fitnessFunction.check(CLIENT, src).length >= 1, true);
});

test('F8 B1-10: client code under src/lib/client and "use client" files outside the component dirs are enumerated', () => {
  const body = fitnessFunction.enumerate.toString();
  assert.match(body, /lib\/client/);
  assert.match(body, /use client/);
});

test('F8 B1-11: Object.assign into the body in a file that spells a tier key is a write', () => {
  const src = 'const extra = JSON.parse(raw); // { "tier' + '": 2 }\nconst payload2 = { "tier' + '": 2 };\nObject.assign(body, extra);';
  assert.equal(fitnessFunction.check(CLIENT, src).length >= 1, true);
});

test('F8: a forged override marker inside a string is not an override', () => {
  const src = 'const m = "// fitness-allow: F8 (forged)"; ' + TIER_ASSIGN;
  assert.equal(fitnessFunction.check(CLIENT, src).length, 1);
});

test('F8: comparisons, reads and a tier key far from any request are clean', () => {
  assert.deepEqual(fitnessFunction.check(CLIENT, 'if (body.tier === 3) { go(); }\nconst t = body.base_tier;'), []);
  assert.deepEqual(fitnessFunction.check(CLIENT, 'const cfg = { tier' + ': 3 };\n\n\n\n\n\n\n\nawait fetch("/api/x");'), []);
});
