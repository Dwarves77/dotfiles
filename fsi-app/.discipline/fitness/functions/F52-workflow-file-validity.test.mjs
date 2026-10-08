// F52-workflow-file-validity.test.mjs - attack tests for lane F52 (brief-f52.md item 1's attack list,
// rule 15): each of the five checks (a-e) gets a RED fixture (the defect is caught) and a GREEN fixture
// (the same shape, fixed, produces zero violations for that check). The M9d line itself - the real defect
// that motivated this gate (GitHub run 35533637184, PR #756) - is RED fixture (b), verbatim.
//
// node:test + node:assert/strict, no npm deps.
// Run: node --test .discipline/fitness/functions/F52-workflow-file-validity.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// ── check (f): a run: step piping into tee must set -o pipefail earlier in the same step ───────────
// (gate-a-rescan.yml, GitHub Actions run 36217491293, 2026-09-26)

test('RED (f): the gate-a-rescan.yml line itself, verbatim - a run: step pipes a node script into tee with no pipefail', () => {
  withTempRepo(
    {
      'gar.yml':
        'name: Gate A rescan\non:\n  workflow_dispatch: {}\n' +
        'jobs:\n  rescan:\n    runs-on: ubuntu-latest\n    steps:\n' +
        '      - name: gate-a-rescan.mjs\n' +
        '        run: |\n' +
        '          mkdir -p "$OUT_ROOT/gate-a-rescan"\n' +
        '          node scripts/maintenance/gate-a-rescan.mjs --mode "$GAR_MODE" | tee /tmp/gate-a-rescan.log\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      const hits = messagesMatching(out, 'F52f');
      assert.ok(hits.length >= 1, 'expected the un-guarded tee pipe to be caught');
      assert.ok(hits.some((v) => v.message.includes('pipefail')));
    },
  );
});

test('GREEN (f): the same step with set -o pipefail added first produces no F52f violation', () => {
  withTempRepo(
    {
      'gar.yml':
        'name: Gate A rescan\non:\n  workflow_dispatch: {}\n' +
        'jobs:\n  rescan:\n    runs-on: ubuntu-latest\n    steps:\n' +
        '      - name: gate-a-rescan.mjs\n' +
        '        run: |\n' +
        '          set -o pipefail\n' +
        '          mkdir -p "$OUT_ROOT/gate-a-rescan"\n' +
        '          node scripts/maintenance/gate-a-rescan.mjs --mode "$GAR_MODE" | tee /tmp/gate-a-rescan.log\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.deepEqual(messagesMatching(out, 'F52f'), []);
    },
  );
});

test('RED (f): pipefail set in a DIFFERENT step does not protect this step\'s own tee pipe', () => {
  withTempRepo(
    {
      'gar.yml':
        'name: Gate A rescan\non:\n  workflow_dispatch: {}\n' +
        'jobs:\n  rescan:\n    runs-on: ubuntu-latest\n    steps:\n' +
        '      - name: one step sets pipefail\n' +
        '        run: |\n' +
        '          set -o pipefail\n' +
        '          echo hi\n' +
        '      - name: a LATER, separate step pipes into tee unguarded\n' +
        '        run: |\n' +
        '          node scripts/x.mjs | tee /tmp/x.log\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.ok(messagesMatching(out, 'F52f').length >= 1, 'pipefail in an earlier, unrelated step must not suppress this one');
    },
  );
});

test('GREEN (f): a run: step with no tee pipe at all produces no F52f violation', () => {
  withTempRepo(
    {
      'plain.yml':
        'name: Plain\non:\n  workflow_dispatch: {}\n' +
        'jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node scripts/x.mjs\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.deepEqual(messagesMatching(out, 'F52f'), []);
    },
  );
});

// ── check (g): a job that runs git rebase must have fetch-depth: 0 on its checkout step ────────────
// (lane STATUTORY-WRITER, 2026-09-29, coordinator finding on PR #824, propagation-drain run 36534640498)

