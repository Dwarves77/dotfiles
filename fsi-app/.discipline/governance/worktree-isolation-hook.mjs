#!/usr/bin/env node
// WORKTREE-ISOLATION git-hook runner (RD-19). Invoked by the installed post-checkout and pre-commit
// hook scripts. Gathers the WHERE signal (git-dir vs git-common-dir) and the WHO signal (env) and runs
// the pure verdict from worktree-isolation.mjs. Prints the doctrine + a loud message and exits nonzero
// when blocked. Git hooks run in the process that invoked git, so this fires REGARDLESS of session type
// (main OR sub-agent) — that is why it catches the incident the session-scoped PreToolUse gate cannot.
//
// Modes:
//   --mode=post-checkout        detection + LOUD alarm (git already moved HEAD; nonzero surfaces the warning)
//   --mode=pre-commit           real BLOCK (nonzero aborts the commit): any commit in the MAIN checkout
//   --mode=pre-merge-commit     the same block for a merge commit (GATE-7: pre-commit does not run for a merge)
//   --mode=post-commit          alarm for a commit that landed through a path that skips pre-commit (cherry-pick)
//   --mode=reference-transaction  alarm for an agent context moving HEAD or the checked-out branch by plumbing
//                               (reset --hard, symbolic-ref, update-ref); never blocks, the ref has moved
// Every refusal and alarm appends one line to the shared firing log (lib/firing-log.mjs) so it is countable.
//
// Fail-open on infra errors (missing git/node handled by the shell wrapper): a broken environment must
// not wedge every checkout/commit. The block is only ever raised on a POSITIVE, resolved violation.

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMainModule } from '../../scripts/lib/is-main.mjs';
import { appendFirings } from '../lib/firing-log.mjs';

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

  let evaluateCheckout, evaluateCommit, evaluateLanded, evaluateRefMove;
  try {
    const m = await import(pathToFileURL(resolve(HERE, 'worktree-isolation.mjs')).href);
    evaluateCheckout = m.evaluateCheckout;
    evaluateCommit = m.evaluateCommit;
    evaluateLanded = m.evaluateLanded;
    evaluateRefMove = m.evaluateRefMove;
  } catch {
    process.exit(0); // detection module unavailable → do not wedge git
  }

  // WHERE: absolute git-dir (always absolute) vs git-common-dir (shared for linked worktrees).
  const gitDir = git(['rev-parse', '--absolute-git-dir']);
  // --path-format=absolute is REQUIRED. Plain --git-common-dir returns a RELATIVE path ('.git')
  // in a main checkout while --absolute-git-dir is absolute, so the equality test in
  // isMainCheckout() could never be true and RD-19's pre-commit block / post-checkout alarm
  // never fired. Reproduced end-to-end 2026-08-09 in a real pre-commit hook: the commit
  // SUCCEEDED where doctrine requires a block (audit finding 10, CONFIRMED). The unit test
  // passed throughout because its fixtures were absolute/absolute — a state git never produces
  // in a main checkout.
  const gitCommonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);

  const ctx = { gitDir, gitCommonDir, env: process.env, branch };
  const verdict =
    mode === 'pre-commit' ? evaluateCommit(ctx)
      : mode === 'pre-merge-commit' ? evaluateCommit({ ...ctx, op: 'merge commit' })
        : mode === 'post-commit' ? evaluateLanded(ctx)
          : mode === 'reference-transaction' ? evaluateRefMove(ctx)
            : evaluateCheckout(ctx);

  if (!verdict.blocked) process.exit(0);
  appendFirings([{ rule: `worktree-isolation:${mode}`, mode: 'hook', path: null, line: verdict.reason, verdict: mode.startsWith('pre-') ? 'refuse' : 'alarm' }]);

  const line = '='.repeat(78);
  process.stderr.write(`\n${line}\n`);
  process.stderr.write(`[worktree-isolation ${mode}] ${verdict.reason}\n\n`);
  process.stderr.write(`DOCTRINE (RD-19): ${verdict.doctrine}\n`);
  process.stderr.write(`${line}\n\n`);
  process.exit(1);
}

// Guarded (F67, lane R20, 2026-10-01): importing this module must never run the hook.
if (isMainModule(import.meta.url)) main();
