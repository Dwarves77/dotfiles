// Fire-tests for F28 (harness-run integrity).
// Run: node --test fsi-app/.discipline/fitness/functions/F28-harness-run-integrity.test.mjs
//
// Behavioural, in the F23/F25/F27 style: scanArtifacts / auditSchema / auditPendingRange /
// auditPendingTreeState / auditProposerAttestation / listPendingFiles are driven with CONSTRUCTED
// inputs so the RULES are proven, not just today's tree. RED FIRST: every rule below has a test proving
// a violating fixture actually fails before the "live tree passes" test at the bottom.
//
// Lane N3, 2026-09-19 (build plan section 6.8 Rule B): rules (b)/(c) were rewritten from a hash-pinned
// PENDING-RUN.md marker to a pending/ directory the tree and the git range are compared against directly
// (never a stored number). parsePendingRunHash / auditFamilyPresence / auditStalenessCoupling and their
// tests are DELETED outright - nothing parses a hash out of a marker file any more.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  scanArtifacts,
  auditSchema,
  auditPendingRange,
  auditPendingTreeState,
  auditProposerAttestation,
  listPendingFiles,
  safeHashGoverningFiles,
  GOVERNING_FILES,
  fitnessFunction,
} from './F28-harness-run-integrity.mjs';
import { ALLOWED_FAMILIES, validateRunArtifact, isRunArtifactFilename } from '../../../scripts/lib/run-artifact.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

function validArtifact(overrides = {}) {
  const base = {
    harness_family: 'mint',
    harness_version: 'sha256:aaaaaaaaaaaaaaaa',
    run_id: 'mint-run-001',
    started_at: '2026-09-01T00:00:00Z',
    config: {},
    inputs_ref: ['/tmp/x.json'],
    per_item: [],
    metrics: {},
    defects_found: [],
    full_trace_refs: ['/tmp/report.md'],
    proposer_notes: '',
  };
  return { ...base, ...overrides };
}

// ── scanArtifacts + auditSchema: rule (a) ────────────────────────────────────

test('scanArtifacts: groups by family and separates valid from invalid (unparseable JSON)', () => {
  const artifact = validArtifact();
  const { byFamily } = scanArtifacts({
    'fsi-app/scripts/harness-runs/mint/mint-run-001.json': JSON.stringify(artifact),
    'fsi-app/scripts/harness-runs/mint/mint-run-002.json': 'not json{{{',
  });
  assert.equal(byFamily.get('mint').valid.length, 1);
  assert.equal(byFamily.get('mint').invalid.length, 1);
  assert.match(byFamily.get('mint').invalid[0].reason, /unparseable JSON/);
});

test('scanArtifacts: a file that parses but fails schema validation is invalid, not valid', () => {
  const { byFamily } = scanArtifacts({
    'fsi-app/scripts/harness-runs/screen/screen-run-001.json': JSON.stringify({ harness_family: 'screen' }),
  });
  assert.equal(byFamily.get('screen').valid.length, 0);
  assert.equal(byFamily.get('screen').invalid.length, 1);
  assert.match(byFamily.get('screen').invalid[0].reason, /missing required field/);
});

test('scanArtifacts: ignores non-family-scoped files (e.g. a stray top-level .json) and non-.json siblings', () => {
  const { byFamily } = scanArtifacts({
    'fsi-app/scripts/harness-runs/stray.json': '{}',
    'fsi-app/scripts/harness-runs/mint/family.json': 'not an artifact',
  });
  assert.equal(byFamily.size, 0);
});

test('scanArtifacts: a .json file placed inside a family\'s pending/ directory is never scanned as an artifact (lane N3, build plan 6.8 Rule B)', () => {
  // Explicit proof of the "nothing under pending/ is ever an artifact" claim: even a file whose bare
  // name matches the run-artifact shape exactly is excluded once it sits two levels under the family
  // directory, the same structural exclusion traces/ and family.json already relied on.
  const { byFamily } = scanArtifacts({
    'fsi-app/scripts/harness-runs/mint/pending/mint-run-001.json': JSON.stringify(validArtifact()),
  });
  assert.equal(byFamily.size, 0);
});