test('RED (g): the propagation-drain.yml class, verbatim shape - git rebase with no fetch-depth: 0', () => {
  withTempRepo(
    {
      'pd.yml':
        'name: Propagation drain\non:\n  workflow_dispatch: {}\n' +
        'jobs:\n  drain:\n    runs-on: ubuntu-latest\n    steps:\n' +
        '      - uses: actions/checkout@v4\n' +
        '      - name: commit\n' +
        '        run: |\n' +
        '          git fetch --no-tags --depth=50 origin master\n' +
        '          git rebase --autostash origin/master || { git rebase --abort; exit 1; }\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      const hits = messagesMatching(out, 'F52g');
      assert.ok(hits.length >= 1, 'expected the shallow-checkout rebase to be caught');
      assert.ok(hits.some((v) => v.message.includes('fetch-depth')));
    },
  );
});

test('GREEN (g): the same job with fetch-depth: 0 on its checkout step produces no F52g violation', () => {
  withTempRepo(
    {
      'pd.yml':
        'name: Propagation drain\non:\n  workflow_dispatch: {}\n' +
        'jobs:\n  drain:\n    runs-on: ubuntu-latest\n    steps:\n' +
        '      - uses: actions/checkout@v4\n' +
        '        with:\n' +
        '          fetch-depth: 0\n' +
        '      - name: commit\n' +
        '        run: |\n' +
        '          git fetch --no-tags --depth=50 origin master\n' +
        '          git rebase --autostash origin/master || { git rebase --abort; exit 1; }\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.deepEqual(messagesMatching(out, 'F52g'), []);
    },
  );
});

test('GREEN (g): a job with no git rebase at all produces no F52g violation regardless of checkout depth', () => {
  withTempRepo(
    {
      'plain.yml':
        'name: Plain\non:\n  workflow_dispatch: {}\n' +
        'jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
        '      - uses: actions/checkout@v4\n' +
        '      - run: node scripts/x.mjs\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.deepEqual(messagesMatching(out, 'F52g'), []);
    },
  );
});

// ── check (h): no run: step may stage only a scripts/harness-runs path and push it as a branch ─────
// (the removed "artifact branch" anti-pattern - land via deliver-artifact-branch.sh instead)

test('RED (h): a step that git-adds only scripts/harness-runs/<family> then pushes a branch', () => {
  withTempRepo(
    {
      'wf.yml':
        'name: WF\non:\n  workflow_dispatch: {}\n' +
        'jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
        '      - name: commit\n' +
        '        run: |\n' +
        '          git add scripts/harness-runs/foo\n' +
        '          git commit -m x\n' +
        '          git push origin HEAD:foo-branch\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      const hits = messagesMatching(out, 'F52h');
      assert.ok(hits.length >= 1, 'expected the artifact-branch push to be caught');
      assert.ok(hits.some((v) => v.message.includes('artifact branch')));
    },
  );
});

test('GREEN (h): a step that ALSO stages other real content alongside the harness-runs path is not flagged (the maintenance.yml / brief-export.yml shape)', () => {
  withTempRepo(
    {
      'wf.yml':
        'name: WF\non:\n  workflow_dispatch: {}\n' +
        'jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
        '      - name: commit\n' +
        '        run: |\n' +
        '          git add scripts/harness-runs/foo docs/ops/dispatch-ledger.jsonl\n' +
        '          git commit -m x\n' +
        '          git push origin HEAD:foo-branch\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.deepEqual(messagesMatching(out, 'F52h'), []);
    },
  );
});

test('GREEN (h): a step that pushes with no git add of a harness-runs path at all is not flagged', () => {
  withTempRepo(
    {
      'wf.yml':
        'name: WF\non:\n  workflow_dispatch: {}\n' +
        'jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
        '      - name: commit\n' +
        '        run: |\n' +
        '          git add docs/ops/dispatch-ledger.jsonl\n' +
        '          git commit -m x\n' +
        '          git push origin HEAD:foo-branch\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.deepEqual(messagesMatching(out, 'F52h'), []);
    },
  );
});

