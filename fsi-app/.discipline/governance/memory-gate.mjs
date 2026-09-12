#!/usr/bin/env node
// MEMORY GATE + UX-COMPLIANCE GATE: the two checks that were inline shell duplicated in
// .github/workflows/discipline.yml (the "Memory gate - code must not outrun the vault" step, added
// 2026-08-13, and the "UX compliance gate" appended to the same step 2026-09-03) and never run by
// fsi-app/.discipline/hooks/pre-push at all (task 7.8, W9 brief-chain build plan, 2026-09-12).
//
// THE DEFECT [CONFIRMED, both the 6.2b and 7.4e ranges had an empty `git diff --stat -- docs/ops/
// session-log.md` while their own lane preflight and the coordinator's own pre-push run were green]:
// PR #647 (task 6.2b) went red in CI at exactly this step although pre-push reported all-clear, because
// the hook has no memory-gate step at all: a range that touches code without a docs/ops/session-log.md
// or docs/PROGRAM-BOARD.md change passes the hook and fails CI. Operator ruling 2026-09-12, verbatim:
// "Why can't we make sure all of the items are wired properly before we start the work and fail." This
// file is the class fix: ONE script, invoked by BOTH CI (discipline.yml, replacing its inline shell) and
// the hook's new step 2b, so the two surfaces can never disagree again, the same "parity by
// construction" shape run-test-suite.sh already uses for pre-push step 3 / CI's discipline-engine job
// (operator ruling 2026-07-04), applied one layer up.
//
// RULES (mirrored byte-for-byte from discipline.yml's inline shell, read in full before writing this):
//   CODE    = changed paths under fsi-app/(src|supabase/migrations|scripts|.discipline)/, EXCLUDING
//             fsi-app/scripts/harness-runs/** and fsi-app/scripts/turns/LAST-TURN.json (run records, not
//             code, emitted by GitHub-Actions runtimes on their own branches; gating those PRs on a
//             session-log addendum would demand a first-person memory entry from a machine, corpus-turn
//             PR #509 failed here 2026-09-01).
//   MEMORY  = changed paths that are exactly docs/ops/session-log.md or docs/PROGRAM-BOARD.md.
//   SURFACE = changed paths under fsi-app/src/**/*.{tsx,css}.
//   Memory gate:  CODE non-empty AND MEMORY empty -> FAIL.
//   UX gate:      SURFACE non-empty AND the session-log diff for the range has no ADDED line ("^+")
//                 containing "UX compliance" -> FAIL. Not applicable (no message) when SURFACE is empty.
//
// PURE CORE (classifyChanged / memoryGateVerdict / uxGateVerdict) takes plain arrays/strings, no git,
// so memory-gate.test.mjs needs no repo fixture. LIVE DRIVER below gathers `git diff --name-only <range>`
// and the session-log's own diff text for the range. node builtins + relative imports only (no-npm
// discipline glob; fsi-app/.discipline/glob-portability.test.mjs enforces this transitively).

import { execFileSync } from 'node:child_process';
import { isMainModule } from '../../scripts/lib/is-main.mjs';

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PURE CORE
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

const CODE_RE = /^fsi-app\/(src|supabase\/migrations|scripts|\.discipline)\//;
const CODE_EXCLUDE_RE = /^fsi-app\/scripts\/(harness-runs\/|turns\/LAST-TURN\.json$)/;
const MEMORY_RE = /^docs\/(ops\/session-log\.md|PROGRAM-BOARD\.md)$/;
const SURFACE_RE = /^fsi-app\/src\/.*\.(tsx|css)$/;
const UX_COMPLIANCE_ADDED_RE = /^\+.*UX compliance/;

/**
 * Bucket a flat list of repo-relative changed paths into the three regex classes the workflow's inline
 * shell used. PURE, no filesystem, no git. @param {string[]} files
 * @returns {{ code: string[], memory: string[], surface: string[] }}
 */
export function classifyChanged(files) {
  const list = (files || []).map((f) => (f || '').trim()).filter(Boolean);
  const code = list.filter((f) => CODE_RE.test(f) && !CODE_EXCLUDE_RE.test(f));
  const memory = list.filter((f) => MEMORY_RE.test(f));
  const surface = list.filter((f) => SURFACE_RE.test(f));
  return { code, memory, surface };
}

