// Red-then-green for F67 (unguarded-main-invocation). A NEW instance of a CLI script calling its own
// main() unconditionally at module scope, with no isMainModule guard, is RED. See this function's own
// header for the defect class (F44-2a/2b/2c, F-10/F-11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fitnessFunction, findUnguardedMainInvocations } from './F67-unguarded-main-invocation.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

test('RED: a bare `main().catch(...)` at module scope with no guard anywhere above it is flagged', () => {
  const src = `import x from "y";\n\nasync function main() {}\n\nmain().catch((e) => { console.error(e); process.exit(1); });\n`;
  const v = fitnessFunction.check('fsi-app/scripts/new-script.mjs', src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 5);
  assert.match(v[0].message, /isMainModule/);
});

test('RED: a bare `await main();` at module scope is flagged', () => {
  const src = `async function main() {}\nawait main();\n`;
  const v = fitnessFunction.check('fsi-app/scripts/new-script.mjs', src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 2);
});

test('GREEN: the multi-line `if (isMainModule(import.meta.url)) { main()... }` form is never flagged', () => {
  const src = [
    'async function main() {}',
    'if (isMainModule(import.meta.url)) {',
    '  main().catch((e) => { console.error(e); process.exit(1); });',
    '}',
  ].join('\n');
  assert.deepEqual(fitnessFunction.check('fsi-app/scripts/new-script.mjs', src), []);
});

test('GREEN: the one-line `if (isMainModule(import.meta.url)) await main();` form is never flagged', () => {
  const src = 'async function main() {}\nif (isMainModule(import.meta.url)) await main();\n';
  assert.deepEqual(fitnessFunction.check('fsi-app/scripts/new-script.mjs', src), []);
});

test('GREEN: a guarded block with statements BETWEEN the guard-open line and main() (a creds check, a createClient() call) is never flagged, only the indentation nesting matters, not adjacency', () => {
  const src = [
    'let sb;',
    'async function main() {}',
    'if (isMainModule(import.meta.url)) {',
    '  if (!process.env.FOO) {',
    '    console.error("no creds");',
    '    process.exit(2);',
    '  }',
    '  sb = createClient(process.env.FOO, process.env.BAR);',
    '  main().catch((e) => { process.exit(1); });',
    '}',
  ].join('\n');
  assert.deepEqual(fitnessFunction.check('fsi-app/scripts/new-script.mjs', src), []);
});

test('RED: a call AFTER the guarded block has closed (same or lesser indentation than the guard-open line) is still flagged, proving the guard scope ends at its own closing brace', () => {
  const src = [
    'async function main() {}',
    'if (isMainModule(import.meta.url)) {',
    '  doSomethingElse();',
    '}',
    'main().catch((e) => { process.exit(1); });',
  ].join('\n');
  const v = fitnessFunction.check('fsi-app/scripts/new-script.mjs', src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 5);
});

test('a comment mentioning `main().catch(` (documenting history) is never flagged, only live code', () => {
  const src = '// the old code used to call main().catch((e) => {}) here unguarded\nconst x = 1;\n';
  assert.deepEqual(fitnessFunction.check('fsi-app/scripts/new-script.mjs', src), []);
});

test('test files are excluded from enumeration (a fixture constructing the unguarded shape as a literal string is not a live call site)', () => {
  for (const f of fitnessFunction.enumerate()) {
    assert.doesNotMatch(f, /\.(?:test|selftest|npmtest)\.mjs$/);
  }
});

test('_archive/ and /fixtures/ (/fixtures-dash/) paths are excluded from enumeration', () => {
  for (const f of fitnessFunction.enumerate()) {
    assert.doesNotMatch(f, /^fsi-app\/scripts\/_archive\//);
    assert.doesNotMatch(f, /\/fixtures(?:-dash)?\//);
  }
});

test('enumerate() reaches into fsi-app/.discipline/** too (round 3 widening), not only fsi-app/scripts/**', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(
    files.some((f) => f.startsWith('fsi-app/.discipline/')),
    'expected at least one fsi-app/.discipline/ file in scope'
  );
});

test('ATTACK: a guard line referencing isMainModule for an unrelated reason (e.g. a comment above an otherwise-bare call) does NOT suppress the finding unless the guard token is on the call line itself or the immediately preceding code line', () => {
  const src = [
    '// isMainModule is used elsewhere in this file',
    '',
    'main().catch((e) => { process.exit(1); });',
  ].join('\n');
  const v = fitnessFunction.check('fsi-app/scripts/new-script.mjs', src);
  assert.equal(v.length, 1, 'a comment-only mention of isMainModule must not suppress the finding');
});

test('findUnguardedMainInvocations: multiple unguarded instances in one file are each reported', () => {
  const src = 'main().catch(() => {});\nawait main();\n';
  assert.deepEqual(findUnguardedMainInvocations(src), [1, 2]);
});

// GATE-4 (2026-10-07): this test runs the fitness function against the live repo, which the Fitness
// functions job already does on every pull request (gate evaluation B section 7.6: it failed the unit-test
// step while the gate itself passed in the fitness job). It stays runnable here with FITNESS_LIVE_TESTS=1.
const LIVE_TREE = process.env.FITNESS_LIVE_TESTS === '1' ? {} : { skip: 'live-tree self-test, run by the Fitness functions job; set FITNESS_LIVE_TESTS=1 to run it here' };

test('LIVE: the whole scoped tree (fsi-app/scripts, excluding _archive) passes F67 clean as of lane R20', LIVE_TREE, () => {
  const problems = [];
  for (const f of fitnessFunction.enumerate()) {
    const content = readFileSync(resolve(REPO_ROOT, f), 'utf8');
    const v = fitnessFunction.check(f, content);
    if (v.length) problems.push(`${f}: ${v.map((x) => `${x.line}: ${x.message}`).join(' | ')}`);
  }
  assert.deepEqual(problems, []);
});
