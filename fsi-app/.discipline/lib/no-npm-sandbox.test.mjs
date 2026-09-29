// Attack proof for no-npm-sandbox.mjs (rule 15: a guard is proven by attack). Each case spawns a real
// child `node`, with and without `--import` of the sandbox, so what is proven is actual module
// resolution, not a reading of the source. The fake "checkout install" is written under
// fsi-app/scripts/tmp/ (gitignored scratch), so the attack behaves the same in CI, where no real npm
// install exists, and locally, where one does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isCheckoutNodeModules } from './no-npm-sandbox.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const SANDBOX = pathToFileURL(join(HERE, 'no-npm-sandbox.mjs')).href;

function fakePackage(nmDir, name) {
  mkdirSync(join(nmDir, name), { recursive: true });
  writeFileSync(join(nmDir, name, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js', exports: { '.': { import: './index.mjs', require: './index.js' } } }));
  writeFileSync(join(nmDir, name, 'index.js'), 'module.exports = "cjs-ok";\n');
  writeFileSync(join(nmDir, name, 'index.mjs'), 'export default "esm-ok";\n');
}

function probe(dir, name) {
  const cjs = join(dir, 'probe-cjs.cjs');
  const esm = join(dir, 'probe-esm.mjs');
  writeFileSync(cjs, `console.log(require(${JSON.stringify(name)}));\n`);
  writeFileSync(esm, `const m = await import(${JSON.stringify(name)}); console.log(m.default);\n`);
  return { cjs, esm };
}

function run(file, withSandbox) {
  const args = withSandbox ? ['--import', SANDBOX, file] : [file];
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test('ATTACK: a package installed in the CHECKOUT resolves without the sandbox and is refused under it, CJS and ESM', (t) => {
  const base = join(REPO, 'fsi-app', 'scripts', 'tmp', `no-npm-sandbox-attack-${process.pid}-${Date.now()}`);
  t.after(() => rmSync(base, { recursive: true, force: true }));
  fakePackage(join(base, 'node_modules'), 'fake-checkout-pkg');
  const { cjs, esm } = probe(base, 'fake-checkout-pkg');

  // Control: the fake package really is resolvable, so a refusal below is the sandbox, not a broken probe.
  assert.match(run(cjs, false).out, /cjs-ok/);
  assert.match(run(esm, false).out, /esm-ok/);

  const c = run(cjs, true);
  assert.notEqual(c.status, 0);
  assert.match(c.out, /Cannot find module 'fake-checkout-pkg'/);
  const e = run(esm, true);
  assert.notEqual(e.status, 0);
  // CI's own message shape (run 36450339377): "Cannot find package '<pkg>' imported from <file>".
  assert.match(e.out, /Cannot find package 'fake-checkout-pkg' imported from /);
});

test('a package in a node_modules OUTSIDE the checkout (a test fixture under os.tmpdir) still resolves under the sandbox, as it does in CI', (t) => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'no-npm-sandbox-fixture-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  fakePackage(join(base, 'node_modules'), 'fake-fixture-pkg');
  const { cjs, esm } = probe(base, 'fake-fixture-pkg');
  assert.match(run(cjs, true).out, /cjs-ok/);
  assert.match(run(esm, true).out, /esm-ok/);
});

test('node builtins and relative imports are untouched by the sandbox', (t) => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'no-npm-sandbox-builtin-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  writeFileSync(join(base, 'dep.mjs'), 'export const x = 7;\n');
  const f = join(base, 'probe.mjs');
  writeFileSync(f, "import { x } from './dep.mjs'; import { join } from 'node:path'; import fs from 'fs'; console.log(x, typeof join, typeof fs.readFileSync);\n");
  assert.match(run(f, true).out, /7 function function/);
});

test('isCheckoutNodeModules: inside a root, at a root, and at an ancestor of a root are blocked; elsewhere is not', () => {
  const isWin = process.platform === 'win32';
  const root = isWin ? 'c:\\repo\\.claude\\worktrees\\lane' : '/repo/.claude/worktrees/lane';
  const j = (...p) => (isWin ? p.join('\\') : p.join('/'));
  const roots = [root];
  assert.equal(isCheckoutNodeModules(j(root, 'fsi-app', 'node_modules'), roots), true); // in-tree install
  assert.equal(isCheckoutNodeModules(j(root, 'node_modules'), roots), true); // at the root
  assert.equal(isCheckoutNodeModules(j(isWin ? 'c:\\repo\\.claude\\worktrees' : '/repo/.claude/worktrees', 'node_modules'), roots), true); // the shared link
  assert.equal(isCheckoutNodeModules(j(isWin ? 'c:\\tmp\\fixture' : '/tmp/fixture', 'node_modules'), roots), false); // a fixture
});