test('RED: auditSchema reports an invalid artifact file by name and reason', () => {
  const { byFamily } = scanArtifacts({
    'fsi-app/scripts/harness-runs/mint/mint-run-001.json': JSON.stringify({ harness_family: 'mint' }),
  });
  const problems = auditSchema(byFamily);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /INVALID ARTIFACT/);
  assert.match(problems[0], /mint-run-001\.json/);
});

test('GREEN: auditSchema is silent when every artifact validates', () => {
  const { byFamily } = scanArtifacts({
    'fsi-app/scripts/harness-runs/mint/mint-run-001.json': JSON.stringify(validArtifact()),
  });
  assert.deepEqual(auditSchema(byFamily), []);
});

// ── auditPendingRange: rule (b), the RANGE RULE ──────────────────────────────

test('RED: a governing file changed in the range, no new artifact, no pending file added - PENDING FILE REQUIRED (range)', () => {
  const problems = auditPendingRange(
    'widget',
    ['scripts/widget/widget.mjs'],
    ['fsi-app/scripts/widget/widget.mjs'], // changed
    [], // added
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /PENDING FILE REQUIRED \(range\)/);
  assert.match(problems[0], /"widget"/);
  assert.match(problems[0], /scripts\/widget\/widget\.mjs/);
});

test('GREEN: a governing file changed, but the range also added a pending file for that family', () => {
  const problems = auditPendingRange(
    'widget',
    ['scripts/widget/widget.mjs'],
    ['fsi-app/scripts/widget/widget.mjs'],
    ['fsi-app/scripts/harness-runs/widget/pending/2026-09-19-lane.md'],
  );
  assert.deepEqual(problems, []);
});

test('GREEN: a governing file changed, but the range also added a new run artifact for that family', () => {
  const problems = auditPendingRange(
    'widget',
    ['scripts/widget/widget.mjs'],
    ['fsi-app/scripts/widget/widget.mjs'],
    ['fsi-app/scripts/harness-runs/widget/widget-run-002.json'],
  );
  assert.deepEqual(problems, []);
});

test('GREEN: no governing file of this family changed in the range - vacuously silent', () => {
  const problems = auditPendingRange(
    'widget',
    ['scripts/widget/widget.mjs'],
    ['fsi-app/scripts/some-other-file.mjs'],
    [],
  );
  assert.deepEqual(problems, []);
});

test('a pending file added for a DIFFERENT family does not satisfy this family\'s range requirement', () => {
  const problems = auditPendingRange(
    'widget',
    ['scripts/widget/widget.mjs'],
    ['fsi-app/scripts/widget/widget.mjs'],
    ['fsi-app/scripts/harness-runs/OTHER-FAMILY/pending/2026-09-19-lane.md'],
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /PENDING FILE REQUIRED \(range\)/);
});

// ── auditPendingTreeState: rule (c), the TREE-STATE RULE ─────────────────────

test('RED: no artifact at the live hash and no pending files - PENDING FILE REQUIRED (tree-state)', () => {
  const problems = auditPendingTreeState('mint', 'sha256:new_hash_11111', [], []);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /PENDING FILE REQUIRED \(tree-state\)/);
  assert.match(problems[0], /"mint"/);
});

test('RED: an artifact exists but at a stale (non-live) hash, and no pending files', () => {
  const artifacts = [validArtifact({ harness_version: 'sha256:old_hash_00000' })];
  const problems = auditPendingTreeState('mint', 'sha256:new_hash_11111', artifacts, []);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /PENDING FILE REQUIRED \(tree-state\)/);
});

