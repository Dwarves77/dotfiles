// F52-workflow-file-validity.test.mjs - attack tests for lane F52 (brief-f52.md item 1's attack list,
// rule 15): each of the five checks (a-e) gets a RED fixture (the defect is caught) and a GREEN fixture
// (the same shape, fixed, produces zero violations for that check). The M9d line itself - the real defect
// that motivated this gate (GitHub run 35533637184, PR #756) - is RED fixture (b), verbatim.
//
// node:test + node:assert/strict, no npm deps.
// Run: node --test .discipline/fitness/functions/F52-workflow-file-validity.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
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

test('GATE-4: the rendering guard is a required job: no continue-on-error, depth-1 checkout, 15 minute timeout (GATE-6)', () => {
  const block = jobText('rendering-guard');
  assert.doesNotMatch(block, /^\s*continue-on-error:\s*true/m, 'rendering-guard must be able to fail the workflow');
  assert.match(block, /^ {4}timeout-minutes:\s*15\s*$/m);
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

// ── GATE-6 (lane gate6-guard-container): every Playwright job runs in the pinned official image ──────
//
// Four Rendering guard runs were cancelled at the job timeout because `playwright install --with-deps`
// stalled on apt downloads. The jobs now run in mcr.microsoft.com/playwright:v<version>-noble, which has
// chromium and its OS libraries, and install only the npm package, whose version is READ BACK OUT OF THE
// IMAGE TAG in the same workflow file (the job context has no container image property, so the file is the
// one place the version is written). These assertions fail if a browser install returns, if the image tag
// and the npm version could differ, or if the guard stops printing its own runtime.

const PLAYWRIGHT_IMAGE = /^ {6}image:\s*mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-noble\s*$/m;

function playwrightJobs() {
  return [
    { file: 'discipline.yml', job: 'rendering-guard' },
    { file: 'layout-baseline-renewal.yml', job: 'renew' },
    { file: 'live-smoke.yml', job: 'live-smoke' },
  ].map(({ file, job }) => {
    const text = readFileSync(join(REPO, '.github', 'workflows', file), 'utf8');
    const lines = text.split(/\r?\n/);
    const found = extractJobs(lines).find((j) => j.id === job);
    assert.ok(found, `${file} has no job "${job}"`);
    return { file, job, text, block: lines.slice(found.startLine, found.endLine + 1).join('\n') };
  });
}

test('GATE-6: each Playwright job runs in the official Playwright image, one image line, same version everywhere', () => {
  const versions = new Set();
  for (const { file, job, block } of playwrightJobs()) {
    const containerBlock = block.match(/^ {4}container:\s*\n((?: {6}.*\n)+)/m);
    assert.ok(containerBlock, `${file}/${job} must declare a job-level container`);
    assert.match(containerBlock[1], PLAYWRIGHT_IMAGE, `${file}/${job} container image must be the Playwright image pinned to a full version`);
    assert.equal(block.match(/^ *image:/gm).length, 1, `${file}/${job}: exactly one image line, so the version is written once`);
    versions.add(block.match(PLAYWRIGHT_IMAGE)[1]);
  }
  assert.equal(versions.size, 1, `all Playwright jobs use one version, got ${[...versions].join(', ')}`);
});

test('GATE-6: no Playwright job installs a browser, and the npm package version is read from the image tag in its own file', () => {
  for (const { file, job, block } of playwrightJobs()) {
    const code = block.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    assert.doesNotMatch(code, /playwright install/, `${file}/${job}: browsers come from the image, never an install`);
    assert.doesNotMatch(code, /apt-get|--with-deps/, `${file}/${job}: no apt step`);
    assert.doesNotMatch(code, /playwright@\d/, `${file}/${job}: the npm version is not a second literal`);
    assert.match(code, /npm install --no-save "playwright@\$\{version\}"/, `${file}/${job}: installs the package at the derived version`);
    // The derivation reads this very file and its pattern must extract the version from the real image line.
    const derive = code.match(/sed -n 's\|(.*)\|\\1\|p'\s+(\.github\/workflows\/[a-z-]+\.yml)/);
    assert.ok(derive, `${file}/${job}: the install step derives the version with sed over a workflow file`);
    assert.equal(derive[2], `.github/workflows/${file}`, `${file}/${job}: derives from its own file, not another`);
    const pattern = new RegExp(derive[1].replaceAll('\\(', '(').replaceAll('\\)', ')'), 'm'); // sed BRE groups to JS groups
    const image = block.match(PLAYWRIGHT_IMAGE)[0].trim();
    assert.equal(image.replace(pattern, '$1'), image.match(/:v(\d+\.\d+\.\d+)-/)[1], `${file}/${job}: the derivation yields the image tag's version`);
    assert.match(code, /test -n "\$version"/, `${file}/${job}: an empty derivation fails the step`);
  }
});

test('GATE-6: the rendering guard prints its own runtime to the step summary with no pipe and keeps the guard exit status', () => {
  const step = stepNamed('rendering-guard', 'Run rendering guard');
  assert.match(step, /run-rendering-guard\.mjs \|\| status=\$\?/, 'the guard exit status is captured, not lost');
  assert.match(step, /line="guard run: \$\(\( \$\(date \+%s\) - start \)\) s"/);
  assert.match(step, /echo "\$line" >> "\$GITHUB_STEP_SUMMARY"/);
  assert.doesNotMatch(step, /\| *tee/, 'no pipe into tee: F52f would need pipefail and the pipe adds nothing here');
  assert.match(step, /exit "\$status"/);
});

test('GATE-6: every Playwright job trusts the workspace for git before anything runs git (the container user does not own the checkout)', () => {
  for (const { file, job, block } of playwrightJobs()) {
    const trust = block.indexOf('git config --global --add safe.directory "$GITHUB_WORKSPACE"');
    assert.ok(trust > 0, `${file}/${job}: a safe.directory step is required in the container`);
    assert.ok(trust > block.indexOf('actions/checkout@'), `${file}/${job}: after the checkout`);
    assert.ok(trust < block.indexOf('Install the Playwright npm package'), `${file}/${job}: before the install and the run`);
  }
});

test('GATE-6: the workflow header describes the container form and the 15 minute limit, not an install and 10 minutes', () => {
  const header = DISCIPLINE_LINES.slice(0, DISCIPLINE_LINES.findIndex((l) => /^jobs:\s*$/.test(l))).join('\n');
  assert.doesNotMatch(header, /installs\s+Playwright chromium/);
  assert.doesNotMatch(header, /10-minute timeout/);
  assert.match(header, /Playwright container image/);
  assert.match(header, /15-minute timeout/);
});

test('GATE-6: the rendering guard timeout is 15 minutes and the comment records the measured reasoning', () => {
  const block = jobText('rendering-guard');
  assert.match(block, /^ {4}timeout-minutes:\s*15\s*$/m);
  assert.match(block, /p90 433 s/);
  assert.match(block, /max 604 s/);
});

// ── GATE-9 (lane gate9-ci-honest-forms, 2026-10-08): the shape of the CI workflows, asserted as facts ─────────
//
// AUD-AT-5 edited discipline.yml and chain-proof.yml 218 ways (continue-on-error, if: false, a step removed,
// the script forced to exit 0) and the repo's own gates refused 69 of the 148 edits that reach a verdict. The
// rest were accepted because every test asserted what the file SAYS TODAY about one step, not what a verdict
// step may never become. These tests state the second thing: for every job and every verdict step, which
// conditions are allowed, and that nothing can make it unable to fail. Each attack is a mutation of the real file
// text run through the same checker, so a check that stops detecting its attack fails here. The attack ids are
// the register's (VC-*, DS*, TR-*, RG-*, DO-6, AH6).

function codeLines(text) {
  return text.split(/\r?\n/).map((l, i) => ({ l, n: i + 1 })).filter(({ l }) => !/^\s*#/.test(l));
}

/** The steps of one job in a workflow text: a step starts at a column-6 dash. */
function stepsOfJob(text, jobId) {
  const lines = text.split(/\r?\n/);
  const job = extractJobs(lines).find((j) => j.id === jobId);
  if (!job) return [];
  const steps = [];
  for (let i = job.startLine; i <= job.endLine; i++) {
    if (/^ {6}- /.test(lines[i])) steps.push({ start: i, lines: [] });
    if (steps.length) steps[steps.length - 1].lines.push(lines[i]);
  }
  return steps.map((s) => {
    const body = s.lines.join('\n');
    const name = (body.match(/^ {6}- name:\s*(.*)$/m) || body.match(/^ {8}name:\s*(.*)$/m) || [null, ''])[1].replace(/^["']|["']$/g, '');
    const ifm = body.match(/^ {8}if:\s*(.*)$/m);
    return { name, body, start: s.start, ifExpr: ifm ? ifm[1].trim() : null };
  });
}

const IF_PR = "github.event_name == 'pull_request'";
const IF_PUSH = "github.event_name == 'push'";
const IF_DOCS = "steps.docs_only.outputs.docs_only != 'true'";

/** Every verdict step of discipline.yml, with the ONLY if it may carry (null = none). A step missing, renamed
 *  or given another condition is a finding. */
const DISCIPLINE_VERDICT_STEPS = {
  'validate-commits': [
    ['Run discipline engine (push to master)', IF_PUSH],
    ['Run discipline engine (pull request)', IF_PR],
    ['Memory gate', 'always()'],
  ],
  'test-discipline-engine': [
    ['Run discipline test suite', IF_DOCS],
    ['Test discovery', IF_DOCS],
    ['Invariant-coverage meta-gate', IF_DOCS],
    ['Closure gate', IF_DOCS],
    ['Skill-contract drift', IF_DOCS],
  ],
  'consistency-backstop': [
    ['Consistency runner (push to master)', IF_PUSH],
    ['Consistency runner (pull request)', IF_PR],
  ],
  'fitness-check': [
    ['ESLint', IF_DOCS],
    ['Run fitness functions', IF_DOCS],
    ['actionlint (pinned', IF_DOCS],
    ['App unit tests requiring npm deps', IF_DOCS],
    ['Behavioral goldens', IF_DOCS],
  ],
  'rendering-guard': [['Run rendering guard', null]],
};
const JOB_IF = {
  'validate-commits': null,
  'test-discipline-engine': IF_PR,
  'consistency-backstop': null,
  'fitness-check': IF_PR,
  'rendering-guard': IF_PR,
};

/** The non-comment run-block commands of a step body (one entry per non-blank, non-comment line). */
function runCommandLines(step) {
  const out = [];
  let inBlock = false;
  for (const l of step.body.split('\n')) {
    if (/^ {8}run:\s*[|>][-+]?\s*$/.test(l)) { inBlock = true; continue; }
    if (/^ {8}run:\s*\S/.test(l)) return [l.replace(/^ {8}run:\s*/, '')];
    if (inBlock) {
      if (/^ {10}\S/.test(l) || l.trim() === '') { if (l.trim() !== '' && !/^\s*#/.test(l)) out.push(l.trim()); continue; }
      inBlock = false;
    }
  }
  return out;
}

/** Problems with a discipline.yml text. [] = the shape holds. */
function disciplineShapeProblems(text) {
  const problems = [];
  const code = codeLines(text).map(({ l }) => l).join('\n');
  // triggers
  if (/^\s*paths(-ignore)?:/m.test(code)) problems.push('a paths/paths-ignore filter is present (TR-2: a skipped required check blocks the merge)');
  const on = text.slice(text.indexOf('\non:'), text.indexOf('\nconcurrency:'));
  if (!/^ {2}pull_request:\n {4}branches:\n {6}- master\n/m.test(on)) problems.push('pull_request must trigger on branches: [master] only (TR-1)');
  if (!/^ {2}push:\n {4}branches:\n {6}- master\n/m.test(on)) problems.push('push must trigger on branches: [master] only (TR-1)');
  if (!/cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/.test(code)) problems.push('cancel-in-progress must be true for pull_request only (TR-4)');
  // nothing may be unable to fail
  if (/continue-on-error/.test(code)) problems.push('continue-on-error appears (JCOE, step COE): a job or step that cannot fail gates nothing');
  if (/\+o pipefail|\|&/.test(code)) problems.push('+o pipefail or |& appears (VC-5, VC-6): the pipeline status is the last command\'s');
  const lines = text.split(/\r?\n/);
  const jobs = extractJobs(lines);
  const jobIds = jobs.map((j) => j.id);
  if (JSON.stringify(jobIds) !== JSON.stringify(Object.keys(JOB_IF))) problems.push(`the job set is ${JSON.stringify(jobIds)} (JDEL)`);
  for (const job of jobs) {
    const ifProp = jobPropertyLines(job, lines).find((p) => p.key === 'if');
    const want = JOB_IF[job.id];
    const have = ifProp ? ifProp.valueInline.trim() : null;
    if (want !== undefined && have !== want) problems.push(`job ${job.id}: if is ${JSON.stringify(have)}, expected ${JSON.stringify(want)} (JIF, TR-3)`);
    if (ifProp && /fork/i.test(ifProp.valueInline)) {
      const above = lines.slice(Math.max(0, ifProp.line - 3), ifProp.line).join('\n');
      if (!/#.*fork/i.test(above)) problems.push(`job ${job.id}: an if that excludes fork pull requests needs a comment naming the fork exclusion (TR-3)`);
    }
  }
  // verdict steps present, with only their allowed condition, and not neutered
  for (const [jobId, list] of Object.entries(DISCIPLINE_VERDICT_STEPS)) {
    const steps = stepsOfJob(text, jobId);
    for (const [fragment, allowedIf] of list) {
      const hits = steps.filter((s) => s.name.includes(fragment));
      if (hits.length !== 1) { problems.push(`job ${jobId}: expected exactly one step named like "${fragment}", found ${hits.length} (DEL)`); continue; }
      const step = hits[0];
      if (step.ifExpr !== allowedIf) problems.push(`job ${jobId}: step "${fragment}" has if ${JSON.stringify(step.ifExpr)}, only ${JSON.stringify(allowedIf)} is allowed (IFF)`);
      const cmds = runCommandLines(step);
      if (cmds.length === 0) problems.push(`job ${jobId}: step "${fragment}" has no run script`);
      for (const c of cmds) {
        if (/\bset \+e\b|\|\|\s*(true|:)\s*$|;\s*(true|:)\s*$|\bexit 0\b/.test(c) && !/^git fetch --no-tags origin "\$BASE_REF" \|\| true$/.test(c)) {
          problems.push(`job ${jobId}: step "${fragment}" runs "${c}", a form that forces success (TRUE)`);
        }
      }
    }
  }
  // every multi-command run block starts with set -euo pipefail
  for (const job of jobs) {
    for (const step of stepsOfJob(text, job.id)) {
      const cmds = runCommandLines(step);
      if (cmds.length > 1 && cmds[0] !== 'set -euo pipefail') problems.push(`job ${job.id}: step "${step.name}" has ${cmds.length} commands and does not start with set -euo pipefail (VC-5)`);
      if (cmds.some((c) => /\|\s*tee\b/.test(c)) && cmds[0] !== 'set -euo pipefail') problems.push(`job ${job.id}: step "${step.name}" pipes into tee without set -euo pipefail (VC-6)`);
    }
  }
  // the exact lines the verdicts depend on
  const dv = stepsOfJob(text, 'validate-commits');
  const pr = dv.find((s) => s.name.includes('(pull request)'));
  if (pr) {
    if (!/^ {10}PR_HEAD: \$\{\{ github\.event\.pull_request\.head\.sha \}\}$/m.test(pr.body)) problems.push('PR engine step: PR_HEAD must be the pull request head sha (VC-7)');
    if (!/\n {10}node fsi-app\/\.discipline\/runner\.mjs \\\n {12}--mode=ci 2>&1 \| tee -a fsi-app\/\.discipline\/out\/rules-ci-firings\.log/.test(pr.body)) problems.push('PR engine step: must run runner.mjs --mode=ci with no range override (VC-7)');
  }
  const push = dv.find((s) => s.name.includes('(push to master)'));
  if (push && !/--range="\$\{PUSH_BEFORE\}\.\.\$\{COMMIT_SHA\}"/.test(push.body)) problems.push('push engine step must validate before..after, every commit in the push (VC-2)');
  const mem = dv.find((s) => s.name.includes('Memory gate'));
  if (mem) {
    if (/--warn-only/.test(mem.body)) problems.push('memory gate must fail, not warn, on a push (VC-3)');
    if (!/^ {12}RANGE="origin\/\$\{BASE_REF\}\.\.\.\$\{PR_HEAD\}"$/m.test(mem.body)) problems.push('memory gate: the pull request range must be origin/BASE...PR_HEAD (VC-8)');
  }
  for (const jobId of ['test-discipline-engine', 'fitness-check']) {
    const s = stepsOfJob(text, jobId).find((x) => x.name.includes('Resolve docs-only fast path'));
    if (!s) { problems.push(`job ${jobId}: no docs-only step (DO-6)`); continue; }
    if (!/^ {10}if node fsi-app\/\.discipline\/governance\/docs-only-range\.mjs --range="\$RANGE"; then$/m.test(s.body)) problems.push(`job ${jobId}: the docs-only condition must be the docs-only-range.mjs exit status (DO-6)`);
    if (!/^ {12}RANGE="origin\/\$\{BASE_REF\}\.\.\.\$\{PR_HEAD\}"$/m.test(s.body)) problems.push(`job ${jobId}: the docs-only pull request range must be origin/BASE...PR_HEAD (DO-6)`);
  }
  // the rendering guard step: exact shape, one status capture, the guard's own exit status
  const guard = stepsOfJob(text, 'rendering-guard').find((s) => s.name.includes('Run rendering guard'));
  if (guard) {
    const want = [
      'set -euo pipefail',
      'start="$(date +%s)"',
      'status=0',
      'node .discipline/rendering/run-rendering-guard.mjs || status=$?',
      'line="guard run: $(( $(date +%s) - start )) s"',
      'echo "$line"',
      'echo "$line" >> "$GITHUB_STEP_SUMMARY"',
      'exit "$status"',
    ];
    const cmds = runCommandLines(guard);
    if (JSON.stringify(cmds) !== JSON.stringify(want)) problems.push(`the rendering guard step must be exactly ${JSON.stringify(want)}, got ${JSON.stringify(cmds)} (RG-1, RG-2)`);
  }
  // firings uploads exist, every run, within the F68 budget
  for (const [jobId, nm] of [['validate-commits', 'gate-firings-validate-commits'], ['validate-commits', 'gate-firings-governance-validate-commits'], ['test-discipline-engine', 'gate-firings-governance-test-discipline-engine'], ['fitness-check', 'gate-firings-fitness-check']]) {
    const u = stepsOfJob(text, jobId).find((s) => s.body.includes(`name: ${nm}`));
    if (!u) { problems.push(`job ${jobId}: no upload of ${nm}`); continue; }
    if (u.ifExpr !== 'always()') problems.push(`upload ${nm}: must run on every run (if: always())`);
    const days = u.body.match(/retention-days:\s*(\d+)/);
    if (!days || Number(days[1]) > 7) problems.push(`upload ${nm}: retention within the F68 budget`);
  }
  return problems;
}

const expectCaught = (id, text, pattern) => {
  const problems = disciplineShapeProblems(text);
  assert.ok(problems.some((p) => pattern.test(p)), `${id}: not caught by the shape check. problems: ${JSON.stringify(problems)}`);
};
/** Apply `fn(stepText)` to the one step of `jobId` whose name or body contains `fragment`; returns the new file text. */
const replaceStep = (yml, jobId, fragment, fn) => {
  const lines = yml.split(/\r?\n/);
  const job = extractJobs(lines).find((j) => j.id === jobId);
  const starts = [];
  for (let i = job.startLine; i <= job.endLine; i++) if (/^ {6}- /.test(lines[i])) starts.push(i);
  starts.push(job.endLine + 1);
  for (let k = 0; k < starts.length - 1; k++) {
    const body = lines.slice(starts[k], starts[k + 1]).join('\n');
    const name = (body.match(/^ {6}- name:\s*(.*)$/m) || body.match(/^ {8}name:\s*(.*)$/m) || [null, ''])[1];
    if (name.includes(fragment)) return [...lines.slice(0, starts[k]), ...fn(body).split('\n'), ...lines.slice(starts[k + 1])].join('\n');
  }
  throw new Error(`attack fixture: no step "${fragment}" in ${jobId}`);
};
const stepText = (yml, jobId, fragment) => stepsOfJob(yml, jobId).find((s) => s.name.includes(fragment)).body;
const mutate = (yml, from, to) => {
  assert.ok(yml.includes(from), `attack fixture text is present in the workflow: ${from.slice(0, 70)}`);
  return yml.replace(from, () => to);
};

test('GATE-9: the committed discipline.yml has the shape every verdict step needs (control: zero problems)', () => {
  assert.deepEqual(disciplineShapeProblems(DISCIPLINE_YML), []);
});

test('VC-5, VC-6: +o pipefail and |& are caught anywhere, and a multi-command step must start with set -euo pipefail', () => {
  expectCaught('VC-5', replaceStep(DISCIPLINE_YML, 'validate-commits', 'Run discipline engine (pull request)', (t) => t.replace('set -euo pipefail', 'set -u +o pipefail')), /\+o pipefail|does not start with set -euo pipefail/);
  expectCaught('VC-6', mutate(DISCIPLINE_YML, '--mode=ci 2>&1 | tee -a fsi-app/.discipline/out/rules-ci-firings.log\n\n      # ──', '--mode=ci 2>&1 |& tee -a fsi-app/.discipline/out/rules-ci-firings.log\n\n      # ──'), /\|&/);
  expectCaught('VC-5 removed', replaceStep(DISCIPLINE_YML, 'validate-commits', 'Run discipline engine (pull request)', (t) => t.replace('          set -euo pipefail\n', '')), /does not start with set -euo pipefail|pipes into tee/);
});

test('VC-2: the push step must validate before..after; a head-only run is caught', () => {
  expectCaught('VC-2', replaceStep(DISCIPLINE_YML, 'validate-commits', 'Run discipline engine (push to master)', (t) => t.replace('--range="${PUSH_BEFORE}..${COMMIT_SHA}"', '--commit="$COMMIT_SHA"')), /before\.\.after/);
});

test('VC-3: a --warn-only memory gate on push is caught', () => {
  expectCaught('VC-3', mutate(DISCIPLINE_YML, 'memory-gate.mjs --range="$RANGE"\n          else', 'memory-gate.mjs --range="$RANGE" --warn-only\n          else'), /fail, not warn/);
});

test('VC-7, VC-8: pointing the engine or the memory gate at an empty range is caught', () => {
  expectCaught('VC-7', replaceStep(DISCIPLINE_YML, 'validate-commits', 'Run discipline engine (pull request)', (t) => t.replace('PR_HEAD: ${{ github.event.pull_request.head.sha }}', 'PR_HEAD: ${{ github.event.pull_request.base.sha }}')), /PR_HEAD must be the pull request head sha/);
  expectCaught('VC-8', replaceStep(DISCIPLINE_YML, 'validate-commits', 'Memory gate', (t) => t.replace('RANGE="origin/${BASE_REF}...${PR_HEAD}"', 'RANGE="origin/${BASE_REF}...origin/${BASE_REF}"')), /memory gate: the pull request range/);
});

test('DO-6: replacing the docs-only condition with a constant is caught, in both jobs', () => {
  for (const jobId of ['test-discipline-engine', 'fitness-check']) {
    expectCaught(`DO-6 ${jobId}`, replaceStep(DISCIPLINE_YML, jobId, 'Resolve docs-only fast path', (t) => t.replace(/if node fsi-app\/\.discipline\/governance\/docs-only-range\.mjs --range="\$RANGE"; then/, 'if true; then')), /docs-only condition must be the docs-only-range\.mjs exit status/);
  }
});

test('TR-1, TR-2, TR-4: a changed branches list, a paths-ignore filter and a blanket cancel-in-progress are caught', () => {
  expectCaught('TR-1', mutate(DISCIPLINE_YML, '  pull_request:\n    branches:\n      - master', '  pull_request:\n    branches:\n      - main'), /pull_request must trigger on branches/);
  expectCaught('TR-2', mutate(DISCIPLINE_YML, '  pull_request:\n    branches:\n      - master', '  pull_request:\n    paths-ignore: ["**"]\n    branches:\n      - master'), /paths\/paths-ignore filter/);
  expectCaught('TR-4', mutate(DISCIPLINE_YML, "cancel-in-progress: ${{ github.event_name == 'pull_request' }}", 'cancel-in-progress: true'), /cancel-in-progress/);
});

test('TR-3: a job if that excludes fork pull requests is caught, and so is any job if that is not the pull_request-only form', () => {
  expectCaught('TR-3', mutate(DISCIPLINE_YML, "    name: Discipline engine unit tests\n    # PR head only (lane GATE-4): a push to master skips this job, see the header's slim job set note.\n    if: github.event_name == 'pull_request'", "    name: Discipline engine unit tests\n    # PR head only (lane GATE-4): a push to master skips this job, see the header's slim job set note.\n    if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.fork == false"), /job test-discipline-engine: if is/);
  expectCaught('JIF', mutate(DISCIPLINE_YML, '    name: Validate commits against discipline rules\n', '    name: Validate commits against discipline rules\n    if: false\n'), /job validate-commits: if is/);
});

test('JCOE, COE: continue-on-error on any job or step is caught', () => {
  expectCaught('JCOE', mutate(DISCIPLINE_YML, '    name: Fitness functions (application-layer enforcement)\n', '    name: Fitness functions (application-layer enforcement)\n    continue-on-error: true\n'), /continue-on-error/);
  expectCaught('COE', replaceStep(DISCIPLINE_YML, 'test-discipline-engine', 'Closure gate', (t) => t.replace('        run: node', '        continue-on-error: true\n        run: node')), /continue-on-error/);
});

test('IFF, DEL, JDEL: a verdict step made conditional on false, removed, or a job removed, is caught', () => {
  expectCaught('IFF', replaceStep(DISCIPLINE_YML, 'fitness-check', 'Run fitness functions', (t) => t.replace(IF_DOCS, 'false')), /is allowed/);
  expectCaught('IFF memory gate', replaceStep(DISCIPLINE_YML, 'validate-commits', 'Memory gate', (t) => t.replace('if: always()', 'if: false')), /is allowed/);
  expectCaught('DEL', replaceStep(DISCIPLINE_YML, 'test-discipline-engine', 'Invariant-coverage meta-gate', () => ''), /expected exactly one step named like "Invariant-coverage meta-gate"/);
  expectCaught('JDEL', DISCIPLINE_YML.slice(0, DISCIPLINE_YML.indexOf('  consistency-backstop:')) + DISCIPLINE_YML.slice(DISCIPLINE_YML.indexOf('  fitness-check:')), /the job set is/);
});

test('TRUE: a verdict step forced to success (set +e, || true, exit 0) is caught', () => {
  expectCaught('TRUE set +e', replaceStep(DISCIPLINE_YML, 'test-discipline-engine', 'Closure gate', (t) => t.replace('        run: node fsi-app/.discipline/governance/closure-gate.mjs', '        run: |\n          set +e\n          node fsi-app/.discipline/governance/closure-gate.mjs\n          exit 0')), /forces success|does not start with set -euo pipefail/);
  expectCaught('TRUE || true', replaceStep(DISCIPLINE_YML, 'fitness-check', 'Run fitness functions', (t) => t.replace('run: node fsi-app/.discipline/fitness/runner.mjs', 'run: node fsi-app/.discipline/fitness/runner.mjs || true')), /forces success/);
});

test('RG-1, RG-2: any change to the rendering guard step\'s status handling is caught', () => {
  expectCaught('RG-1', mutate(DISCIPLINE_YML, '          line="guard run:', '          status=0\n          line="guard run:'), /rendering guard step must be exactly/);
  expectCaught('RG-2', mutate(DISCIPLINE_YML, 'run-rendering-guard.mjs || status=$?', 'run-rendering-guard.mjs || status=$?; status=0'), /rendering guard step must be exactly/);
});

test('GATE-9: the governance and fitness firings uploads exist on every run within the artifact budget', () => {
  expectCaught('upload removed', mutate(DISCIPLINE_YML, 'name: gate-firings-governance-test-discipline-engine', 'name: something-else'), /no upload of gate-firings-governance-test-discipline-engine/);
  expectCaught('upload retention', replaceStep(DISCIPLINE_YML, 'validate-commits', 'Upload gate firings (governance gates, validate-commits)', (t) => t.replace('retention-days: 7', 'retention-days: 90')), /retention within the F68 budget/);
});

test('GATE-9: the Test discovery step runs the --check-unrun CLI and sits after the suite', () => {
  const steps = stepsOfJob(DISCIPLINE_YML, 'test-discipline-engine').map((s) => s.name);
  const suite = steps.findIndex((n) => n.includes('Run discipline test suite'));
  const disc = steps.findIndex((n) => n.includes('Test discovery'));
  assert.ok(suite >= 0 && disc > suite);
  assert.match(stepText(DISCIPLINE_YML, 'test-discipline-engine', 'Test discovery'), /run: node fsi-app\/\.discipline\/lib\/test-discovery\.mjs --check-unrun/);
});

test('AH6: a workflow name: is unique across .github/workflows (a duplicate would let a dormant file fire a consumer)', () => {
  const dir = join(REPO, '.github', 'workflows');
  const names = new Map();
  for (const f of readdirSync(dir).filter((n) => /\.ya?ml$/.test(n))) {
    const m = readFileSync(join(dir, f), 'utf8').match(/^name:\s*(.+?)\s*$/m);
    const name = m ? m[1].replace(/^["']|["']$/g, '') : f;
    names.set(name, [...(names.get(name) ?? []), f]);
  }
  assert.deepEqual([...names.entries()].filter(([, files]) => files.length > 1), [], 'two workflow files share a name');
});
