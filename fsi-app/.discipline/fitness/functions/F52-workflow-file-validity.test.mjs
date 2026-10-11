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
import { ALWAYS_ON, SCOPED, SCOPED_KEYS } from '../../governance/job-inputs.mjs';

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

// ── GATE-4 / GATE-6 / GATE-9 / CI-FIX-1 / CI-MIN-1, rewritten by lane PIPE-1 (2026-10-11) against the ONE workflow ────────
//
// The eight PR workflows (discipline, bug-class-guard, build-proof, design-audit, migration-proof, rls-persona-matrix,
// route-and-view-attacks, gate-step-attacks) became .github/workflows/ci.yml: five jobs, inputs, static, schema, app and
// master. Everything these tests asserted about discipline.yml (the GATE-4 job set and push posture, the GATE-6 Playwright
// container, the GATE-9 honest forms, the CI-FIX-1 required contexts, the CI-MIN-1 scoped-job skip) is asserted here
// about ci.yml, and each attack of the old file has its counterpart below (the coverage table of the lane's session log
// maps every case). They read the committed .github/workflows/ci.yml and assert workflow-validity facts, not a run of any
// fitness function against the live tree.

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const CI_YML = readFileSync(join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8');
const CI_LINES = CI_YML.split(/\r?\n/);
const JOBS = extractJobs(CI_LINES);

function jobById(id) {
  const job = JOBS.find((j) => j.id === id);
  assert.ok(job, `ci.yml has no job "${id}"`);
  return job;
}

function jobText(id) {
  const job = jobById(id);
  return CI_LINES.slice(job.startLine, job.endLine + 1).join('\n');
}

/** The step blocks of a job: a step starts at a column-6 dash and runs to the next column-6 dash. */
function stepsOf(id) {
  const job = jobById(id);
  const steps = [];
  for (let i = job.startLine; i <= job.endLine; i++) {
    if (/^ {6}- /.test(CI_LINES[i])) steps.push([]);
    if (steps.length) steps[steps.length - 1].push(CI_LINES[i]);
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

const headerOf = (lines) => lines.slice(0, lines.findIndex((l) => /^jobs:\s*$/.test(l))).join('\n');

const IF_PR = "github.event_name == 'pull_request'";
const IF_PUSH = "github.event_name == 'push'";
const IF_CODE = "needs.inputs.outputs.code == 'true'";
const IF_NOT_CANCELLED = '${{ !cancelled() }}';

/** The job-level condition of each job of ci.yml (null = none). A job given another condition is a finding (JIF). */
const JOB_IF = {
  inputs: null,
  static: IF_PR,
  schema: `${IF_PR} && needs.inputs.outputs.schema == 'true'`,
  app: `(${IF_PR} && needs.inputs.outputs.app == 'true') || github.event_name == 'workflow_dispatch'`,
  master: IF_PUSH,
};

/** Every verdict step of ci.yml, with the ONLY if it may carry (null = none). A step missing, renamed or given another
 *  condition is a finding. The code-gated steps carry the classifier's code verdict and nothing else. */
const VERDICT_STEPS = {
  inputs: [['Classify the change', null]],
  static: [
    ['Run discipline engine (pull request)', null],
    ['Memory gate', 'always()'],
    ['Consistency runner (pull request)', null],
    ['Audit finding status gate', null],
    ['Run discipline test suite', IF_CODE],
    ['Test discovery', IF_CODE],
    ['Invariant-coverage meta-gate', IF_CODE],
    ['Closure gate', IF_CODE],
    ['Skill-contract drift', IF_CODE],
    ['ESLint (max-warnings 0)', IF_CODE],
    ['Run fitness functions', IF_CODE],
    ['actionlint (pinned', IF_CODE],
    ['App unit tests requiring npm deps', IF_CODE],
    ['Behavioral goldens', IF_CODE],
    ['HARD - detector discrimination', IF_CODE],
    ['DS23 attacks', IF_CODE],
    ['DS24 control and attacks', IF_CODE],
    ['F9 on the real app', IF_CODE],
  ],
  schema: [
    ['Replay the applied migration files', null],
    ['Apply every pending migration', null],
    ['Run the RLS persona matrix', null],
    ['Attack the views and the system-only functions', null],
    ['Attack every route method', null],
  ],
  app: [
    ['next build', null],
    ['Run rendering guard', null],
    ['Run the design audit', IF_NOT_CANCELLED],
    ['Attack the D-M4 forbid rows', null],
  ],
  master: [
    ['Run discipline engine (push to master)', null],
    ['Memory gate', 'always()'],
    ['Consistency runner (push to master)', null],
    ['HARD - detector discrimination', null],
    ['next build', "needs.inputs.outputs.master_build == 'true'"],
  ],
};

/** The jobs whose multi-command steps must start with a pipefail line (VC-5): the schema job's steps use the plain
 *  `set -o pipefail` form before a tee, checked separately (VC-6). */
const PIPEFAIL_FIRST = /^set (-euo|-uo|-o) pipefail$/;

test('GATE-4: the workflow has exactly the five jobs, so a new job is a deliberate edit', () => {
  assert.deepEqual(JOBS.map((j) => j.id), ['inputs', 'static', 'schema', 'app', 'master']);
});

test('GATE-4: static runs on a pull request only, master on a push only, inputs on every event, and schema and app are scoped by the classifier', () => {
  for (const [id, want] of Object.entries(JOB_IF)) {
    const ifProp = jobPropertyLines(jobById(id), CI_LINES).find((p) => p.key === 'if');
    assert.equal(ifProp ? ifProp.valueInline.trim() : null, want, `job ${id}`);
  }
});

test('GATE-4: the workflow header states the five jobs, that all five are the required contexts, and where the route attacks run', () => {
  const header = headerOf(CI_LINES);
  assert.match(header, /FIVE jobs/);
  assert.match(header, /ALL FIVE are the required status contexts/);
  assert.match(header, /master {3}a push to master only/);
  assert.match(header, /WHERE THE ROUTE ATTACKS RUN, AND WHY/);
});

test('GATE-4: the app job is a required job: no continue-on-error, depth-1 checkout, 25 minute timeout (GATE-6)', () => {
  const block = jobText('app');
  assert.doesNotMatch(block, /^\s*continue-on-error:\s*true/m, 'app must be able to fail the workflow');
  assert.match(block, /^ {4}timeout-minutes:\s*25\s*$/m);
  const checkout = stepNamed('app', 'Checkout repository');
  assert.match(checkout, /fetch-depth:\s*1\s*$/m, 'the app job checks out depth 1');
  assert.doesNotMatch(checkout, /fetch-depth:\s*0/);
  assert.doesNotMatch(checkout, /git fetch/, 'no extra ref fetch');
});

test('GATE-4: actionlint restores a version-keyed cache of its pinned tarball and still verifies the checksum', () => {
  const cache = stepNamed('static', 'actionlint tarball');
  assert.match(cache, /uses:\s*actions\/cache@v4/);
  assert.match(cache, /key:\s*actionlint-v1\.7\.12-linux-amd64\s*$/m);
  const lint = stepNamed('static', 'actionlint (pinned');
  assert.match(lint, /sha256sum -c/, 'the checksum is verified on every run, cache hit or miss');
  assert.match(lint, /--retry/, 'a download on a cache miss retries a network reset');
});

test('GATE-4: every job that produces gate firings uploads a gate-firings artifact on every run, never failing on absence', () => {
  for (const id of ['static', 'master']) {
    const uploads = stepsOf(id).filter((s) => /uses:\s*actions\/upload-artifact@v4/.test(s));
    assert.ok(uploads.length >= 2, `${id}: uploads its firings`);
    for (const upload of uploads) {
      assert.match(upload, /^ {8}if:\s*always\(\)\s*$/m, `${id}: upload on pass and on fail`);
      assert.match(upload, /name:\s*gate-firings-/);
      assert.match(upload, /if-no-files-found:\s*ignore/, `${id}: an absent file uploads nothing and does not fail`);
      const retention = upload.match(/retention-days:\s*(\d+)/);
      assert.ok(retention && Number(retention[1]) <= 7, `${id}: retention within the F68 budget`);
    }
  }
  assert.match(stepNamed('static', 'Upload gate firings (fitness functions)'), /fsi-app\/\.discipline\/out\/fitness-firings\.json/);
  assert.match(stepNamed('static', 'Upload gate firings (rule engine output)'), /fsi-app\/\.discipline\/out\/rules-ci-firings\.log/);
});

test('GATE-4: the explicit-test runner runs its files concurrently (the programmatic run() defaults to serial)', () => {
  const src = readFileSync(join(REPO, 'fsi-app', '.discipline', 'lib', 'run-explicit-tests.mjs'), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.match(code, /run\(\{[^}]*\bconcurrency\b[^}]*\}\)/, 'run({ files, execArgv, concurrency }) must pass a concurrency option');
});

test('PIPE-1: the static job timeout is set from measurement and the comment records the numbers', () => {
  const block = jobText('static');
  assert.match(block, /^ {4}timeout-minutes:\s*19\s*$/m);
  assert.match(block, /FROM MEASUREMENT/);
  assert.match(block, /739 s/);
  assert.match(block, /REG-1 \(in flight\) shrinks the suite/);
});

// ── GATE-6 (lane gate6-guard-container): every Playwright job runs in the pinned official image ──────
//
// Four Rendering guard runs were cancelled at the job timeout because `playwright install --with-deps` stalled on apt
// downloads. The jobs run in mcr.microsoft.com/playwright:v<version>-noble, which has chromium and its OS libraries, and
// install only the npm package, whose version is READ BACK OUT OF THE IMAGE TAG in the same workflow file (the job
// context has no container image property, so the file is the one place the version is written). These assertions fail
// if a browser install returns, if the image tag and the npm version could differ, or if the guard stops printing its
// own runtime.

const PLAYWRIGHT_IMAGE = /^ {6}image:\s*mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-noble\s*$/m;

function playwrightJobs() {
  return [
    { file: 'ci.yml', job: 'app' },
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
  assert.equal(CI_YML.match(/^ *image:/gm).length, 1, 'ci.yml carries ONE image line: the rendering guard and the design audit share the app job');
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
  const step = stepNamed('app', 'Run rendering guard');
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

test('GATE-6: the app job describes the container form and the 25 minute limit, not an install and 10 minutes', () => {
  const block = jobText('app');
  assert.doesNotMatch(block, /installs\s+Playwright chromium/);
  assert.doesNotMatch(block, /10-minute timeout/);
  assert.match(block, /CONTAINER, NOT AN INSTALL/);
  assert.match(block, /TIMEOUT 25 MINUTES/);
});

test('GATE-6: the app job timeout is 25 minutes and the comment records the measured reasoning', () => {
  const block = jobText('app');
  assert.match(block, /^ {4}timeout-minutes:\s*25\s*$/m);
  assert.match(block, /p90 433 s/);
  assert.match(block, /max 604 s/);
});

// ── GATE-9 (lane gate9-ci-honest-forms, 2026-10-08): the shape of the CI workflow, asserted as facts ─────────
//
// AUD-AT-5 edited discipline.yml and chain-proof.yml 218 ways (continue-on-error, if: false, a step removed, the script
// forced to exit 0) and the repo's own gates refused 69 of the 148 edits that reach a verdict. The rest were accepted
// because every test asserted what the file SAYS TODAY about one step, not what a verdict step may never become. These
// tests state the second thing: for every job and every verdict step, which conditions are allowed, and that nothing can
// make it unable to fail. Each attack is a mutation of the real file text run through the same checker, so a check that
// stops detecting its attack fails here. The attack ids are the register's (VC-*, DS*, TR-*, RG-*, DO-6, AH6).

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

/** The non-comment run-block commands of a step body (one entry per command; a backslash continuation joins its lines). */
function runCommandLines(step) {
  const out = [];
  let inBlock = false;
  let carry = '';
  const push = (raw) => {
    const piece = raw.trim();
    if (piece === '' || /^#/.test(piece)) return;
    if (piece.endsWith('\\')) { carry += `${piece.slice(0, -1).trim()} `; return; }
    out.push(`${carry}${piece}`);
    carry = '';
  };
  for (const l of step.body.split('\n')) {
    if (/^ {8}run:\s*[|>][-+]?\s*$/.test(l)) { inBlock = true; continue; }
    if (/^ {8}run:\s*\S/.test(l)) return [l.replace(/^ {8}run:\s*/, '')];
    if (inBlock) {
      if (/^ {10,}\S/.test(l) || l.trim() === '') { push(l); continue; }
      inBlock = false;
    }
  }
  return out;
}

/** Problems with a ci.yml text. [] = the shape holds. */
function ciShapeProblems(text) {
  const problems = [];
  const code = codeLines(text).map(({ l }) => l).join('\n');
  // triggers
  if (/^\s*paths(-ignore)?:/m.test(code)) problems.push('a paths/paths-ignore filter is present (TR-2: a skipped required check blocks the merge)');
  const on = text.slice(text.indexOf('\non:'), text.indexOf('\npermissions:'));
  if (!/^ {2}pull_request:\n {4}branches:\n {6}- master\n/m.test(on)) problems.push('pull_request must trigger on branches: [master] only (TR-1)');
  if (!/^ {2}push:\n {4}branches:\n {6}- master\n/m.test(on)) problems.push('push must trigger on branches: [master] only (TR-1)');
  if (/^ {2}(schedule|workflow_run|pull_request_target):/m.test(on)) problems.push('a schedule, workflow_run or pull_request_target trigger is present (TR-5)');
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
  for (const [jobId, list] of Object.entries(VERDICT_STEPS)) {
    const steps = stepsOfJob(text, jobId);
    for (const [fragment, allowedIf] of list) {
      const hits = steps.filter((s) => s.name.includes(fragment));
      if (hits.length !== 1) { problems.push(`job ${jobId}: expected exactly one step named like "${fragment}", found ${hits.length} (DEL)`); continue; }
      const step = hits[0];
      if (step.ifExpr !== allowedIf) problems.push(`job ${jobId}: step "${fragment}" has if ${JSON.stringify(step.ifExpr)}, only ${JSON.stringify(allowedIf)} is allowed (IFF)`);
      const cmds = runCommandLines(step);
      if (cmds.length === 0 && !/^ {8}uses:/m.test(step.body)) problems.push(`job ${jobId}: step "${fragment}" has no run script`);
      for (const c of cmds) {
        if (/\bset \+e\b|\|\|\s*(true|:)\s*$|;\s*(true|:)\s*$|\bexit 0\b/.test(c) && !/^git fetch --no-tags origin "\$BASE_REF" \|\| true$/.test(c)) {
          problems.push(`job ${jobId}: step "${fragment}" runs "${c}", a form that forces success (TRUE)`);
        }
      }
    }
  }
  // every multi-command run block starts with a pipefail line (the schema job's stack steps use the plain form before a tee)
  for (const job of jobs) {
    for (const step of stepsOfJob(text, job.id)) {
      const cmds = runCommandLines(step);
      const skip = job.id === 'schema' || /^(Note the stack|Start the app|Stop the app|Remove the attack files|Land the design-audit)/.test(step.name);
      if (cmds.length > 1 && !skip && !PIPEFAIL_FIRST.test(cmds[0])) problems.push(`job ${job.id}: step "${step.name}" has ${cmds.length} commands and does not start with set -euo pipefail (VC-5)`);
      if (cmds.some((c) => /\|\s*tee\b/.test(c)) && !PIPEFAIL_FIRST.test(cmds[0])) problems.push(`job ${job.id}: step "${step.name}" pipes into tee without pipefail (VC-6)`);
    }
  }
  // the exact lines the verdicts depend on
  const dv = stepsOfJob(text, 'static');
  const pr = dv.find((s) => s.name.includes('(pull request)') && s.name.includes('Run discipline engine'));
  if (pr) {
    if (!/^ {10}PR_HEAD: \$\{\{ github\.event\.pull_request\.head\.sha \}\}$/m.test(pr.body)) problems.push('PR engine step: PR_HEAD must be the pull request head sha (VC-7)');
    if (!/\n {10}node fsi-app\/\.discipline\/runner\.mjs \\\n {12}--mode=ci 2>&1 \| tee -a fsi-app\/\.discipline\/out\/rules-ci-firings\.log/.test(pr.body)) problems.push('PR engine step: must run runner.mjs --mode=ci with no range override (VC-7)');
  }
  const push = stepsOfJob(text, 'master').find((s) => s.name.includes('(push to master)') && s.name.includes('Run discipline engine'));
  if (push && !/--range="\$\{PUSH_BEFORE\}\.\.\$\{COMMIT_SHA\}"/.test(push.body)) problems.push('push engine step must validate before..after, every commit in the push (VC-2)');
  const mem = dv.find((s) => s.name.includes('Memory gate'));
  if (mem) {
    if (/--warn-only/.test(mem.body)) problems.push('memory gate must fail, not warn, on a pull request (VC-3)');
    if (!/^ {10}RANGE="origin\/\$\{BASE_REF\}\.\.\.\$\{PR_HEAD\}"$/m.test(mem.body)) problems.push('memory gate: the pull request range must be origin/BASE...PR_HEAD (VC-8)');
  }
  const memPush = stepsOfJob(text, 'master').find((s) => s.name.includes('Memory gate'));
  if (memPush && /--warn-only/.test(memPush.body)) problems.push('memory gate must fail, not warn, on a push (VC-3)');
  // the classifier: the inputs job must run it for each event, and the code verdict is its output
  const classify = stepsOfJob(text, 'inputs').find((s) => s.name.includes('Classify the change'));
  if (classify) {
    if (!/node "\$CLASSIFIER" --pr-merge --github-output/.test(classify.body)) problems.push('the inputs job must classify a pull request over the merge commit (DO-6)');
    if (!/--range="\$\{PUSH_BEFORE\}\.\.\$\{PUSH_SHA\}" --github-output/.test(classify.body)) problems.push('the inputs job must classify a push over before..after (DO-6)');
    if (!/node "\$CLASSIFIER" --all --github-output/.test(classify.body)) problems.push('the inputs job must fall back to every job true (DO-6)');
  }
  // the rendering guard step: exact shape, one status capture, the guard's own exit status
  const guard = stepsOfJob(text, 'app').find((s) => s.name.includes('Run rendering guard'));
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
  for (const [jobId, nm] of [['static', 'gate-firings-validate-commits'], ['static', 'gate-firings-governance-static'], ['static', 'gate-firings-fitness-check'], ['master', 'gate-firings-validate-commits'], ['master', 'gate-firings-governance-master']]) {
    const u = stepsOfJob(text, jobId).find((s) => s.body.includes(`name: ${nm}`));
    if (!u) { problems.push(`job ${jobId}: no upload of ${nm}`); continue; }
    if (u.ifExpr !== 'always()') problems.push(`upload ${nm}: must run on every run (if: always())`);
    const days = u.body.match(/retention-days:\s*(\d+)/);
    if (!days || Number(days[1]) > 7) problems.push(`upload ${nm}: retention within the F68 budget`);
  }
  // the one write permission and the one place a secret is named (the app job's dispatch-only steps)
  if (!/^permissions:\n {2}contents: read\n/m.test(text)) problems.push('the workflow permissions must be contents: read (PERM-1)');
  const writes = [...code.matchAll(/^\s*([a-z-]+): write$/gm)].map((m) => m[1]);
  if (JSON.stringify(writes) !== JSON.stringify(['contents'])) problems.push(`the only write permission allowed is the app job's contents: write, found ${JSON.stringify(writes)} (PERM-1)`);
  const secretJobs = jobs.filter((j) => /secrets\./.test(codeLines(lines.slice(j.startLine, j.endLine + 1).join('\n')).map(({ l }) => l).join('\n'))).map((j) => j.id);
  if (JSON.stringify(secretJobs) !== JSON.stringify(['app'])) problems.push(`secrets may be named only in the app job's dispatch-only step, found in ${JSON.stringify(secretJobs)} (PERM-2)`);
  return problems;
}

const expectCaught = (id, text, pattern) => {
  const problems = ciShapeProblems(text);
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
const mutate = (yml, from, to) => {
  assert.ok(yml.includes(from), `attack fixture text is present in the workflow: ${from.slice(0, 70)}`);
  return yml.replace(from, () => to);
};

test('GATE-9: the committed ci.yml has the shape every verdict step needs (control: zero problems)', () => {
  assert.deepEqual(ciShapeProblems(CI_YML), []);
});

test('VC-5, VC-6: +o pipefail and |& are caught anywhere, and a multi-command step must start with set -euo pipefail', () => {
  expectCaught('VC-5', replaceStep(CI_YML, 'static', 'Run discipline engine (pull request)', (t) => t.replace('set -euo pipefail', 'set -u +o pipefail')), /\+o pipefail|does not start with set -euo pipefail/);
  expectCaught('VC-6', mutate(CI_YML, '--mode=ci 2>&1 | tee -a fsi-app/.discipline/out/rules-ci-firings.log\n\n      # Memory gate', '--mode=ci 2>&1 |& tee -a fsi-app/.discipline/out/rules-ci-firings.log\n\n      # Memory gate'), /\|&/);
  expectCaught('VC-5 removed', replaceStep(CI_YML, 'static', 'Run discipline engine (pull request)', (t) => t.replace('          set -euo pipefail\n', '')), /does not start with set -euo pipefail|pipes into tee/);
});

test('VC-2: the push step must validate before..after; a head-only run is caught', () => {
  expectCaught('VC-2', replaceStep(CI_YML, 'master', 'Run discipline engine (push to master)', (t) => t.replace('--range="${PUSH_BEFORE}..${COMMIT_SHA}"', '--commit="$COMMIT_SHA"')), /before\.\.after/);
});

test('VC-3: a --warn-only memory gate, on a pull request or on a push, is caught', () => {
  expectCaught('VC-3 pull request', mutate(CI_YML, 'memory-gate.mjs --range="$RANGE"\n\n      # The always-on C3/C4/C5', 'memory-gate.mjs --range="$RANGE" --warn-only\n\n      # The always-on C3/C4/C5'), /fail, not warn/);
  expectCaught('VC-3 push', replaceStep(CI_YML, 'master', 'Memory gate', (t) => t.replace('memory-gate.mjs --range="$RANGE"', 'memory-gate.mjs --range="$RANGE" --warn-only')), /fail, not warn/);
});

test('VC-7, VC-8: pointing the engine or the memory gate at an empty range is caught', () => {
  expectCaught('VC-7', replaceStep(CI_YML, 'static', 'Run discipline engine (pull request)', (t) => t.replace('PR_HEAD: ${{ github.event.pull_request.head.sha }}', 'PR_HEAD: ${{ github.event.pull_request.base.sha }}')), /PR_HEAD must be the pull request head sha/);
  expectCaught('VC-8', replaceStep(CI_YML, 'static', 'Memory gate', (t) => t.replace('RANGE="origin/${BASE_REF}...${PR_HEAD}"', 'RANGE="origin/${BASE_REF}...origin/${BASE_REF}"')), /memory gate: the pull request range/);
});

test('DO-6: replacing the classifier call with a constant, or dropping one of its three shapes, is caught', () => {
  expectCaught('DO-6 pull request', replaceStep(CI_YML, 'inputs', 'Classify the change', (t) => t.replace('node "$CLASSIFIER" --pr-merge --github-output', 'echo code=false >> "$GITHUB_OUTPUT"')), /classify a pull request over the merge commit/);
  expectCaught('DO-6 push', replaceStep(CI_YML, 'inputs', 'Classify the change', (t) => t.replace('--range="${PUSH_BEFORE}..${PUSH_SHA}" --github-output', '--all --github-output')), /classify a push over before\.\.after/);
  expectCaught('DO-6 fallback', replaceStep(CI_YML, 'inputs', 'Classify the change', (t) => t.replace('node "$CLASSIFIER" --all --github-output', 'node "$CLASSIFIER" --range=HEAD..HEAD --github-output')), /fall back to every job true/);
});

test('TR-1, TR-2, TR-4, TR-5: a changed branches list, a paths-ignore filter, a blanket cancel-in-progress and a schedule trigger are caught', () => {
  expectCaught('TR-1', mutate(CI_YML, '  pull_request:\n    branches:\n      - master', '  pull_request:\n    branches:\n      - main'), /pull_request must trigger on branches/);
  expectCaught('TR-2', mutate(CI_YML, '  pull_request:\n    branches:\n      - master', '  pull_request:\n    paths-ignore: ["**"]\n    branches:\n      - master'), /paths\/paths-ignore filter/);
  expectCaught('TR-4', mutate(CI_YML, "cancel-in-progress: ${{ github.event_name == 'pull_request' }}", 'cancel-in-progress: true'), /cancel-in-progress/);
  expectCaught('TR-5', mutate(CI_YML, '  workflow_dispatch:\n', "  workflow_dispatch:\n  schedule:\n    - cron: '0 3 * * *'\n"), /schedule, workflow_run or pull_request_target/);
});

test('TR-3: a job if that excludes fork pull requests is caught, and so is any job if that is not the expected form', () => {
  expectCaught('TR-3', mutate(CI_YML, "  static:\n    name: static\n    needs: inputs\n    if: github.event_name == 'pull_request'\n", "  static:\n    name: static\n    needs: inputs\n    if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.fork == false\n"), /job static: if is/);
  expectCaught('JIF', mutate(CI_YML, '  inputs:\n    name: inputs\n', '  inputs:\n    name: inputs\n    if: false\n'), /job inputs: if is/);
  expectCaught('JIF app', mutate(CI_YML, "    if: (github.event_name == 'pull_request' && needs.inputs.outputs.app == 'true') || github.event_name == 'workflow_dispatch'\n", "    if: github.event_name == 'pull_request'\n"), /job app: if is/);
});

test('JCOE, COE: continue-on-error on any job or step is caught', () => {
  expectCaught('JCOE', mutate(CI_YML, '  static:\n    name: static\n', '  static:\n    name: static\n    continue-on-error: true\n'), /continue-on-error/);
  expectCaught('COE', replaceStep(CI_YML, 'static', 'Closure gate', (t) => t.replace('        run: node', '        continue-on-error: true\n        run: node')), /continue-on-error/);
});

test('IFF, DEL, JDEL: a verdict step made conditional on false, removed, or a job removed, is caught', () => {
  expectCaught('IFF', replaceStep(CI_YML, 'static', 'Run fitness functions', (t) => t.replace(IF_CODE, 'false')), /is allowed/);
  expectCaught('IFF memory gate', replaceStep(CI_YML, 'static', 'Memory gate', (t) => t.replace('if: always()', 'if: false')), /is allowed/);
  expectCaught('IFF master build', replaceStep(CI_YML, 'master', 'next build', (t) => t.replace("needs.inputs.outputs.master_build == 'true'", 'false')), /is allowed/);
  expectCaught('DEL', replaceStep(CI_YML, 'static', 'Invariant-coverage meta-gate', () => ''), /expected exactly one step named like "Invariant-coverage meta-gate"/);
  expectCaught('JDEL', CI_YML.slice(0, CI_YML.indexOf(String.fromCharCode(10) + '  schema:' + String.fromCharCode(10))) + CI_YML.slice(CI_YML.indexOf(String.fromCharCode(10) + '  app:' + String.fromCharCode(10))), /the job set is/);
});

test('TRUE: a verdict step forced to success (set +e, || true, exit 0) is caught', () => {
  expectCaught('TRUE set +e', replaceStep(CI_YML, 'static', 'Closure gate', (t) => t.replace('        run: node fsi-app/.discipline/governance/closure-gate.mjs', '        run: |\n          set +e\n          node fsi-app/.discipline/governance/closure-gate.mjs\n          exit 0')), /forces success|does not start with set -euo pipefail/);
  expectCaught('TRUE || true', replaceStep(CI_YML, 'static', 'Run fitness functions', (t) => t.replace('run: node fsi-app/.discipline/fitness/runner.mjs', 'run: node fsi-app/.discipline/fitness/runner.mjs || true')), /forces success/);
  expectCaught('TRUE schema', replaceStep(CI_YML, 'schema', 'Attack every route method', (t) => t.replace('| tee -a "$GITHUB_STEP_SUMMARY"', '| tee -a "$GITHUB_STEP_SUMMARY" || true')), /forces success/);
});

test('RG-1, RG-2: any change to the rendering guard step\'s status handling is caught', () => {
  expectCaught('RG-1', mutate(CI_YML, '          line="guard run:', '          status=0\n          line="guard run:'), /rendering guard step must be exactly/);
  expectCaught('RG-2', mutate(CI_YML, 'run-rendering-guard.mjs || status=$?', 'run-rendering-guard.mjs || status=$?; status=0'), /rendering guard step must be exactly/);
});

test('GATE-9: the governance and fitness firings uploads exist on every run within the artifact budget', () => {
  expectCaught('upload removed', mutate(CI_YML, 'name: gate-firings-governance-static', 'name: something-else'), /no upload of gate-firings-governance-static/);
  expectCaught('upload retention', replaceStep(CI_YML, 'master', 'Upload gate firings (governance gates)', (t) => t.replace('retention-days: 7', 'retention-days: 90')), /retention within the F68 budget/);
  expectCaught('upload not every run', replaceStep(CI_YML, 'static', 'Upload gate firings (rule engine output)', (t) => t.replace('if: always()', 'if: success()')), /must run on every run/);
});

test('PERM-1, PERM-2: a second write permission, a workflow-level write, or a secret named outside the app job is caught', () => {
  expectCaught('PERM-1 workflow', mutate(CI_YML, 'permissions:\n  contents: read\n\nconcurrency:', 'permissions:\n  contents: write\n\nconcurrency:'), /workflow permissions must be contents: read|only write permission/);
  expectCaught('PERM-1 job', mutate(CI_YML, '    permissions:\n      contents: read\n      actions: read\n', '    permissions:\n      contents: read\n      actions: write\n'), /only write permission/);
  expectCaught('PERM-2', replaceStep(CI_YML, 'static', 'Prepare gate firings log', (t) => t.replace('        env:\n', '        env:\n          LEAK: ${{ secrets.WORKER_SECRET }}\n')), /secrets may be named only/);
});

test('GATE-9: the Test discovery step runs the --check-unrun CLI and sits after the suite', () => {
  const steps = stepsOfJob(CI_YML, 'static').map((s) => s.name);
  const suite = steps.findIndex((n) => n.includes('Run discipline test suite'));
  const disc = steps.findIndex((n) => n.includes('Test discovery'));
  assert.ok(suite >= 0 && disc > suite);
  const text = stepsOfJob(CI_YML, 'static').find((s) => s.name.includes('Test discovery')).body;
  assert.match(text, /run: node fsi-app\/\.discipline\/lib\/test-discovery\.mjs --check-unrun/);
});

test('PIPE-1: the no-npm steps of the static job run before npm ci, and the attacks run last (the attack files are never in the tree the fitness runner compiles)', () => {
  const steps = stepsOfJob(CI_YML, 'static').map((s) => s.name);
  const at = (frag) => steps.findIndex((n) => n.includes(frag));
  const install = at('Install fsi-app deps');
  for (const frag of ['Run discipline test suite', 'Test discovery', 'Invariant-coverage meta-gate', 'Closure gate', 'Skill-contract drift', 'Orphan-module']) assert.ok(at(frag) >= 0 && at(frag) < install, `${frag} runs before npm ci (the no-npm job semantics)`);
  for (const frag of ['ESLint (max-warnings 0)', 'Run fitness functions', 'actionlint (pinned', 'App unit tests requiring npm deps', 'Behavioral goldens', 'HARD - detector discrimination']) assert.ok(at(frag) > install, `${frag} runs after npm ci`);
  assert.ok(at('DS23 attacks') > at('Behavioral goldens') && at('F9 on the real app') > at('DS24 control and attacks'), 'the attacks run last');
});

test('PIPE-1: the classifier outputs feed exactly the conditions the job table names, and every code condition reads the code output', () => {
  const header = jobText('inputs').split('\n    steps:')[0];
  for (const key of ['code', ...SCOPED_KEYS]) assert.match(header, new RegExp(`^ {6}${key}: \\$\\{\\{ steps\\.classify\\.outputs\\.${key} \\}\\}$`, 'm'), `inputs outputs ${key}`);
  const reads = [...new Set([...CI_YML.matchAll(/needs\.inputs\.outputs\.([a-z_]+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(reads, ['app', 'code', 'master_build', 'schema'], 'no step reads an output the classifier does not write');
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
  assert.deepEqual(names.get('CI'), ['ci.yml']);
});

// ── GATE-9: a container job whose steps use pipefail must run them under bash ────────────────────────────────
// A container job's steps run under `sh -e` (dash on the Playwright image), which rejects `set -o pipefail`: the first
// GATE-9 run of the rendering guard died with "set: Illegal option -o pipefail". Every job with a `container:` key whose
// code uses pipefail must declare `defaults.run.shell: bash` (the layout-baseline-renewal and live-smoke jobs use no
// pipefail today, so they need nothing; the day one does, this test names it).

function containerShellProblems(fileLabel, text) {
  const problems = [];
  const lines = text.split(/\r?\n/);
  for (const job of extractJobs(lines)) {
    const jobLines = lines.slice(job.startLine, job.endLine + 1);
    if (!jobLines.some((l) => /^ {4}container:/.test(l))) continue;
    const usesPipefail = jobLines.some((l) => !/^\s*#/.test(l) && /pipefail/.test(l));
    const hasBash = /^ {4}defaults:\n {6}run:\n {8}shell: bash\s*$/m.test(jobLines.filter((l) => !/^\s*#/.test(l)).join('\n'));
    if (usesPipefail && !hasBash) problems.push(`${fileLabel} job ${job.id}: a container job that uses pipefail must declare defaults.run.shell: bash (the default shell there is sh)`);
  }
  return problems;
}

test('GATE-9: every container job that uses pipefail declares defaults.run.shell: bash (real workflow files)', () => {
  const dir = join(REPO, '.github', 'workflows');
  for (const f of readdirSync(dir).filter((n) => /\.ya?ml$/.test(n))) {
    assert.deepEqual(containerShellProblems(f, readFileSync(join(dir, f), 'utf8')), []);
  }
  assert.match(jobText('app'), /^ {4}defaults:\n {6}run:\n {8}shell: bash$/m, 'the app job runs its steps under bash');
});

test('GATE-9 attack: removing the shell default from the app job, or adding pipefail to a container job without it, is caught', () => {
  const noShell = CI_YML.replace('    defaults:\n      run:\n        shell: bash\n', '');
  assert.notEqual(noShell, CI_YML);
  assert.equal(containerShellProblems('ci.yml', noShell).length, 1);
  const synthetic = 'name: X\non:\n  workflow_dispatch: {}\njobs:\n  a:\n    runs-on: ubuntu-latest\n    container:\n      image: x\n    steps:\n      - run: |\n          set -euo pipefail\n          echo hi\n';
  assert.equal(containerShellProblems('x.yml', synthetic).length, 1);
  assert.deepEqual(containerShellProblems('x.yml', synthetic.replace('    container:', '    defaults:\n      run:\n        shell: bash\n    container:')), []);
});

// ── CI-FIX-1 (RULES-X-1 item 11, 2026-10-09; PIPE-1, 2026-10-11): the required-check context names are pinned ───────────
// Branch protection requires these five contexts by their exact job `name:` string (the executor switches protection to
// them when this workflow merges). A job renamed here silently drops out of branch protection: the old context is never
// reported, so it is neither green nor red, and the merge button does not know. The names are pinned, so a rename is a
// red test in the same PR. A skipped job reports as skipped and satisfies protection, which is why schema and app may be
// scoped at job level and master may be skipped on a pull request.
const REQUIRED_CONTEXTS = ['inputs', 'static', 'schema', 'app', 'master'];

/** Every job-level `name:` value across a set of workflow texts: [{ file, job, name }]. */
function jobNames(workflows) {
  const out = [];
  for (const [file, text] of Object.entries(workflows)) {
    const lines = text.split(/\r?\n/);
    for (const job of extractJobs(lines)) {
      for (const l of lines.slice(job.startLine + 1, job.endLine + 1)) {
        const m = l.match(/^ {4}name:\s*(.+?)\s*$/);
        if (m) {
          out.push({ file, job: job.id, name: m[1].replace(/^["']|["']$/g, '') });
          break;
        }
      }
    }
  }
  return out;
}

function readWorkflows() {
  const dir = join(REPO, '.github', 'workflows');
  const out = {};
  for (const f of readdirSync(dir).filter((n) => /\.ya?ml$/.test(n))) out[f] = readFileSync(join(dir, f), 'utf8');
  return out;
}

function missingRequired(workflows) {
  const names = jobNames(workflows).map((j) => j.name);
  return REQUIRED_CONTEXTS.filter((c) => names.filter((n) => n === c).length !== 1);
}

test('CI-FIX-1: every required status check context is the job name of exactly one job in .github/workflows', () => {
  assert.equal(REQUIRED_CONTEXTS.length, 5);
  assert.deepEqual(missingRequired(readWorkflows()), []);
  assert.deepEqual(jobNames({ 'ci.yml': CI_YML }).map((j) => [j.job, j.name]), REQUIRED_CONTEXTS.map((c) => [c, c]), 'each job id is its own context name');
});

test('CI-FIX-1 attack: renaming one required job, or defining its name twice, is red', () => {
  const real = readWorkflows();
  const renamed = { ...real, 'ci.yml': real['ci.yml'].replace('    name: static\n', '    name: static v2\n') };
  assert.notEqual(renamed['ci.yml'], real['ci.yml']);
  assert.deepEqual(missingRequired(renamed), ['static']);
  const renamedApp = { ...real, 'ci.yml': real['ci.yml'].replace('    name: app\n', '    name: application\n') };
  assert.deepEqual(missingRequired(renamedApp), ['app']);
  const duplicated = { ...real, 'copy.yml': 'name: Copy\non:\n  workflow_dispatch: {}\njobs:\n  x:\n    name: schema\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n' };
  assert.deepEqual(missingRequired(duplicated), ['schema']);
});

// ── CI-MIN-1 (lane cimin1-jobs-scoped-to-inputs, 2026-10-10, ADR-047 decision 5; PIPE-1): every scoped job carries the skip ─
//
// A scoped job runs only when the pull request touched its inputs, decided by the workflow's `inputs` job running the
// one classifier (governance/job-inputs.mjs, whose SCOPED table is the list asserted here, never a second list). The
// skip is JOB-level: a skipped required context satisfies branch protection, a path-filtered workflow does not. A job
// that lost its `needs: inputs` or its `if` would run on every pull request again, silently spending the minutes the
// plan removed; a job whose `if` reads the wrong output would skip a gate that guards the change.

/** Problems with one scoped job of a workflow text. [] = the job carries the job-level skip and the inputs job feeds it. */
function scopedJobProblems(text, jobId, key) {
  const problems = [];
  const lines = text.split(/\r?\n/);
  const jobs = extractJobs(lines);
  const inputs = jobs.find((j) => j.id === 'inputs');
  if (!inputs) problems.push(`no inputs job (the classifier never runs, so ${jobId} cannot be scoped)`);
  else if (!new RegExp(`^ {6}${key}:\\s*\\$\\{\\{ steps\\.classify\\.outputs\\.${key} \\}\\}\\s*$`, 'm').test(lines.slice(inputs.startLine, inputs.endLine + 1).join('\n'))) {
    problems.push(`the inputs job does not output ${key} from steps.classify`);
  }
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return [...problems, `no job ${jobId}`];
  const props = jobPropertyLines(job, lines);
  const needsProp = props.find((p) => p.key === 'needs');
  if (!needsProp || !parseNeedsIds(lines, needsProp, 4).includes('inputs')) problems.push(`job ${jobId}: needs must list inputs`);
  const ifProp = props.find((p) => p.key === 'if');
  if (!ifProp) problems.push(`job ${jobId}: no job-level if`);
  else if (!new RegExp(`needs\\.inputs\\.outputs\\.${key} == 'true'`).test(ifProp.valueInline)) problems.push(`job ${jobId}: the if must test needs.inputs.outputs.${key} == 'true', got ${JSON.stringify(ifProp.valueInline)}`);
  else if (/continue-on-error|\|\|\s*true\b/.test(ifProp.valueInline)) problems.push(`job ${jobId}: the if may not be made unable to fail`);
  return problems;
}

/** Problems with one STEP-level scoped entry (the master job's next build): the step carries the if over the output. */
function scopedStepProblems(text, jobId, key) {
  const problems = [];
  const lines = text.split(/\r?\n/);
  const inputs = extractJobs(lines).find((j) => j.id === 'inputs');
  if (!inputs || !new RegExp(`^ {6}${key}:\\s*\\$\\{\\{ steps\\.classify\\.outputs\\.${key} \\}\\}\\s*$`, 'm').test(lines.slice(inputs.startLine, inputs.endLine + 1).join('\n'))) problems.push(`the inputs job does not output ${key} from steps.classify`);
  const guarded = stepsOfJob(text, jobId).filter((s) => s.ifExpr === `needs.inputs.outputs.${key} == 'true'`);
  if (guarded.length !== 1) problems.push(`job ${jobId}: expected exactly one step guarded by needs.inputs.outputs.${key}, found ${guarded.length}`);
  return problems;
}

const workflowText = (file) => readFileSync(join(REPO, '.github', 'workflows', file), 'utf8');

test('CI-MIN-1: every scoped entry in the classifier table carries needs: inputs and the job-level if (or the step-level if)', () => {
  assert.ok(SCOPED_KEYS.length >= 3, 'the table names the schema and app jobs and the master build step');
  for (const key of SCOPED_KEYS) {
    const def = SCOPED[key];
    const problems = def.level === 'job' ? scopedJobProblems(workflowText(def.workflow), def.jobId, key) : scopedStepProblems(workflowText(def.workflow), def.jobId, key);
    assert.deepEqual(problems, [], key);
  }
});

test('CI-MIN-1: the two always-on jobs never read the classifier in their job-level condition, and the master job runs on a push only', () => {
  for (const id of ALWAYS_ON) {
    const ifProp = jobPropertyLines(jobById(id), CI_LINES).find((p) => p.key === 'if');
    assert.doesNotMatch(ifProp ? ifProp.valueInline : '', /needs\.inputs/, `${id} is always-on`);
  }
  assert.match(jobPropertyLines(jobById('master'), CI_LINES).find((p) => p.key === 'if').valueInline, /github\.event_name == 'push'/);
});

test('CI-MIN-1 attack: a scoped job that loses its if, its needs, or reads the wrong output is caught', () => {
  const yml = workflowText('ci.yml');
  assert.deepEqual(scopedJobProblems(yml, 'app', 'app'), []);
  const noIf = mutate(yml, "    if: (github.event_name == 'pull_request' && needs.inputs.outputs.app == 'true') || github.event_name == 'workflow_dispatch'\n", '');
  assert.ok(scopedJobProblems(noIf, 'app', 'app').some((p) => /no job-level if/.test(p)));
  const noNeeds = mutate(yml, "  schema:\n    name: schema\n    needs: inputs\n", '  schema:\n    name: schema\n');
  assert.ok(scopedJobProblems(noNeeds, 'schema', 'schema').some((p) => /needs must list inputs/.test(p)));
  const wrongOutput = mutate(yml, "needs.inputs.outputs.schema == 'true'", "needs.inputs.outputs.app == 'true'");
  assert.ok(scopedJobProblems(wrongOutput, 'schema', 'schema').some((p) => /must test needs\.inputs\.outputs\.schema/.test(p)));
  const noOutput = mutate(yml, '      schema: ${{ steps.classify.outputs.schema }}\n', '');
  assert.ok(scopedJobProblems(noOutput, 'schema', 'schema').some((p) => /does not output schema/.test(p)));
  const noStepIf = replaceStep(yml, 'master', 'next build', (t) => t.replace("        if: needs.inputs.outputs.master_build == 'true'\n", ''));
  assert.ok(scopedStepProblems(noStepIf, 'master', 'master_build').some((p) => /exactly one step guarded/.test(p)));
});

test('CI-MIN-1 attack: a fixture workflow whose scoped job has no inputs job, no needs and no if fails', () => {
  const fixture = ['name: X', 'on:', '  pull_request:', '    branches: [master]', 'jobs:', '  heavy:', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo hi', ''].join('\n');
  const problems = scopedJobProblems(fixture, 'heavy', 'heavy');
  assert.ok(problems.some((p) => /no inputs job/.test(p)));
  assert.ok(problems.some((p) => /needs must list inputs/.test(p)));
  assert.ok(problems.some((p) => /no job-level if/.test(p)));
});

test('CI-MIN-1: a master push still runs validate-commits, the consistency backstop, the HARD discrimination step and the scoped build, and never cancels them (the 2026-10-11 addendum)', () => {
  const on = CI_YML.slice(CI_YML.indexOf('\non:'), CI_YML.indexOf('\nconcurrency:'));
  assert.match(on, /^ {2}push:\n {4}branches:\n {6}- master\n/m);
  assert.match(on, /^ {2}pull_request:\n {4}branches:\n {6}- master\n/m);
  assert.match(CI_YML, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  const names = stepsOf('master').map((s) => s.match(/^ {6}- name:\s*(.*)$/m)[1]);
  for (const frag of ['Run discipline engine (push to master)', 'Memory gate', 'Consistency runner (push to master)', 'HARD - detector discrimination', 'next build']) assert.ok(names.some((n) => n.includes(frag)), `master runs: ${frag}`);
});

test('CI-MIN-1: every setup-node step in a workflow or action restores the npm cache from the one lockfile', () => {
  const files = listWorkflowAndActionFiles(REPO);
  assert.ok(files.length > 25);
  let steps = 0;
  for (const f of files) {
    const path = join(REPO, f.path ?? f);
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    lines.forEach((l, i) => {
      if (!/uses:\s*actions\/setup-node@/.test(l)) return;
      const ind = l.match(/^\s*/)[0].length + (/^\s*- /.test(l) ? 2 : 0);
      const block = [];
      for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || lines[j].match(/^\s*/)[0].length >= ind) && !/^\s*- /.test(lines[j]); j++) block.push(lines[j]);
      const text = block.join('\n');
      assert.match(text, /^\s*cache:\s*'?npm'?\s*$/m, `${path}:${i + 1} setup-node has no npm cache`);
      assert.match(text, /^\s*cache-dependency-path:\s*fsi-app\/package-lock\.json\s*$/m, `${path}:${i + 1} setup-node has no cache-dependency-path`);
      steps++;
    });
  }
  assert.ok(steps > 30, `${steps} setup-node steps checked`);
});
