// F59 proven by attack: every hard-coded dependency path shape the 2026-09-27 fix removed is flagged,
// and the resolver-based replacements, comments and directory-skip lists are not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction, findHardcodedDepPaths } from './F59-dep-path-resolved.mjs';

const lines = (src) => findHardcodedDepPaths(src).map((f) => f.line);

test('RED: the five pre-fix shapes (verbatim from the removed code) are each flagged', () => {
  const removed = [
    "  const localTsc = join(getRepoRoot(), 'fsi-app', 'node_modules', '.bin', 'tsc');",
    "const LEAFLET_CSS = readFileSync(join(getRepoRoot(), 'fsi-app/node_modules/leaflet/dist/leaflet.css'), 'utf8');",
    "    styleFiles: ['fsi-app/node_modules/leaflet/dist/leaflet.css'],",
    '    target = fs.realpathSync(path.join(__dirname, "node_modules"));',
    // run-npmtest-suites.sh's pre-fix presence check: no trailing separator. The first draft of this
    // gate required one and missed it; the attack against origin/master's copy caught that.
    'if [ ! -d fsi-app/node_modules ] || [ -z "$(ls -A fsi-app/node_modules 2>/dev/null)" ]; then',
  ];
  for (const src of removed) assert.deepEqual(lines(src), [1], `not flagged: ${src}`);
});

test('RED: Windows separators and a bare node_modules/.bin join are flagged too', () => {
  assert.deepEqual(lines("const p = 'fsi-app\\\\node_modules\\\\typescript';"), [1]);
  assert.deepEqual(lines("x\nconst bin = join(root, 'node_modules', '.bin', 'next');"), [2]);
});

test('GREEN: resolver calls, comments and skip lists are not flagged', () => {
  const ok = [
    "  return tryResolveAppDep('typescript/bin/tsc');",
    "const LEAFLET_CSS = readFileSync(resolveAppDep('leaflet/dist/leaflet.css'), 'utf8');",
    "    const nextPkg = require.resolve(\"next/package.json\", { paths: [__dirname] });",
    "// never the literal fsi-app/node_modules/.bin path (RD-85)",
    "# in a worktree fsi-app/node_modules/ does not exist",
    " * resolved from fsi-app/node_modules/ first",
    "const SKIP_DIRS = new Set(['node_modules', '.git', '.next']);",
    "const SKIP_DIR = /node_modules|\\.next/;",
  ];
  for (const src of ok) assert.deepEqual(lines(src), [], `falsely flagged: ${src}`);
});

test('check() reports file:line violations; the resolver and layout owner are out of scope', () => {
  const v = fitnessFunction.check('x.mjs', "a\nb\nconst t = join(r, 'fsi-app', 'node_modules');");
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 3);
  const files = fitnessFunction.enumerate();
  assert.ok(!files.includes('fsi-app/.discipline/lib/resolve-dep.mjs'));
  assert.ok(!files.includes('fsi-app/.discipline/hooks/lib/worktree-node-modules.sh'));
  assert.ok(files.includes('fsi-app/.discipline/fitness/functions/F9-build-compiles.mjs'), 'F9 is in scope');
  assert.ok(files.includes('fsi-app/next.config.ts'), 'next.config.ts is in scope');
  assert.ok(files.includes('fsi-app/.discipline/hooks/lib/run-npmtest-suites.sh'), 'hook shell libs are in scope');
});
