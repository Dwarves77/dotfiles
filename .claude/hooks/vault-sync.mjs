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

/** Run git with -C dir; null on any failure. PURE apart from the subprocess. */
export function git(dir, args, opts = {}) {
  try {
    return execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: opts.timeout ?? 30000,
    }).trim();
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
export function syncVault(vault) {
  const bare = (git(vault, ['config', '--bool', 'core.bare']) ?? 'false') === 'true';
  const fetched = bare ? false : git(vault, ['fetch', '--quiet', 'origin'], { timeout: 60000 }) !== null;
  const branch = bare ? null : git(vault, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const dirtyOut = bare ? '' : (git(vault, ['status', '--porcelain', '--untracked-files=no']) ?? '');
  const dirty = dirtyOut ? dirtyOut.split(/\r?\n/).filter(Boolean).length : 0;
  const ahead = bare ? 0 : Number(git(vault, ['rev-list', '--count', 'origin/master..HEAD']) ?? 0);
  const behind = bare ? 0 : Number(git(vault, ['rev-list', '--count', 'HEAD..origin/master']) ?? 0);
  const before = bare ? null : git(vault, ['rev-parse', '--short', 'HEAD']);
  const d = decide({ bare, branch, dirty, ahead, behind, fetched });
  if (d.action !== 'ff') return `vault-sync: ${d.action === 'noop' ? 'up to date' : 'SKIPPED'} (${d.reason}) at ${vault}`;
  const merged = git(vault, ['merge', '--ff-only', '--quiet', 'origin/master']);
  const after = git(vault, ['rev-parse', '--short', 'HEAD']);
  if (merged === null || after === before) return `vault-sync: SKIPPED (fast-forward refused; run git -C "${vault}" merge --ff-only origin/master to see why) at ${vault}`;
  return `vault-sync: ${before}..${after} (${d.reason}) at ${vault}`;
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
