// F52-workflow-file-validity.test.mjs - attack tests for lane F52 (brief-f52.md item 1's attack list,
// rule 15): each of the five checks (a-e) gets a RED fixture (the defect is caught) and a GREEN fixture
// (the same shape, fixed, produces zero violations for that check). The M9d line itself - the real defect
// that motivated this gate (GitHub run 35533637184, PR #756) - is RED fixture (b), verbatim.
//
// node:test + node:assert/strict, no npm deps.
// Run: node --test .discipline/fitness/functions/F52-workflow-file-validity.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _clearRepoRootCache } from '../../lib/context.mjs';
import { _clearCache } from '../lib/file-content.mjs';
import {
  fitnessFunction,
  listWorkflowAndActionFiles,
  extractJobs,
  jobPropertyLines,
  extractBlockEntries,
  parseNeedsIds,
  stepIdsInJob,
  stepOutputReferencesInJob,
} from './F52-workflow-file-validity.mjs';

// ── fixture harness: a temp repo root with .github/workflows and/or .github/actions files ──────────

function withTempRepo(workflowFiles, actionFiles, fn) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'f52-'));
  const wfDir = join(repoRoot, '.github', 'workflows');
  mkdirSync(wfDir, { recursive: true });
  for (const [name, content] of Object.entries(workflowFiles || {})) {
    writeFileSync(join(wfDir, name), content);
  }
  for (const [dirName, content] of Object.entries(actionFiles || {})) {
    const d = join(repoRoot, '.github', 'actions', dirName);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'action.yml'), content);
  }
  const prevRoot = process.env.DISCIPLINE_REPO_ROOT;
  process.env.DISCIPLINE_REPO_ROOT = repoRoot;
  _clearRepoRootCache();
  _clearCache();
  try {
    return fn(repoRoot);
  } finally {
    if (prevRoot === undefined) delete process.env.DISCIPLINE_REPO_ROOT;
    else process.env.DISCIPLINE_REPO_ROOT = prevRoot;
    _clearRepoRootCache();
    _clearCache();
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

function messagesMatching(violations, needle) {
  return violations.filter((v) => v.message.includes(needle));
}

// ── check (a): parses, has on: and a runnable job / an action has runs.using ────────────────────────

test('RED (a): a workflow with no jobs. block at all is caught', () => {
  withTempRepo(
    { 'nojobs.yml': 'name: No jobs\non:\n  workflow_dispatch: {}\n' },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.ok(messagesMatching(out, 'F52a').some((v) => v.message.includes("defines no job")));
    },
  );
});

test('RED (a): a workflow whose only job has neither runs-on nor uses is caught', () => {
  withTempRepo(
    {
      'norunson.yml':
        'name: No runs-on\non:\n  workflow_dispatch: {}\njobs:\n  build:\n    timeout-minutes: 5\n    steps:\n      - run: echo hi\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.ok(messagesMatching(out, 'F52a').some((v) => v.message.includes('no job has')));
    },
  );
});

test('GREEN (a): a minimal valid workflow produces no F52a violation', () => {
  withTempRepo(
    {
      'valid.yml':
        'name: Valid\non:\n  workflow_dispatch: {}\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.deepEqual(messagesMatching(out, 'F52a'), []);
    },
  );
});

test('RED (a): an action.yml missing using: under runs: is caught', () => {
  withTempRepo(null, { 'bad-action': 'name: Bad action\ndescription: x\nruns:\n  steps:\n    - run: echo hi\n' }, () => {
    const out = fitnessFunction.check();
    assert.ok(messagesMatching(out, 'F52a').some((v) => v.message.includes("no 'using:' value")));
  });
});

test('GREEN (a): a valid composite action.yml produces no F52a violation', () => {
  withTempRepo(
    null,
    {
      'good-action':
        'name: Good action\ndescription: x\nruns:\n  using: composite\n  steps:\n    - shell: bash\n      run: echo hi\n',
    },
    () => {
      const out = fitnessFunction.check();
      assert.deepEqual(messagesMatching(out, 'F52a'), []);
    },
  );
});

// ── check (b): env context availability - the M9d class ─────────────────────────────────────────────

test('RED (b): the M9d line itself, verbatim - a job-level env: referencing runner.temp', () => {
  withTempRepo(
    {
      'producers.yml':
        'name: Data producers\n' +
        'on:\n  workflow_dispatch: {}\n' +
        'jobs:\n' +
        '  produce:\n' +
        '    runs-on: ubuntu-latest\n' +
        '    env:\n' +
        '      PRODUCER_SUMMARY_DIR: ${{ runner.temp }}/producer-summaries\n' +
        '    steps:\n' +
        '      - run: echo hi\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      const hits = messagesMatching(out, 'F52b');
      assert.ok(hits.length >= 1, 'expected the M9d line to be caught');
      assert.ok(hits.some((v) => v.message.includes("'runner.'")));
    },
  );
});

