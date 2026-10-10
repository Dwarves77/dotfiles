// CLOSURE NEVER-RUN with real git-history dates, end to end (lane TESTS-1, 2026-10-09; AUD-AT-4 line 461: the
// introduction dates "were exercised through the exported pure functions, not end to end").
// gatherNeverRunTargets() is the live path: it reads maintenance.yml's history with one `git log -p` scan and every
// dispatchable workflow's with one `git log --diff-filter=A --name-only` scan, then hands `introducedAt` to
// checkNeverRun. Until GATE-3 the first scan's loop ended on its own empty first element, so the index was always empty
// and no step was ever gated: the failure is silent (introducedAt null reads as "unknown age, not failed").
//
// This file proves the dates are REAL by an independent route: for each workflow target, `git log --reverse
// --diff-filter=A --format=%cI -- <file>` is asked directly and must equal the gatherer's introducedAt; and no
// maintenance step may be left undated. A dateless index (the GATE-3 defect) fails both.
//
// Run: node --test fsi-app/.discipline/governance/closure-gate-git-dates.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { gatherNeverRunTargets, checkNeverRun } from './closure-gate.mjs';
import { getRepoRoot } from '../lib/context.mjs';

const ROOT = getRepoRoot();
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).trim();

// A ledger that has never recorded a run, so every target keeps its introducedAt as the only clock and none is
// silently cleared by evidence. liveRunFn/stateFn are stubbed so the test makes no network call.
const EMPTY_LEDGER = { present: true, capturedAt: '2026-10-08', rows: [] };
const targets = () => gatherNeverRunTargets({ ledger: EMPTY_LEDGER, liveRunFn: () => null, stateFn: () => null });

test('every maintenance step on this tree carries a real introduction date from git (the GATE-3 empty-index defect)', () => {
  const steps = targets().filter((t) => t.id.startsWith('maintenance:'));
  assert.ok(steps.length > 10, `maintenance.yml lists its steps (got ${steps.length})`);
  const undated = steps.filter((t) => !(t.introducedAt instanceof Date) || Number.isNaN(t.introducedAt.getTime())).map((t) => t.id);
  assert.deepEqual(undated, [], 'no maintenance step is undated, so none escapes the NEVER-RUN window');
});

test('each dispatchable workflow introducedAt equals the committer date of the commit git says added the file', () => {
  const wf = targets().filter((t) => t.id.startsWith('workflow:'));
  assert.ok(wf.length > 5, `dispatchable workflows found (got ${wf.length})`);
  for (const t of wf) {
    const file = `.github/workflows/${t.id.slice('workflow:'.length)}`;
    const first = git(['log', '--reverse', '--diff-filter=A', '--format=%cI', '--', file]).split('\n')[0];
    assert.ok(first, `git knows when ${file} was added`);
    assert.ok(t.introducedAt instanceof Date, `${t.id} is dated`);
    assert.equal(t.introducedAt.getTime(), new Date(first).getTime(), `${t.id}: introducedAt is the commit date git reports`);
  }
});

test('end to end: a dated target with no run fails once its real age passes the window, and is clear inside it', () => {
  const t = targets().find((x) => x.id.startsWith('workflow:'));
  assert.ok(t);
  const base = t.introducedAt.getTime();
  const day = 86400000;
  const inside = checkNeverRun({ targets: [{ ...t, newestRunAt: null }], now: new Date(base + 10 * day), windowDays: 30, ledgerPresent: false });
  assert.equal(inside.ok, true, 'ten days after its introduction a never-run target is inside a 30 day window');
  const past = checkNeverRun({ targets: [{ ...t, newestRunAt: null }], now: new Date(base + 40 * day), windowDays: 30, ledgerPresent: false });
  assert.equal(past.ok, false, 'forty days after its introduction a never-run target is overdue');
  assert.equal(past.failures[0].id, t.id);
  assert.match(past.failures[0].reason, /introduced 40 days ago/);
});
