#!/usr/bin/env node
// OVERRIDE-AWARE CONSISTENCY CHECK — the single primitive shared by the three enforcement surfaces that
// must run the consistency runner AND honor `Consistency-Override:` trailers:
//   1. rule 014 (commit-time, inventory-edit-triggered)      — imports parseDriftCheckIds/parseValidOverrides
//   2. the pre-push hook (local, all pushed commits)         — via prepush-consistency.mjs
//   3. the CI "consistency backstop" job (always-on)         — via this file's CLI (--range / --commit)
//
// WHY this exists: the runner (runner.mjs) reports C3/C4/C5 drift but knows nothing about overrides; the
// override VOCABULARY was duplicated (rule 014 parsed it; the pre-push hook ADVERTISED it but never parsed
// it — g1b defect). One home for "run the runner + treat a C-check as overridden by a VALID trailer" keeps
// the three surfaces from drifting.
//
// Override contract (sprint-followups-discipline § Inventory consistency rule):
//   Consistency-Override: C<N> (rationale: <non-empty text>; remediation-deadline: YYYY-MM-DD)
//   A trailer is VALID only when the rationale is non-empty AND the remediation-deadline is today-or-future.
//   (An expired deadline is NOT a valid override — the drift must be fixed or re-deadlined.)
//
// Exit codes (CLI): 0 = clean OR every failing check validly overridden; 1 = uncovered drift; 2 = runner error.

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = resolve(HERE, 'runner.mjs');

// Parse the failing C-check ids from the runner's STDERR (it writes drift records via console.error as
// `  [C3] <kind>`). Mirrors rule 014's stderr-only parse so "Running [Cn]" stdout lines never false-fail.
export function parseDriftCheckIds(stderr) {
  const ids = new Set();
  const re = /^\s*\[C(\d+)\]/gm;
  let m;
  while ((m = re.exec(stderr || '')) !== null) ids.add('C' + m[1]);
  return ids;
}

// Parse VALID Consistency-Override trailers across the given commit messages → Set of normalized ids
// ('C3'). Valid = non-empty rationale AND remediation-deadline today-or-future. `C-3` and `C3` both accepted.
export function parseValidOverrides(messages, { now = new Date() } = {}) {
  const out = new Set();
  const re = /Consistency-Override:\s*(C-?\d+)\s*\(rationale:\s*([^;]+?);\s*remediation-deadline:\s*(\d{4}-\d{2}-\d{2})\)/g;
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (const msg of messages || []) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(msg || '')) !== null) {
      const id = m[1].replace('-', '');
      const rationale = (m[2] || '').trim();
      const deadlineMs = Date.parse(m[3] + 'T00:00:00Z');
      if (rationale.length > 0 && !Number.isNaN(deadlineMs) && deadlineMs >= todayUTC) out.add(id);
    }
  }
  return out;
}

// Pure verdict from a runner result + the pushed/committed messages.
export function evaluate({ runnerStatus, stderr, messages, now }) {
  if (runnerStatus === 0) return { ok: true, failing: [], overridden: [], uncovered: [], runnerError: false };
  if (runnerStatus === 2) return { ok: false, failing: [], overridden: [], uncovered: [], runnerError: true };
  const failing = [...parseDriftCheckIds(stderr)];
  const overridden = [...parseValidOverrides(messages, { now })];
  const uncovered = failing.filter((c) => !overridden.includes(c));
  // Mirror rule 014: pass only when drift was actually parsed AND all of it is validly overridden.
  const ok = failing.length > 0 && uncovered.length === 0;
  return { ok, failing, overridden, uncovered, runnerError: false };
}

export function runConsistencyRunner({ cwd } = {}) {
  const r = spawnSync(process.execPath, [RUNNER], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], cwd });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// ---- git helpers (CLI only) ----
function git(args, cwd) {
  const r = spawnSync('git', args, { encoding: 'utf-8', cwd });
  return r.status === 0 ? (r.stdout || '') : '';
}
// Commit messages (%B) for a range or single commit, as an array (one string per commit).
export function messagesForRange(range, cwd) {
  const out = git(['log', '--format=%B%x00', range], cwd);
  return out.split('\0').map((s) => s.trim()).filter(Boolean);
}
export function messageForCommit(sha, cwd) {
  const out = git(['log', '-1', '--format=%B', sha], cwd);
  return out.trim() ? [out.trim()] : [];
}
// Parse git's pre-push ref-update lines (`<local ref> <local sha> <remote ref> <remote sha>`), returning
// the commit messages for every commit being pushed. Zero remote sha (new branch) → commits not on any remote.
export function messagesFromPrepushStdin(stdin, cwd) {
  const ZERO = /^0+$/;
  const msgs = [];
  for (const line of (stdin || '').split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const [, localSha, , remoteSha] = parts;
    if (!localSha || ZERO.test(localSha)) continue; // deleting a ref — nothing to check
    const out = ZERO.test(remoteSha)
      ? git(['log', '--format=%B%x00', localSha, '--not', '--remotes'], cwd)
      : git(['log', '--format=%B%x00', `${remoteSha}..${localSha}`], cwd);
    for (const s of out.split('\0').map((x) => x.trim()).filter(Boolean)) msgs.push(s);
  }
  return msgs;
}

// ---- CLI ----
const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('consistency/override-check.mjs');
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const get = (k) => { const a = args.find((x) => x.startsWith(k + '=')); return a ? a.slice(k.length + 1) : null; };
  const cwd = process.cwd();

  let messages = [];
  if (args.includes('--prepush')) {
    const { readFileSync } = await import('node:fs');
    let stdin = ''; try { stdin = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
    messages = messagesFromPrepushStdin(stdin, cwd);
    // Fallback: if git gave us nothing (e.g. manual run), consider HEAD so a HEAD-trailer override still counts.
    if (!messages.length) messages = messageForCommit('HEAD', cwd);
  } else if (get('--range')) {
    messages = messagesForRange(get('--range'), cwd);
  } else if (get('--commit')) {
    messages = messageForCommit(get('--commit'), cwd);
  } else {
    messages = messageForCommit('HEAD', cwd);
  }

  const runner = runConsistencyRunner({ cwd });
  if (runner.status === 2) {
    console.error('[consistency backstop] runner ERROR (exit 2):');
    console.error(runner.stderr);
    process.exit(2);
  }
  const verdict = evaluate({ runnerStatus: runner.status, stderr: runner.stderr, messages });
  if (verdict.ok) {
    if (verdict.failing.length) {
      console.log(`[consistency backstop] drift present but VALIDLY OVERRIDDEN: ${verdict.failing.join(', ')} (overrides: ${verdict.overridden.join(', ')}).`);
    } else {
      console.log('[consistency backstop] consistency runner clean (no drift).');
    }
    process.exit(0);
  }
  console.error('[consistency backstop] FAIL: uncovered consistency drift.');
  if (runner.stderr) console.error(runner.stderr);
  console.error(`  failing: ${verdict.failing.join(', ') || '(none parsed — runner exit ' + runner.status + ')'}`);
  console.error(`  valid overrides: ${verdict.overridden.join(', ') || '(none)'}`);
  console.error(`  uncovered: ${verdict.uncovered.join(', ') || '(all)'}`);
  console.error('  Fix the drift, or add a VALID trailer per failing check:');
  console.error('    Consistency-Override: C<N> (rationale: <non-empty>; remediation-deadline: YYYY-MM-DD[future])');
  process.exit(1);
}