test('GREEN (h): deliver-artifact-branch.sh with no git add/push at all is not flagged (the fixed shape)', () => {
  withTempRepo(
    {
      'wf.yml':
        'name: WF\non:\n  workflow_dispatch: {}\n' +
        'jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
        '      - name: land\n' +
        '        run: bash scripts/turns/deliver-artifact-branch.sh "label"\n',
    },
    null,
    () => {
      const out = fitnessFunction.check();
      assert.deepEqual(messagesMatching(out, 'F52h'), []);
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

// GATE-4 (2026-10-07): this test runs the fitness function against the live repo, which the Fitness
// functions job already does on every pull request (gate evaluation B section 7.6: it failed the unit-test
// step while the gate itself passed in the fitness job). It stays runnable here with FITNESS_LIVE_TESTS=1.
const LIVE_TREE = process.env.FITNESS_LIVE_TESTS === '1' ? {} : { skip: 'live-tree self-test, run by the Fitness functions job; set FITNESS_LIVE_TESTS=1 to run it here' };

test('LIVE: fitnessFunction.check() over the real committed tree returns zero violations', LIVE_TREE, () => {
  const result = fitnessFunction.check();
  assert.deepEqual(result, [], `expected 0 violations, got: ${JSON.stringify(result, null, 2)}`);
});

test('enumerate() returns exactly one sentinel path (holistic pattern, same as F23/F25/F27/F50)', () => {
  assert.deepEqual(fitnessFunction.enumerate(), [
    'fsi-app/.discipline/fitness/functions/F52-workflow-file-validity.mjs',
  ]);
});

// ── GATE-4 (lane gate4-ci): the shape of the real discipline.yml, asserted as workflow-validity facts ──
//
// These read the committed .github/workflows/discipline.yml and assert the job set and posture the gate
// plan fixed: (1) a push to master runs Validate commits and the Consistency layer only, the unit-test,
// fitness and rendering jobs run on the pull_request head; (2) the rendering guard is a REQUIRED job (no
// continue-on-error) on a depth-1 checkout; (3) actionlint's pinned tarball is cached by version;
// (4) each job that produces gate firings uploads them as a gate-firings artifact on every run;
// (5) the explicit-test runner runs files concurrently. They are workflow-shape assertions, not a run of
// any fitness function against the live tree.

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const DISCIPLINE_YML = readFileSync(join(REPO, '.github', 'workflows', 'discipline.yml'), 'utf8');
const DISCIPLINE_LINES = DISCIPLINE_YML.split(/\r?\n/);
const JOBS = extractJobs(DISCIPLINE_LINES);

function jobById(id) {
  const job = JOBS.find((j) => j.id === id);
  assert.ok(job, `discipline.yml has no job "${id}"`);
  return job;
}

function jobText(id) {
  const job = jobById(id);
  return DISCIPLINE_LINES.slice(job.startLine, job.endLine + 1).join('\n');
}

/** The step blocks of a job: a step starts at a column-6 dash and runs to the next column-6 dash. */
function stepsOf(id) {
  const job = jobById(id);
  const steps = [];
  for (let i = job.startLine; i <= job.endLine; i++) {
    if (/^ {6}- /.test(DISCIPLINE_LINES[i])) steps.push([]);
    if (steps.length) steps[steps.length - 1].push(DISCIPLINE_LINES[i]);
  }
  return steps.map((lines) => lines.join('\n'));
}

/** The step whose `name:` contains `fragment`. */
function stepNamed(id, fragment) {
  const found = stepsOf(id).find((s) => {
    const m = s.match(/^ {6}- name:\s*(.*)$/m) || s.match(/^ {8}name:\s*(.*)$/m);
    return m !== null && m[1].includes(fragment);
  });
  assert.ok(found, `job "${id}" has no step named like "${fragment}"`);
  return found;
}

test('GATE-4: the workflow has exactly the five jobs, so a new push-time job is a deliberate edit', () => {
  assert.deepEqual(
    JOBS.map((j) => j.id),
    ['validate-commits', 'test-discipline-engine', 'consistency-backstop', 'fitness-check', 'rendering-guard'],
  );
});

test('GATE-4: a push to master runs Validate commits and the Consistency layer only', () => {
  for (const id of ['validate-commits', 'consistency-backstop']) {
    const props = jobPropertyLines(jobById(id), DISCIPLINE_LINES);
    assert.equal(props.find((p) => p.key === 'if'), undefined, `${id} must run on every event (push and pull_request)`);
  }
  for (const id of ['test-discipline-engine', 'fitness-check', 'rendering-guard']) {
    const ifProp = jobPropertyLines(jobById(id), DISCIPLINE_LINES).find((p) => p.key === 'if');
    assert.ok(ifProp, `${id} must carry a job-level if so a push to master skips it`);
    assert.match(ifProp.valueInline, /github\.event_name\s*==\s*'pull_request'/, `${id}'s if must select pull_request only`);
  }
});

test('GATE-4: the workflow header states the push-to-master posture and the measured 38 percent', () => {
  const header = DISCIPLINE_LINES.slice(0, DISCIPLINE_LINES.findIndex((l) => /^jobs:\s*$/.test(l))).join('\n');
  assert.match(header, /38 percent/);
  assert.match(header, /push to master[^\n]*(Validate commits|validate-commits)/i);
});

test('GATE-4: the rendering guard is a required job: no continue-on-error, depth-1 checkout, 10 minute timeout', () => {
  const block = jobText('rendering-guard');
  assert.doesNotMatch(block, /^\s*continue-on-error:\s*true/m, 'rendering-guard must be able to fail the workflow');
  assert.match(block, /^ {4}timeout-minutes:\s*10\s*$/m);
  const checkout = stepNamed('rendering-guard', 'Checkout repository');
  assert.match(checkout, /fetch-depth:\s*1\s*$/m, 'the rendering guard checks out depth 1');
  assert.doesNotMatch(checkout, /fetch-depth:\s*0/);
  assert.doesNotMatch(checkout, /git fetch/, 'no extra ref fetch');
});

test('GATE-4: actionlint restores a version-keyed cache of its pinned tarball and still verifies the checksum', () => {
  const cache = stepNamed('fitness-check', 'actionlint tarball');
  assert.match(cache, /uses:\s*actions\/cache@v4/);
  assert.match(cache, /key:\s*actionlint-v1\.7\.12-linux-amd64\s*$/m);
  const lint = stepNamed('fitness-check', 'actionlint (pinned');
  assert.match(lint, /sha256sum -c/, 'the checksum is verified on every run, cache hit or miss');
  assert.match(lint, /--retry/, 'a download on a cache miss retries a network reset');
});

test('GATE-4: every job that produces gate firings uploads a gate-firings artifact on every run, never failing on absence', () => {
  for (const id of ['validate-commits', 'fitness-check']) {
    const upload = stepNamed(id, 'Upload gate firings');
    assert.match(upload, /uses:\s*actions\/upload-artifact@v4/);
    assert.match(upload, /^ {8}if:\s*always\(\)\s*$/m, `${id}: upload on pass and on fail`);
    assert.match(upload, /name:\s*gate-firings-/);
    assert.match(upload, /if-no-files-found:\s*ignore/, `${id}: an absent file uploads nothing and does not fail`);
    const retention = upload.match(/retention-days:\s*(\d+)/);
    assert.ok(retention && Number(retention[1]) <= 7, `${id}: retention within the F68 budget`);
  }
  assert.match(stepNamed('fitness-check', 'Upload gate firings'), /fsi-app\/\.discipline\/out\/fitness-firings\.json/);
  assert.match(stepNamed('validate-commits', 'Upload gate firings'), /fsi-app\/\.discipline\/out\/rules-ci-firings\.log/);
});

test('GATE-4: the explicit-test runner runs its files concurrently (the programmatic run() defaults to serial)', () => {
  const src = readFileSync(join(REPO, 'fsi-app', '.discipline', 'lib', 'run-explicit-tests.mjs'), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.match(code, /run\(\{[^}]*\bconcurrency\b[^}]*\}\)/, 'run({ files, execArgv, concurrency }) must pass a concurrency option');
});
