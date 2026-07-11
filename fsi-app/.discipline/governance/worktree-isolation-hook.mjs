#!/usr/bin/env node
// WORKTREE-ISOLATION git-hook runner (RD-19). Invoked by the installed post-checkout and pre-commit
// hook scripts. Gathers the WHERE signal (git-dir vs git-common-dir) and the WHO signal (env) and runs
// the pure verdict from worktree-isolation.mjs. Prints the doctrine + a loud message and exits nonzero
// when blocked. Git hooks run in the process that invoked git, so this fires REGARDLESS of session type
// (main OR sub-agent) — that is why it catches the incident the session-scoped PreToolUse gate cannot.
//
// Modes:
//   --mode=post-checkout  → detection + LOUD alarm (git already moved HEAD; nonzero surfaces the warning)
//   --mode=pre-commit     → real BLOCK (nonzero aborts the commit)
//
// Fail-open on infra errors (missing git/node handled by the shell wrapper): a broken environment must
// not wedge every checkout/commit. The block is only ever raised on a POSITIVE, resolved violation.

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function main() {
  const mode = (process.argv.find((a) => a.startsWith('--mode=')) || '').slice('--mode='.length) || 'post-checkout';

  let evaluateCheckout, evaluateCommit;
  try {
    const m = await import(pathToFileURL(resolve(HERE, 'worktree-isolation.mjs')).href);
    evaluateCheckout = m.evaluateCheckout;
    evaluateCommit = m.evaluateCommit;
  } catch {
    process.exit(0); // detection module unavailable → do not wedge git
  }

  // WHERE: absolute git-dir (always absolute) vs git-common-dir (shared for linked worktrees).
  const gitDir = git(['rev-parse', '--absolute-git-dir']);
  const gitCommonDir = git(['rev-parse', '--git-common-dir']);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);

  const ctx = { gitDir, gitCommonDir, env: process.env, branch };
  const verdict = mode === 'pre-commit' ? evaluateCommit(ctx) : evaluateCheckout(ctx);

  if (!verdict.blocked) process.exit(0);

  const line = '='.repeat(78);
  process.stderr.write(`\n${line}\n`);
  process.stderr.write(`[worktree-isolation ${mode}] ${verdict.reason}\n\n`);
  process.stderr.write(`DOCTRINE (RD-19): ${verdict.doctrine}\n`);
  process.stderr.write(`${line}\n\n`);
  process.exit(1);
}

main();