test('RED (b): a workflow-level env: referencing steps. is caught', () => {
  withTempRepo(
    {
      'wfenv.yml':
        'name: WF env\non:\n  workflow_dispatch: {}\n' +
        'env:\n  X: ${{ steps.foo.outputs.bar }}\n' +
        'jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.ok(messagesMatching(out, 'F52b').some((v) => v.message.includes('workflow-level') && v.message.includes("'steps.'")));
    },
  );
});

test('GREEN (b): a job-level env: referencing only secrets/github/inputs produces no F52b violation', () => {
  withTempRepo(
    {
      'goodenv.yml':
        'name: Good env\non:\n  workflow_dispatch:\n    inputs:\n      mode:\n        default: dry\n' +
        'jobs:\n  build:\n    runs-on: ubuntu-latest\n    env:\n' +
        '      TOKEN: ${{ secrets.TOKEN }}\n      SHA: ${{ github.sha }}\n      MODE: ${{ inputs.mode }}\n' +
        '    steps:\n      - run: echo hi\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.deepEqual(messagesMatching(out, 'F52b'), []);
    },
  );
});

// ── check (c): job-level if: may not reference steps. or runner. ────────────────────────────────────

test('RED (c): a job-level if: referencing steps.foo.outputs is caught', () => {
  withTempRepo(
    {
      'badif.yml':
        'name: Bad if\non:\n  workflow_dispatch: {}\n' +
        "jobs:\n  build:\n    if: ${{ steps.foo.outputs.bar == 'true' }}\n    runs-on: ubuntu-latest\n" +
        '    steps:\n      - run: echo hi\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.ok(messagesMatching(out, 'F52c').some((v) => v.message.includes("'steps.'")));
    },
  );
});

test('GREEN (c): a job-level if: referencing github.event_name produces no F52c violation', () => {
  withTempRepo(
    {
      'goodif.yml':
        'name: Good if\non:\n  workflow_dispatch: {}\n' +
        "jobs:\n  build:\n    if: ${{ github.event_name == 'push' }}\n    runs-on: ubuntu-latest\n" +
        '    steps:\n      - run: echo hi\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.deepEqual(messagesMatching(out, 'F52c'), []);
    },
  );
});

// ── check (d): needs: names a real job; steps.<id>.outputs names a real step id in the same job ────

test('RED (d): needs: names a job that does not exist', () => {
  withTempRepo(
    {
      'badneeds.yml':
        'name: Bad needs\non:\n  workflow_dispatch: {}\n' +
        'jobs:\n  build:\n    needs: [nonexistent]\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.ok(messagesMatching(out, 'F52d').some((v) => v.message.includes("needs 'nonexistent'")));
    },
  );
});

test('RED (d): steps.<id>.outputs references a step id that does not exist in the same job', () => {
  withTempRepo(
    {
      'badoutputs.yml':
        'name: Bad outputs\non:\n  workflow_dispatch: {}\n' +
        'jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
        '      - name: Resolve\n        id: resolve\n        run: echo hi\n' +
        "      - name: Use\n        run: echo \"${{ steps.wrongid.outputs.value }}\"\n",
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.ok(messagesMatching(out, 'F52d').some((v) => v.message.includes('steps.wrongid.outputs')));
    },
  );
});

test('GREEN (d): needs: an existing job and steps.<id>.outputs naming a real step id produce no F52d violation', () => {
  withTempRepo(
    {
      'gooddeps.yml':
        'name: Good deps\non:\n  workflow_dispatch: {}\n' +
        'jobs:\n' +
        '  first:\n    runs-on: ubuntu-latest\n    steps:\n' +
        '      - name: Resolve\n        id: resolve\n        run: echo "value=x" >> "$GITHUB_OUTPUT"\n' +
        '  second:\n    needs: [first]\n    runs-on: ubuntu-latest\n    steps:\n' +
        '      - name: Own step\n        id: own\n        run: echo hi\n' +
        '      - name: Use own\n        run: echo "${{ steps.own.outputs.value }}"\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.deepEqual(messagesMatching(out, 'F52d'), []);
    },
  );
});

// ── check (e): a workflow_run trigger names a real workflow ─────────────────────────────────────────

