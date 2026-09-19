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
//             fsi-app/scripts/harness-runs/**, fsi-app/scripts/turns/LAST-TURN.json (run records, not
//             code, emitted by GitHub-Actions runtimes on their own branches; gating those PRs on a
//             session-log addendum would demand a first-person memory entry from a machine, corpus-turn
//             PR #509 failed here 2026-09-01), and fsi-app/scripts/turns/record-briefs/batches/** (D20,
//             defect-fix-plan-2026-09-12.md, lane L12, 2026-09-13: brief-lane/002's push failed step 2b
//             because a lane-emitted batch file under this path matched CODE with no session-log change
//             on that branch -- the SAME arrangement as harness-runs/LAST-TURN.json: a batch file is
//             lane-emitted DATA on an apply-target branch that is never merged, its own memory is the
//             proposer pass on master, not a first-person entry on a throwaway branch).
//   MEMORY  = changed paths that are exactly docs/ops/session-log.md or docs/PROGRAM-BOARD.md, OR that
//             match docs/ops/session-log.d/YYYY-MM-DD-<slug>.md (D28, defect-fix-plan-2026-09-12.md, W9
//             lane L18: every lane appended to the ONE session-log.md file, so every rebase onto a master
//             that merged another lane's own appended entry conflicted on it -- four lanes hit that
//             conflict in one night, and two push chains swallowed the conflict and pushed half-rebased
//             trees that then failed CI's own memory gate. A per-lane-per-day file under session-log.d/
//             satisfies the SAME vault requirement without a shared file to conflict on; the single
//             session-log.md file stays for coordinator entries -- see docs/ops/session-log.d/README.md).
//   SURFACE = changed paths under fsi-app/src/**/*.{tsx,css}.
//   Memory gate:  CODE non-empty AND MEMORY empty -> FAIL.
//   UX gate:      SURFACE non-empty AND the session-log addendum diff for the range (docs/ops/
//                 session-log.md or the lane's own docs/ops/session-log.d file) has no ADDED line ("^+")
//                 containing "UX compliance" -> FAIL. Not applicable (no message) when SURFACE is empty.
//                 (Lane D28b, 2026-09-19: before this fix the CLI main fed uxGateVerdict ONLY docs/ops/
//                 session-log.md's own diff, so a lane that wrote its UX compliance block into its own
//                 docs/ops/session-log.d/ file per D28 above -- exactly what memoryGateVerdict already
//                 accepts -- was refused at push; memoryDiffPaths() below is the fix, see its own header.)
//
// PURE CORE (classifyChanged / memoryGateVerdict / uxGateVerdict / memoryDiffPaths) takes plain
// arrays/strings, no git, so memory-gate.test.mjs needs no repo fixture. LIVE DRIVER below gathers
// `git diff --name-only <range>` and, for every memoryDiffPaths() path, that path's own diff text for
// the range, concatenated in order. node builtins + relative imports only (no-npm discipline glob;
// fsi-app/.discipline/glob-portability.test.mjs enforces this transitively).
//
// DELIBERATE PARITY DEVIATION (review-7.8.md finding F1, coordinator ruling D6, 2026-09-12): the
// original inline shell exited the whole step the moment the memory gate failed on a pull_request
// event, so a range failing BOTH gates only ever printed the memory gate's own error, never the UX
// gate's. This CLI evaluates and prints both verdicts unconditionally, so a combined failure on
// pull_request prints TWO error lines instead of one. Ruling: keep the new behaviour on purpose (a lane
// sees every failure in one run instead of fixing one, re-pushing, and hitting the next) rather than
// re-introduce the short-circuit. The exit code is identical either way (both shapes fail the step), so
// this changes nothing about what CI enforces, only how much of the failure a lane sees at once.

import { execFileSync } from 'node:child_process';
import { isMainModule } from '../../scripts/lib/is-main.mjs';

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PURE CORE
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

