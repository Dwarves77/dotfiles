// RED-THEN-GREEN proof for the memory gate (task 7.8, W9 brief-chain build plan; the UX-compliance half was
// removed by lane GATE-2, 2026-10-08). Hermetic: exercises the PURE decision functions (classifyChanged / memoryGateVerdict)
// with injected file lists and diff text, no real git repo, so this needs no fixture range and cannot
// drift from a live checkout's history. Cases are the exact ones the brief names, each mirroring one
// clause of the inline shell this file replaces (.github/workflows/discipline.yml, memory-gate step).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as memoryGate from './memory-gate.mjs';
import { classifyChanged, memoryGateVerdict } from './memory-gate.mjs';

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// classifyChanged
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('classifyChanged: fsi-app/src file is CODE, not MEMORY', () => {
  const r = classifyChanged(['fsi-app/src/x.ts']);
  assert.deepEqual(r.code, ['fsi-app/src/x.ts']);
  assert.deepEqual(r.memory, []);
});

test('classifyChanged: harness-runs and LAST-TURN.json alone are NOT code', () => {
  const r = classifyChanged([
    'fsi-app/scripts/harness-runs/mint/mint-run-001.json',
    'fsi-app/scripts/turns/LAST-TURN.json',
  ]);
  assert.deepEqual(r.code, []);
});

test('classifyChanged: a real script alongside harness-runs still counts the script as CODE', () => {
  const r = classifyChanged([
    'fsi-app/scripts/harness-runs/mint/mint-run-001.json',
    'fsi-app/scripts/turns/LAST-TURN.json',
    'fsi-app/scripts/turns/record-briefs/schema.mjs',
  ]);
  assert.deepEqual(r.code, ['fsi-app/scripts/turns/record-briefs/schema.mjs']);
});

// D20 (defect-fix-plan-2026-09-12.md, lane L12, 2026-09-13): a record-briefs batch file is lane-emitted
// DATA on an apply-target branch that is never merged (the same posture harness-runs/** and
// turns/LAST-TURN.json already had) -- excluded from CODE, same as those two.
test('classifyChanged: a record-briefs batch file alone is NOT code', () => {
  const r = classifyChanged(['fsi-app/scripts/turns/record-briefs/batches/record-briefs-002.json']);
  assert.deepEqual(r.code, []);
});

test('classifyChanged: a record-briefs batch file alongside a real script still counts the script as CODE', () => {
  const r = classifyChanged([
    'fsi-app/scripts/turns/record-briefs/batches/record-briefs-002.json',
    'fsi-app/scripts/turns/record-briefs/schema.mjs',
  ]);
  assert.deepEqual(r.code, ['fsi-app/scripts/turns/record-briefs/schema.mjs']);
});

test('classifyChanged: session-log.md and PROGRAM-BOARD.md are MEMORY', () => {
  const r = classifyChanged(['docs/ops/session-log.md', 'docs/PROGRAM-BOARD.md', 'docs/other.md']);
  assert.deepEqual(r.memory, ['docs/ops/session-log.md', 'docs/PROGRAM-BOARD.md']);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// D28 (defect-fix-plan-2026-09-12.md, W9 lane L18): docs/ops/session-log.d/YYYY-MM-DD-<slug>.md also
// satisfies MEMORY, so a per-lane-per-day file ends the shared-file rebase conflicts on session-log.md.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('classifyChanged: a docs/ops/session-log.d/YYYY-MM-DD-<slug>.md file is MEMORY', () => {
  const r = classifyChanged(['docs/ops/session-log.d/2026-09-13-l18.md']);
  assert.deepEqual(r.memory, ['docs/ops/session-log.d/2026-09-13-l18.md']);
});

test('classifyChanged: docs/ops/session-log.d/README.md does NOT satisfy MEMORY (no date/slug in the name)', () => {
  const r = classifyChanged(['docs/ops/session-log.d/README.md']);
  assert.deepEqual(r.memory, []);
});

test('classifyChanged: a session-log.d file with a malformed name (no date prefix) does NOT satisfy MEMORY', () => {
  const r = classifyChanged(['docs/ops/session-log.d/l18.md', 'docs/ops/session-log.d/2026-09-13.md']);
  assert.deepEqual(r.memory, []);
});

