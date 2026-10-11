// Red-then-green for F71 (community-boundary, ADR-041). Rule 15: the guard is proven by attack, the RED case is
// the exact crossing ADR-041 forbids: a regulations data path importing from src/lib/community.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fitnessFunction, findCrossings, ALLOWLIST, COMMUNITY_SCOPE } from './F71-community-boundary.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const REG_PATH = 'fsi-app/src/lib/regulations/data.ts';
const NL = String.fromCharCode(10);
// Fixture import lines are assembled at run time so this test file never carries a literal import statement of its own
// (the no-npm portability scan reads a quoted import line as a real import).
const imp = (spec, name = 'x') => `import { ${name} } ${'fro' + 'm'} "${spec}";${NL}`;

test('RED: a fixture import from src/lib/community into a regulations data path fails', () => {
  const src = imp('@/lib/community/rooms', 'rooms') + 'export const x = rooms;' + NL;
  const v = fitnessFunction.check(REG_PATH, src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 1);
  assert.match(v[0].message, /ADR-041 boundary/);
});

test('RED: a relative import that resolves into src/components/community is caught', () => {
  const v = fitnessFunction.check('fsi-app/src/components/regulations/Row.tsx', imp('../community/Chip', 'Chip'));
  assert.equal(v.length, 1);
});

test('RED: a dynamic import from the Community library is caught', () => {
  const v = fitnessFunction.check(REG_PATH, 'const m = await ' + 'import' + '("@/lib/community/identity");' + NL);
  assert.equal(v.length, 1);
});

test('RED: naming a community_* table outside the scope is caught', () => {
  const v = fitnessFunction.check('fsi-app/src/lib/dashboard/pulse.ts', 'const r = await sb.from("community_posts").select("id");' + NL);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /community_posts/);
});

test('GREEN: a file inside each of the four Community directories is never judged', () => {
  const src = imp('@/lib/community/identity') + 'sb.from("community_posts");' + NL;
  for (const dir of COMMUNITY_SCOPE) assert.deepEqual(fitnessFunction.check(`${dir}some-file.ts`, src), [], dir);
});

test('GREEN: a comment that names the Community library is not a crossing', () => {
  const src = ['// formerly imported ' + 'from "@/lib/community/rooms"', '/* ' + 'from "@/lib/community/x" */', ' * ' + 'from "@/lib/community/y"'].join(NL) + NL;
  assert.deepEqual(fitnessFunction.check(REG_PATH, src), []);
});

test('GREEN: an unrelated import with community in a filename is not a crossing', () => {
  assert.deepEqual(fitnessFunction.check(REG_PATH, imp('@/lib/communityless/x') + imp('./community-notes.json', 'y')), []);
});

test('GREEN: an allowlisted site that still crosses passes; a stale allowlisted site is RED', () => {
  const file = Object.keys(ALLOWLIST)[0];
  assert.deepEqual(fitnessFunction.check(file, 'sb.from("community_posts");' + NL), []);
  const stale = fitnessFunction.check(file, 'const nothing = 1;' + NL);
  assert.equal(stale.length, 1);
  assert.match(stale[0].message, /ALLOWLIST STALE/);
});

test('every allowlist entry carries a reason and an ISO date', () => {
  for (const [file, e] of Object.entries(ALLOWLIST)) {
    assert.ok(typeof e.reason === 'string' && e.reason.split(/\s+/).length >= 8, file);
    assert.ok(!Number.isNaN(Date.parse(e.decidedOn)), file);
  }
});

test('findCrossings: reports each crossing on its own line', () => {
  const src = imp('@/lib/community/a', 'a') + imp('@/lib/community/b', 'b');
  assert.deepEqual(findCrossings(REG_PATH, src).map((c) => c.line), [1, 2]);
});

const LIVE_TREE = process.env.FITNESS_LIVE_TESTS === '1' ? {} : { skip: 'live-tree self-test, run by the Fitness functions job; set FITNESS_LIVE_TESTS=1 to run it here' };

test('LIVE: the whole src tree passes F71 clean', LIVE_TREE, () => {
  const problems = [];
  for (const f of fitnessFunction.enumerate()) {
    const v = fitnessFunction.check(f, readFileSync(resolve(REPO_ROOT, f), 'utf8'));
    if (v.length) problems.push(`${f}: ${v.map((x) => `${x.line}: ${x.message}`).join(' | ')}`);
  }
  assert.deepEqual(problems, []);
});
