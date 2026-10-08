// F50-loop-wiring.test.mjs - attack tests for lane M9a (brief-m9a.md item 3's attack list): an enforced
// edge whose yml lacks the workflow_run line is caught; an enforced-fired hop whose family has only
// manual artifacts is caught; a wrong name is caught. Plus a live proof that today's real tree (this
// lane's own landing) reports zero violations, matching the acceptance criterion in brief-m9a.md
// ("Reachable: F50 in the manifest and run by the fitness runner ... with 0 violations and 'hops not yet
// enforced: N'").
//
// node:test + node:assert/strict, no npm deps.
// Run: node --test .discipline/fitness/functions/F50-loop-wiring.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  extractWorkflowRunNames,
  hasWorkflowRunEdge,
  familyFiredStatus,
  readFiredEvidence,
  fitnessFunction,
} from './F50-loop-wiring.mjs';

// ── pure helper: extractWorkflowRunNames / hasWorkflowRunEdge ──────────────────────────────────────

test('extractWorkflowRunNames reads the inline-array form every workflow file in this repo actually uses', () => {
  const yml = 'on:\n  workflow_run:\n    workflows: ["Source sweep", "Data producers"]\n    types: [completed]\n';
  assert.deepEqual(extractWorkflowRunNames(yml), ['Source sweep', 'Data producers']);
});

test('extractWorkflowRunNames reads a multi-line block-list form too (documented bonus, not the primary shape)', () => {
  const yml = 'on:\n  workflow_run:\n    workflows:\n      - "Source sweep"\n      - "Data producers"\n    types: [completed]\n';
  assert.deepEqual(extractWorkflowRunNames(yml), ['Source sweep', 'Data producers']);
});

test('extractWorkflowRunNames returns null when there is no workflow_run trigger at all', () => {
  const yml = 'on:\n  workflow_dispatch:\n    inputs: {}\n';
  assert.equal(extractWorkflowRunNames(yml), null);
});

test('ATTACK: a consumer yml that lacks the workflow_run line does not satisfy hasWorkflowRunEdge', () => {
  const ymlWithoutEdge = 'on:\n  workflow_dispatch:\n    inputs:\n      mode:\n        type: choice\n';
  assert.equal(hasWorkflowRunEdge(ymlWithoutEdge, 'Source sweep'), false);
});

test('ATTACK: a wrong producer name is caught (the real edge names a different workflow)', () => {
  const yml = 'on:\n  workflow_run:\n    workflows: ["Source sweep"]\n    types: [completed]\n';
  assert.equal(hasWorkflowRunEdge(yml, 'Source Sweep (wrong case)'), false);
  assert.equal(hasWorkflowRunEdge(yml, 'Source sweep'), true);
});

// ── pure helper: familyFiredStatus ──────────────────────────────────────────────────────────────────

