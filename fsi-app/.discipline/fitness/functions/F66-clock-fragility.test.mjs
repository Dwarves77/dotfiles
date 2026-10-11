// Red-then-green for F66 (clock-fragility, lane R11). Each case is proven by attack: a planted
// violation is RED with its line, the sanctioned (pinned) form is GREEN, and the two files A6 sampled
// as known-good non-matches (relative-time.npmtest.mjs, render-clock.npmtest.mjs) stay clean. See the
// function's own header for the #816 class this gate targets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fitnessFunction,
  findClockFragileAssertions,
  findClockFragileAssertions as _f,
  splitIntoTestBlocks,
  stripComments,
  stripStrings,
  inScope,
  isGovernedTestPath,
  hasBracketChar,
  findBracketPathTests,
  checkBracketPathTests,
} from './F66-clock-fragility.mjs';
import { readFile } from '../lib/file-content.mjs';

test('RED: the #816 shape, reproduced directly, a live clock read and a concatenation-built equality assertion in the same block', () => {
  const src = [
    'test("nextMilestoneClause: drifts with the wall clock", () => {',
    '  const now = new Date();',
    '  const clause = nextMilestoneClause(classifyMilestones(list), now);',
    '  assert.equal(clause, "Transition deadline . 29 Sep 2026 . in " + daysBetween("2026-09-29") + " days");',
    '});',
  ].join('\n');
  assert.deepEqual(findClockFragileAssertions(src), [4]);
  const v = fitnessFunction.check('fsi-app/src/lib/detail/x.test.mjs', src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 4);
  assert.match(v[0].message, /#816/);
});

test('RED: Date.now() form, template-literal computed assertion', () => {
  const src = [
    'test("stamp matches", () => {',
    '  const t = Date.now();',
    '  assert.strictEqual(label(t), `stamped at ${t}`);',
    '});',
  ].join('\n');
  assert.deepEqual(findClockFragileAssertions(src), [3]);
});

test('RED: each computed assertion in a fragile block is reported, in line order', () => {
  const src = [
    'test("two assertions, one live read", () => {',
    '  const now = new Date();',
    '  assert.equal(a(now), "x" + now.getDate());',
    '  assert.equal(b(now), "y " + now.getDate());',
    '});',
  ].join('\n');
  assert.deepEqual(findClockFragileAssertions(src), [3, 4]);
});

test('GREEN: a live clock read compared only against a plain string literal is not flagged (relative-time.npmtest.mjs\'s own shape)', () => {
  const src = [
    'test("omitting the instant keeps default behaviour", () => {',
    '  const justNow = new Date();',
    '  assert.equal(formatRelative(justNow), "just now");',
    '});',
  ].join('\n');
  assert.deepEqual(findClockFragileAssertions(src), []);
});

test('GREEN: a pinned instant with no live read is not flagged even with a computed assertion', () => {
  const src = [
    'test("nextMilestoneClause: pinned now", () => {',
    '  const clause = nextMilestoneClause(classifyMilestones(list), "2026-09-21");',
    '  assert.equal(clause, "Transition deadline . 29 Sep 2026 . in " + 8 + " days");',
    '});',
  ].join('\n');
  assert.deepEqual(findClockFragileAssertions(src), []);
});

test('GREEN: a computed assertion in a DIFFERENT block than the live read is not flagged (the hazard is the combination, not either half alone)', () => {
  const src = [
    'test("reads the clock, asserts a literal", () => {',
    '  const now = new Date();',
    '  assert.equal(label(now), "today");',
    '});',
    'test("computed assertion, no live read here", () => {',
    '  assert.equal(label(fixed), "x" + 3);',
    '});',
  ].join('\n');
  assert.deepEqual(findClockFragileAssertions(src), []);
});

test('GREEN: a live-clock token quoted as fixture STRING DATA is never mistaken for a call (render-clock.npmtest.mjs\'s red-control shape)', () => {
  const src = [
    'test("the scanner actually fires (red control)", () => {',
    '  const red = \'  const weekOfLabel = useMemo(() => formatLocaleDate(new Date(), { month: "short" }), []);\';',
    '  assert.ok(HAZARD.test(red));',
    '  assert.equal(label, "x" + "y");',
    '});',
  ].join('\n');
  assert.deepEqual(findClockFragileAssertions(src), []);
});

test('GREEN: prose naming the hazard in a comment is never mistaken for a live call', () => {
  const src = [
    '// Variable input such as `new Date()` or `Date.now()` which changes each time it is called.',
    'test("x", () => {',
    '  assert.equal(a, "p" + 1);',
    '});',
  ].join('\n');
  assert.deepEqual(findClockFragileAssertions(src), []);
});

test('helper: stripComments blanks // and /* */ bodies but keeps line count', () => {
  const src = 'const a = 1; // new Date()\n/* Date.now() */\nconst b = 2;\n';
  const out = stripComments(src);
  assert.equal(out.split('\n').length, src.split('\n').length);
  assert.ok(!/Date/.test(out));
});

test('helper: stripStrings blanks quoted bodies but keeps quote chars and length', () => {
  const src = "const red = 'new Date() lives here';\n";
  const out = stripStrings(src);
  assert.ok(!/new Date/.test(out));
  assert.equal(out.length, src.length);
});

test('helper: splitIntoTestBlocks finds each top-level test() and assigns its own start line', () => {
  const src = 'import x from "y";\n\ntest("a", () => {\n  1;\n});\ntest("b", () => {\n  2;\n});\n';
  const blocks = splitIntoTestBlocks(src);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].startLine, 3);
  assert.equal(blocks[1].startLine, 6);
});

