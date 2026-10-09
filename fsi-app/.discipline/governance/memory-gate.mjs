#!/usr/bin/env node
// MEMORY GATE: the check that was inline shell duplicated in
// .github/workflows/discipline.yml (the "Memory gate - code must not outrun the vault" step, added
// 2026-08-13) and never run by fsi-app/.discipline/hooks/pre-push at all (task 7.8, W9 brief-chain build
// plan, 2026-09-12).
//
// GATE-2 (2026-10-08): the UX-compliance half of this file is REMOVED. It was a substring match
// (a regex on an added session-log line), an attestation that checked no content: of the 209
// session-log.d files dated since 09-08, 113 carried the phrase and 15 more were "not applicable" variants
// (gate-evaluation-A section 4, H5; the manifest's 5e3ae41 "ceremony rather than enforcement" lesson). The
// rendering guard's UX smoke slot measures every row component at 375 px; that is the UX enforcement.
// Both callers (pre-push step 2b and discipline.yml's memory-gate step) run this one CLI, so both drop it.
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
//   Memory gate:  CODE non-empty AND MEMORY empty -> FAIL.
//
// PURE CORE (classifyChanged / memoryGateVerdict) takes plain arrays, no git, so memory-gate.test.mjs needs
// no repo fixture. LIVE DRIVER below gathers `git diff --name-only <range>`. node builtins + relative
// imports only (no-npm discipline glob; fsi-app/.discipline/glob-portability.test.mjs enforces this
// transitively).

import { execFileSync } from 'node:child_process';
import { isMainModule } from '../../scripts/lib/is-main.mjs';
import { gitChangedPaths, resolveRange } from '../lib/change-range.mjs';
import { recordGateFirings } from '../lib/gate-firings.mjs';

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PURE CORE
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

// CODE is every path that changes what the system does or how it is gated. Lane GATE-8 (2026-10-08, AUD-AT-4 B7-10,
// B7-11, B7-13) widened it from the four fsi-app directories: a workflow, package.json, an edge function, a skill and
// the build config change behaviour exactly as a source file does, and a change to them with no memory entry was
// invisible to the gate (a PR that edited only .github/workflows passed it).
const CODE_RE = /^(?:fsi-app\/(?:src|supabase\/migrations|supabase\/functions|scripts|\.discipline|\.claude\/skills)\/|\.github\/|fsi-app\/(?:package(?:-lock)?\.json|tsconfig\.json|next\.config\.[a-z]+)$)/;
// The exclusion is for lane-emitted DATA only: a run record, a batch file. It is by DIRECTORY AND EXTENSION, so an
// executable file placed under scripts/harness-runs/ or record-briefs/batches/ (a .mjs, a .sh, a .yml) is code, which
// is what the earlier directory-only exclusion let through (B7-10, B7-13).
const CODE_EXCLUDE_DIR_RE = /^fsi-app\/scripts\/(harness-runs\/|turns\/LAST-TURN\.json$|turns\/record-briefs\/batches\/)/;
const DATA_EXTENSION_RE = /\.(?:json|jsonl|ndjson|md|txt|csv)$/i;
const CODE_EXCLUDE_RE = { test: (f) => CODE_EXCLUDE_DIR_RE.test(f) && DATA_EXTENSION_RE.test(f) };
const MEMORY_RE = /^docs\/(ops\/session-log\.md|PROGRAM-BOARD\.md)$/;
// D28 (defect-fix-plan-2026-09-12.md, W9 lane L18): a per-lane-per-day session-log file also satisfies
// the vault requirement - see docs/ops/session-log.d/README.md for the entry format and the "one file per
// lane per day, never edit another lane's file" rule. README.md itself does not match (no date/slug), so
// adding the README does not, on its own, satisfy the memory gate for a code-only range - by design.
const SESSION_LOG_D_RE = /^docs\/ops\/session-log\.d\/\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]+\.md$/;

/**
 * Is this file's CONTENT memory evidence (lane GATE-9, 2026-10-08, AUD-AT-5 VC-4)? A per-lane session-log file
 * satisfied the gate by its NAME alone: a one-byte file containing "x" passed. Evidence is the dated heading the
 * README's entry format starts with plus at least one Accomplished line:
 *   - a heading (`#` to `###`) that carries a YYYY-MM-DD date, and
 *   - an "Accomplished" heading or label followed by at least one substantive line (20 characters or more) before
 *     the next heading, or "Accomplished: <text>" with that much text on the same line.
 * PURE. @param {string|null|undefined} content @returns {boolean}
 */