test('memoryGateVerdict: a range adding ONLY a session-log.d file PASSES', () => {
  const v = memoryGateVerdict(['fsi-app/src/x.ts', 'docs/ops/session-log.d/2026-09-13-l18.md'], { range: 'a..b' });
  assert.equal(v.ok, true);
  assert.equal(v.message, 'memory gate OK');
});

test('memoryGateVerdict: a range with code and NONE of the three vault forms FAILS, and names the session-log.d option', () => {
  const v = memoryGateVerdict(['fsi-app/src/x.ts'], { range: 'a..b' });
  assert.equal(v.ok, false);
  assert.match(v.message, /session-log\.d\/YYYY-MM-DD-<slug>\.md/);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// memoryGateVerdict: the brief's five named cases
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('memoryGateVerdict: fsi-app/src/x.ts with no vault file FAILS', () => {
  const v = memoryGateVerdict(['fsi-app/src/x.ts'], { range: 'a..b' });
  assert.equal(v.ok, false);
  assert.match(v.message, /Memory gate/);
  assert.match(v.message, /a\.\.b/);
});

test('memoryGateVerdict: fsi-app/src/x.ts plus docs/ops/session-log.md PASSES', () => {
  const v = memoryGateVerdict(['fsi-app/src/x.ts', 'docs/ops/session-log.md'], { range: 'a..b' });
  assert.equal(v.ok, true);
  assert.equal(v.message, 'memory gate OK');
});

test('memoryGateVerdict: harness-runs and LAST-TURN.json alone are not code, PASSES with no vault file', () => {
  const v = memoryGateVerdict([
    'fsi-app/scripts/harness-runs/mint/mint-run-001.json',
    'fsi-app/scripts/turns/LAST-TURN.json',
  ]);
  assert.equal(v.ok, true);
});

// D20's own two named cases.
test('memoryGateVerdict: a range touching only a record-briefs batch file PASSES with no vault file', () => {
  const v = memoryGateVerdict(['fsi-app/scripts/turns/record-briefs/batches/record-briefs-002.json']);
  assert.equal(v.ok, true);
});

test('memoryGateVerdict: a record-briefs batch file plus a script change still FAILS without a vault file', () => {
  const v = memoryGateVerdict([
    'fsi-app/scripts/turns/record-briefs/batches/record-briefs-002.json',
    'fsi-app/scripts/turns/record-briefs/schema.mjs',
  ]);
  assert.equal(v.ok, false);
  assert.match(v.message, /Memory gate/);
});

test('memoryGateVerdict: docs-only range PASSES (no code touched at all)', () => {
  const v = memoryGateVerdict(['docs/runbooks/SOME-RUNBOOK.md', 'docs/decisions/ADR-999-x.md']);
  assert.equal(v.ok, true);
});

test('memoryGateVerdict: PROGRAM-BOARD.md alone also satisfies the vault requirement', () => {
  const v = memoryGateVerdict(['fsi-app/src/x.ts', 'docs/PROGRAM-BOARD.md']);
  assert.equal(v.ok, true);
});

test('memoryGateVerdict: empty changed-file list PASSES', () => {
  const v = memoryGateVerdict([]);
  assert.equal(v.ok, true);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// GATE-2 (2026-10-08): the UX-compliance substring gate is gone from the memory gate. It matched the words
// "UX compliance" on an added session-log line and checked no content; the rendering guard is the UX check.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('GATE-2: a .tsx/.css change with a session-log.d entry that has NO "UX compliance" block PASSES', () => {
  for (const surface of ['fsi-app/src/components/Foo.tsx', 'fsi-app/src/app/globals.css']) {
    const v = memoryGateVerdict([surface, 'docs/ops/session-log.d/2026-10-08-gate2.md'], { range: 'a..b' });
    assert.equal(v.ok, true, surface);
    assert.equal(v.message, 'memory gate OK');
  }
});

test('GATE-2: a .tsx change with NO vault entry still FAILS the memory gate (the memory half is intact)', () => {
  const v = memoryGateVerdict(['fsi-app/src/components/Foo.tsx'], { range: 'a..b' });
  assert.equal(v.ok, false);
  assert.match(v.message, /Memory gate/);
});

test('GATE-2: the UX-compliance API is gone, so no caller can still run the substring check', () => {
  assert.equal(memoryGate.uxGateVerdict, undefined);
  assert.equal(memoryGate.memoryDiffPaths, undefined);
  assert.equal(memoryGate.gitMemoryDiffLines, undefined);
  assert.equal('surface' in classifyChanged(['fsi-app/src/components/Foo.tsx']), false);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// Lane R23 item 1 (2026-10-02): the CLI's range argument is now resolved via change-range.mjs's
// resolveRange() when --range is omitted, instead of erroring. Proven directly against resolveRange +
// gitChangedFiles (the same functions the CLI main uses), not by presence.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('resolveRange (as the memory-gate CLI now calls it): BASE_REF+PR_HEAD resolves to the real ' +
  "merge-base, not the branch's own commit sha", async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { resolveRange, gitChangedFiles } = await import('../lib/change-range.mjs');

  const dir = mkdtempSync(join(tmpdir(), 'memory-gate-cli-'));
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  try {
    git(['init', '-q']);
    git(['config', '--local', 'user.name', 'memory-gate-test']);
    git(['config', '--local', 'user.email', 'memory-gate-test@example.com']);

    writeFileSync(join(dir, 'untouched.ts'), 'v1\n');
    git(['add', 'untouched.ts']);
    git(['commit', '-q', '-m', 'shared history']);
    const forkSha = git(['rev-parse', 'HEAD']).trim();
    git(['update-ref', 'refs/remotes/origin/master', forkSha]);
    const trunk = git(['symbolic-ref', '--short', 'HEAD']).trim();

    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(dir, 'docs-ops-session-log.md'), 'lane note\n');
    git(['add', 'docs-ops-session-log.md']);
    git(['commit', '-q', '-m', 'branch: own vault note']);
    const headSha = git(['rev-parse', 'HEAD']).trim();

    // Master advances AFTER the fork, touching a file the branch never touches.
    git(['checkout', '-q', trunk]);
    writeFileSync(join(dir, 'untouched.ts'), 'v2 -- master fix\n');
    git(['add', 'untouched.ts']);
    git(['commit', '-q', '-m', 'master: unrelated change after fork']);
    const masterTipSha = git(['rev-parse', 'HEAD']).trim();
    git(['update-ref', 'refs/remotes/origin/master', masterTipSha]);

    const resolved = resolveRange({ env: { BASE_REF: 'master', PR_HEAD: headSha }, cwd: dir });
    assert.equal(resolved.base, forkSha);
    const changed = gitChangedFiles(resolved.range, { cwd: dir });
    assert.deepEqual(changed, ['docs-ops-session-log.md'], 'only the branch\'s own file, never untouched.ts');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- lane GATE-8 (2026-10-08): the honest forms the AUD-AT-4 register found ACCEPTED, red then green ----

test('memory B7-10 B7-13: executable code under scripts/harness-runs/ or record-briefs/batches/ is code; run-record data still is not', () => {
  const code = classifyChanged([
    'fsi-app/scripts/harness-runs/mint/payload.mjs',
    'fsi-app/scripts/harness-runs/mint/run.sh',
    'fsi-app/scripts/turns/record-briefs/batches/apply.mjs',
  ]).code;
  assert.equal(code.length, 3);
  assert.deepEqual(classifyChanged(['fsi-app/scripts/harness-runs/mint/mint-run-001.json', 'fsi-app/scripts/harness-runs/mint/FAMILY.md', 'fsi-app/scripts/turns/LAST-TURN.json']).code, []);
  assert.equal(memoryGateVerdict(['fsi-app/scripts/harness-runs/mint/payload.mjs']).ok, false);
});

test('memory B7-11: workflows, package.json, edge functions, skills and the build config are code like any source file', () => {
  for (const f of [
    '.github/workflows/discipline.yml',
    '.github/actions/maintenance-step/action.yml',
    'fsi-app/package.json',
    'fsi-app/package-lock.json',
    'fsi-app/supabase/functions/capture-worker/index.ts',
    'fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md',
    'fsi-app/next.config.ts',
    'fsi-app/tsconfig.json',
  ]) {
    assert.equal(classifyChanged([f]).code.length, 1, f);
    assert.equal(memoryGateVerdict([f]).ok, false, `${f} with no memory entry fails`);
    assert.equal(memoryGateVerdict([f, 'docs/ops/session-log.d/2026-10-08-lane-x.md']).ok, true, `${f} with a memory entry passes`);
  }
  // docs and unrelated top-level files stay outside the code set
  assert.deepEqual(classifyChanged(['docs/specs/00.md', 'README.md', 'fsi-app/README.md']).code, []);
});

test('memory B7-13: a workflow-only commit range, read from a real git diff in a throwaway repo, fails the verdict', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'mg-e2e-'));
  try {
    const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    git('init', '-q', '-b', 'master');
    git('config', 'user.email', 't@example.test');
    git('config', 'user.name', 't');
    writeFileSync(join(dir, 'a.txt'), 'a');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    const base = git('rev-parse', 'HEAD').trim();
    mkdirSync(join(dir, '.github/workflows'), { recursive: true });
    writeFileSync(join(dir, '.github/workflows/x.yml'), 'name: x\n');
    git('add', '.');
    git('commit', '-q', '-m', 'workflow only');
    const changed = git('diff', '--name-only', base + '..HEAD').trim().split('\n');
    assert.deepEqual(changed, ['.github/workflows/x.yml']);
    assert.equal(memoryGateVerdict(changed).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── lane GATE-9 (2026-10-08): a session-log file is evidence by its content, not its name (AUD-AT-5 VC-4) ──────
import { isMemoryEvidence, rangeHead } from './memory-gate.mjs';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REAL_ENTRY = '# 2026-10-08 lane X (x): a real entry\n\n## Accomplished\n\n- Fixed the thing that was broken and proved it with a test run.\n';

test('VC-4: a one-byte file, a bare heading, an empty Accomplished section and an undated entry are NOT evidence', () => {
  for (const c of ['x', '', '# 2026-10-08 lane X\n', '# 2026-10-08 lane X\n\n## Accomplished\n\n## Decisions\n\n- a long decision line that is not an accomplishment\n', '# lane X no date\n\n## Accomplished\n\n- Fixed the thing that was broken and proved it.\n', '# 2026-10-08 x\n\n## Accomplished\n\n- done\n', null, undefined]) {
    assert.equal(isMemoryEvidence(c), false, JSON.stringify(c));
  }
});

test('VC-4: the dated heading plus an Accomplished line is evidence, in the heading, bold-label and inline forms', () => {
  assert.equal(isMemoryEvidence(REAL_ENTRY), true);
  assert.equal(isMemoryEvidence('## 2026-10-08 x\n\n**Accomplished**\n\nFixed the thing that was broken and proved it.\n'), true);
  assert.equal(isMemoryEvidence('# 2026-10-08 x\n\nAccomplished: fixed the thing that was broken and proved it.\n'), true);
  assert.equal(isMemoryEvidence(REAL_ENTRY.replace(/\n/g, '\r\n')), true, 'CRLF checkouts');
});

test('VC-4: classifyChanged with a reader counts a session-log.d file only when its content is evidence; a deleted file is none', () => {
  const code = 'fsi-app/src/lib/x.ts';
  const log = 'docs/ops/session-log.d/2026-10-08-lane-x.md';
  const verdict = (content) => memoryGateVerdict([code, log], { readMemoryFile: () => content }).ok;
  assert.equal(verdict('x'), false, 'the one-byte file fails');
  assert.equal(verdict(null), false, 'a deleted or unreadable file fails');
  assert.equal(verdict(REAL_ENTRY), true);
  assert.equal(memoryGateVerdict([code, 'docs/ops/session-log.md'], { readMemoryFile: () => null }).ok, true, 'the shared log and PROGRAM-BOARD are counted by name, as before');
  assert.equal(memoryGateVerdict([code, log]).ok, true, 'a pure-core caller with no reader keeps the name rule');
  assert.match(memoryGateVerdict([code, log], { readMemoryFile: () => 'x' }).message, /dated heading and an Accomplished line/);
});

test('rangeHead: the right-hand side of a..b and a...b, HEAD when empty or absent', () => {
  assert.equal(rangeHead('origin/master...abc123'), 'abc123');
  assert.equal(rangeHead('a..b'), 'b');
  assert.equal(rangeHead('a..'), 'HEAD');
  assert.equal(rangeHead('a'), 'HEAD');
});

/** The gate CLI, copied with its three relative imports into a throwaway git repo so a real range can be run. */
function gateFixture(fn) {
  const here = dirname(fileURLToPath(import.meta.url));
  const fsi = join(here, '..', '..');
  const dir = mkdtempSync(join(tmpdir(), 'mg-cli-'));
  try {
    for (const rel of ['.discipline/governance/memory-gate.mjs', '.discipline/lib/change-range.mjs', '.discipline/lib/gate-firings.mjs', 'scripts/lib/is-main.mjs']) {
      mkdirSync(dirname(join(dir, 'fsi-app', rel)), { recursive: true });
      copyFileSync(join(fsi, rel), join(dir, 'fsi-app', rel));
    }
    const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    git('init', '-q', '-b', 'master');
    writeFileSync(join(dir, 'README'), 'base');
    writeFileSync(join(dir, '.gitignore'), 'fsi-app/.discipline/out/\n'); // the gate writes its firings file there
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    const base = git('rev-parse', 'HEAD').trim();
    const gate = (...args) => spawnSync(process.execPath, [join(dir, 'fsi-app/.discipline/governance/memory-gate.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
    const commitFiles = (files, msg) => {
      for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), c); }
      git('add', '-A');
      git('commit', '-q', '-m', msg);
    };
    return fn({ gate, commitFiles, base });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('VC-4: through the real CLI over a real range, a code change with a one-byte session-log file exits 1, with a real entry exits 0', () => {
  gateFixture(({ gate, commitFiles, base }) => {
    commitFiles({ 'fsi-app/scripts/x.mjs': 'export const x = 1;\n', 'docs/ops/session-log.d/2026-10-08-zz.md': 'x' }, 'code plus a stub log');
    const bad = gate(`--range=${base}..HEAD`);
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    assert.match(bad.stderr, /Memory gate/);
    commitFiles({ 'docs/ops/session-log.d/2026-10-08-zz.md': REAL_ENTRY }, 'a real entry');
    const good = gate(`--range=${base}..HEAD`);
    assert.equal(good.status, 0, good.stdout + good.stderr);
    assert.match(good.stdout, /memory gate OK/);
  });
});

test('memory-gate exit status: 1 for code with no memory, 0 for the same on --warn-only, 0 for no code, 2 for an unresolvable range', () => {
  gateFixture(({ gate, commitFiles, base }) => {
    commitFiles({ 'fsi-app/scripts/y.mjs': 'export const y = 1;\n' }, 'code only');
    assert.equal(gate(`--range=${base}..HEAD`).status, 1);
    assert.equal(gate(`--range=${base}..HEAD`, '--warn-only').status, 0);
    commitFiles({ 'docs/notes.md': 'just docs' }, 'docs only');
    assert.equal(gate('--range=HEAD~1..HEAD').status, 0, 'a docs-only range has no code to record');
    assert.equal(gate('--range=no-such-ref..HEAD').status, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// ENGINE-FIX-1 (2026-10-09), register RULES-X-1 S7 / X6: refresh PRs and pre-format logs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

import { isHeaderOnlyChange, isGrandfatheredEvidence, GRANDFATHER_BEFORE, rangeBase } from './memory-gate.mjs';

const SQL_BASE = '-- subject: Migration 380 fixture\n-- 380 -- fixture.\n--\n-- NOT APPLIED. Authored by lane X.\nCREATE TABLE t (id int);\n';
const SQL_FLIPPED = '-- subject: Migration 380 fixture\n-- 380 -- fixture.\n--\n-- APPLIED (production ledger version 20261008999999, as of 2026-10-09). Authored by lane X.\nCREATE TABLE t (id int);\n';
const SQL_BODY_EDIT = SQL_FLIPPED.replace('CREATE TABLE t (id int);', 'CREATE TABLE t (id int, extra text);');

test('ENGINE-FIX-1 X6: an executor refresh PR (applied-map, ledger export, header flips) and a ledger-export-only PR need no session log', () => {
  const sql = 'fsi-app/supabase/migrations/380_fixture.sql';
  const headerOnly = (p) => (p === sql ? isHeaderOnlyChange(SQL_BASE, SQL_FLIPPED) : false);
  const refresh = [sql, 'fsi-app/supabase/migrations/APPLIED-MAP.json', 'fsi-app/.discipline/governance/harness-ledger-export.json', 'docs/inventories/migrations.md'];
  assert.equal(memoryGateVerdict(refresh, { headerOnly }).ok, true, 'the refresh shape passes with no log');
  assert.equal(memoryGateVerdict(['fsi-app/.discipline/governance/harness-ledger-export.json']).ok, true, 'a ledger-export-only PR passes');
  assert.equal(memoryGateVerdict(['fsi-app/supabase/migrations/APPLIED-MAP.json']).ok, true);
});

test('ENGINE-FIX-1 attack: a code change with no log still fails, with or without refresh files beside it, and a migration body edit is not a header flip', () => {
  const sql = 'fsi-app/supabase/migrations/380_fixture.sql';
  assert.equal(memoryGateVerdict(['fsi-app/src/x.ts']).ok, false);
  assert.equal(memoryGateVerdict(['fsi-app/src/x.ts', 'fsi-app/supabase/migrations/APPLIED-MAP.json', 'fsi-app/.discipline/governance/harness-ledger-export.json']).ok, false, 'refresh files do not launder a code change');
  assert.equal(isHeaderOnlyChange(SQL_BASE, SQL_FLIPPED), true);
  assert.equal(isHeaderOnlyChange(SQL_BASE, SQL_BODY_EDIT), false, 'a body edit is code');
  assert.equal(isHeaderOnlyChange(null, SQL_FLIPPED), false, 'a new migration is code');
  assert.equal(isHeaderOnlyChange(SQL_BASE, null), false, 'a deleted migration is code');
  const bodyEdit = (p) => (p === sql ? isHeaderOnlyChange(SQL_FLIPPED, SQL_BODY_EDIT) : false);
  assert.equal(memoryGateVerdict([sql, 'fsi-app/supabase/migrations/APPLIED-MAP.json'], { headerOnly: bodyEdit }).ok, false);
  assert.equal(memoryGateVerdict([sql]).ok, false, 'without the header reader a migration file is code, as before');
});

test('ENGINE-FIX-1 S7: a pre-format log is evidence for its own date when it has substance; a stub, or a log dated today or later in the old format, is not', () => {
  const old = 'docs/ops/session-log.d/2026-09-12-oldlane.md';
  const oldFormat = 'Did the work on the thing and confirmed the result against the live table.\n';
  assert.equal(GRANDFATHER_BEFORE, '2026-10-09');
  assert.equal(isMemoryEvidence(oldFormat), false, 'the old format is not current-format evidence');
  assert.equal(isGrandfatheredEvidence(old, oldFormat), true);
  const code = 'fsi-app/src/x.ts';
  assert.equal(memoryGateVerdict([code, old], { readMemoryFile: () => oldFormat }).ok, true, 'an in-place edit of an old dated log counts');
  assert.equal(memoryGateVerdict([code, old], { readMemoryFile: () => 'x' }).ok, false, 'attack: a one-byte log fails');
  assert.equal(memoryGateVerdict([code, old], { readMemoryFile: () => '# 2026-09-12\n\n## Accomplished\n' }).ok, false, 'attack: headings with no substance fail');
  assert.equal(memoryGateVerdict([code, old], { readMemoryFile: () => null }).ok, false, 'attack: a deleted log is no evidence');
  const today = 'docs/ops/session-log.d/2026-10-09-newlane.md';
  assert.equal(memoryGateVerdict([code, today], { readMemoryFile: () => oldFormat }).ok, false, 'attack: a log dated today needs the current format');
});

test('ENGINE-FIX-1: through the real CLI, a header flip plus the applied-map and ledger export exits 0 with no log, a body edit or a source change exits 1', () => {
  gateFixture(({ gate, commitFiles }) => {
    const sql = 'fsi-app/supabase/migrations/380_fixture.sql';
    const map = 'fsi-app/supabase/migrations/APPLIED-MAP.json';
    commitFiles({ [sql]: SQL_BASE, [map]: '{}\n' }, 'the migration lands, not applied');
    assert.equal(rangeBase('HEAD~1..HEAD'), 'HEAD~1', 'two-dot form: the left side');
    commitFiles({ [sql]: SQL_FLIPPED, [map]: '{"20261008999999":{}}\n', 'fsi-app/.discipline/governance/harness-ledger-export.json': '{}\n' }, 'executor refresh');
    const flip = gate('--range=HEAD~1..HEAD');
    assert.equal(flip.status, 0, flip.stdout + flip.stderr);
    commitFiles({ [sql]: SQL_BODY_EDIT }, 'a body edit');
    assert.equal(gate('--range=HEAD~1..HEAD').status, 1, 'attack: a migration body edit owes a log');
    commitFiles({ 'fsi-app/scripts/z.mjs': 'export const z = 1;\n', [map]: '{"1":{}}\n' }, 'a source change beside a map change');
    assert.equal(gate('--range=HEAD~1..HEAD').status, 1, 'attack: refresh files do not launder a source change');
  });
});