const CODE_RE = /^fsi-app\/(src|supabase\/migrations|scripts|\.discipline)\//;
const CODE_EXCLUDE_RE = /^fsi-app\/scripts\/(harness-runs\/|turns\/LAST-TURN\.json$|turns\/record-briefs\/batches\/)/;
const MEMORY_RE = /^docs\/(ops\/session-log\.md|PROGRAM-BOARD\.md)$/;
// D28 (defect-fix-plan-2026-09-12.md, W9 lane L18): a per-lane-per-day session-log file also satisfies
// the vault requirement - see docs/ops/session-log.d/README.md for the entry format and the "one file per
// lane per day, never edit another lane's file" rule. README.md itself does not match (no date/slug), so
// adding the README does not, on its own, satisfy the memory gate for a code-only range - by design.
const SESSION_LOG_D_RE = /^docs\/ops\/session-log\.d\/\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]+\.md$/;
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
  const memory = list.filter((f) => MEMORY_RE.test(f) || SESSION_LOG_D_RE.test(f));
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
        `Memory gate: this range (${range}) touches code but none of docs/ops/session-log.md, ` +
        `docs/PROGRAM-BOARD.md, or a docs/ops/session-log.d/YYYY-MM-DD-<slug>.md file. The vault is the ` +
        `project memory; a change it does not record is invisible to every future session. Append a ` +
        `session-log addendum (docs/ops/session-log.md, or your own docs/ops/session-log.d/ file - see ` +
        `its README.md), or update PROGRAM-BOARD, in this PR.`,
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
  // Trailing space matches the original shell's `tr '\n' ' '` behaviour (a space after every filename,
  // including the last), so the ellipsis below sits exactly where the original's did (review-7.8.md F2:
  // byte-identical message, U+2026 restored, not the "..." three-ASCII-period placeholder this file
  // shipped with in fix round 0 -- U+2026 is not in the banned em-dash/en-dash/section-sign set).
  const sample = surface.slice(0, 3).join(' ') + ' ';
  return {
    applicable: true,
    ok: false,
    message:
      `UX compliance gate: this range (${range}) touches a customer surface (${sample}…) but the ` +
      `session-log addendum in the same range (docs/ops/session-log.md or the lane's own docs/ops/` +
      `session-log.d file) has no 'UX compliance' block (docs/design/ux-laws.md, DP-2). Add it: per ` +
      `screen, the primary goal, the path, the one primary action, the feedback state per async action.`,
    warnNote: 'warn-only on push',
  };
}

/**
 * Lane D28b (2026-09-19): the UX-compliance check's `hasComplianceLine` scan only ever saw
 * `docs/ops/session-log.md`'s own diff, because the CLI main below built `sessionLogDiffLines` from
 * that one path alone -- so a lane that writes its UX compliance block into its own
 * `docs/ops/session-log.d/YYYY-MM-DD-<slug>.md` file (D28's own fix, the mechanism this file's header
 * already documents under MEMORY) was refused at push even though the vault requirement was satisfied.
 * `memoryGateVerdict` already accepted the per-lane file; only the UX half never learned about it.
 *
 * This is the pure selection function the CLI now uses: which paths' diffs should be combined and
 * handed to `uxGateVerdict`, in order. `docs/ops/session-log.md` first (if present in the range), then
 * every file matching SESSION_LOG_D_RE, in the order they appear in `files`. Nothing else -- the
 * README (no date/slug) and a malformed session-log.d name are excluded, same as `classifyChanged`'s
 * MEMORY bucket already excludes them. PURE, no filesystem, no git.
 * @param {string[]} files
 * @returns {string[]}
 */
export function memoryDiffPaths(files) {
  const list = (files || []).map((f) => (f || '').trim()).filter(Boolean);
  const paths = [];
  if (list.includes('docs/ops/session-log.md')) paths.push('docs/ops/session-log.md');
  for (const f of list) {
    if (SESSION_LOG_D_RE.test(f)) paths.push(f);
  }
  return paths;
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

/**
 * `git diff <range> -- <path>` for ONE path, as an array of diff lines (may be empty on a missing or
 * unchanged path -- never throws, matching the original single-path helper's behaviour).
 */
function gitDiffLinesForPath(range, path) {
  let out = '';
  try { out = git(['diff', range, '--', path]); } catch { out = ''; }
  return out.split(/\r?\n/);
}

/**
 * Lane D28b (2026-09-19): the memory addendum's diff for the range, combined across every path
 * `memoryDiffPaths(files)` names -- `docs/ops/session-log.md` first (if present), then each matching
 * `docs/ops/session-log.d/` file, in that order -- so `uxGateVerdict` sees the UX compliance block
 * wherever the lane actually wrote it, not only in the one shared file.
 * @param {string} range @param {string[]} files
 * @returns {string[]}
 */
export function gitMemoryDiffLines(range, files) {
  const paths = memoryDiffPaths(files);
  return paths.flatMap((p) => gitDiffLinesForPath(range, p));
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
    sessionLogDiffLines = gitMemoryDiffLines(range, files);
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
