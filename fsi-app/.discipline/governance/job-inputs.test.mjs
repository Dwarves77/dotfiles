// job-inputs.test.mjs (lane CI-MIN-1, 2026-10-10). Tests for the one job-inputs classifier. node:test, no npm deps.
// (a) ATTACK, parameterised over the map: a new entry is covered with no edit here. (b) COVERAGE: no tracked non-docs
// file can skip every gate. (c) a workflow or the classifier itself runs every job. Plus the derivation and the CLI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALWAYS_ON,
  CLASSIFIER_FILES,
  SCOPED,
  SCOPED_KEYS,
  buildJobInputs,
  globToRegex,
  importClosure,
  jobBlockCode,
  jobIdOf,
  jobsTouched,
  sampleFileFor,
  scriptsRunBy,
} from './job-inputs.mjs';
import { isDocsOnlyPath } from './docs-only-range.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const MAP = buildJobInputs(ROOT);

test('every scoped key has a map entry that names its workflow file and the shared actions', () => {
  assert.deepEqual(Object.keys(MAP).sort(), [...SCOPED_KEYS].sort());
  for (const key of SCOPED_KEYS) {
    assert.ok(MAP[key].includes(`.github/workflows/${SCOPED[key].workflow}`), `${key}: its own workflow`);
    assert.ok(MAP[key].includes('.github/actions/**'), `${key}: the shared actions`);
  }
});

test('ATTACK (a): for every scoped job, touching exactly one file from each of its globs returns that job', () => {
  let probes = 0;
  for (const key of SCOPED_KEYS) {
    for (const glob of MAP[key]) {
      const file = sampleFileFor(glob);
      assert.ok(globToRegex(glob).test(file), `${key}: the probe ${file} matches its glob ${glob}`);
      const verdict = jobsTouched([file], MAP);
      assert.ok(verdict.touched.includes(key), `${key}: touching ${file} (glob ${glob}) must run the job; got ${JSON.stringify(verdict.touched)}`);
      probes++;
    }
  }
  assert.ok(probes > 100, `the attack covered ${probes} globs`);
});

test('ATTACK (a): a job whose glob is removed from the map is no longer run by its own file (the attack bites)', () => {
  const cut = { ...MAP, design_audit: MAP.design_audit.filter((g) => g !== 'docs/design/**') };
  assert.equal(jobsTouched(['docs/design/handoff/x.md'], cut).touched.includes('design_audit'), false);
  assert.equal(jobsTouched(['docs/design/handoff/x.md'], MAP).touched.includes('design_audit'), true);
});

test('COVERAGE (b): every git-tracked non-docs file is an input of at least one always-on or scoped job', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
  const readDocs = new Set();
  let checked = 0;
  for (const f of tracked) {
    if (isDocsOnlyPath(f, readDocs)) continue;
    const v = jobsTouched([f], MAP);
    assert.ok(v.alwaysOn.length + v.touched.length > 0, `${f}: no job would run`);
    checked++;
  }
  assert.ok(checked > 1000, `${checked} non-docs files checked`);
});

test('COVERAGE (b): the always-on jobs are real jobs of discipline.yml and carry no input scoping', () => {
  const text = readFileSync(join(ROOT, '.github', 'workflows', 'discipline.yml'), 'utf8');
  for (const id of ALWAYS_ON) {
    assert.ok(text.split('\n').includes(`  ${id}:`), `discipline.yml has the always-on job ${id}`);
    assert.doesNotMatch(jobBlockCode(text, id), /needs\.inputs\.outputs/, `${id} is never scoped by the inputs job`);
  }
});

test('COVERAGE (b): every scoped job id exists in its workflow file', () => {
  for (const key of SCOPED_KEYS) {
    const text = readFileSync(join(ROOT, '.github', 'workflows', SCOPED[key].workflow), 'utf8');
    assert.ok(text.split('\n').includes(`  ${jobIdOf(key)}:`), `${SCOPED[key].workflow} has job ${jobIdOf(key)}`);
  }
});