/**
 * The memory gate's verdict for one range's changed-file list. PURE.
 * @param {string[]} files @param {{range?: string}} [opts]
 * @returns {{ ok: boolean, message: string, warnNote: string }}
 */
export function memoryGateVerdict(files, { range = '<range>' } = {}) {
  const { code, memory } = classifyChanged(files);
  if (code.length > 0 && memory.length === 0) {
    return {
      ok: false,
      message:
        `Memory gate: this range (${range}) touches code but neither docs/ops/session-log.md nor ` +
        `docs/PROGRAM-BOARD.md. The vault is the project memory; a change it does not record is ` +
        `invisible to every future session. Append a session-log addendum (or update PROGRAM-BOARD) in ` +
        `this PR.`,
      warnNote: 'warn-only on push: piecewise web-upload delivery lands code and docs as separate pushes',
    };
  }
  return { ok: true, message: 'memory gate OK', warnNote: '' };
}

/**
 * The UX-compliance gate's verdict. `sessionLogDiffLines` is the range's own diff text for
 * docs/ops/session-log.md, split into lines (as `git diff <range> -- docs/ops/session-log.md` would
 * produce), only ADDED lines ("+" prefix) count, mirroring the workflow's `grep -qE '^\+.*UX compliance'`.
 * PURE. @param {string[]} files @param {string[]} sessionLogDiffLines @param {{range?: string}} [opts]
 * @returns {{ applicable: boolean, ok: boolean, message: string|null, warnNote: string }}
 */
export function uxGateVerdict(files, sessionLogDiffLines, { range = '<range>' } = {}) {
  const { surface } = classifyChanged(files);
  if (surface.length === 0) return { applicable: false, ok: true, message: null, warnNote: '' };

  const hasComplianceLine = (sessionLogDiffLines || []).some((l) => UX_COMPLIANCE_ADDED_RE.test(l));
  if (hasComplianceLine) {
    return { applicable: true, ok: true, message: 'UX compliance gate OK', warnNote: '' };
  }
  const sample = surface.slice(0, 3).join(' ');
  return {
    applicable: true,
    ok: false,
    message:
      `UX compliance gate: this range (${range}) touches a customer surface (${sample} ...) but the ` +
      `session-log addendum added in the same range has no 'UX compliance' block (docs/design/` +
      `ux-laws.md, DP-2). Add it: per screen, the primary goal, the path, the one primary action, the ` +
      `feedback state per async action.`,
    warnNote: 'warn-only on push',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// LIVE DRIVER: git only. Everything above is pure and injectable.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 26, cwd: process.cwd() });
}

/** `git diff --name-only <range>` as a clean array of repo-relative paths. */
export function gitChangedFiles(range) {
  let out = '';
  try { out = git(['diff', '--name-only', range]); } catch (e) {
    throw new Error(`memory-gate: 'git diff --name-only ${range}' failed: ${e.message}`);
  }
  return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/** `git diff <range> -- docs/ops/session-log.md`, as an array of diff lines (may be empty). */
export function gitSessionLogDiffLines(range) {
  let out = '';
  try { out = git(['diff', range, '--', 'docs/ops/session-log.md']); } catch { out = ''; }
  return out.split(/\r?\n/);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);
  const rangeArg = args.find((a) => a.startsWith('--range='));
  const warnOnly = args.includes('--warn-only');

  if (!rangeArg) {
    console.error('[memory-gate] --range=<a>..<b> (or <a>...<b>) is required.');
    process.exit(2);
  }
  const range = rangeArg.slice('--range='.length);

  let files;
  let sessionLogDiffLines;
  try {
    files = gitChangedFiles(range);
    sessionLogDiffLines = gitSessionLogDiffLines(range);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(2);
  }

  const mem = memoryGateVerdict(files, { range });
  const ux = uxGateVerdict(files, sessionLogDiffLines, { range });

  let failed = false;
  for (const verdict of [mem, ux]) {
    if (verdict.message == null) continue; // ux gate not applicable, no line printed, same as the workflow
    if (verdict.ok) {
      console.log(verdict.message);
      continue;
    }
    failed = true;
    if (warnOnly) {
      console.log(`::warning::${verdict.message} (${verdict.warnNote})`);
    } else {
      console.error(`::error::${verdict.message}`);
    }
  }

  process.exit(failed && !warnOnly ? 1 : 0);
}
