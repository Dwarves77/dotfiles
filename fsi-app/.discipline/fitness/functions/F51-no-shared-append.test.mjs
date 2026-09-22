// Red-then-green for F51 (no-shared-append, plan 6.8, lane N6). Each of the five checks is proven by
// attack (rule 15): a violation is planted in a throwaway fixture, the check catches it, the violation
// is removed, the check passes. The final test replays the 2026-09-18 lane set (M8, M9b, M9a, M1, W10-A)
// merging in every order and asserts zero conflicts, the acceptance that closes plan 6.8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { getRepoRoot } from '../../lib/context.mjs';
import { FAMILIES } from '../../../scripts/harness-runs/family-registry.mjs';
import {
  scanHandEntries, scanStoredMeasurements, findDuplicateIds, evaluateIdDuplicates, countHotspots,
  parseFirstParentLog, parseFirstParentLogDetailed, evaluateConcurrencyViolations, resolveForkPoint,
  classifyConcurrency, underEntryDir,
  runCheck1, runCheck2, runCheck3, runCheck4, runCheck5,
  ZERO_CEILING_ALLOWLIST, MIGRATION_DUPLICATE_ALLOWLIST, HOTSPOT_ALLOWLIST, HOTSPOT_WINDOW_ANCHOR_COMMIT,
  fitnessFunction,
} from './F51-no-shared-append.mjs';

function tmpRepo(prefix) {
  const tmp = mkdtempSync(join(tmpdir(), prefix));
  const git = (args) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', 'user.email', `${prefix}@test.local`]);
  git(['config', 'user.name', prefix]);
  git(['config', 'commit.gpgsign', 'false']);
  return { tmp, git };
}

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECK 1: converted files stay derived. Pure, no fs.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('check 1 RED: a hand-written "import { fitnessFunction as F" line in manifest.mjs is caught', () => {
  const files = [{
    path: 'fsi-app/.discipline/fitness/manifest.mjs',
    text: "import { fitnessFunction as F1 } from './functions/F1-old.mjs';\nexport const fitnessFunctions = [F1];\n",
  }];
  const v = scanHandEntries(files, { familyNames: [] });
  assert.equal(v.length, 2, 'both the import line and the array-literal line should be caught');
  assert.ok(v.some((x) => x.message.includes('hand-written "import')));
  assert.ok(v.some((x) => x.message.includes('array literal of fitness-function identifiers')));
});

test('check 1 GREEN: the real (derived) manifest.mjs shape has neither pattern', () => {
  const files = [{
    path: 'fsi-app/.discipline/fitness/manifest.mjs',
    text: "export function listFunctionFiles(dir) { return readdirSync(dir); }\nexport const fitnessFunctions = await loadAll();\n",
  }];
  assert.deepEqual(scanHandEntries(files, { familyNames: [] }), []);
});

test('check 1 RED: a hand object-literal family entry in governing-files.mjs is caught', () => {
  const files = [{
    path: 'fsi-app/scripts/harness-runs/governing-files.mjs',
    text: "export const GOVERNING_FILES = {\n  mint: ['scripts/mint/run-mint-batch.mjs'],\n};\n",
  }];
  const v = scanHandEntries(files, { familyNames: ['mint', 'screen'] });
  assert.equal(v.length, 1);
  assert.ok(v[0].message.includes('hand object-literal entry for family "mint"'));
});

test('check 1 RED: a hand array literal naming a family outside FAMILIES.map(...) in run-artifact.mjs is caught', () => {
  const files = [{
    path: 'fsi-app/scripts/lib/run-artifact.mjs',
    text: "export const ALLOWED_FAMILIES = ['mint', 'screen', 'fetch-drain'];\n",
  }];
  const v = scanHandEntries(files, { familyNames: ['mint', 'screen', 'fetch-drain'] });
  assert.ok(v.length >= 1, 'at least the first family literal should be caught');
});

test('check 1 GREEN: the real (derived) governing-files.mjs/run-artifact.mjs shape passes', () => {
  const files = [
    { path: 'fsi-app/scripts/harness-runs/governing-files.mjs', text: "const base = Object.fromEntries(families.map((f) => [f.family, f.governing_files]));\nexport const GOVERNING_FILES = Object.freeze({ ...base, 'meta-harness': [...(base['meta-harness'] ?? [])] });\n" },
    { path: 'fsi-app/scripts/lib/run-artifact.mjs', text: "export const ALLOWED_FAMILIES = Object.freeze(FAMILIES.map((f) => f.family));\n" },
  ];
  assert.deepEqual(scanHandEntries(files, { familyNames: ['mint', 'screen', 'meta-harness'] }), []);
});

test('check 1 RED: a hand-written invariant "id:" entry in invariants.mjs is caught', () => {
  const files = [{
    path: 'fsi-app/.discipline/governance/invariants.mjs',
    text: "export const INVARIANTS = [\n  {\n    id: 'RD-99',\n    skill: 'remediation-discipline',\n  },\n];\n",
  }];
  const v = scanHandEntries(files, { familyNames: [] });
  assert.equal(v.length, 1);
  assert.ok(v[0].message.includes('hand-written invariant "id:" entry'));
});

test('check 1 GREEN: the real (derived) invariants.mjs loader shape passes', () => {
  const files = [{
    path: 'fsi-app/.discipline/governance/invariants.mjs',
    text: "export async function loadInvariantsFromDir(dirUrl) { /* directory scan, no id: literal */ }\nexport const INVARIANTS = await loadInvariantsFromDir();\n",
  }];
  assert.deepEqual(scanHandEntries(files, { familyNames: [] }), []);
});

test('check 1 RED: a hand-written "LOOP_HOPS = [" array literal in loop-manifest.mjs is caught', () => {
  const files = [{
    path: 'fsi-app/.discipline/governance/loop-manifest.mjs',
    text: "export const LOOP_HOPS = [\n  {\n    id: 'sweep-to-fetch-drain',\n  },\n];\n",
  }];
  const v = scanHandEntries(files, { familyNames: [] });
  assert.equal(v.length, 2, 'both the array-literal line and the hop id: line should be caught');
  assert.ok(v.some((x) => x.message.includes('hand-written array literal reappeared assigning LOOP_HOPS')));
  assert.ok(v.some((x) => x.message.includes('hand-written hop "id:" entry reappeared')));
});

test('check 1 GREEN: the real (derived) loop-manifest.mjs loader shape passes', () => {
  const files = [{
    path: 'fsi-app/.discipline/governance/loop-manifest.mjs',
    text: "export function loadLoopHops(dir) { return Object.freeze(readdirSync(dir).map(readHop)); }\nexport const LOOP_HOPS = loadLoopHops(LOOP_HOPS_DIR);\n",
  }];
  assert.deepEqual(scanHandEntries(files, { familyNames: [] }), []);
});