test('(c) a change to the classifier, its test, or any workflow returns every job', () => {
  for (const f of [...CLASSIFIER_FILES, '.github/workflows/brief-apply.yml', '.github/workflows/discipline.yml', '.github/workflows/new-one.yml']) {
    const v = jobsTouched([f, 'docs/ops/session-log.d/x.md'], MAP);
    assert.deepEqual([...v.touched].sort(), [...SCOPED_KEYS].sort(), f);
    assert.deepEqual(v.unchanged, []);
  }
});

test('fail toward running: an empty or unreadable change list runs every job', () => {
  assert.deepEqual([...jobsTouched([], MAP).touched].sort(), [...SCOPED_KEYS].sort());
  assert.deepEqual([...jobsTouched(undefined, MAP).touched].sort(), [...SCOPED_KEYS].sort());
});

test('expected job sets: a docs or tokens only PR, a migrations only PR, a src only PR', () => {
  const docs = jobsTouched(['docs/ops/session-log.d/2026-10-11-x.md', 'docs/inventories/migrations.md', 'docs/PROGRAM-BOARD.md'], MAP);
  assert.deepEqual(docs.touched, []);
  assert.deepEqual(docs.alwaysOn, [...ALWAYS_ON]);
  const mig = jobsTouched(['fsi-app/supabase/migrations/390_x.sql', 'docs/ops/session-log.d/y.md'], MAP);
  assert.deepEqual([...mig.touched].sort(), ['bug_class_scan', 'migration_proof', 'rls_persona_matrix']);
  const src = jobsTouched(['fsi-app/src/components/ui/Chip.tsx'], MAP);
  assert.deepEqual([...src.touched].sort(), ['bug_class_scan', 'design_audit', 'discrimination_guard', 'rendering_guard']);
  assert.deepEqual(src.unchanged.sort(), ['migration_proof', 'rls_persona_matrix']);
});

test('docs that a scoped job reads still run it: docs/design and docs/specs are design audit inputs', () => {
  assert.deepEqual(jobsTouched(['docs/specs/04-x.md'], MAP).touched, ['design_audit']);
});

test('globToRegex: ** crosses directories, * does not, dots are literal', () => {
  assert.equal(globToRegex('a/**').test('a/b/c.txt'), true);
  assert.equal(globToRegex('a/*').test('a/b/c.txt'), false);
  assert.equal(globToRegex('a/*.json').test('a/xjson'), false);
  assert.equal(globToRegex('a/b.json').test('a/b.json'), true);
});

test('derivation: the rendering guard script and its imports are inputs without being typed in the map', () => {
  const guard = 'fsi-app/.discipline/rendering/run-rendering-guard.mjs';
  assert.ok(MAP.rendering_guard.includes(guard));
  assert.ok(MAP.rendering_guard.includes('fsi-app/.discipline/lib/context.mjs'), 'a transitive import is an input');
  assert.ok(MAP.design_audit.includes('fsi-app/.discipline/rendering/audit/run-audit.mjs'), 'npm run audit:design resolves through package.json');
  assert.ok(MAP.discrimination_guard.includes('fsi-app/scripts/lib/inconclusive-probe.npmtest.mjs'), 'the node --test list of the workflow');
  assert.ok(MAP.bug_class_scan.includes('fsi-app/scripts/verify/migration-number-collision.mjs'));
  assert.ok(MAP.rls_persona_matrix.includes('fsi-app/scripts/verify/attacks/rls-persona-matrix.mjs'));
});

test('derivation: scriptsRunBy ignores comment lines (jobBlockCode) and reads npm run bodies', () => {
  const yml = ['jobs:', '  a:', '    steps:', '      # node scripts/lib/commented.mjs', '      - run: node scripts/lib/real.mjs', '      - run: npm run thing', '  b:', '    steps:', '      - run: node scripts/lib/other.mjs'].join('\n');
  const block = jobBlockCode(yml, 'a');
  assert.deepEqual(scriptsRunBy(block, { thing: 'node .discipline/x/y.mjs --flag' }).sort(), ['fsi-app/.discipline/x/y.mjs', 'fsi-app/scripts/lib/real.mjs']);
});