function withTempFamily(family, artifacts, fn) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'f50-family-'));
  const dir = join(repoRoot, 'fsi-app', 'scripts', 'harness-runs', family);
  mkdirSync(dir, { recursive: true });
  artifacts.forEach((artifact, i) => {
    const runId = `${family}-run-${String(i + 1).padStart(3, '0')}`;
    writeFileSync(join(dir, `${runId}.json`), JSON.stringify({ ...artifact, run_id: runId }));
  });
  try {
    return fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

test('familyFiredStatus: no directory at all', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'f50-nofam-'));
  try {
    assert.deepEqual(familyFiredStatus(repoRoot, 'nonexistent-family'), {
      dirExists: false,
      hasFiredArtifact: false,
    });
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('ATTACK: an enforced-fired hop whose family has only manual artifacts is caught', () => {
  withTempFamily('mint', [{ trigger: 'manual' }, { trigger: 'manual' }], (repoRoot) => {
    const status = familyFiredStatus(repoRoot, 'mint');
    assert.equal(status.dirExists, true);
    assert.equal(status.hasFiredArtifact, false);
  });
});

test('familyFiredStatus: true once one artifact carries trigger workflow_run, even among manual ones', () => {
  withTempFamily('mint', [{ trigger: 'manual' }, { trigger: 'workflow_run' }], (repoRoot) => {
    const status = familyFiredStatus(repoRoot, 'mint');
    assert.equal(status.hasFiredArtifact, true);
  });
});

test('familyFiredStatus: true for trigger workflow_run_forced_dry too (lane CHAINED-DRY-GUARD, 2026-09-29 -- a real workflow_run firing that build mode downgraded to dry, still proof of a fired chain)', () => {
  withTempFamily('mint', [{ trigger: 'manual' }, { trigger: 'workflow_run_forced_dry' }], (repoRoot) => {
    const status = familyFiredStatus(repoRoot, 'mint');
    assert.equal(status.hasFiredArtifact, true);
  });
});

test('familyFiredStatus: an artifact with no trigger field at all (pre-this-lane artifacts) does not count as fired', () => {
  withTempFamily('mint', [{ metrics: {} }], (repoRoot) => {
    const status = familyFiredStatus(repoRoot, 'mint');
    assert.equal(status.hasFiredArtifact, false);
  });
});

test('familyFiredStatus: a corrupt JSON file is skipped, not thrown on', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'f50-corrupt-'));
  const dir = join(repoRoot, 'fsi-app', 'scripts', 'harness-runs', 'mint');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mint-run-001.json'), '{ not valid json');
  try {
    assert.doesNotThrow(() => familyFiredStatus(repoRoot, 'mint'));
    assert.equal(familyFiredStatus(repoRoot, 'mint').hasFiredArtifact, false);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

// ── LIVE: the real tree, today, reports zero violations ────────────────────────────────────────────

// GATE-4 (2026-10-07): this test runs the fitness function against the live repo, which the Fitness
// functions job already does on every pull request (gate evaluation B section 7.6: it failed the unit-test
// step while the gate itself passed in the fitness job). It stays runnable here with FITNESS_LIVE_TESTS=1.
const LIVE_TREE = process.env.FITNESS_LIVE_TESTS === '1' ? {} : { skip: 'live-tree self-test, run by the Fitness functions job; set FITNESS_LIVE_TESTS=1 to run it here' };

test('LIVE: fitnessFunction.check() over the real committed tree returns zero violations', LIVE_TREE, () => {
  const result = fitnessFunction.check();
  assert.deepEqual(
    result,
    [],
    `expected 0 violations, got: ${JSON.stringify(result, null, 2)}`,
  );
});

test('enumerate() returns exactly one sentinel path (holistic pattern, same as F23/F25/F27/F47)', () => {
  assert.deepEqual(fitnessFunction.enumerate(), ['fsi-app/.discipline/governance/loop-manifest.mjs']);
});

// ── LANE GATES-1: firing evidence from the committed evidence file (chained runs land in harness_runs) ──

const HOP = {
  id: 'h-one',
  producer: { file: '.github/workflows/a.yml', name: 'A' },
  consumer: { file: '.github/workflows/b.yml', name: 'B' },
  trigger: 'workflow_run',
  family: 'fam-b',
  enforceEdge: false,
  enforceFired: true,
  note: 'fixture',
};
const NO_ARTIFACT = () => ({ dirExists: true, hasFiredArtifact: false });
const entry = (over = {}) => ({
  hop: 'h-one', family: 'fam-b', run_id: 'fam-b-run-001', github_run_id: '1', upstream_run_id: '0',
  started_at: '2026-10-03T00:00:00Z', trigger: 'workflow_run', ...over,
});
// The ledger export the entries are checked against (lane GATE-8: a firing claim is proof only when its run id
// resolves there). By default the fixture ledger holds a row for every entry in the evidence text, so the tests
// below that are about OTHER properties of the entries keep testing those; the GATE-8 tests pass their own ledger.
const rowsOf = (evidenceText) => {
  try { return (JSON.parse(evidenceText).entries || []).map((e) => ({ family: e.family, run_id: e.run_id, trigger: e.trigger })); } catch { return []; }
};
const run = (evidenceText, hops = [HOP], familyStatus = NO_ARTIFACT, ledgerRows = rowsOf(evidenceText)) =>
  fitnessFunction.check('x', '', { hops, evidenceText, familyStatus, ledgerRows, repoRoot: '/none', log: () => {} });

test('GATES-1: an enforceFired hop with no artifact and no evidence entry is a violation (the old rule)', () => {
  const v = run(JSON.stringify({ entries: [] }));
  assert.equal(v.length, 1);
  assert.match(v[0].message, /enforceFired is true but no artifact/);
});

test('GATES-1: an evidence entry for the hop satisfies enforceFired with no committed artifact', () => {
  assert.deepEqual(run(JSON.stringify({ entries: [entry()] })), []);
});

test('GATES-1: workflow_run_forced_dry evidence counts as fired', () => {
  assert.deepEqual(run(JSON.stringify({ entries: [entry({ trigger: 'workflow_run_forced_dry' })] })), []);
});

test('GATES-1: a committed artifact still satisfies enforceFired with no evidence file at all (today rule kept)', () => {
  assert.deepEqual(run(null, [HOP], () => ({ dirExists: true, hasFiredArtifact: true })), []);
});

test('ATTACK: an evidence entry for an unknown hop fails F50', () => {
  const v = run(JSON.stringify({ entries: [entry({ hop: 'no-such-hop' })] }), [{ ...HOP, enforceFired: false }]);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /unknown hop "no-such-hop"/);
});

test('ATTACK: an evidence entry whose family is not the hop family fails F50 and does not count as fired', () => {
  const v = run(JSON.stringify({ entries: [entry({ family: 'other-family' })] }));
  assert.ok(v.some((x) => /names family "other-family"/.test(x.message)));
  assert.ok(v.some((x) => /enforceFired is true but no artifact/.test(x.message)), 'the mismatched entry must not satisfy the hop');
});

test('ATTACK: an evidence entry with a non-fired trigger fails F50', () => {
  const v = run(JSON.stringify({ entries: [entry({ trigger: 'manual' })] }));
  assert.ok(v.some((x) => /carries trigger "manual"/.test(x.message)));
});

test('ATTACK: a corrupt or shapeless evidence file fails F50', () => {
  assert.match(run('{ nope')[0].message, /not valid JSON/);
  assert.ok(run(JSON.stringify({ rows: [] })).some((x) => /no "entries" array/.test(x.message)));
});

test('readFiredEvidence: absent file yields no fired hops and no problems', () => {
  const r = readFiredEvidence(null, [HOP]);
  assert.equal(r.firedHopIds.size, 0);
  assert.deepEqual(r.problems, []);
});

// lane CHAIN-1 (2026-10-07): a dispatchFallback hop accepts a workflow_dispatch evidence entry that carries an
// upstream_run_id; a hop without the flag, or an entry without the id, is still a problem.
test('readFiredEvidence: a workflow_dispatch entry with upstream_run_id fires a dispatchFallback hop only', () => {
  const fb = { ...HOP, dispatchFallback: true };
  const entry = (over) => JSON.stringify({ entries: [{ hop: HOP.id, family: HOP.family, run_id: 'r', trigger: 'workflow_dispatch', upstream_run_id: '9', ...over }] });
  assert.equal(readFiredEvidence(entry({}), [fb]).firedHopIds.has(HOP.id), true);
  assert.equal(readFiredEvidence(entry({}), [HOP]).problems.length, 1);
  assert.equal(readFiredEvidence(entry({ upstream_run_id: null }), [fb]).problems.length, 1);
});

// ---- lane GATE-8 (2026-10-08): the honest forms the AUD-AT-4 register found ACCEPTED, red then green ----

test('F50 B6-25: a hand-written run artifact with trigger workflow_run, whose run id is in no ledger row, does not satisfy enforceFired', () => {
  const artifactStatus = (repoRoot, family, resolves) => ({
    dirExists: true,
    hasFiredArtifact: resolves === null ? true : resolves(family, 'fam-b-run-001'),
  });
  const forged = run(null, [HOP], artifactStatus, []);
  assert.equal(forged.length, 1);
  assert.match(forged[0].message, /enforceFired is true/);
  // the same artifact with a real ledger row for that run id satisfies it
  const real = run(null, [HOP], artifactStatus, [{ family: 'fam-b', run_id: 'fam-b-run-001', trigger: 'workflow_run' }]);
  assert.deepEqual(real, []);
});

test('F50 B6-25: familyFiredStatus passes the artifact run id to the resolver and counts the artifact only when it resolves', () => {
  withTempFamily('fam-z', [{ trigger: 'workflow_run' }], (repoRoot) => {
    assert.equal(familyFiredStatus(repoRoot, 'fam-z').hasFiredArtifact, true); // no resolver: the old behaviour
    assert.equal(familyFiredStatus(repoRoot, 'fam-z', () => false).hasFiredArtifact, false);
    assert.equal(familyFiredStatus(repoRoot, 'fam-z', (f, id) => f === 'fam-z' && id === 'fam-z-run-001').hasFiredArtifact, true);
  });
});

test('F50 B6-26: an evidence entry for a run id that never existed does not satisfy enforceFired, and the message names the id', () => {
  const v = run(JSON.stringify({ entries: [entry({ run_id: 'fam-b-run-999' })] }), [HOP], NO_ARTIFACT, []);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /unresolved run id\(s\): fam-b-run-999/);
  assert.match(v[0].message, /harness-ledger-export\.json/);
});