test('scope: test files under scripts/src are in; archived/reground/tmp trees and non-test files are out', () => {
  assert.equal(inScope('fsi-app/src/lib/detail/timeline-math.test.mjs'), true);
  assert.equal(inScope('fsi-app/src/lib/relative-time.npmtest.mjs'), true);
  assert.equal(inScope('fsi-app/scripts/mint/apply-mint-batch.test.mjs'), true);
  assert.equal(inScope('fsi-app/scripts/_archive/x.test.mjs'), false);
  assert.equal(inScope('fsi-app/scripts/tmp/x.test.mjs'), false);
  assert.equal(inScope('fsi-app/src/lib/detail/timeline-math.ts'), false);
});

test('NEGATIVE CONTROL: relative-time.npmtest.mjs is a known-good non-match (A6\'s own sampled case)', () => {
  const content = readFile('fsi-app/src/lib/relative-time.npmtest.mjs');
  assert.ok(content, 'fixture file must exist and be readable');
  assert.deepEqual(_f(content), []);
  assert.equal(fitnessFunction.check('fsi-app/src/lib/relative-time.npmtest.mjs', content).length, 0);
});

test('NEGATIVE CONTROL: render-clock.npmtest.mjs is a known-good non-match (A6\'s own sampled case)', () => {
  const content = readFile('fsi-app/src/lib/render-clock.npmtest.mjs');
  assert.ok(content, 'fixture file must exist and be readable');
  assert.deepEqual(_f(content), []);
  assert.equal(fitnessFunction.check('fsi-app/src/lib/render-clock.npmtest.mjs', content).length, 0);
});

test('GREEN: Date.now() used to build a scratch-dir name, asserted deepEqual against a literal [], not a string-equality date assertion (emit-producers-artifact.test.mjs:40 / population-report.test.mjs:744 shape)', () => {
  const src = [
    'test("a missing directory yields [], never a throw", () => {',
    '  assert.deepEqual(loadThing(join(tmpdir(), "does-not-exist-" + Date.now())), []);',
    '});',
  ].join('\n');
  assert.deepEqual(findClockFragileAssertions(src), []);
});

// GATE-4 (2026-10-07): this test runs the fitness function against the live repo, which the Fitness
// functions job already does on every pull request (gate evaluation B section 7.6: it failed the unit-test
// step while the gate itself passed in the fitness job). It stays runnable here with FITNESS_LIVE_TESTS=1.
const LIVE_TREE = process.env.FITNESS_LIVE_TESTS === '1' ? {} : { skip: 'live-tree self-test, run by the Fitness functions job; set FITNESS_LIVE_TESTS=1 to run it here' };