export function isMemoryEvidence(content) {
  if (typeof content !== 'string') return false;
  const lines = content.split(/\r?\n/);
  if (!lines.some((l) => /^#{1,3}\s+.*\b\d{4}-\d{2}-\d{2}\b/.test(l))) return false;
  const bare = (text) => text.replace(/[*_`]/g, '').trim();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,4}\s*)?\**\s*accomplished\b\**\s*(?:[:(-]\s*(.*))?$/i);
    if (!m) continue;
    const isHeading = Boolean(m[1]);
    if (!isHeading && bare(m[2] ?? '').length >= 20) return true;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^#{1,4}\s/.test(lines[j])) break;
      if (bare(lines[j].replace(/^[\s>*+\-\d.]+/, '')).length >= 20) return true;
    }
  }
  return false;
}

// GRANDFATHERED LOGS (lane ENGINE-FIX-1, 2026-10-09; register RULES-X-1 S7/X6). The dated-heading plus Accomplished
// format was fixed by GATE-9 on 2026-10-08; 147 of the 276 session-log.d files written before it do not meet it (95 of
// 105 in September, 52 of 171 in October) and they are the only memory those days have. A log whose FILE DATE is
// before this day is evidence for its own date when it carries substance: one line of GRANDFATHER_MIN_LINE characters
// or more that is not a heading. A file dated this day or later needs the full format, and a stub of any date still
// fails (a one-byte log is not memory).
export const GRANDFATHER_BEFORE = '2026-10-09';
const GRANDFATHER_MIN_LINE = 20;

export function isGrandfatheredEvidence(path, content) {
  const m = String(path).match(/session-log\.d\/(\d{4}-\d{2}-\d{2})-/);
  if (!m || m[1] >= GRANDFATHER_BEFORE || typeof content !== 'string') return false;
  return content.split(/\r?\n/).some((l) => !/^#{1,6}\s/.test(l) && l.replace(/[*_`>|\-+]/g, '').trim().length >= GRANDFATHER_MIN_LINE);
}

// REFRESH FILES (lane ENGINE-FIX-1). The executor's post-merge refresh regenerates the migration applied-map and the
// harness ledger export from the live ledger and flips migration headers; a PR made only of those (plus the generated
// inventories, which are docs and never code) records nothing a first-person log could add. These are not CODE for
// this gate. A refresh file alongside a real code change leaves that change as CODE, so the log is still owed.
const REFRESH_FILE_RE = /^fsi-app\/(?:supabase\/migrations\/APPLIED-MAP\.json|\.discipline\/governance\/harness-ledger-export\.json)$/;
const MIGRATION_SQL_RE = /^fsi-app\/supabase\/migrations\/[^/]+\.sql$/;

/** The text after a file's leading comment block (the lines before the first SQL statement). PURE. */
function afterHeaderBlock(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const at = lines.findIndex((l) => l.trim() !== '' && !l.trimStart().startsWith('--'));
  return at === -1 ? '' : lines.slice(at).join('\n');
}

/** True when two versions of a migration differ only inside the leading comment block (a header flip). A new or deleted file is not. PURE. */
export function isHeaderOnlyChange(baseText, headText) {
  if (typeof baseText !== 'string' || typeof headText !== 'string') return false;
  return afterHeaderBlock(baseText) === afterHeaderBlock(headText);
}

/**
 * Bucket a flat list of repo-relative changed paths into the two regex classes the workflow's inline
 * shell used. PURE, no filesystem, no git. @param {string[]} files
 * `headerOnly(path)` (the CLI passes it) answers whether a changed migration .sql differs from the base only in its
 * header comments; without it a migration file is code, as before.
 * @returns {{ code: string[], memory: string[] }}
 */
export function classifyChanged(files, { readMemoryFile, headerOnly } = {}) {
  const list = (files || []).map((f) => (f || '').trim()).filter(Boolean);
  const code = list.filter((f) => CODE_RE.test(f) && !CODE_EXCLUDE_RE.test(f) && !REFRESH_FILE_RE.test(f)
    && !(headerOnly && MIGRATION_SQL_RE.test(f) && headerOnly(f)));
  // With readMemoryFile (the CLI always passes it) a per-lane session-log file counts only when its content is
  // evidence (isMemoryEvidence, or a grandfathered pre-format log with substance); without it (a pure-core caller)
  // the name alone counts, as before.
  const isEvidence = (f) => {
    const content = readMemoryFile(f);
    return isMemoryEvidence(content) || isGrandfatheredEvidence(f, content);
  };
  const memory = list.filter((f) => MEMORY_RE.test(f) || (SESSION_LOG_D_RE.test(f) && (!readMemoryFile || isEvidence(f))));
  return { code, memory };
}

/**
 * The memory gate's verdict for one range's changed-file list. PURE.
 * @param {string[]} files @param {{range?: string}} [opts]
 * @returns {{ ok: boolean, message: string, warnNote: string }}
 */
export function memoryGateVerdict(files, { range = '<range>', readMemoryFile, headerOnly } = {}) {
  const { code, memory } = classifyChanged(files, { readMemoryFile, headerOnly });
  if (code.length > 0 && memory.length === 0) {
    return {
      ok: false,
      message:
        `Memory gate: this range (${range}) touches code but none of docs/ops/session-log.md, ` +
        `docs/PROGRAM-BOARD.md, or a docs/ops/session-log.d/YYYY-MM-DD-<slug>.md file with a dated heading and an Accomplished line. The vault is the ` +
        `project memory; a change it does not record is invisible to every future session. Append a ` +
        `session-log addendum (docs/ops/session-log.md, or your own docs/ops/session-log.d/ file - see ` +
        `its README.md), or update PROGRAM-BOARD, in this PR.`,
      warnNote: 'warn-only on push: piecewise web-upload delivery lands code and docs as separate pushes',
    };
  }
  return { ok: true, message: 'memory gate OK', warnNote: '' };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// LIVE DRIVER: git only, via fsi-app/.discipline/lib/change-range.mjs (lane N0, plan section 6.8 Rule
// C -- this file's own private gitChangedFiles copy moved there, alongside
// F45-duplicate-code.mjs's equivalent copy, so the two gates cannot silently disagree on what "changed
// in this range" means). change-range.mjs also fixes Amendment 1 item 4 (operator, 2026-09-19): its git
// calls resolve the repository top level from the module's own path, never from process.cwd(), so this
// CLI now gives the same verdict whether it is run from the repo root or from fsi-app/ -- see that
// module's header for the defect this replaces.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** The range's head revision: the right-hand side of `a..b` or `a...b`, HEAD when it is empty. @param {string} range */
export function rangeHead(range) {
  const m = String(range).match(/^.*?\.{2,3}(.*)$/);
  return m && m[1].trim() ? m[1].trim() : 'HEAD';
}

/** A file's content at the range head, or null when it does not exist there (a deleted file is no evidence). */
function readAtRangeHead(range, path) {
  try {
    return execFileSync('git', ['show', `${rangeHead(range)}:${path}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

/** The revision a range starts from: the left side of `a..b`, the merge base of `a...b`, or null when it cannot be read. */
export function rangeBase(range) {
  const r = String(range);
  try {
    if (r.includes('...')) {
      const [a, b] = r.split('...');
      return execFileSync('git', ['merge-base', a || 'HEAD', b || 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
    }
    const m = r.match(/^(.*?)\.\.(.*)$/);
    return m && m[1].trim() ? m[1].trim() : null;
  } catch {
    return null;
  }
}

/** A file's content at the range base, or null when it does not exist there. */
function readAtRangeBase(range, path) {
  const base = rangeBase(range);
  if (!base) return null;
  try {
    return execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);
  const rangeArg = args.find((a) => a.startsWith('--range='));
  const warnOnly = args.includes('--warn-only');

  // Range resolution via change-range.mjs's resolveRange() (lane R23 item 1, 2026-10-02): an explicit
  // --range is honored verbatim (both of discipline.yml's push-event shapes pass an exact before/after
  // SHA pair here, not a branch-tip-relative range, so they are not exposed to the tip-vs-merge-base
  // defect and keep passing --range explicitly); omitted, BASE_REF+PR_HEAD resolve to an ACTUAL
  // merge-base commit, or the local merge-base against origin/master fires -- the SAME function
  // runner.mjs, override-check.mjs, and F51 resolve through. Before this fix, pre-push step 2b passed
  // the literal `--range=origin/master..HEAD` (tip-vs-tip) by hand.
  const resolved = resolveRange({ explicit: rangeArg ? rangeArg.slice('--range='.length) : undefined, env: process.env });
  if (resolved.source === 'unavailable' || !resolved.range) {
    console.error(`[memory-gate] could not resolve a range${resolved.reason ? ` (${resolved.reason})` : ''}. Pass --range=<a>..<b> (or <a>...<b>) explicitly.`);
    process.exit(2);
  }
  const range = resolved.range;

  let files;
  try {
    // gitChangedPaths (GATE-7): a rename is a delete of its source plus an add of its destination, so code
    // moved out of the CODE directories still counts as a code change that needs a memory entry.
    files = gitChangedPaths(range);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(2);
  }

  const verdict = memoryGateVerdict(files, { range, readMemoryFile: (p) => readAtRangeHead(range, p), headerOnly: (p) => isHeaderOnlyChange(readAtRangeBase(range, p), readAtRangeHead(range, p)) });
  // every refusal is a logged firing (lane GATE-8, 2026-10-08); a pass clears the gate's records
  recordGateFirings('memory-gate', verdict.ok ? [] : [{ message: verdict.message }]);
  if (verdict.ok) {
    console.log(verdict.message);
    process.exit(0);
  }
  if (warnOnly) {
    console.log(`::warning::${verdict.message} (${verdict.warnNote})`);
    process.exit(0);
  }
  console.error(`::error::${verdict.message}`);
  process.exit(1);
}