test('check 1 wired to the live tree: runCheck1 against this real repo is clean', () => {
  assert.deepEqual(runCheck1(getRepoRoot()), []);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECK 2: no stored measurement. Pure, no fs.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('check 2 RED: a nonzero stored ceiling is always a violation, allowlisted or not', () => {
  const files = [{ path: 'fsi-app/.discipline/fitness/functions/F99-fixture.mjs', text: 'export const FIXTURE_CEILING = 7;\n' }];
  const v = scanStoredMeasurements(files);
  assert.equal(v.length, 1);
  assert.ok(v[0].message.includes('REGRESSION: a nonzero stored ceiling'));
});

test('check 2 RED: a zero ceiling with no dated allowlist entry is a violation', () => {
  const files = [{ path: 'fsi-app/.discipline/fitness/functions/F99-fixture.mjs', text: 'export const FIXTURE_CEILING = 0;\n' }];
  const v = scanStoredMeasurements(files);
  assert.equal(v.length, 1);
  assert.ok(v[0].message.includes('is not in the dated ZERO_CEILING_ALLOWLIST'));
});

test('check 2 GREEN: a zero ceiling with a dated allowlist entry passes (the two real F46/F47 cases)', () => {
  const files = [
    { path: 'fsi-app/.discipline/fitness/functions/F46-external-host-home.mjs', text: 'export const MULTI_HOME_CEILING = 0;\n' },
    { path: 'fsi-app/.discipline/fitness/functions/F47-db-object-reference.mjs', text: 'export const UNREFERENCED_TABLES_CEILING = 0;\nexport const UNREAD_TABLES_CEILING = 0;\n' },
  ];
  assert.deepEqual(scanStoredMeasurements(files, { allowlist: ZERO_CEILING_ALLOWLIST }), []);
});

test('check 2 RED: a hash-pin literal (sha256:<16 hex> or a bare 64-hex string) is a violation', () => {
  const files = [
    { path: 'fsi-app/.discipline/fitness/functions/F99-fixture.mjs', text: "const PIN = 'sha256:7fd76beaa3b4eb6d';\n" },
    { path: 'fsi-app/.discipline/fitness/functions/F98-fixture.mjs', text: "const PIN = '4f09523532bb7aee4f09523532bb7aee4f09523532bb7aee4f09523532bb7aee';\n" },
  ];
  const v = scanStoredMeasurements(files);
  assert.equal(v.length, 2);
  assert.ok(v.every((x) => x.message.includes('hash-pin literal')));
});

test('check 2 GREEN: ordinary code with neither pattern passes', () => {
  const files = [{ path: 'fsi-app/.discipline/fitness/functions/F99-fixture.mjs', text: 'export function check() { return []; }\n' }];
  assert.deepEqual(scanStoredMeasurements(files), []);
});

test('check 2 wired to the live tree: runCheck2 against this real repo is clean', () => {
  assert.deepEqual(runCheck2(getRepoRoot()), []);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECK 3: ids unique within each entry-file category. Pure, no fs.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('check 3 RED: two files claiming the same id are caught, naming both files', () => {
  const dups = findDuplicateIds([
    { id: 'F99', file: 'fsi-app/.discipline/fitness/functions/F99-a.mjs' },
    { id: 'F99', file: 'fsi-app/.discipline/fitness/functions/F99-b.mjs' },
    { id: 'F98', file: 'fsi-app/.discipline/fitness/functions/F98-a.mjs' },
  ]);
  assert.equal(dups.length, 1);
  assert.equal(dups[0].id, 'F99');
  assert.deepEqual(dups[0].files, ['fsi-app/.discipline/fitness/functions/F99-a.mjs', 'fsi-app/.discipline/fitness/functions/F99-b.mjs']);
});

test('check 3 GREEN: unique ids pass', () => {
  assert.deepEqual(
    findDuplicateIds([{ id: 'F99', file: 'a.mjs' }, { id: 'F98', file: 'b.mjs' }]),
    [],
  );
});

test('check 3 (Amendment 2) RED: a migration duplicate NOT matching the allowlisted file set is caught, allowlist or not', () => {
  const idsByFile = [
    { category: 'migration', id: '150', file: 'fsi-app/supabase/migrations/150_a.sql' },
    { category: 'migration', id: '150', file: 'fsi-app/supabase/migrations/150_b.sql' },
  ];
  const v = evaluateIdDuplicates(idsByFile);
  assert.equal(v.length, 1);
  assert.ok(v[0].message.includes('duplicate id "150"'));
});

test('check 3 (Amendment 2) GREEN: the two allowlisted migration prefixes pass when the observed file set matches exactly', () => {
  const idsByFile = [
    { category: 'migration', id: '006', file: 'fsi-app/supabase/migrations/006_multi_tenant.sql' },
    { category: 'migration', id: '006', file: 'fsi-app/supabase/migrations/006_rls_multi_tenant.sql' },
    { category: 'migration', id: '007', file: 'fsi-app/supabase/migrations/007_community_layer.sql' },
    { category: 'migration', id: '007', file: 'fsi-app/supabase/migrations/007_full_brief.sql' },
    { category: 'migration', id: '007', file: 'fsi-app/supabase/migrations/007_rls_community.sql' },
  ];
  assert.deepEqual(evaluateIdDuplicates(idsByFile), []);
});

test('check 3 (Amendment 2) RED: a planted THIRD "006_" file is still caught -- the allowlist pins the exact file set, not the bare id', () => {
  const idsByFile = [
    { category: 'migration', id: '006', file: 'fsi-app/supabase/migrations/006_multi_tenant.sql' },
    { category: 'migration', id: '006', file: 'fsi-app/supabase/migrations/006_rls_multi_tenant.sql' },
    { category: 'migration', id: '006', file: 'fsi-app/supabase/migrations/006_a_new_planted_file.sql' },
  ];
  const v = evaluateIdDuplicates(idsByFile);
  assert.equal(v.length, 1, 'the observed 3-file set no longer matches the allowlisted 2-file set, so it must be caught again');
  assert.ok(v[0].message.includes('duplicate id "006"'));
  assert.ok(v[0].message.includes('006_a_new_planted_file.sql'));
});

test('check 3 (Amendment 2) GREEN: unallowlisted categories (fitness, invariants, harness-family) are never affected by the migration allowlist', () => {
  const idsByFile = [
    { category: 'fitness', id: 'F900', file: 'a.mjs' },
    { category: 'fitness', id: 'F900', file: 'b.mjs' },
  ];
  const v = evaluateIdDuplicates(idsByFile);
  assert.equal(v.length, 1);
});

test('check 3 (Amendment 2) wired to the live tree: runCheck3 reports 0 violations -- the two pre-existing migration duplicates are now allowlisted, exactly and only', () => {
  assert.deepEqual(runCheck3(getRepoRoot()), []);
  assert.deepEqual(Object.keys(MIGRATION_DUPLICATE_ALLOWLIST).sort(), ['006', '007']);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECK 4: a lane/ branch never touches a coordinator-only file. Git-fixture-based (real merge-base
// resolution against a fake `refs/remotes/origin/master`, same pattern skill-drift-gate.test.mjs uses).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function initCheck4Base(tmp, git) {
  writeFile(join(tmp, 'docs/ops/session-log.md'), '# session log\n');
  writeFile(join(tmp, 'docs/PROGRAM-BOARD.md'), '# board\n');
  writeFile(join(tmp, 'docs/audits/existing-audit.md'), '# audit\n');
  writeFile(join(tmp, 'fsi-app/src/lib/x.mjs'), 'export const x = 1;\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'base']);
  git(['update-ref', 'refs/remotes/origin/master', 'HEAD']);
}

test('check 4 RED: a lane/ branch changing docs/ops/session-log.md is caught', () => {
  const { tmp, git } = tmpRepo('f51-check4-');
  try {
    initCheck4Base(tmp, git);
    git(['checkout', '-q', '-b', 'lane/fixture']);
    writeFile(join(tmp, 'docs/ops/session-log.md'), '# session log\nnew entry\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'lane touches the coordinator-only session log']);
    const v = runCheck4(tmp);
    assert.equal(v.length, 1);
    assert.ok(v[0].message.includes('coordinator-only file "docs/ops/session-log.md"'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('check 4 RED: a lane/ branch adding a file under docs/audits/ is caught', () => {
  const { tmp, git } = tmpRepo('f51-check4-');
  try {
    initCheck4Base(tmp, git);
    git(['checkout', '-q', '-b', 'lane/fixture']);
    writeFile(join(tmp, 'docs/audits/new-finding.md'), '# new finding\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'lane edits a file under docs/audits/']);
    const v = runCheck4(tmp);
    assert.equal(v.length, 1);
    assert.ok(v[0].message.includes('docs/audits/new-finding.md'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('check 4 GREEN: a lane/ branch that never touches a coordinator-only file passes', () => {
  const { tmp, git } = tmpRepo('f51-check4-');
  try {
    initCheck4Base(tmp, git);
    git(['checkout', '-q', '-b', 'lane/fixture']);
    writeFile(join(tmp, 'fsi-app/src/lib/x.mjs'), 'export const x = 2;\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'ordinary change']);
    assert.deepEqual(runCheck4(tmp), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('check 4 SKIP: a non-lane branch is skipped even if it touches a coordinator-only file', () => {
  const { tmp, git } = tmpRepo('f51-check4-');
  try {
    initCheck4Base(tmp, git);
    git(['checkout', '-q', '-b', 'not-a-lane-branch']);
    writeFile(join(tmp, 'docs/ops/session-log.md'), '# session log\ncoordinator edit\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'coordinator commit']);
    assert.deepEqual(runCheck4(tmp), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('check 4 SKIP: no origin/master ref at all is skipped, never failed', () => {
  const { tmp, git } = tmpRepo('f51-check4-');
  try {
    writeFile(join(tmp, 'docs/ops/session-log.md'), '# session log\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'base, no origin/master ref']);
    git(['checkout', '-q', '-b', 'lane/fixture']);
    writeFile(join(tmp, 'docs/ops/session-log.md'), '# session log\nedit\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'lane edit, no baseline to diff against']);
    assert.deepEqual(runCheck4(tmp), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('check 4 wired to the live tree: this lane\'s own branch touches no coordinator-only file', () => {
  assert.deepEqual(runCheck4(getRepoRoot()), []);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECK 5: the hotspot standing number. countHotspots/parseFirstParentLog are pure; runCheck5 is
// git-fixture-based.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('countHotspots: a file touched 3+ times is a hotspot; fewer than 3 is not', () => {
  const perCommit = [['a.mjs', 'b.mjs'], ['a.mjs'], ['a.mjs', 'c.mjs'], ['b.mjs']];
  assert.deepEqual(countHotspots(perCommit), [['a.mjs', 3]]);
});

test('parseFirstParentLog: parses the %x01-delimited git log --name-only shape, oldest and newest blocks alike', () => {
  const raw = '\x01aaa\nfile1.mjs\nfile2.mjs\n\x01bbb\nfile1.mjs\n';
  assert.deepEqual(parseFirstParentLog(raw), [['file1.mjs', 'file2.mjs'], ['file1.mjs']]);
});

test('parseFirstParentLogDetailed (lane F51b): parses the %x01/%x02-delimited sha+subject+files shape', () => {
  const raw = '\x01aaa\x02first subject\nfile1.mjs\nfile2.mjs\n\x01bbb\x02second subject\nfile1.mjs\n';
  assert.deepEqual(parseFirstParentLogDetailed(raw), [
    { sha: 'aaa', subject: 'first subject', files: ['file1.mjs', 'file2.mjs'] },
    { sha: 'bbb', subject: 'second subject', files: ['file1.mjs'] },
  ]);
});

function initCheck5Repo(tmp, git) {
  // An ANCHOR commit (Amendment 2), touching pre-anchor.txt three times before it lands -- none of that
  // must ever count. Then, AFTER the anchor: three commits touching hot.txt (a hotspot), one commit
  // touching entry.mjs under an entry directory (excluded even though it is also touched 3+ times), one
  // touching docs/INDEX.md (allowlisted), and one touching gone.txt which is then deleted (falls out
  // because it no longer exists).
  const commit = (files, message) => {
    for (const [path, content] of files) writeFile(join(tmp, path), content);
    git(['add', '-A']);
    git(['commit', '-q', '-m', message]);
  };
  commit([['pre-anchor.txt', '1']], 'pre1');
  commit([['pre-anchor.txt', '2']], 'pre2');
  commit([['pre-anchor.txt', '3']], 'pre3 (anchor)');
  const anchorSha = git(['rev-parse', 'HEAD']).trim();

  commit([['hot.txt', '1'], ['fsi-app/.discipline/fitness/functions/fixture-entry.mjs', '1'], ['gone.txt', '1']], 'c1');
  commit([['hot.txt', '2'], ['fsi-app/.discipline/fitness/functions/fixture-entry.mjs', '2'], ['gone.txt', '2']], 'c2');
  commit([['hot.txt', '3'], ['fsi-app/.discipline/fitness/functions/fixture-entry.mjs', '3'], ['docs/INDEX.md', '1']], 'c3 (deletes gone.txt)');
  execFileSync('git', ['rm', '-q', 'gone.txt'], { cwd: tmp });
  git(['commit', '-q', '-m', 'c4: delete gone.txt']);
  commit([['docs/INDEX.md', '2']], 'c5');
  commit([['docs/INDEX.md', '3']], 'c6');
  git(['update-ref', 'refs/remotes/origin/master', 'HEAD']);
  return anchorSha;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECK 5 (lane F51c, 2026-09-21/22, third occurrence): the F51b raw-count definition ("master touches +
// this range, threshold 3") still refused three genuinely SERIAL cases (a lane cut after the prior one
// already merged). The VIOLATION criterion is now CONCURRENCY: a prior commit only counts against this
// lane's range when this lane's branch was already open while that commit merged (it is NOT an ancestor
// of this lane's fork point with origin/master). The pure core, evaluateConcurrencyViolations, takes
// pre-classified commits (a `concurrent` boolean per commit, from classifyConcurrency or set directly by
// a fixture); it is tested directly per brief item 2(a)-(d) below, and the git-fixture tests further down
// exercise classifyConcurrency/resolveForkPoint end to end through runCheck5's own range resolution.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function masterCommit(sha, subject, files, concurrent = true) {
  return { sha, subject, files, concurrent };
}

test('evaluateConcurrencyViolations (a) RED: one CONCURRENT prior touch on origin/master plus the range touching the file is a violation (two branches cut from the same master, first merges, second is checked)', () => {
  const masterCommits = [
    masterCommit('aaaaaaaa1111111111111111111111111111aaaa', 'lane A: first touch', ['shared.mjs'], true),
  ];
  const v = evaluateConcurrencyViolations({ masterCommits, rangeFiles: ['shared.mjs'] });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'shared.mjs');
  assert.ok(v[0].message.includes('concurrency violation:'));
});

test('evaluateConcurrencyViolations (b) GREEN: three SERIAL prior touches (each lane cut after the previous one merged) never violate, however many there are', () => {
  const masterCommits = [
    masterCommit('a1', 'lane M3: extend the resolver', ['shared.mjs'], false),
    masterCommit('a2', 'lane M3b: extend it again', ['shared.mjs'], false),
    masterCommit('a3', 'lane M4: extract the shared home', ['shared.mjs'], false),
  ];
  const v = evaluateConcurrencyViolations({ masterCommits, rangeFiles: ['shared.mjs'] });
  assert.deepEqual(v, []);
});

test('evaluateConcurrencyViolations (c) VIOLATION: the same three touches, but the third one is CONCURRENT (that branch was cut before the second one merged)', () => {
  const masterCommits = [
    masterCommit('a1', 'lane M3: extend the resolver', ['shared.mjs'], false),
    masterCommit('a2', 'lane M3b: cut before M4 merged', ['shared.mjs'], true),
  ];
  const v = evaluateConcurrencyViolations({ masterCommits, rangeFiles: ['shared.mjs'] });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'shared.mjs');
});

test('evaluateConcurrencyViolations (d): three serial touches plus one genuinely concurrent touch on the same file produces exactly one violation, naming only the concurrent commit', () => {
  const masterCommits = [
    masterCommit('serial1a1111111111111111111111111111111', 'lane S1: serial touch', ['shared.mjs'], false),
    masterCommit('serial2b2222222222222222222222222222222', 'lane S2: serial touch', ['shared.mjs'], false),
    masterCommit('serial3c3333333333333333333333333333333', 'lane S3: serial touch', ['shared.mjs'], false),
    masterCommit('concur4d4444444444444444444444444444444', 'lane C: genuinely concurrent touch', ['shared.mjs'], true),
  ];
  const v = evaluateConcurrencyViolations({ masterCommits, rangeFiles: ['shared.mjs'] });
  assert.equal(v.length, 1, 'exactly one violation, not one per prior touch');
  assert.equal(v[0].path, 'shared.mjs');
  assert.ok(v[0].message.includes('concur4d4'.slice(0, 8)), 'message must name the concurrent commit');
  assert.ok(!v[0].message.includes('serial1a1'.slice(0, 8)), 'message must not name serial commit 1');
  assert.ok(!v[0].message.includes('serial2b2'.slice(0, 8)), 'message must not name serial commit 2');
  assert.ok(!v[0].message.includes('serial3c3'.slice(0, 8)), 'message must not name serial commit 3');
});

test('evaluateConcurrencyViolations GREEN: a concurrent touch on origin/master, range does NOT touch that file (the bystander case) is not a violation', () => {
  const masterCommits = [
    masterCommit('a1', 'lane A: concurrent touch', ['shared.mjs'], true),
  ];
  const v = evaluateConcurrencyViolations({ masterCommits, rangeFiles: ['unrelated-file.mjs'] });
  assert.deepEqual(v, []);
});

test('evaluateConcurrencyViolations GREEN: an empty range never produces a violation regardless of master history', () => {
  const masterCommits = [
    masterCommit('a1', 's1', ['shared.mjs'], true),
    masterCommit('a2', 's2', ['shared.mjs'], true),
  ];
  assert.deepEqual(evaluateConcurrencyViolations({ masterCommits, rangeFiles: [] }), []);
});

test('evaluateConcurrencyViolations: an allowlisted file in the range is skipped even with a concurrent prior touch, a non-allowlisted one in the same range is not', () => {
  const masterCommits = [
    masterCommit('a1', 's1', ['docs/INDEX.md', 'other-hot.mjs'], true),
  ];
  const v = evaluateConcurrencyViolations({ masterCommits, rangeFiles: ['docs/INDEX.md', 'other-hot.mjs'] });
  const paths = v.map((x) => x.path);
  assert.ok(!paths.includes('docs/INDEX.md'), 'docs/INDEX.md is in the dated HOTSPOT_ALLOWLIST and must be skipped');
  assert.ok(paths.includes('other-hot.mjs'), 'other-hot.mjs is not allowlisted and must still be caught');
});

test('evaluateConcurrencyViolations: the violation message names the concurrent prior commits (sha and subject)', () => {
  const masterCommits = [
    masterCommit('cafe1111111111111111111111111111111111', 'lane C1: concurrent touch', ['shared.mjs'], true),
    masterCommit('cafe2222222222222222222222222222222222', 'lane C2: also concurrent', ['shared.mjs'], true),
  ];
  const v = evaluateConcurrencyViolations({ masterCommits, rangeFiles: ['shared.mjs'] });
  assert.equal(v.length, 1);
  assert.ok(v[0].message.includes('cafe1111'), 'message must name the first prior commit sha (short form)');
  assert.ok(v[0].message.includes('lane C1: concurrent touch'), 'message must name the first prior commit subject');
  assert.ok(v[0].message.includes('cafe2222'), 'message must name the second prior commit sha (short form)');
  assert.ok(v[0].message.includes('lane C2: also concurrent'), 'message must name the second prior commit subject');
});

test('evaluateConcurrencyViolations: an entry-directory file in the range is excluded even with a concurrent prior touch', () => {
  const masterCommits = [
    masterCommit('a1', 's1', ['fsi-app/.discipline/fitness/functions/F900-fixture.mjs'], true),
  ];
  const v = evaluateConcurrencyViolations({ masterCommits, rangeFiles: ['fsi-app/.discipline/fitness/functions/F900-fixture.mjs'] });
  assert.deepEqual(v, []);
});

test('evaluateConcurrencyViolations: existsCheck excludes a file that fell out of the tree even when the range formally touches it', () => {
  const masterCommits = [
    masterCommit('a1', 's1', ['gone.mjs'], true),
  ];
  const v = evaluateConcurrencyViolations({ masterCommits, rangeFiles: ['gone.mjs'], existsCheck: () => false });
  assert.deepEqual(v, []);
});

test('check 5 (lane F51c) GREEN, git-fixture end to end: hot.txt has 3 SERIAL prior touches on origin/master (raw count 3+), but this lane was cut AFTER every one of them already merged -- zero concurrency, not a violation, even though this lane\'s own range touches hot.txt', () => {
  const { tmp, git } = tmpRepo('f51-check5-');
  try {
    const anchorSha = initCheck5Repo(tmp, git); // hot.txt touched 3x on origin/master, all before this lane is cut
    git(['checkout', '-q', '-b', 'lane/fixture']); // cut fresh from the current origin/master tip: fork point = tip
    writeFile(join(tmp, 'hot.txt'), '4'); // this lane's range touches the same file the raw count would have flagged
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'lane/fixture: touches hot.txt after every prior touch already merged']);
    const v = runCheck5(tmp, { anchor: anchorSha });
    assert.ok(!v.some((x) => x.path === 'hot.txt'), 'every prior touch to hot.txt is an ancestor of this lane\'s fork point (serial); raw count 3+ must not matter under the concurrency definition');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('check 5 (lane F51c) GREEN, git-fixture end to end: hot.txt\'s prior touches are bystanders to a range that does not touch it -- not a violation regardless of concurrency', () => {
  const { tmp, git } = tmpRepo('f51-check5-');
  try {
    const anchorSha = initCheck5Repo(tmp, git);
    git(['checkout', '-q', '-b', 'lane/fixture']);
    writeFile(join(tmp, 'lane-own-file.txt'), '1'); // this lane's own range never touches hot.txt
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'lane/fixture: unrelated change']);
    const v = runCheck5(tmp, { anchor: anchorSha });
    assert.ok(!v.some((x) => x.path === 'hot.txt'), 'hot.txt is a bystander to this lane\'s range and must not be refused');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// ATTACK TESTS (a)-(d), brief item 2, full runCheck5 pipeline through classifyConcurrency/resolveForkPoint
// on real branched git history (never the live tree). (d) is proven as a pure evaluateConcurrencyViolations
// test above; (a)-(c) need real branch divergence to exercise resolveForkPoint end to end.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('ATTACK (a) VIOLATION, git-fixture end to end: two branches cut from the same master, both touching shared.mjs, the first merges, the second is checked', () => {
  const { tmp, git } = tmpRepo('f51-attack-a-');
  try {
    writeFile(join(tmp, 'a0.txt'), '1'); git(['add', '-A']); git(['commit', '-q', '-m', 'c0 (anchor)']);
    const anchorSha = git(['rev-parse', 'HEAD']).trim();
    writeFile(join(tmp, 'seed.txt'), '1'); git(['add', '-A']); git(['commit', '-q', '-m', 'seed']);
    const seedSha = git(['rev-parse', 'HEAD']).trim();
    git(['update-ref', 'refs/remotes/origin/master', 'HEAD']);
    git(['branch', 'lane-a', seedSha]);
    git(['checkout', '-q', 'lane-a']);
    writeFile(join(tmp, 'shared.mjs'), 'a'); git(['add', '-A']); git(['commit', '-q', '-m', 'lane A: touch shared.mjs']);
    const laneATip = git(['rev-parse', 'HEAD']).trim();
    git(['update-ref', 'refs/remotes/origin/master', laneATip]); // lane A merges first
    git(['checkout', '-q', '-b', 'lane-b', seedSha]); // lane B was cut from `seed`, BEFORE lane A's commit merged
    writeFile(join(tmp, 'shared.mjs'), 'b'); git(['add', '-A']); git(['commit', '-q', '-m', 'lane B: touch shared.mjs too']);
    const v = runCheck5(tmp, { anchor: anchorSha });
    assert.ok(v.some((x) => x.path === 'shared.mjs' && x.message.includes('concurrency violation:')), 'lane A\'s merged touch is NOT an ancestor of lane B\'s fork point (seed) -- genuinely concurrent, must be refused');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('ATTACK (b) PASS, git-fixture end to end: three serial branches, each cut after the previous one merged, all touching shared.mjs -- zero violations', () => {
  const { tmp, git } = tmpRepo('f51-attack-b-');
  try {
    writeFile(join(tmp, 'a0.txt'), '1'); git(['add', '-A']); git(['commit', '-q', '-m', 'c0 (anchor)']);
    const anchorSha = git(['rev-parse', 'HEAD']).trim();
    writeFile(join(tmp, 'seed.txt'), '1'); git(['add', '-A']); git(['commit', '-q', '-m', 'seed']);
    const seedSha = git(['rev-parse', 'HEAD']).trim();
    git(['update-ref', 'refs/remotes/origin/master', 'HEAD']);
    git(['checkout', '-q', '-b', 'lane-1', seedSha]);
    writeFile(join(tmp, 'shared.mjs'), '1'); git(['add', '-A']); git(['commit', '-q', '-m', 'lane 1: touch shared.mjs']);
    const lane1Tip = git(['rev-parse', 'HEAD']).trim();
    git(['update-ref', 'refs/remotes/origin/master', lane1Tip]); // lane 1 merges
    git(['checkout', '-q', '-b', 'lane-2', lane1Tip]); // cut AFTER lane 1 merged
    writeFile(join(tmp, 'shared.mjs'), '2'); git(['add', '-A']); git(['commit', '-q', '-m', 'lane 2: touch shared.mjs again']);
    const lane2Tip = git(['rev-parse', 'HEAD']).trim();
    git(['update-ref', 'refs/remotes/origin/master', lane2Tip]); // lane 2 merges
    git(['checkout', '-q', '-b', 'lane-3', lane2Tip]); // cut AFTER lane 2 merged
    writeFile(join(tmp, 'shared.mjs'), '3'); git(['add', '-A']); git(['commit', '-q', '-m', 'lane 3: touch shared.mjs a third time']);
    const v = runCheck5(tmp, { anchor: anchorSha });
    assert.ok(!v.some((x) => x.path === 'shared.mjs'), 'all three touches are ancestors of lane 3\'s own fork point (serial, cut after every prior merge); this is the design working');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('ATTACK (c) VIOLATION, git-fixture end to end: same as (b), but the third branch was cut BEFORE the second one merged', () => {
  const { tmp, git } = tmpRepo('f51-attack-c-');
  try {
    writeFile(join(tmp, 'a0.txt'), '1'); git(['add', '-A']); git(['commit', '-q', '-m', 'c0 (anchor)']);
    const anchorSha = git(['rev-parse', 'HEAD']).trim();
    writeFile(join(tmp, 'seed.txt'), '1'); git(['add', '-A']); git(['commit', '-q', '-m', 'seed']);
    const seedSha = git(['rev-parse', 'HEAD']).trim();
    git(['update-ref', 'refs/remotes/origin/master', 'HEAD']);
    git(['checkout', '-q', '-b', 'lane-1', seedSha]);
    writeFile(join(tmp, 'shared.mjs'), '1'); git(['add', '-A']); git(['commit', '-q', '-m', 'lane 1: touch shared.mjs']);
    const lane1Tip = git(['rev-parse', 'HEAD']).trim();
    git(['update-ref', 'refs/remotes/origin/master', lane1Tip]); // lane 1 merges
    git(['checkout', '-q', '-b', 'lane-2', lane1Tip]);
    writeFile(join(tmp, 'shared.mjs'), '2'); git(['add', '-A']); git(['commit', '-q', '-m', 'lane 2: touch shared.mjs again']);
    const lane2Tip = git(['rev-parse', 'HEAD']).trim();
    // lane 3 is cut from lane 1's tip, BEFORE lane 2 merges -- the concurrent case.
    git(['checkout', '-q', '-b', 'lane-3', lane1Tip]);
    writeFile(join(tmp, 'shared.mjs'), '3'); git(['add', '-A']); git(['commit', '-q', '-m', 'lane 3: touch shared.mjs a third time']);
    git(['update-ref', 'refs/remotes/origin/master', lane2Tip]); // NOW lane 2 merges, while lane 3 is already open
    const v = runCheck5(tmp, { anchor: anchorSha });
    assert.ok(v.some((x) => x.path === 'shared.mjs' && x.message.includes('concurrency violation:')), 'lane 2\'s touch merged while lane 3 was already open (not an ancestor of lane 3\'s fork point, lane 1\'s tip) -- genuinely concurrent, must be refused');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('check 5 (lane F51c) GREEN, git-fixture end to end: an entry-directory file and an allowlisted file are excluded even with a genuinely CONCURRENT prior touch, while a second, non-allowlisted concurrently-touched file in the same range still fails', () => {
  const { tmp, git } = tmpRepo('f51-check5-concurrent-allow-');
  try {
    writeFile(join(tmp, 'a0.txt'), '1'); git(['add', '-A']); git(['commit', '-q', '-m', 'c0 (anchor)']);
    const anchorSha = git(['rev-parse', 'HEAD']).trim();
    writeFile(join(tmp, 'seed.txt'), '1'); git(['add', '-A']); git(['commit', '-q', '-m', 'seed']);
    const seedSha = git(['rev-parse', 'HEAD']).trim();
    git(['update-ref', 'refs/remotes/origin/master', 'HEAD']);
    git(['branch', 'lane-a', seedSha]);
    git(['checkout', '-q', 'lane-a']);
    writeFile(join(tmp, 'fsi-app/.discipline/fitness/functions/fixture-entry.mjs'), 'a');
    writeFile(join(tmp, 'docs/INDEX.md'), 'a');
    writeFile(join(tmp, 'other-hot.txt'), 'a');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'lane A: touch an entry-dir file, an allowlisted file, and other-hot.txt']);
    const laneATip = git(['rev-parse', 'HEAD']).trim();
    git(['update-ref', 'refs/remotes/origin/master', laneATip]);
    git(['checkout', '-q', '-b', 'lane-b', seedSha]); // lane B forked before lane A merged: genuinely concurrent
    writeFile(join(tmp, 'fsi-app/.discipline/fitness/functions/fixture-entry.mjs'), 'b');
    writeFile(join(tmp, 'docs/INDEX.md'), 'b');
    writeFile(join(tmp, 'other-hot.txt'), 'b');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'lane B: touches the same three files']);
    const v = runCheck5(tmp, { anchor: anchorSha });
    const paths = v.map((x) => x.path);
    assert.ok(!paths.includes('fsi-app/.discipline/fitness/functions/fixture-entry.mjs'), 'entry-directory file must be excluded even with a concurrent prior touch');
    assert.ok(!paths.includes('docs/INDEX.md'), 'HOTSPOT_ALLOWLIST entry must be excluded even with a concurrent prior touch');
    assert.ok(paths.includes('other-hot.txt'), 'a non-allowlisted, non-entry-dir file with a genuinely concurrent prior touch must still be caught');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('check 5 (lane F51b) GREEN: on origin/master itself (no lane range), the standing number prints but no violations are returned', () => {
  const { tmp, git } = tmpRepo('f51-check5-');
  try {
    const anchorSha = initCheck5Repo(tmp, git); // HEAD is already refs/remotes/origin/master's own tip; no lane range exists
    assert.deepEqual(runCheck5(tmp, { anchor: anchorSha }), [], 'on master itself there is no range to refuse, even though hot.txt is a standing hotspot');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('check 5 (Amendment 2) ANCHOR HONOURED: a file touched 3+ times AT OR BEFORE the anchor is never counted, even if this lane\'s own range touches it', () => {
  const { tmp, git } = tmpRepo('f51-check5-');
  try {
    const anchorSha = initCheck5Repo(tmp, git);
    git(['checkout', '-q', '-b', 'lane/fixture']);
    writeFile(join(tmp, 'pre-anchor.txt'), '4'); // this lane's range touches the pre-anchor file
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'lane/fixture: touches pre-anchor.txt']);
    const v = runCheck5(tmp, { anchor: anchorSha });
    assert.ok(!v.some((x) => x.path === 'pre-anchor.txt'), 'pre-anchor.txt has 0 touches in the post-anchor window, so this lane\'s single touch (total 1) never reaches threshold 3');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('check 5 (Amendment 2) SHORT-WINDOW SKIP: fewer than 3 first-parent commits after the anchor prints the count and skips, never fails', () => {
  const { tmp, git } = tmpRepo('f51-check5-');
  try {
    writeFile(join(tmp, 'a.txt'), '1');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'anchor commit']);
    const anchorSha = git(['rev-parse', 'HEAD']).trim();
    writeFile(join(tmp, 'b.txt'), '1');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'one commit after the anchor']);
    git(['update-ref', 'refs/remotes/origin/master', 'HEAD']);
    assert.deepEqual(runCheck5(tmp, { anchor: anchorSha }), [], 'only 1 commit after the anchor, below the 3-commit floor needed for any hotspot');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('check 5 SKIP: no origin/master ref at all is skipped, never failed', () => {
  const { tmp, git } = tmpRepo('f51-check5-');
  try {
    writeFile(join(tmp, 'x.txt'), '1');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'base, no origin/master ref']);
    const sha = git(['rev-parse', 'HEAD']).trim();
    assert.deepEqual(runCheck5(tmp, { anchor: sha }), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('check 5 SKIP: the anchor commit itself is unreachable (bad anchor) is skipped, never failed', () => {
  const { tmp, git } = tmpRepo('f51-check5-');
  try {
    writeFile(join(tmp, 'x.txt'), '1');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'base']);
    git(['update-ref', 'refs/remotes/origin/master', 'HEAD']);
    assert.deepEqual(runCheck5(tmp, { anchor: '0'.repeat(40) }), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('underEntryDir: recognizes the five derived directories and docs/ops/session-log.d/', () => {
  assert.equal(underEntryDir('fsi-app/.discipline/fitness/functions/F1-x.mjs'), true);
  assert.equal(underEntryDir('fsi-app/.discipline/governance/invariants.d/RD-1.mjs'), true);
  assert.equal(underEntryDir('fsi-app/scripts/harness-runs/mint/family.json'), true);
  assert.equal(underEntryDir('fsi-app/.discipline/governance/skill-acks/2026-09-19-n6.md'), true);
  assert.equal(underEntryDir('fsi-app/.discipline/governance/loop-hops.d/01-sweep-to-fetch-drain.json'), true);
  assert.equal(underEntryDir('docs/ops/session-log.d/2026-09-19-n6.md'), true);
  assert.equal(underEntryDir('fsi-app/scripts/lib/run-artifact.mjs'), false);
});

test('check 5 wired to the live tree (lane F51c): HOTSPOT_ALLOWLIST names only the six coordinator-only-by-contract entries -- the seven serial-owner entries (the lane-briefs README, the three ADR-031 loop-id-resolver files, loop-manifest.mjs, and the two FactCard part files) are deleted, cleared by the concurrency definition instead', () => {
  assert.deepEqual(
    Object.keys(HOTSPOT_ALLOWLIST).sort(),
    [
      'docs/INDEX.md', 'docs/PROGRAM-BOARD.md', 'docs/audits/system-health-audit-2026-09-17.md',
      'docs/ops/HANDOFF-2026-09-19-addendum.md', 'docs/ops/session-log.md',
      'docs/plans/complete-system-build-plan-2026-09-04.md',
    ].sort(),
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// LANE G1 AMENDMENT 2 ATTACK (a): F51 check 5 fired on docs/dispatches/lane-briefs/2026-09-19/README.md
// because three coordinator docs PRs each appended a row to its per-brief table (Cause A, the exact
// shape plan 6.8 removed elsewhere). The fix (item 1) deleted the table; this test proves the shape
// stays gone. AMENDMENT 2 ATTACK (b), the allowlist-does-not-widen synthetic fixture, is RETIRED by lane
// F51c: its premise (an allowlist entry for the README) no longer exists -- item 3 deletes it, because
// under the concurrency definition the README's three serial touches were never a violation to begin
// with. The "LIVE-TREE PROOF" test below is its replacement: real evidence, against the real repo
// history, that every one of the seven deleted entries clears the concurrency definition on its own.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('AMENDMENT 2 ATTACK (a): the live README carries no per-brief table row; planting one in a fixture copy proves the pattern would be caught', () => {
  const readmePath = join(getRepoRoot(), 'docs/dispatches/lane-briefs/2026-09-19/README.md');
  const text = readFileSync(readmePath, 'utf8');
  const tableRowPattern = /^\|\s*brief-/m;
  assert.equal(tableRowPattern.test(text), false, 'the live README must carry no re-added per-brief table row (plan 6.8 Rule A)');
  const plantedRegression = text + '\n| brief-x.md | X | a table row growing back |\n';
  assert.equal(tableRowPattern.test(plantedRegression), true, 'the detection pattern must catch a re-added table row in a fixture copy');
});

test('check 5 (Amendment 2) wired to the live tree: runCheck5 with the real anchor reports 0 violations (the conversion regime is excluded, no file is allowlisted to force this)', () => {
  assert.equal(HOTSPOT_WINDOW_ANCHOR_COMMIT, 'ccb6aa0c091aba55f6e85d93ecc704c218acc20c');
  assert.deepEqual(runCheck5(getRepoRoot()), []);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// LIVE-TREE PROOF (lane F51c, brief item 3): re-run the concurrency definition against the REAL recent
// master history, with the allowlist emptied, naming exactly the seven files whose dated entries this
// lane deletes. If any of them showed a violation here, the definition would be wrong (go back to item
// 1, never re-add an entry, per the brief) -- none does, because every prior touch to every one of them
// is a real serial edit (a lane cut after the previous one merged), not a concurrent one.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('check 5 (lane F51c) LIVE-TREE PROOF: the concurrency definition clears the seven deleted-allowlist files against the real repo history, with no allowlist entry protecting them', () => {
  const root = getRepoRoot();
  const raw = execFileSync(
    'git',
    ['log', '--first-parent', '-n', '30', '--name-only', '--pretty=format:%x01%H%x02%s', `${HOTSPOT_WINDOW_ANCHOR_COMMIT}..origin/master`],
    { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 },
  );
  const commits = parseFirstParentLogDetailed(raw);
  const forkPoint = resolveForkPoint(root);
  assert.ok(forkPoint, 'this lane\'s fork point with origin/master must resolve against the live tree');
  const classified = classifyConcurrency(root, commits, forkPoint);
  const deletedEntryFiles = [
    'docs/dispatches/lane-briefs/2026-09-19/README.md',
    'fsi-app/scripts/lib/loop-run-id.mjs',
    'fsi-app/scripts/lib/loop-run-id.test.mjs',
    'fsi-app/scripts/turns/emit-downstream-chain-artifact.mjs',
    'fsi-app/.discipline/governance/loop-manifest.mjs',
    'fsi-app/src/components/ui/FactCard.tsx',
    'fsi-app/src/components/ui/FactCard.npmtest.mjs',
  ];
  const v = evaluateConcurrencyViolations({
    masterCommits: classified,
    rangeFiles: deletedEntryFiles,
    allowlist: {}, // deliberately empty: proving the definition, not the allowlist, clears these
    existsCheck: (f) => existsSync(join(root, f)),
  });
  assert.deepEqual(v, [], 'every file whose HOTSPOT_ALLOWLIST entry lane F51c deletes must clear the concurrency definition on its own');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// fitnessFunction.check() wired end to end against the live tree: prints the hotspot line, returns the
// true current violation set (see the report for what each one is and why it is outside this lane's
// write set to fix).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
test('fitnessFunction.check() live: id/name/enumerate shape, and the result matches the sum of the five checks', () => {
  assert.equal(fitnessFunction.id, 'F51');
  assert.equal(fitnessFunction.name, 'no-shared-append');
  assert.deepEqual(fitnessFunction.enumerate(), ['fsi-app/.discipline/fitness/functions/F51-no-shared-append.mjs']);
  const root = getRepoRoot();
  const expectedCount = runCheck1(root).length + runCheck2(root).length + runCheck3(root).length + runCheck4(root).length + runCheck5(root).length;
  assert.equal(fitnessFunction.check().length, expectedCount);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// THE REPLAY (plan 6.8's own acceptance for closing itself): a throwaway repo seeded with the REAL
// derived directories, five branches doing what the five 2026-09-18 lanes' registrations required,
// merged in every order (or a reduced sample if the full sweep would exceed 60s) with zero conflicts,
// every derived entry present on the merged tree exactly once.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const REAL_ROOT = getRepoRoot();

function seedReplayBase(tmp, git) {
  cpSync(join(REAL_ROOT, 'fsi-app/.discipline/fitness/functions'), join(tmp, 'fsi-app/.discipline/fitness/functions'), { recursive: true });
  cpSync(join(REAL_ROOT, 'fsi-app/.discipline/governance/invariants.d'), join(tmp, 'fsi-app/.discipline/governance/invariants.d'), { recursive: true });
  for (const fam of FAMILIES) {
    const src = join(REAL_ROOT, 'fsi-app/scripts/harness-runs', fam.family, 'family.json');
    const dst = join(tmp, 'fsi-app/scripts/harness-runs', fam.family, 'family.json');
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst);
  }
  // Exactly one real pending/ file, per the brief.
  const pendingSrc = join(REAL_ROOT, 'fsi-app/scripts/harness-runs/forward-events/pending/2026-09-19-n3-migrated.md');
  const pendingDst = join(tmp, 'fsi-app/scripts/harness-runs/forward-events/pending/2026-09-19-n3-migrated.md');
  mkdirSync(dirname(pendingDst), { recursive: true });
  cpSync(pendingSrc, pendingDst);
  cpSync(join(REAL_ROOT, 'docs/ops/session-log.d'), join(tmp, 'docs/ops/session-log.d'), { recursive: true });
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'base: derived directories as they are on the real tree']);
  return git(['rev-parse', 'HEAD']).trim();
}

// What each of the five 2026-09-18 lanes' registration required under plan 6.8, per the brief:
// M8/M9b/M1 add a family descriptor and a pending file; M9a/W10-A add a fitness function, an invariant
// and a skill ack. Every branch also adds its own session-log.d file.
const LANE_APPLY = {
  m8: (tmp) => {
    writeFile(join(tmp, 'fsi-app/scripts/harness-runs/fixture-m8/family.json'), JSON.stringify({ family: 'fixture-m8', registered: '2026-09-18', registered_by: 'lane-m8', governing_files: ['fsi-app/scripts/turns/fixture-m8-runner.mjs'], rationale: 'replay fixture' }, null, 2));
    writeFile(join(tmp, 'fsi-app/scripts/harness-runs/fixture-m8/pending/2026-09-18-m8.md'), '## Change\nregistered family fixture-m8\n## Planned run\nfixture-m8-run-001\n');
    writeFile(join(tmp, 'docs/ops/session-log.d/2026-09-18-m8.md'), '## 2026-09-18, lane M8 fixture\n\n### UX compliance (M8)\nNot a UI change.\n');
  },
  m9b: (tmp) => {
    writeFile(join(tmp, 'fsi-app/scripts/harness-runs/fixture-m9b/family.json'), JSON.stringify({ family: 'fixture-m9b', registered: '2026-09-18', registered_by: 'lane-m9b', governing_files: ['fsi-app/scripts/turns/fixture-m9b-runner.mjs'], rationale: 'replay fixture' }, null, 2));
    writeFile(join(tmp, 'fsi-app/scripts/harness-runs/fixture-m9b/pending/2026-09-18-m9b.md'), '## Change\nregistered family fixture-m9b\n## Planned run\nfixture-m9b-run-001\n');
    writeFile(join(tmp, 'docs/ops/session-log.d/2026-09-18-m9b.md'), '## 2026-09-18, lane M9b fixture\n\n### UX compliance (M9b)\nNot a UI change.\n');
  },
  m1: (tmp) => {
    writeFile(join(tmp, 'fsi-app/scripts/harness-runs/fixture-m1/family.json'), JSON.stringify({ family: 'fixture-m1', registered: '2026-09-18', registered_by: 'lane-m1', governing_files: ['fsi-app/scripts/turns/fixture-m1-runner.mjs'], rationale: 'replay fixture' }, null, 2));
    writeFile(join(tmp, 'fsi-app/scripts/harness-runs/fixture-m1/pending/2026-09-18-m1.md'), '## Change\nregistered family fixture-m1\n## Planned run\nfixture-m1-run-001\n');
    writeFile(join(tmp, 'docs/ops/session-log.d/2026-09-18-m1.md'), '## 2026-09-18, lane M1 fixture\n\n### UX compliance (M1)\nNot a UI change.\n');
  },
  m9a: (tmp) => {
    writeFile(join(tmp, 'fsi-app/.discipline/fitness/functions/F900-fixture-m9a.mjs'), "export const fitnessFunction = { id: 'F900', name: 'fixture-m9a', enumerate() { return []; }, check() { return []; } };\n");
    writeFile(join(tmp, 'fsi-app/.discipline/governance/invariants.d/ZZ-900.mjs'), "export const invariant = { id: 'ZZ-900', skill: 'remediation-discipline', section: 'fixture', text: 'fixture', anchor: 'fixture', exempt: { reason: 'replay fixture' } };\n");
    writeFile(join(tmp, 'fsi-app/.discipline/governance/skill-acks/2026-09-18-m9a.md'), '## Skill\nremediation-discipline\n## Citing files reviewed\nnone (fixture)\n');
    writeFile(join(tmp, 'docs/ops/session-log.d/2026-09-18-m9a.md'), '## 2026-09-18, lane M9a fixture\n\n### UX compliance (M9a)\nNot a UI change.\n');
  },
  w10a: (tmp) => {
    writeFile(join(tmp, 'fsi-app/.discipline/fitness/functions/F901-fixture-w10a.mjs'), "export const fitnessFunction = { id: 'F901', name: 'fixture-w10a', enumerate() { return []; }, check() { return []; } };\n");
    writeFile(join(tmp, 'fsi-app/.discipline/governance/invariants.d/ZZ-901.mjs'), "export const invariant = { id: 'ZZ-901', skill: 'remediation-discipline', section: 'fixture', text: 'fixture', anchor: 'fixture', exempt: { reason: 'replay fixture' } };\n");
    writeFile(join(tmp, 'fsi-app/.discipline/governance/skill-acks/2026-09-18-w10a.md'), '## Skill\nremediation-discipline\n## Citing files reviewed\nnone (fixture)\n');
    writeFile(join(tmp, 'docs/ops/session-log.d/2026-09-18-w10a.md'), '## 2026-09-18, lane W10-A fixture\n\n### UX compliance (W10-A)\nNot a UI change.\n');
  },
};

function verifyMergedReplayTree(tmp) {
  const functionFiles = readdirSync(join(tmp, 'fsi-app/.discipline/fitness/functions'));
  assert.equal(functionFiles.filter((f) => f === 'F900-fixture-m9a.mjs').length, 1);
  assert.equal(functionFiles.filter((f) => f === 'F901-fixture-w10a.mjs').length, 1);

  const invariantFiles = readdirSync(join(tmp, 'fsi-app/.discipline/governance/invariants.d'));
  assert.equal(invariantFiles.filter((f) => f === 'ZZ-900.mjs').length, 1);
  assert.equal(invariantFiles.filter((f) => f === 'ZZ-901.mjs').length, 1);

  const harnessDirs = readdirSync(join(tmp, 'fsi-app/scripts/harness-runs'));
  for (const fam of ['fixture-m8', 'fixture-m9b', 'fixture-m1']) {
    assert.equal(harnessDirs.filter((d) => d === fam).length, 1, `family directory "${fam}" must exist exactly once`);
    assert.ok(existsSync(join(tmp, 'fsi-app/scripts/harness-runs', fam, 'family.json')));
    assert.ok(existsSync(join(tmp, 'fsi-app/scripts/harness-runs', fam, 'pending', `2026-09-18-${fam.slice('fixture-'.length)}.md`)));
  }

  const ackFiles = readdirSync(join(tmp, 'fsi-app/.discipline/governance/skill-acks'));
  assert.equal(ackFiles.filter((f) => f === '2026-09-18-m9a.md').length, 1);
  assert.equal(ackFiles.filter((f) => f === '2026-09-18-w10a.md').length, 1);

  const logFiles = readdirSync(join(tmp, 'docs/ops/session-log.d'));
  for (const lane of ['m8', 'm9b', 'm9a', 'm1', 'w10a']) {
    assert.equal(logFiles.filter((f) => f === `2026-09-18-${lane}.md`).length, 1, `session-log.d entry for ${lane} must exist exactly once`);
  }
}

test('F51 REPLAY: the 2026-09-18 lane set (M8, M9b, M9a, M1, W10-A) merges clean in every order; the merged tree carries every derived entry exactly once', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'f51-replay-'));
  const git = (args) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8', maxBuffer: 1 << 26 });
  try {
    git(['init', '-q']);
    git(['config', 'user.email', 'f51-replay@test.local']);
    git(['config', 'user.name', 'f51-replay']);
    git(['config', 'commit.gpgsign', 'false']);
    const baseSha = seedReplayBase(tmp, git);

    const lanes = Object.keys(LANE_APPLY).sort(); // ['m1','m8','m9a','m9b','w10a'] -- alphabetical
    for (const lane of lanes) {
      git(['checkout', '-q', '-b', lane, baseSha]);
      LANE_APPLY[lane](tmp);
      git(['add', '-A']);
      git(['commit', '-q', '-m', `${lane}: fixture registration under plan 6.8`]);
    }

    const fullPerms = permutations(lanes);
    assert.equal(fullPerms.length, 120);

    function runOneOrder(order, tag) {
      git(['checkout', '-q', '-B', `replay-${tag}`, baseSha]);
      for (const lane of order) {
        git(['merge', '--no-ff', '-q', '-m', `merge ${lane}`, lane]);
      }
      verifyMergedReplayTree(tmp);
    }

    const t0 = Date.now();
    runOneOrder(fullPerms[0], 0); // fullPerms[0] is the ascending-lexical order (identity of the sorted input)
    const sampleMs = Date.now() - t0;
    const projectedFullMs = sampleMs * fullPerms.length;

    let ordersRun = 1;
    let mode;
    if (projectedFullMs > 60000) {
      const descending = [...lanes].sort().reverse();
      const randomOrders = Array.from({ length: 24 }, () => shuffled(lanes));
      const reduced = [descending, ...randomOrders];
      for (let i = 0; i < reduced.length; i++) runOneOrder(reduced[i], `r${i}`);
      ordersRun += reduced.length;
      mode = `projected ${projectedFullMs}ms for the full 120 exceeds 60000ms (sample order took ${sampleMs}ms); used 24 random orders plus the two lexical extremes instead`;
    } else {
      for (let i = 1; i < fullPerms.length; i++) runOneOrder(fullPerms[i], i);
      ordersRun += fullPerms.length - 1;
      mode = `all 120 orders (projected ${projectedFullMs}ms from a ${sampleMs}ms sample order)`;
    }
    const elapsedMs = Date.now() - t0;

    console.log(`F51 replay: ${ordersRun} order(s), ${mode}, elapsed ${elapsedMs}ms total, zero conflicts, every derived entry present exactly once.`);
    assert.ok(ordersRun === 120 || ordersRun === 26, `expected either the full 120 or the reduced 26 (2 lexical extremes + 24 random), got ${ordersRun}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