test('RED (e): a workflow_run trigger names a workflow that does not exist in the tree', () => {
  withTempRepo(
    {
      'consumer.yml':
        'name: Consumer\non:\n  workflow_run:\n    workflows: ["Nonexistent producer"]\n    types: [completed]\n' +
        'jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.ok(messagesMatching(out, 'F52e').some((v) => v.message.includes('Nonexistent producer')));
    },
  );
});

test('GREEN (e): a workflow_run trigger naming a real workflow (by its own name:) produces no F52e violation', () => {
  withTempRepo(
    {
      'producer.yml': 'name: Real producer\non:\n  workflow_dispatch: {}\njobs:\n  p:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n',
      'consumer.yml':
        'name: Consumer\non:\n  workflow_run:\n    workflows: ["Real producer"]\n    types: [completed]\n' +
        'jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.deepEqual(messagesMatching(out, 'F52e'), []);
    },
  );
});

// ── pure helpers, direct unit coverage ───────────────────────────────────────────────────────────────

test('extractJobs finds job ids and line ranges', () => {
  const lines = 'jobs:\n  a:\n    runs-on: ubuntu-latest\n  b:\n    runs-on: ubuntu-latest\n'.split('\n');
  const jobs = extractJobs(lines);
  assert.deepEqual(jobs.map((j) => j.id), ['a', 'b']);
});

test('jobPropertyLines reads only direct job-level properties, not nested ones', () => {
  const lines =
    '  build:\n    runs-on: ubuntu-latest\n    env:\n      X: y\n    steps:\n      - run: echo hi\n'.split('\n');
  const job = { startLine: 0, endLine: lines.length - 1 };
  const props = jobPropertyLines(job, lines);
  assert.deepEqual(props.map((p) => p.key), ['runs-on', 'env', 'steps']);
});

test('extractBlockEntries stops at the first line at or below the header indent', () => {
  const lines = 'env:\n  A: 1\n  B: 2\nnotenv: true\n'.split('\n');
  const entries = extractBlockEntries(lines, 0, 0);
  assert.deepEqual(entries.map((e) => e.key), ['A', 'B']);
});

test('parseNeedsIds reads both the inline-array and the block-list form', () => {
  const inlineLines = '    needs: [a, b]\n'.split('\n');
  const inline = parseNeedsIds(inlineLines, { line: 0, valueInline: '[a, b]' }, 4);
  assert.deepEqual(inline, ['a', 'b']);

  const blockLines = '    needs:\n      - a\n      - b\n'.split('\n');
  const block = parseNeedsIds(blockLines, { line: 0, valueInline: '' }, 4);
  assert.deepEqual(block, ['a', 'b']);
});

test('stepIdsInJob and stepOutputReferencesInJob agree on a matching id', () => {
  const lines =
    '  build:\n    runs-on: ubuntu-latest\n    steps:\n      - name: X\n        id: resolve\n        run: echo hi\n      - run: echo "${{ steps.resolve.outputs.v }}"\n'.split(
      '\n',
    );
  const job = { startLine: 0, endLine: lines.length - 1 };
  assert.ok(stepIdsInJob(job, lines).has('resolve'));
  assert.deepEqual(stepOutputReferencesInJob(job, lines).map((r) => r.id), ['resolve']);
});

test('listWorkflowAndActionFiles lists both workflow and action files, sorted', () => {
  withTempRepo(
    { 'b.yml': 'name: B\non:\n  workflow_dispatch: {}\njobs:\n  x:\n    runs-on: ubuntu-latest\n' },
    { 'my-action': 'name: A\nruns:\n  using: composite\n  steps: []\n' },
    (repoRoot) => {
      const files = listWorkflowAndActionFiles(repoRoot);
      assert.deepEqual(files, [
        { path: '.github/actions/my-action/action.yml', kind: 'action' },
        { path: '.github/workflows/b.yml', kind: 'workflow' },
      ]);
    },
  );
});

// ── LIVE: the real committed tree today reports zero violations ─────────────────────────────────────

test('LIVE: fitnessFunction.check() over the real committed tree returns zero violations', () => {
  const result = fitnessFunction.check();
  assert.deepEqual(result, [], `expected 0 violations, got: ${JSON.stringify(result, null, 2)}`);
});

test('enumerate() returns exactly one sentinel path (holistic pattern, same as F23/F25/F27/F50)', () => {
  assert.deepEqual(fitnessFunction.enumerate(), [
    'fsi-app/.discipline/fitness/functions/F52-workflow-file-validity.mjs',
  ]);
});
