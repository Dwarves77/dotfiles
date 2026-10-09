// Red-then-green for F51 (no-shared-append, plan 6.8, lane N6). Each of the four checks is proven by
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
  scanHandEntries, scanStoredMeasurements, findDuplicateIds, evaluateIdDuplicates,
  runCheck1, runCheck2, runCheck3, runCheck4,
  ZERO_CEILING_ALLOWLIST, MIGRATION_DUPLICATE_ALLOWLIST,
  fitnessFunction,
} from './F51-no-shared-append.mjs';
import * as f51 from './F51-no-shared-append.mjs';

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

test('check 1 RED: a hand-written "PARTS: PartEntry[] = [" array literal in admin/parts/page.tsx is caught', () => {
  const files = [{
    path: 'fsi-app/src/app/admin/parts/page.tsx',
    text: "const PARTS: PartEntry[] = [\n  {\n    slug: 'fact-card',\n  },\n];\n",
  }];
  const v = scanHandEntries(files, { familyNames: [] });
  assert.equal(v.length, 2, 'both the array-literal line and the slug entry line should be caught');
  assert.ok(v.some((x) => x.message.includes('hand-written array literal reappeared assigning PARTS')));
  assert.ok(v.some((x) => x.message.includes('hand-written part "slug:" entry reappeared')));
});

test('check 1 GREEN: the real (derived) admin/parts/page.tsx loader shape passes', () => {
  const files = [{
    path: 'fsi-app/src/app/admin/parts/page.tsx',
    text: "import { loadPartEntries } from \"@/lib/admin/parts-registry\";\nconst parts = loadPartEntries();\n",
  }];
  assert.deepEqual(scanHandEntries(files, { familyNames: [] }), []);
});

// GATE-4 (2026-10-07): this test runs the fitness function against the live repo, which the Fitness
// functions job already does on every pull request (gate evaluation B section 7.6: it failed the unit-test
// step while the gate itself passed in the fitness job). It stays runnable here with FITNESS_LIVE_TESTS=1.
const LIVE_TREE = process.env.FITNESS_LIVE_TESTS === '1' ? {} : { skip: 'live-tree self-test, run by the Fitness functions job; set FITNESS_LIVE_TESTS=1 to run it here' };