test('F50 B6-26: an entry whose ledger row has a non-fired trigger, or another family, does not resolve', () => {
  const e = JSON.stringify({ entries: [entry()] });
  assert.equal(run(e, [HOP], NO_ARTIFACT, [{ family: 'fam-b', run_id: 'fam-b-run-001', trigger: 'manual' }]).length, 1);
  assert.equal(run(e, [HOP], NO_ARTIFACT, [{ family: 'other', run_id: 'fam-b-run-001', trigger: 'workflow_run' }]).length, 1);
  assert.deepEqual(run(e, [HOP], NO_ARTIFACT, [{ family: 'fam-b', run_id: 'fam-b-run-001', trigger: 'workflow_run' }]), []);
});

test('F50 B6-27: a workflow_run block written inside a run: heredoc, or a comment, is not the trigger edge', () => {
  const faked = [
    'name: Consumer',
    'on:',
    '  workflow_dispatch:',
    'jobs:',
    '  a:',
    '    steps:',
    '      - run: |',
    '          cat <<EOF > x.yml',
    '          on:',
    '            workflow_run:',
    '              workflows: ["Source sweep"]',
    '          EOF',
    '      # workflow_run:',
    '      #   workflows: ["Source sweep"]',
  ].join('\n');
  assert.equal(extractWorkflowRunNames(faked), null);
  assert.equal(hasWorkflowRunEdge(faked, 'Source sweep'), false);
});

