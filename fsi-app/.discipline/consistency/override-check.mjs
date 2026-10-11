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
//   A trailer is VALID only when (GATE-FIX-2, 2026-10-10; aud-at3 line 528, which overrode with rationale `x` and
//   a 2099 date):
//     * the rationale NAMES THE INVARIANT it overrides: the check id (C3, C-3) or a distinctive word of the
//       check's own name from the manifest (migrations, worktrees, program, anchors), and it is a sentence (at
//       least 3 words, 20 characters), so `because` or `will fix` is refused;
//     * the remediation-deadline is today-or-future AND at most MAX_DEADLINE_DAYS (30) days out, so a date in
//       2030 is not a deferral, it is a waiver.
//   (An expired deadline is NOT a valid override, the drift must be fixed or re-deadlined.)
//
// Exit codes (CLI): 0 = clean OR every failing check validly overridden; 1 = uncovered drift; 2 = runner error.

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRange } from '../lib/change-range.mjs';
import { getCheckById } from './manifest.mjs';

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

export const MAX_DEADLINE_DAYS = 30;
const MIN_RATIONALE_WORDS = 3;
const MIN_RATIONALE_CHARS = 20;
const GENERIC_NAME_WORDS = new Set(['reality', 'check', 'file', 'files']);
const DAY_MS = 24 * 60 * 60 * 1000;

// The words that name a check's invariant: the words of its manifest name (`migrations.md reality` gives
// `migrations`), generic words dropped. A rationale naming the check id satisfies the rule without any of these.
export function invariantTerms(id) {
  const check = getCheckById(id);
  if (!check || !check.name) return [];
  return String(check.name).toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !GENERIC_NAME_WORDS.has(w));
}

// Does this rationale name the invariant of check `id` ('C3')? The id itself (C3 or C-3, whole token) or a
// distinctive word of the check's name (singular stem, so `migration` matches `migrations`).
export function namesInvariant(rationale, id) {
  const text = String(rationale || '');
  const n = id.replace(/^C/, '');
  if (new RegExp(String.raw`\bC-?${n}\b`, 'i').test(text)) return true;
  const lower = text.toLowerCase();
  return invariantTerms(id).some((w) => new RegExp(String.raw`\b${w.replace(/s$/, '')}`).test(lower));
}

// Parse VALID Consistency-Override trailers across the given commit messages -> Set of normalized ids
// ('C3'). Valid = a rationale that names the invariant (see header) AND a remediation-deadline that is today or
// later and at most MAX_DEADLINE_DAYS out. `C-3` and `C3` both accepted.
export function parseValidOverrides(messages, { now = new Date() } = {}) {
  const out = new Set();
  const re = /Consistency-Override:\s*(C-?\d+)\s*\(rationale:\s*([^;]+?);\s*remediation-deadline:\s*(\d{4}-\d{2}-\d{2})\)/g;
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const lastUTC = todayUTC + MAX_DEADLINE_DAYS * DAY_MS;
  for (const msg of messages || []) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(msg || '')) !== null) {
      const id = m[1].replace('-', '');
      const rationale = (m[2] || '').trim();
      const deadlineMs = Date.parse(m[3] + 'T00:00:00Z');
      const sentence = rationale.length >= MIN_RATIONALE_CHARS && rationale.split(/\s+/).length >= MIN_RATIONALE_WORDS;
      const dated = !Number.isNaN(deadlineMs) && deadlineMs >= todayUTC && deadlineMs <= lastUTC;
      if (sentence && namesInvariant(rationale, id) && dated) out.add(id);
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
function messageForCommit(sha, cwd) {
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
  } else if (get('--commit')) {
    messages = messageForCommit(get('--commit'), cwd);
  } else {
    // Range resolution via change-range.mjs's resolveRange() (lane R23 item 1, 2026-10-02): an explicit
    // --range is honored verbatim (manual diagnosis); otherwise BASE_REF+PR_HEAD resolve to an ACTUAL
    // merge-base commit (not the base ref's tip), or the local merge-base against origin/master fires --
    // the SAME function runner.mjs and F51 already resolve through, so this caller cannot build its own
    // drifted range string. Before this fix, every caller passed a literal --range= string by hand (the
    // CI consistency-backstop job, assemble-train.mjs's runGateSet()); this flag's own hand-built two-dot
    // shape was never exposed to the tree-diff defect rule 022 hit (this file only reads commit MESSAGES
    // via `git log`, never diffs file content), but leaving it hand-built meant one more caller free to
    // drift from the others. No --range, no CI env, no --commit falls back to messageForCommit('HEAD')
    // exactly as before (a bare local run with nothing to resolve against).
    const resolved = resolveRange({ explicit: get('--range'), env: process.env, cwd });
    messages = resolved.range ? messagesForRange(resolved.range, cwd) : messageForCommit('HEAD', cwd);
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
  console.error('    Consistency-Override: C<N> (rationale: <a sentence naming C<N> or its invariant>; remediation-deadline: YYYY-MM-DD, today to +30 days)');
  process.exit(1);
}