test('check 1 wired to the live tree: runCheck1 against this real repo is clean', LIVE_TREE, () => {
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

test('check 2 wired to the live tree: runCheck2 against this real repo is clean', LIVE_TREE, () => {
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

test('check 3 (Amendment 2) wired to the live tree: runCheck3 reports 0 violations -- the two pre-existing migration duplicates are now allowlisted, exactly and only', LIVE_TREE, () => {
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
  writeFile(join(tmp, 'docs/runbooks/MAINTENANCE-RUNBOOK.md'), '# runbook\n');
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

test('check 4 RED: a lane/ branch changing docs/runbooks/MAINTENANCE-RUNBOOK.md (the coordinator-owned step index) is caught', () => {
  const { tmp, git } = tmpRepo('f51-check4-');
  try {
    initCheck4Base(tmp, git);
    git(['checkout', '-q', '-b', 'lane/fixture']);
    writeFile(join(tmp, 'docs/runbooks/MAINTENANCE-RUNBOOK.md'), '# runbook\n- new index line\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'lane adds its own index line']);
    const v = runCheck4(tmp);
    assert.equal(v.length, 1);
    assert.ok(v[0].message.includes('coordinator-only file "docs/runbooks/MAINTENANCE-RUNBOOK.md"'));
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

test('check 4 SKIP: a coordinator branch (coord/*) is skipped even if it touches a coordinator-only file', () => {
  const { tmp, git } = tmpRepo('f51-check4-');
  try {
    initCheck4Base(tmp, git);
    git(['checkout', '-q', '-b', 'coord/fixture']);
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

test('check 4 wired to the live tree: this lane\'s own branch touches no coordinator-only file', LIVE_TREE, () => {
  assert.deepEqual(runCheck4(getRepoRoot()), []);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// LANE G1 AMENDMENT 2 ATTACK (a): F51's former check 5 fired on docs/dispatches/lane-briefs/2026-09-19/README.md
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

// fitnessFunction.check() wired end to end against the live tree: returns the true current violation set.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
test('fitnessFunction.check() live: id/name/enumerate shape, and the result matches the sum of the four checks', LIVE_TREE, () => {
  assert.equal(fitnessFunction.id, 'F51');
  assert.equal(fitnessFunction.name, 'no-shared-append');
  assert.deepEqual(fitnessFunction.enumerate(), ['fsi-app/.discipline/fitness/functions/F51-no-shared-append.mjs']);
  const root = getRepoRoot();
  const expectedCount = runCheck1(root).length + runCheck2(root).length + runCheck3(root).length + runCheck4(root).length;
  assert.equal(fitnessFunction.check().length, expectedCount);
});

test('GATE-3: check 5 (hotspot concurrency) and its HOTSPOT_ALLOWLIST are gone, a concurrent edit is left to git to merge', () => {
  for (const gone of ['runCheck5', 'HOTSPOT_ALLOWLIST', 'HOTSPOT_WINDOW_ANCHOR_COMMIT', 'countHotspots', 'evaluateConcurrencyViolations', 'resolveForkPoint', 'classifyConcurrency', 'underEntryDir']) {
    assert.equal(f51[gone], undefined, `${gone} must not be exported any more`);
  }
  assert.doesNotMatch(fitnessFunction.description, /\b5\) the standing hotspot/);
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
  cpSync(join(REAL_ROOT, 'docs/ops/session-log.d'), join(tmp, 'docs/ops/session-log.d'), { recursive: true });
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'base: derived directories as they are on the real tree']);
  return git(['rev-parse', 'HEAD']).trim();
}

// What each of the five 2026-09-18 lanes' registration required under plan 6.8, per the brief:
// M8/M9b/M1 add a family descriptor; M9a/W10-A add a fitness function and an invariant. Every branch
// also adds its own session-log.d file. (The pending marker and the skill ack the original replay also
// carried were deleted by lane GATE-3, 2026-10-08.)
const LANE_APPLY = {
  m8: (tmp) => {
    writeFile(join(tmp, 'fsi-app/scripts/harness-runs/fixture-m8/family.json'), JSON.stringify({ family: 'fixture-m8', registered: '2026-09-18', registered_by: 'lane-m8', governing_files: ['fsi-app/scripts/turns/fixture-m8-runner.mjs'], rationale: 'replay fixture' }, null, 2));
    writeFile(join(tmp, 'docs/ops/session-log.d/2026-09-18-m8.md'), '## 2026-09-18, lane M8 fixture\n\n### UX compliance (M8)\nNot a UI change.\n');
  },
  m9b: (tmp) => {
    writeFile(join(tmp, 'fsi-app/scripts/harness-runs/fixture-m9b/family.json'), JSON.stringify({ family: 'fixture-m9b', registered: '2026-09-18', registered_by: 'lane-m9b', governing_files: ['fsi-app/scripts/turns/fixture-m9b-runner.mjs'], rationale: 'replay fixture' }, null, 2));
    writeFile(join(tmp, 'docs/ops/session-log.d/2026-09-18-m9b.md'), '## 2026-09-18, lane M9b fixture\n\n### UX compliance (M9b)\nNot a UI change.\n');
  },
  m1: (tmp) => {
    writeFile(join(tmp, 'fsi-app/scripts/harness-runs/fixture-m1/family.json'), JSON.stringify({ family: 'fixture-m1', registered: '2026-09-18', registered_by: 'lane-m1', governing_files: ['fsi-app/scripts/turns/fixture-m1-runner.mjs'], rationale: 'replay fixture' }, null, 2));
    writeFile(join(tmp, 'docs/ops/session-log.d/2026-09-18-m1.md'), '## 2026-09-18, lane M1 fixture\n\n### UX compliance (M1)\nNot a UI change.\n');
  },
  m9a: (tmp) => {
    writeFile(join(tmp, 'fsi-app/.discipline/fitness/functions/F900-fixture-m9a.mjs'), "export const fitnessFunction = { id: 'F900', name: 'fixture-m9a', enumerate() { return []; }, check() { return []; } };\n");
    writeFile(join(tmp, 'fsi-app/.discipline/governance/invariants.d/ZZ-900.mjs'), "export const invariant = { id: 'ZZ-900', skill: 'remediation-discipline', section: 'fixture', text: 'fixture', anchor: 'fixture', exempt: { reason: 'replay fixture' } };\n");
    writeFile(join(tmp, 'docs/ops/session-log.d/2026-09-18-m9a.md'), '## 2026-09-18, lane M9a fixture\n\n### UX compliance (M9a)\nNot a UI change.\n');
  },
  w10a: (tmp) => {
    writeFile(join(tmp, 'fsi-app/.discipline/fitness/functions/F901-fixture-w10a.mjs'), "export const fitnessFunction = { id: 'F901', name: 'fixture-w10a', enumerate() { return []; }, check() { return []; } };\n");
    writeFile(join(tmp, 'fsi-app/.discipline/governance/invariants.d/ZZ-901.mjs'), "export const invariant = { id: 'ZZ-901', skill: 'remediation-discipline', section: 'fixture', text: 'fixture', anchor: 'fixture', exempt: { reason: 'replay fixture' } };\n");
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
  }

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

// ---- lane GATE-8 (2026-10-08): AUD-AT-4 B6-32, red then green ----
import { isCoordinatorBranch, effectiveBranch } from './F51-no-shared-append.mjs';

test('F51 B6-32: check 4 applies to every branch that is not the coordinator\'s, whatever its prefix', () => {
  for (const b of ['claude/zz', 'feat/x', 'fix/y', 'lane/z', 'worktree-agent-abc123', 'docs3-pass']) {
    assert.equal(isCoordinatorBranch(b), false, b);
  }
  for (const b of ['master', 'main', 'coord/docs3-pass', 'coord/adr-035']) {
    assert.equal(isCoordinatorBranch(b), true, b);
  }
  assert.equal(isCoordinatorBranch(null), false);
});

test('F51 B6-32: a branch named claude/zz that changes a coordinator-only file is caught', () => {
  const { tmp, git } = tmpRepo('f51-check4-');
  try {
    initCheck4Base(tmp, git);
    git(['checkout', '-q', '-b', 'claude/zz']);
    writeFile(join(tmp, 'docs/ops/session-log.md'), '# session log\nedit\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'non-lane-named branch edits the session log']);
    assert.equal(runCheck4(tmp).length, 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('F51 B6-32: a detached HEAD (a pull request checkout) is judged by the branch name CI provides, and an unnamed one is strict', () => {
  const { tmp, git } = tmpRepo('f51-check4-');
  try {
    initCheck4Base(tmp, git);
    git(['checkout', '-q', '-b', 'tmp-work']);
    writeFile(join(tmp, 'docs/ops/session-log.md'), '# session log\nedit\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'edit']);
    git(['checkout', '-q', '--detach']);
    assert.equal(effectiveBranch(tmp, { GITHUB_HEAD_REF: 'lane/from-ci' }), 'lane/from-ci');
    assert.equal(runCheck4(tmp, { GITHUB_HEAD_REF: 'lane/from-ci' }).length, 1, 'a PR from a lane branch is caught while detached');
    assert.deepEqual(runCheck4(tmp, { GITHUB_HEAD_REF: 'coord/docs-pass' }), [], 'the coordinator\'s branch is exempt');
    assert.equal(runCheck4(tmp, {}).length, 1, 'no name at all: the strict reading');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---- lane ENGINE-FIX-1 (2026-10-09): register RULES-X-1 S10/X10, a coordinator checkout with no CI name ----

function detachedEdit(prefix, refsAtTip) {
  const { tmp, git } = tmpRepo(prefix);
  initCheck4Base(tmp, git);
  git(['checkout', '-q', '-b', 'tmp-work']);
  writeFile(join(tmp, 'docs/PROGRAM-BOARD.md'), '# board\nedit\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'edit the board']);
  git(['checkout', '-q', '--detach']);
  git(['branch', '-q', '-D', 'tmp-work']);
  for (const r of refsAtTip) git(['update-ref', r, 'HEAD']);
  return { tmp, git };
}

test('ENGINE-FIX-1 S10: an unnamed detached HEAD sitting at the tip of a coord/ ref is the coordinator\'s (executor refresh), and a lane/ ref there is not', () => {
  const a = detachedEdit('f51-ef1-a-', ['refs/heads/coord/mig-headers-refresh']);
  const b = detachedEdit('f51-ef1-b-', ['refs/heads/lane/some-lane']);
  const c = detachedEdit('f51-ef1-c-', ['refs/heads/coord/mig-headers-refresh', 'refs/remotes/origin/lane/some-lane']);
  const d = detachedEdit('f51-ef1-d-', []);
  try {
    assert.deepEqual(runCheck4(a.tmp, {}), [], 'a detached coordinator checkout at a coord/ tip passes');
    assert.equal(runCheck4(b.tmp, {}).length, 1, 'attack: a lane/ ref at the tip still fails');
    assert.equal(runCheck4(c.tmp, {}).length, 1, 'attack: a coord/ ref sharing the tip with a lane/ ref is not a free pass');
    assert.equal(runCheck4(d.tmp, {}).length, 1, 'attack: no ref names the tip, the strict reading stands');
    assert.deepEqual(runCheck4(a.tmp, { GITHUB_HEAD_REF: 'coord/docs-pass' }), [], 'a PR head ref that starts with coord/ passes');
    assert.equal(runCheck4(a.tmp, { GITHUB_HEAD_REF: 'lane/from-ci' }).length, 1, 'attack: CI naming a lane/ head ref wins over the local coord/ ref');
  } finally {
    for (const x of [a, b, c, d]) rmSync(x.tmp, { recursive: true, force: true });
  }
});
