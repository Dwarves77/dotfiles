// Tests for the generated-files registry (lane RULES-1, 2026-10-07). A file is exempt from F51 check 5
// only when it is registered AND its committed copy equals what its named generator prints now; a
// hand-edited copy, a failed generator and a live-sourced file are never exempt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRepoRoot } from '../lib/context.mjs';
import {
  GENERATED_FILES, findGeneratedEntry, renderGenerated, checkGeneratedFile,
} from './generated-files.mjs';

const ROOT = getRepoRoot();

const FIXTURE = [
  { path: 'out/tree.txt', generator: 'gen/tree.mjs', source: 'tree' },
  { path: 'out/live.json', generator: 'gen/live.mjs', source: 'live', why: 'needs a live database' },
];
const fakeRun = (stdout) => { const calls = []; const run = (argv, cwd) => { calls.push({ argv, cwd }); return stdout; }; run.calls = calls; return run; };
const fakeRead = (text) => () => text;

test('registry: every entry names an existing generator script, a unique path and a source', () => {
  const seen = new Set();
  assert.ok(GENERATED_FILES.length >= 3, 'the registry names the inventories every migration lane regenerates');
  for (const e of GENERATED_FILES) {
    assert.ok(typeof e.path === 'string' && e.path.length > 0, 'path');
    assert.ok(!seen.has(e.path), `duplicate path ${e.path}`);
    seen.add(e.path);
    assert.ok(typeof e.generator === 'string' && existsSync(join(ROOT, e.generator)), `generator ${e.generator} must exist`);
    assert.ok(e.source === 'tree' || e.source === 'live', `${e.path}: source must be tree or live`);
    if (e.source === 'live') assert.ok(typeof e.why === 'string' && e.why.length > 0, `${e.path}: a live entry says why`);
  }
});

test('registry: the migration inventory, the coverage report and the check-constraint inventory are registered', () => {
  assert.equal(findGeneratedEntry('docs/inventories/migrations.md').generator, 'fsi-app/scripts/inventories/generate-migrations-inventory.mjs');
  assert.equal(findGeneratedEntry('fsi-app/.discipline/governance/coverage-report.json').generator, 'fsi-app/.discipline/governance/coverage-scan.mjs');
  assert.equal(findGeneratedEntry('fsi-app/docs/inventories/db-check-constraints.json').source, 'live');
  assert.equal(findGeneratedEntry('fsi-app/src/lib/anything-else.ts'), null);
});

test('checkGeneratedFile: an unregistered file is not generated', () => {
  assert.deepEqual(checkGeneratedFile('/x', 'src/a.ts', { entries: FIXTURE }), { generated: false });
});

test('checkGeneratedFile GREEN: a registered file whose copy equals the generator output is exempt, and nothing is written', () => {
  const run = fakeRun('line one\nline two\n');
  const r = checkGeneratedFile('/x', 'out/tree.txt', { entries: FIXTURE, run, readFile: fakeRead('line one\nline two\n') });
  assert.equal(r.generated, true);
  assert.equal(r.exempt, true);
  assert.equal(run.calls.length, 1);
  assert.equal(run.calls[0].cwd, '/x');
  assert.ok(run.calls[0].argv[0].endsWith('tree.mjs'), 'the generator named by the entry is the thing that runs');
});

test('checkGeneratedFile GREEN: CRLF in the working copy does not make an equal file differ', () => {
  const r = checkGeneratedFile('/x', 'out/tree.txt', { entries: FIXTURE, run: fakeRun('a\nb\n'), readFile: fakeRead('a\r\nb\r\n') });
  assert.equal(r.exempt, true);
});

test('checkGeneratedFile RED: a hand-edited copy differs from the generator output and is NOT exempt', () => {
  const r = checkGeneratedFile('/x', 'out/tree.txt', { entries: FIXTURE, run: fakeRun('a\nb\n'), readFile: fakeRead('a\nb edited by hand\n') });
  assert.equal(r.generated, true);
  assert.equal(r.exempt, false);
  assert.match(r.reason, /does not equal/);
  assert.match(r.reason, /gen\/tree\.mjs/, 'the reason names the generator to rerun');
});

test('checkGeneratedFile RED: a generator that fails is NOT exempt (fail closed), with the reason', () => {
  const run = () => { throw new Error('boom'); };
  const r = checkGeneratedFile('/x', 'out/tree.txt', { entries: FIXTURE, run, readFile: fakeRead('a\n') });
  assert.equal(r.exempt, false);
  assert.match(r.reason, /generator failed/);
  assert.match(r.reason, /boom/);
});

test('checkGeneratedFile RED: a registered file missing from the tree is NOT exempt', () => {
  const r = checkGeneratedFile('/x', 'out/tree.txt', { entries: FIXTURE, run: fakeRun('a\n'), readFile: () => null });
  assert.equal(r.exempt, false);
});

test('checkGeneratedFile RED: a live-sourced file is listed but never exempt, and its generator is never run', () => {
  const run = fakeRun('{}');
  const r = checkGeneratedFile('/x', 'out/live.json', { entries: FIXTURE, run, readFile: fakeRead('{}') });
  assert.equal(r.generated, true);
  assert.equal(r.exempt, false);
  assert.match(r.reason, /live/);
  assert.equal(run.calls.length, 0);
});

test('renderGenerated: default argv is the entry\'s generator plus its args, run from the root', () => {
  const run = fakeRun('x');
  renderGenerated('/repo', { path: 'p', generator: 'g/gen.mjs', args: ['--dry'], source: 'tree' }, { run });
  assert.equal(run.calls[0].argv[0], join('/repo', 'g/gen.mjs'));
  assert.deepEqual(run.calls[0].argv.slice(1), ['--dry']);
});

test('LIVE TREE: the real migration inventory equals its real generator output (no file is written)', () => {
  const r = checkGeneratedFile(ROOT, 'docs/inventories/migrations.md');
  assert.equal(r.generated, true);
  assert.equal(r.exempt, true, r.reason);
});

test('LIVE TREE ATTACK: the real migration inventory with one Subject cell edited by hand is NOT exempt', () => {
  const real = checkGeneratedFile(ROOT, 'docs/inventories/migrations.md', {
    readFile: (abs) => `${readFileSync(abs, 'utf8')}\n| 999 | 999_hand_added.sql | hand-added row |\n`,
  });
  assert.equal(real.exempt, false);
});

test('LIVE TREE: the coverage report renders from its real generator as the report JSON', () => {
  const entry = findGeneratedEntry('fsi-app/.discipline/governance/coverage-report.json');
  const text = renderGenerated(ROOT, entry);
  const parsed = JSON.parse(text);
  assert.ok(Array.isArray(parsed.items) && parsed.items.length > 0);
  assert.ok(parsed.summary && typeof parsed.summary.governed_files === 'number');
});