test('derivation: importClosure follows static, re-export and dynamic relative imports and skips bare specifiers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'job-inputs-'));
  try {
    mkdirSync(join(dir, 'p'), { recursive: true });
    writeFileSync(join(dir, 'p', 'a.mjs'), "import x from './b.mjs';\nexport * from './c';\nconst d = await import('./d.mjs');\nimport 'node:fs';\nimport y from 'typescript';\n");
    for (const f of ['b.mjs', 'c.mjs', 'd.mjs']) writeFileSync(join(dir, 'p', f), '// leaf\n');
    assert.deepEqual(importClosure(['p/a.mjs'], dir), ['p/a.mjs', 'p/b.mjs', 'p/c.mjs', 'p/d.mjs']);
    assert.deepEqual(importClosure(['p/missing.mjs'], dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every wired scoped job is wired and every unwired one is named, so flipping wired is a deliberate edit', () => {
  assert.deepEqual(SCOPED_KEYS.filter((k) => !SCOPED[k].wired), ['migration_proof']);
  const text = readFileSync(join(ROOT, '.github', 'workflows', 'migration-proof.yml'), 'utf8');
  assert.doesNotMatch(jobBlockCode(text, 'migration-proof'), /needs\.inputs/, 'migration_proof is unwired until its workflow test is granted');
});

// --- CLI ----------------------------------------------------------------------------------------------------------

function gitIn(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' });
}

test('CLI: --pr-merge classifies HEAD^1..HEAD of a merge commit, prints skipped jobs and writes GITHUB_OUTPUT', () => {
  // The script resolves the repo root from its own location, so run it from a clone of this checkout's files.
  const dir = mkdtempSync(join(tmpdir(), 'job-inputs-cli-'));
  try {
    mkdirSync(join(dir, 'fsi-app', '.discipline', 'governance'), { recursive: true });
    gitIn(dir, 'init', '-q', '-b', 'master');
    writeFileSync(join(dir, 'README.md'), 'x\n');
    gitIn(dir, 'add', '-A');
    gitIn(dir, 'commit', '-q', '-m', 'base');
    gitIn(dir, 'checkout', '-q', '-b', 'pr');
    mkdirSync(join(dir, 'fsi-app', 'supabase', 'migrations'), { recursive: true });
    writeFileSync(join(dir, 'fsi-app', 'supabase', 'migrations', '999_x.sql'), 'select 1;\n');
    gitIn(dir, 'add', '-A');
    gitIn(dir, 'commit', '-q', '-m', 'pr change');
    gitIn(dir, 'checkout', '-q', 'master');
    writeFileSync(join(dir, 'other.txt'), 'y\n');
    gitIn(dir, 'add', '-A');
    gitIn(dir, 'commit', '-q', '-m', 'base moves');
    gitIn(dir, 'merge', '-q', '--no-ff', '-m', 'merge', 'pr');
    const outFile = join(dir, 'gh-output');
    const res = spawnSync('node', [join(HERE, 'job-inputs.mjs'), '--pr-merge', '--github-output', '--print-unchanged'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: outFile },
    });
    assert.equal(res.status, 0, res.stderr);
    const out = readFileSync(outFile, 'utf8');
    assert.match(out, /^migration_proof=true$/m);
    assert.match(out, /^rls_persona_matrix=true$/m);
    assert.match(out, /^rendering_guard=false$/m);
    assert.match(res.stdout, /^inputs unchanged: rendering-guard$/m);
    assert.doesNotMatch(res.stdout, /inputs unchanged: migration-proof/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: a checkout that is not a merge commit runs every job (fails toward running)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'job-inputs-cli2-'));
  try {
    gitIn(dir, 'init', '-q', '-b', 'master');
    writeFileSync(join(dir, 'README.md'), 'x\n');
    gitIn(dir, 'add', '-A');
    gitIn(dir, 'commit', '-q', '-m', 'only');
    const outFile = join(dir, 'gh-output');
    const res = spawnSync('node', [join(HERE, 'job-inputs.mjs'), '--pr-merge', '--github-output', '--print-unchanged'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: outFile },
    });
    assert.equal(res.status, 0, res.stderr);
    const out = readFileSync(outFile, 'utf8');
    for (const key of SCOPED_KEYS) assert.match(out, new RegExp(`^${key}=true$`, 'm'));
    assert.doesNotMatch(res.stdout, /inputs unchanged/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: bad arguments exit 2', () => {
  const res = spawnSync('node', [join(HERE, 'job-inputs.mjs'), '--bogus'], { encoding: 'utf8' });
  assert.equal(res.status, 2);
});