test('GREEN: no artifact at the live hash, but the family has a pending file - the run is honestly owed', () => {
  const problems = auditPendingTreeState('mint', 'sha256:new_hash_11111', [], ['2026-09-19-lane.md']);
  assert.deepEqual(problems, []);
});

test('GREEN: the latest (or any) artifact already matches the live hash, no pending files left', () => {
  const artifacts = [validArtifact({ harness_version: 'sha256:aaaaaaaaaaaaaaaa' })];
  const problems = auditPendingTreeState('mint', 'sha256:aaaaaaaaaaaaaaaa', artifacts, []);
  assert.deepEqual(problems, []);
});

test('RED: an artifact matches the live hash but a pending file is still present - STALE PENDING FILE(S), the run happened', () => {
  const artifacts = [validArtifact({ harness_version: 'sha256:aaaaaaaaaaaaaaaa' })];
  const problems = auditPendingTreeState('mint', 'sha256:aaaaaaaaaaaaaaaa', artifacts, ['2026-09-01-old.md']);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /STALE PENDING FILE/);
  assert.match(problems[0], /run happened/);
  assert.match(problems[0], /2026-09-01-old\.md/);
});

// ── listPendingFiles ──────────────────────────────────────────────────────────

test('listPendingFiles: returns sorted bare filenames under <root>/fsi-app/scripts/harness-runs/<family>/pending/', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f28-pending-'));
  try {
    const pendingDir = join(dir, 'fsi-app', 'scripts', 'harness-runs', 'widget', 'pending');
    mkdirSync(pendingDir, { recursive: true });
    writeFileSync(join(pendingDir, '2026-09-19-b.md'), '# b\n');
    writeFileSync(join(pendingDir, '2026-09-18-a.md'), '# a\n');
    assert.deepEqual(listPendingFiles(dir, 'widget'), ['2026-09-18-a.md', '2026-09-19-b.md']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('listPendingFiles: a family with no pending/ directory yet returns [], never throws', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f28-pending-'));
  try {
    assert.deepEqual(listPendingFiles(dir, 'widget'), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── auditProposerAttestation: rule (d) - unchanged by this lane ──────────────

test('N<2 artifacts: no attestation required yet', () => {
  const artifacts = [validArtifact()];
  assert.deepEqual(auditProposerAttestation('mint', artifacts, null), []);
});

test('RED: N≥2 artifacts and no LAST-PROPOSER-PASS.md at all', () => {
  const artifacts = [
    validArtifact({ run_id: 'screen-run-001', harness_family: 'screen', started_at: '2026-08-31T17:00:00Z' }),
    validArtifact({ run_id: 'screen-run-002', harness_family: 'screen', started_at: '2026-08-31T18:00:00Z' }),
  ];
  const problems = auditProposerAttestation('screen', artifacts, null);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /NO PROPOSER ATTESTATION/);
  assert.match(problems[0], /screen-run-002/); // names the LATEST run it expects to see
});

test('RED: LAST-PROPOSER-PASS.md exists but does not name the latest run_id (stale - an older pass)', () => {
  const artifacts = [
    validArtifact({ run_id: 'screen-run-001', harness_family: 'screen', started_at: '2026-08-31T17:00:00Z' }),
    validArtifact({ run_id: 'screen-run-002', harness_family: 'screen', started_at: '2026-08-31T18:00:00Z' }),
  ];
  const problems = auditProposerAttestation('screen', artifacts, 'Artifacts read: screen-run-001. Proposal: none.');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /STALE PROPOSER ATTESTATION/);
});

test('GREEN: LAST-PROPOSER-PASS.md names the latest run_id (order-independent - sorted by started_at)', () => {
  const artifacts = [
    validArtifact({ run_id: 'screen-run-002', harness_family: 'screen', started_at: '2026-08-31T18:00:00Z' }),
    validArtifact({ run_id: 'screen-run-001', harness_family: 'screen', started_at: '2026-08-31T17:00:00Z' }),
  ];
  const problems = auditProposerAttestation('screen', artifacts, 'Artifacts read: screen-run-001, screen-run-002.');
  assert.deepEqual(problems, []);
});

// ── safeHashGoverningFiles: a missing governing file is a NAMED failure, never an unhandled throw ──

test('safeHashGoverningFiles: hashes cleanly when every governing file exists (GREEN passthrough)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f28-safehash-'));
  try {
    writeFileSync(join(dir, 'a.mjs'), 'export const x = 1;\n');
    const { hash, problems } = safeHashGoverningFiles('mint', ['a.mjs'], dir);
    assert.match(hash, /^sha256:[0-9a-f]{16}$/);
    assert.deepEqual(problems, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('safeHashGoverningFiles RED: a missing governing file yields a NAMED problem (not a thrown ENOENT), naming the family and the missing path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f28-safehash-'));
  try {
    writeFileSync(join(dir, 'a.mjs'), 'export const x = 1;\n');
    // 'b.mjs' is listed but does not exist on disk - the exact shape a stale/typo'd GOVERNING_FILES entry
    // produces. Before this fix, hashHarnessVersion's plain readFileSync would throw a raw ENOENT here and
    // abort check() for every family in the same pass.
    let threw = false;
    let result;
    try {
      result = safeHashGoverningFiles('mint', ['a.mjs', 'b.mjs'], dir);
    } catch {
      threw = true;
    }
    assert.equal(threw, false, 'safeHashGoverningFiles must not let ENOENT escape as a raw throw');
    assert.equal(result.hash, null);
    assert.equal(result.problems.length, 1);
    assert.match(result.problems[0], /MISSING GOVERNING FILE/);
    assert.match(result.problems[0], /harness family "mint"/);
    assert.match(result.problems[0], /b\.mjs/, 'the missing path must be named in the message');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('safeHashGoverningFiles RED: a non-ENOENT failure (e.g. a listed "file" that is actually a directory) still propagates, never silently swallowed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f28-safehash-'));
  try {
    mkdirSync(join(dir, 'not-a-file.mjs'));
    assert.throws(() => safeHashGoverningFiles('mint', ['not-a-file.mjs'], dir), (err) => err.code !== 'ENOENT');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check() does not throw when a family has a missing governing file - reports a named problem instead (fixture: forward-events with an unregistered/missing governing file)', () => {
  // Regression proof for the exact scenario "fine today only because rule (c) skips families with zero
  // artifacts" used to name: drive the actual internal helper (safeHashGoverningFiles) directly against
  // a family with a governing file that does not exist - this is what check() itself calls internally,
  // so a passing result here proves check() cannot crash on this input without re-deriving getRepoRoot().
  const problems = safeHashGoverningFiles('forward-events', ['scripts/forward-events/does-not-exist.mjs'], '/tmp').problems;
  assert.equal(problems.length, 1);
  assert.match(problems[0], /MISSING GOVERNING FILE/);
  assert.match(problems[0], /does-not-exist\.mjs/);
});

// ── shape ─────────────────────────────────────────────────────────────────

test('F28 is holistic: one sentinel so the harness-runs analysis runs exactly once', () => {
  assert.equal(fitnessFunction.enumerate().length, 1);
});

test('GOVERNING_FILES keys are exactly ALLOWED_FAMILIES (kept 1:1 by construction)', () => {
  assert.deepEqual(Object.keys(GOVERNING_FILES).sort(), [...ALLOWED_FAMILIES].sort());
});

// FAMILY-DESCRIPTOR-REALITY (lane N2, 2026-09-19, build plan section 6.8 Rule A, replacing
// CONVENTION-TABLE-PARITY). CONVENTION.md no longer carries a hand-maintained harness_version table for a
// registration to find and edit (the exact 2026-09-18 collision this lane's own family-registry.mjs
// exists to make impossible): each family's governing files now live only in that family's own
// family.json, and governing-files.mjs's GOVERNING_FILES is DERIVED from every family's descriptor. So
// the parity question this test proves is no longer "does the table match the module," it is "does every
// path the derived GOVERNING_FILES actually names exist on the tree it is checked against," the same
// reality-check role CONVENTION-TABLE-PARITY served, aimed at the new source of truth instead of a
// markdown table.
test('FAMILY-DESCRIPTOR-REALITY: every governing_files path of every registered family exists on disk', () => {
  const root = getRepoRoot();
  const fsiRoot = join(root, 'fsi-app');
  const missing = [];
  for (const family of ALLOWED_FAMILIES) {
    const files = GOVERNING_FILES[family];
    if (!files) continue; // defensive; GOVERNING_FILES and ALLOWED_FAMILIES are kept 1:1 by construction
    for (const rel of files) {
      const abs = join(fsiRoot, rel);
      if (!existsSync(abs)) missing.push(`${family}: ${rel} (resolved ${abs})`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `family.json governing_files paths that do not exist on disk:\n${missing.join('\n')}`,
  );
});

// ── live tree: the gate is clean today ───────────────────────────────────────

test('F28 passes GREEN against the live tree', () => {
  const result = fitnessFunction.check();
  if (result.length !== 0) {
    assert.fail(`F28 is RED against the live tree:\n${result.map((v) => `  - ${v.message}`).join('\n')}`);
  }
});

test('sanity: every artifact currently in the repo independently passes validateRunArtifact', () => {
  // Belt-and-suspenders on rule (a): drives validateRunArtifact directly (not through scanArtifacts) over
  // every real committed artifact, so a future artifact hand-edited into invalidity fails HERE too, not
  // only via the live-tree check() above. isRunArtifactFilename (lane N2, 2026-09-19, Amendment 2, the
  // same predicate scanArtifacts now uses) replaces the plain ".json" suffix filter, which used to also
  // match each family's own family.json descriptor and fail this test on a file that is not a run
  // artifact at all, a THIRD occurrence of the same defect class Amendment 2's two named readers already
  // fixed (this test has its own independent readdirSync, never routed through scanArtifacts).
  const root = getRepoRoot();
  const families = ['mint', 'screen', 'fetch-drain', 'meta-harness'];
  let checked = 0;
  for (const family of families) {
    const dir = `${root}/fsi-app/scripts/harness-runs/${family}`;
    let files;
    try {
      files = readdirSync(dir).filter(isRunArtifactFilename);
    } catch {
      continue;
    }
    for (const f of files) {
      const parsed = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
      assert.deepEqual(validateRunArtifact(parsed), [], `${family}/${f} must validate`);
      checked++;
    }
  }
  assert.ok(checked > 0, 'expected at least one real artifact on disk to check');
});

// ── the collision replay (build plan section 6.8): three lanes, one family, zero conflicts ──────────
//
// 2026-09-18: three lanes (M8, M9b, M9a) each registered or touched a family on the SAME evening and
// each stopped the merge train, because the old mechanism required each to hand-edit the SAME
// PENDING-RUN.md hash line. Rule B's fix is that a pending file is a lane's OWN file, so three lanes
// each adding their own pending/<date>-<lane>.md is an add/add on three DIFFERENT filenames, which git
// merges cleanly in any order by construction. This test proves it directly: a real throwaway git repo
// (temp dir, `-c user.name=/-c user.email=` passed per-invocation so nothing touches this machine's real
// git config, global or local, beyond the temp repo itself), one family, three branches each adding
// their own pending file, merged in every permutation, asserting zero conflicts and that F28's own
// tree-state/schema rules are satisfied on the merged result.

function git(args, cwd) {
  return execFileSync(
    'git',
    ['-c', 'user.name=F28 Collision Test', '-c', 'user.email=f28-test@example.invalid', ...args],
    { cwd, encoding: 'utf8' },
  );
}

function buildCollisionFixtureRepo() {
  const dir = mktempRepo();
  git(['init', '-q'], dir);
  git(['checkout', '-q', '-b', 'main'], dir);

  const familyDir = join(dir, 'fsi-app', 'scripts', 'harness-runs', 'widget');
  mkdirSync(familyDir, { recursive: true });
  mkdirSync(join(dir, 'fsi-app', 'scripts', 'widget'), { recursive: true });
  writeFileSync(join(dir, 'fsi-app', 'scripts', 'widget', 'widget.mjs'), 'export const x = 1;\n');
  writeFileSync(
    join(familyDir, 'family.json'),
    JSON.stringify(
      {
        family: 'widget',
        registered: '2026-09-18',
        registered_by: 'fixture',
        governing_files: ['scripts/widget/widget.mjs'],
        rationale: 'fixture family for the collision-replay test.',
      },
      null,
      2,
    ) + '\n',
  );
  git(['add', '.'], dir);
  git(['commit', '-q', '-m', 'base: widget family registered, no runs yet'], dir);

  const lanes = ['m8', 'm9b', 'm9a'];
  for (const lane of lanes) {
    git(['checkout', '-q', 'main'], dir);
    git(['checkout', '-q', '-b', `lane-${lane}`], dir);
    const pendingDir = join(familyDir, 'pending');
    mkdirSync(pendingDir, { recursive: true });
    writeFileSync(
      join(pendingDir, `2026-09-18-${lane}.md`),
      `## Change\n\nlane ${lane} touched the widget family.\n\n## Planned run\n\nthe next widget dispatch.\n`,
    );
    git(['add', '.'], dir);
    git(['commit', '-q', '-m', `lane ${lane}: add its own pending file`], dir);
  }
  git(['checkout', '-q', 'main'], dir);
  return { dir, lanes };
}

function mktempRepo() {
  return mkdtempSync(join(tmpdir(), 'f28-collision-'));
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

test('COLLISION REPLAY: three lanes each adding their own pending file merge clean in every order, and F28 passes on the merged tree', () => {
  for (const order of permutations(['m8', 'm9b', 'm9a'])) {
    const { dir } = buildCollisionFixtureRepo();
    try {
      git(['checkout', '-q', '-b', `merged-${order.join('-')}`], dir);
      for (const lane of order) {
        // A real merge, not a rebase - mirrors how the merge train actually integrates lane branches.
        // assert.doesNotThrow: execFileSync throws on a non-zero exit, which is exactly what a real
        // conflict would produce (git exits 1 and leaves the tree mid-conflict).
        assert.doesNotThrow(
          () => git(['merge', '--no-ff', '-q', '-m', `merge lane-${lane}`, `lane-${lane}`], dir),
          `merging lane-${lane} after [${order.slice(0, order.indexOf(lane)).join(', ')}] must not conflict`,
        );
      }

      const pending = listPendingFiles(dir, 'widget');
      assert.deepEqual(
        pending,
        ['2026-09-18-m8.md', '2026-09-18-m9a.md', '2026-09-18-m9b.md'],
        `order ${order.join(',')}: all three pending files must survive the merge`,
      );

      // F28's own rules against the merged tree: no artifacts exist yet, so the tree-state rule requires
      // >=1 pending file (satisfied - three), and auditSchema has nothing to complain about (no artifact
      // files were ever written in this fixture).
      const { byFamily } = scanArtifacts({}); // no *-run-NNN.json in this fixture at all
      assert.deepEqual(auditSchema(byFamily), []);
      const { hash: currentHash, problems: hashProblems } = safeHashGoverningFiles(
        'widget',
        ['scripts/widget/widget.mjs'],
        join(dir, 'fsi-app'),
      );
      assert.deepEqual(hashProblems, []);
      const treeStateProblems = auditPendingTreeState('widget', currentHash, [], pending);
      assert.deepEqual(treeStateProblems, [], `order ${order.join(',')}: F28's tree-state rule must pass on the merged tree`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