test('LIVE: no test file in the live tree carries the #816 combination', LIVE_TREE, () => {
  const files = fitnessFunction.enumerate();
  assert.ok(files.length > 20, `expected a real scan, got ${files.length} files`);
  const red = [];
  for (const f of files) {
    const content = readFile(f);
    if (content === null) continue;
    const v = fitnessFunction.check(f, content);
    if (v.length) red.push(`${f}:${v.map((x) => x.line).join(',')}`);
  }
  assert.deepEqual(red, [], `F66 violations: ${red.join(' ')}`);
});

// ---- Facet B, formerly F65 (REG-1, 2026-10-11): the former F65 test file, moved here with its function. ----
test('isGovernedTestPath: recognizes all four governed suffixes, case notwithstanding path case', () => {
  assert.equal(isGovernedTestPath('fsi-app/scripts/foo.test.mjs'), true);
  assert.equal(isGovernedTestPath('fsi-app/scripts/foo.npmtest.mjs'), true);
  assert.equal(isGovernedTestPath('fsi-app/scripts/foo.selftest.mjs'), true);
  assert.equal(isGovernedTestPath('fsi-app/scripts/foo.golden.mjs'), true);
  assert.equal(isGovernedTestPath('fsi-app/scripts/foo.mjs'), false);
  assert.equal(isGovernedTestPath('fsi-app/scripts/foo.ts'), false);
});

test('hasBracketChar: true for either bracket, anywhere in the path', () => {
  assert.equal(hasBracketChar('fsi-app/src/app/api/[id]/route.test.mjs'), true);
  assert.equal(hasBracketChar('fsi-app/src/app/[locale]/page.npmtest.mjs'), true);
  assert.equal(hasBracketChar('fsi-app/scripts/foo.test.mjs'), false);
});

test('RED (fixture that MUST fail, rule 15, the exact CF-SEC-11 shape): a *.npmtest.mjs colocated under a [param]/ route dir is flagged', () => {
  const paths = [
    'fsi-app/src/app/api/admin/statutory-rows/[id]/route.ts',
    'fsi-app/src/app/api/admin/statutory-rows/[id]/route.npmtest.mjs',
    'fsi-app/scripts/lib/db.mjs',
  ];
  const bad = findBracketPathTests(paths);
  assert.deepEqual(bad, ['fsi-app/src/app/api/admin/statutory-rows/[id]/route.npmtest.mjs']);
});

test('RED: each of the four governed suffixes is independently caught under a bracket segment', () => {
  const paths = [
    'fsi-app/src/app/[locale]/page.test.mjs',
    'fsi-app/src/app/[locale]/page.npmtest.mjs',
    'fsi-app/src/app/[locale]/page.selftest.mjs',
    'fsi-app/src/app/[locale]/page.golden.mjs',
  ];
  assert.deepEqual(findBracketPathTests(paths), paths.slice().sort());
});

test('GREEN: a governed test path with no bracket is never flagged', () => {
  const paths = [
    'fsi-app/scripts/lib/db.test.mjs',
    'fsi-app/.discipline/fitness/functions/F44-broken-main-guard.test.mjs',
  ];
  assert.deepEqual(findBracketPathTests(paths), []);
});

test('GREEN: a non-test path with a bracket segment is never flagged (only governed test suffixes count)', () => {
  const paths = [
    'fsi-app/src/app/api/admin/statutory-rows/[id]/route.ts',
    'fsi-app/src/app/[locale]/page.tsx',
  ];
  assert.deepEqual(findBracketPathTests(paths), []);
});

test('findBracketPathTests: sorts its output deterministically', () => {
  const paths = [
    'fsi-app/z/[b]/z.test.mjs',
    'fsi-app/a/[a]/a.test.mjs',
  ];
  assert.deepEqual(findBracketPathTests(paths), [
    'fsi-app/a/[a]/a.test.mjs',
    'fsi-app/z/[b]/z.test.mjs',
  ]);
});

// GATE-4 (2026-10-07): this test runs the fitness function against the live repo, which the Fitness
// functions job already does on every pull request (gate evaluation B section 7.6: it failed the unit-test
// step while the gate itself passed in the fitness job). It stays runnable here with FITNESS_LIVE_TESTS=1.

test('LIVE: the real tracked tree carries zero bracket-path governed tests today', LIVE_TREE, () => {
  const violations = checkBracketPathTests();
  assert.deepEqual(violations, []);
});