test('F50 B6-46: the workflow_run trigger in flow style, scalar style and list style is read', () => {
  assert.deepEqual(extractWorkflowRunNames('on: { workflow_run: { workflows: ["A", "B"], types: [completed] } }\n'), ['A', 'B']);
  assert.deepEqual(extractWorkflowRunNames('on:\n  workflow_run: { workflows: [A] }\n'), ['A']);
  assert.deepEqual(extractWorkflowRunNames('on: workflow_run\n'), []);
  assert.deepEqual(extractWorkflowRunNames('on: [push, workflow_run]\n'), []);
  assert.equal(extractWorkflowRunNames('on: [push, workflow_dispatch]\n'), null);
});

test('F50: the live loop-fired-evidence entries resolve against the committed ledger export, or their hop is not enforced', async () => {
  const { LOOP_HOPS } = await import('../../governance/loop-manifest.mjs');
  const { readHarnessLedgerExport } = await import('../../../scripts/lib/run-artifact.mjs');
  const { getRepoRoot } = await import('../../lib/context.mjs');
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const evPath = join(getRepoRoot(), 'fsi-app/.discipline/governance/loop-fired-evidence.json');
  const entries = existsSync(evPath) ? JSON.parse(readFileSync(evPath, 'utf8')).entries : [];
  const rows = readHarnessLedgerExport(getRepoRoot()).rows;
  for (const hop of LOOP_HOPS.filter((h) => h.enforceFired)) {
    const proofs = entries.filter((e) => e.hop === hop.id && rows.some((r) => r.family === e.family && String(r.run_id) === String(e.run_id)));
    assert.ok(proofs.length > 0, `${hop.id} is enforceFired but no evidence entry resolves in the ledger export; refresh the export or leave enforceFired false`);
  }
});
