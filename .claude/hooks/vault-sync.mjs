#!/usr/bin/env node
// vault-sync: fast-forward the operator's vault checkout to origin/master.
//
// WHY. docs/ is the project memory and Obsidian is a local viewer pointed at the docs/ folder of
// the operator's main checkout. Every session works in a worktree and every merge lands on
// GitHub, so nothing ever moved that checkout: on 2026-09-18 it sat 231 commits and 211
// session-log entries behind master, a month of memory that Obsidian never showed. Git is the
// only transport (ledger skill, A0); this hook is the last hop of that transport.
//
// WHAT. Locate the vault from wherever the session runs (the parent of the shared .git dir, so a
// worktree finds it too), then fast-forward it to origin/master when, and only when, that is
// safe: the checkout is not marked bare, it is on master, no tracked file is modified, and it
// carries no local commits master lacks. Anything else prints SKIPPED with the reason and the
// fix; it never resets, never stashes, never touches untracked files.
//
// WHEN. SessionStart (settings.json), the done skill's last step, and the coordinator's merge
// train after every merge. NEVER FAILS THE SESSION: always exits 0 (a broken hook must not
// wedge a session); one line of stdout, which SessionStart adds to the session context.
//
// Set VAULT_SYNC_DISABLE=1 to make it a no-op (CI, or a machine where the checkout is not the
// vault).

import { execFileSync } from 'node:child_process';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Run git with -C dir; null on any failure. PURE apart from the subprocess.
 *  Output is trimmed unless `opts.raw`. Porcelain status MUST be read raw: a worktree modification prints as
 *  ` M path`, beginning with a space, and trimming strips that space from the FIRST entry only, turning it
 *  into `M ` (a staged change) with the first character of its path cut off. That bug shipped in the first
 *  cut of the content classifier on 2026-09-18 and made two identical files read as one phantom and one
 *  real edit; the conservative rule turned it into a refusal, never a wrong restore. */
export function git(dir, args, opts = {}) {
  try {
    const out = execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: opts.timeout ?? 30000,
    });
    return opts.raw ? out : out.trim();
  } catch {
    return null;
  }
}

/** The checkout that owns the shared .git directory: for a worktree that is the main checkout,
 *  for the main checkout itself. Null when git cannot answer. */
export function locateVault(fromDir) {
  const common = git(fromDir, ['rev-parse', '--git-common-dir']);
  if (!common) return null;
  const abs = resolve(fromDir, common);
  return basename(abs) === '.git' ? dirname(abs) : null;
}

/** Decide what to do from the observed state. PURE, unit-tested.
 *  @param {{bare:boolean, branch:string|null, dirty:number, ahead:number, behind:number, fetched:boolean}} s
 *  @returns {{action:'ff'|'noop'|'skip', reason:string}} */
export function decide(s) {
  if (s.bare) return { action: 'skip', reason: 'core.bare=true on the vault checkout; set it to false in its .git/config' };
  if (!s.fetched) return { action: 'skip', reason: 'fetch failed (offline?); nothing changed' };
  if (s.branch !== 'master') return { action: 'skip', reason: `vault is on ${s.branch ?? 'an unknown ref'}, not master; check out master there` };
  if (s.dirty > 0) return { action: 'skip', reason: `${s.dirty} tracked file(s) modified in the vault checkout; commit them through a worktree PR or restore them` };
  if (s.ahead > 0) return { action: 'skip', reason: `vault carries ${s.ahead} local commit(s) master lacks; push them or move them to a branch` };
  if (s.behind === 0) return { action: 'noop', reason: 'already at origin/master' };
  return { action: 'ff', reason: `${s.behind} commit(s) behind origin/master` };
}

/** Observe, decide, act. Returns the one-line report. Never throws. */
/** Parse `git status --porcelain -z --untracked-files=no` into [{ status, path }]. NUL-separated, so a path
 *  with spaces or quotes cannot be misread. A rename or copy emits a second NUL-separated token (the origin
 *  path); it is consumed and the entry keeps its R or C status, which the classifier treats as a real change.
 *  PURE. @param {string} out @returns {{status:string, path:string}[]} */
export function parsePorcelainZ(out) {
  const tokens = (out || '').split('\0').filter((t) => t.length > 0);
  const entries = [];
  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i].slice(0, 2);
    const path = tokens[i].slice(3);
    if (status.includes('R') || status.includes('C')) i++; // skip the origin path token
    entries.push({ status, path });
  }
  return entries;
}

/** Split the files git REPORTS as modified into phantoms and real edits, by content. PURE, unit-tested.
 *
 *  WHY (observed 2026-09-18, the day this hook landed). After its first fast-forward the vault checkout
 *  listed three tracked files as ` M` that were byte-identical to HEAD: `cmp` clean, `git diff` empty, zero
 *  carriage returns in blob and working copy, core.autocrlf and core.fileMode both false, no fsmonitor or
 *  split index, and `git update-index --refresh` did not clear them. The fast-forward range had not touched
 *  them. The cause is NOT established; four explanations were tested and refuted. The hook judged dirtiness
 *  from that report, so it synced once and then refused itself forever: Obsidian would have silently stopped
 *  updating again, the exact failure this hook exists to prevent.
 *
 *  The fix does not depend on the cause. Git can say what blob id a working file WOULD store, through the
 *  repo's own attribute and filter pipeline (`git hash-object`). When that equals the id in the index the
 *  file is unmodified by git's own definition of content: a PHANTOM. Restoring a phantom is lossless by
 *  proof. CONSERVATIVE by construction: only a plain worktree modification (` M`) whose two ids are both
 *  known and equal is a phantom. A staged change, a rename, a delete, a missing id, or any difference is a
 *  REAL edit, is never touched, and blocks the sync exactly as before.
 *  @param {{status:string, path:string, indexId:string|null, workingId:string|null}[]} entries */
export function partitionByContent(entries) {
  const phantom = [];
  const real = [];
  for (const e of entries) {
    const identical = e.status === ' M' && Boolean(e.indexId) && Boolean(e.workingId) && e.indexId === e.workingId;
    (identical ? phantom : real).push(e.path);
  }
  return { phantom, real };
}

/** Ask git which tracked files it reports as modified, with the two ids the classifier needs. */
export function reportedModified(vault) {
  const out = git(vault, ['status', '--porcelain', '-z', '--untracked-files=no'], { raw: true }) ?? '';
  return parsePorcelainZ(out).map((e) => {
    const staged = git(vault, ['ls-files', '-s', '--', e.path]);
    return {
      ...e,
      indexId: staged ? staged.split(/\s+/)[1] ?? null : null,
      workingId: git(vault, ['hash-object', '--', e.path]),
    };
  });
}

/** Observe, decide, act. Returns the one-line report. Never throws.
 *  `deps.reportedModified` is a seam for tests: the cause of git's phantom reports is unknown, so a test
 *  cannot honestly reproduce one; it injects git's (mis)report and asserts what THIS code decides. */
export function syncVault(vault, deps = {}) {
  const bare = (git(vault, ['config', '--bool', 'core.bare']) ?? 'false') === 'true';
  const fetched = bare ? false : git(vault, ['fetch', '--quiet', 'origin'], { timeout: 60000 }) !== null;
  const branch = bare ? null : git(vault, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const entries = bare ? [] : (deps.reportedModified ?? reportedModified)(vault);
  const { phantom, real } = partitionByContent(entries);
  const dirty = real.length;
  const ahead = bare ? 0 : Number(git(vault, ['rev-list', '--count', 'origin/master..HEAD']) ?? 0);
  const behind = bare ? 0 : Number(git(vault, ['rev-list', '--count', 'HEAD..origin/master']) ?? 0);
  const before = bare ? null : git(vault, ['rev-parse', '--short', 'HEAD']);
  const d = decide({ bare, branch, dirty, ahead, behind, fetched });
  const note = phantom.length ? `; ${phantom.length} phantom-modified file(s) identical to HEAD by content` : '';
  if (d.action !== 'ff') return `vault-sync: ${d.action === 'noop' ? 'up to date' : 'SKIPPED'} (${d.reason}${note}) at ${vault}`;
  // Make git agree before merging, so a fast-forward that touches a phantom file is not refused. Lossless by
  // proof: every path here has a would-store id equal to its index id.
  for (const p of phantom) git(vault, ['checkout', '--', p]);
  const merged = git(vault, ['merge', '--ff-only', '--quiet', 'origin/master']);
  const after = git(vault, ['rev-parse', '--short', 'HEAD']);
  if (merged === null || after === before) return `vault-sync: SKIPPED (fast-forward refused; run git -C "${vault}" merge --ff-only origin/master to see why${note}) at ${vault}`;
  return `vault-sync: ${before}..${after} (${d.reason}${note ? note.replace('identical to HEAD by content', 'restored, identical to HEAD by content') : ''}) at ${vault}`;
}

function main() {
  if (process.env.VAULT_SYNC_DISABLE === '1') {
    process.stdout.write('vault-sync: disabled (VAULT_SYNC_DISABLE=1)\n');
    return;
  }
  const from = process.env.CLAUDE_PROJECT_DIR || resolve(HERE, '..', '..');
  const vault = locateVault(from);
  if (!vault) {
    process.stdout.write(`vault-sync: SKIPPED (no git checkout found from ${from})\n`);
    return;
  }
  process.stdout.write(syncVault(vault) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { process.stdout.write(`vault-sync: SKIPPED (${e?.message ?? e})\n`); }
  process.exit(0);
}
