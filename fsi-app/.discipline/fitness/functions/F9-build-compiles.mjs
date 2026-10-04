// F9: The project must typecheck cleanly (tsc --noEmit exits 0).
// Source: OBS-64 (Sprint Architecture verification surface gap; Vercel build
// failed on master commit 2494a74 because the F8 refactor updated runtime
// field reads but not TypeScript type definitions).
//
// Rationale: prior fitness functions check code patterns and architectural
// invariants, but none of them run the actual TypeScript compiler. A refactor
// that breaks types passes every other gate locally and fails only when
// Vercel runs `npm run build`. F9 closes that gap: every fitness run invokes
// `tsc --noEmit` against fsi-app/ and reports any compilation errors.
//
// Scope: this function is special-shaped. It does not iterate per-file via
// enumerate()/check(); instead it runs the TypeScript compiler once against
// the whole fsi-app/ project and parses the output. The runner's per-file
// loop calls check() once with a sentinel filepath; the function does its
// whole-project compile inside that single call.
//
// Performance: tsc --noEmit on this codebase takes ~10-15s. Acceptable for
// CI (separate fitness-check job). For local commit-msg hook, F9 is excluded
// by default (would slow every commit); future pre-push hook can include it.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { violation, PASS } from '../lib/result.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { tryResolveAppDep } from '../../lib/resolve-dep.mjs';

// Sentinel filepath: the runner enumerates this single "file" and calls check()
// on it. The check then runs tsc against the whole fsi-app project.
const SENTINEL = 'fsi-app/tsconfig.json';

function findTsc() {
  // The compiler's own entry script, found the way Node resolves it from fsi-app/ (in-tree install,
  // or the shared install a linked worktree reaches through its parent directory), and run with the
  // same node binary. Never the literal fsi-app/node_modules/.bin path (RD-85).
  return tryResolveAppDep('typescript/bin/tsc');
}

function runTypecheck() {
  const tsc = findTsc();
  const fsiAppDir = join(getRepoRoot(), 'fsi-app');

  // If no local tsc and no clear fallback: surface a precise error.
  if (!tsc) {
    return {
      ok: false,
      output: 'typescript does not resolve from fsi-app/. In a linked worktree run: sh fsi-app/.discipline/hooks/lib/worktree-node-modules.sh --link ; in the main checkout: cd fsi-app && npm ci',
      errCode: 'TSC_NOT_FOUND',
    };
  }

  // No shell: node runs the resolved entry script directly, identically on POSIX and Windows.
  const result = spawnSync(process.execPath, [tsc, '--noEmit', '-p', fsiAppDir], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status === 0) return { ok: true, output: '' };
  return {
    ok: false,
    output: (result.stdout || '') + (result.stderr || ''),
    errCode: result.status,
  };
}

export const fitnessFunction = {
  id: 'F9',
  name: 'build-compiles',
  description: 'Project must typecheck cleanly (tsc --noEmit). Closes the verification surface gap surfaced by OBS-64 (Vercel build broke on master after Phase 1.5 F8 refactor updated reads without updating type definitions).',
  source: 'OBS-64 (Sprint Architecture verification surface gap; build-compilation not gated locally)',

  // Single-file enumerate: the sentinel triggers exactly one check() call.
  enumerate() {
    return [SENTINEL];
  },

  check(filepath, _content, deps = {}) {
    if (filepath !== SENTINEL) return PASS;

    const { typecheck = runTypecheck, log = (m) => console.log(m) } = deps;
    const result = typecheck();
    if (result.ok) return PASS;

    // Lane GATES-1 (2026-10-04): the compiler not resolving is a fact about the environment (a job that
    // never ran "npm ci", such as the no-npm Discipline engine unit tests job, which spawns this whole
    // runner from runner.test.mjs), not a type error. Report a SKIP with the reason; the job that installed
    // the dependencies is the authoritative run. A tsc that runs and fails is still a violation, below.
    if (result.errCode === 'TSC_NOT_FOUND') {
      log(`  [F9] SKIP: ${result.output}`);
      return PASS;
    }

    // Parse tsc output for the first few error locations
    const lines = result.output.split(/\r?\n/);
    const errorLines = lines.filter((l) => /error TS\d+:/.test(l)).slice(0, 5);

    const summary = `TypeScript compilation failed (tsc --noEmit exit code ${result.errCode}).`;
    const errorSummary = errorLines.length > 0
      ? `\nFirst ${errorLines.length} error(s):\n${errorLines.map((l) => '    ' + l).join('\n')}`
      : `\n(no error lines parsed; raw output below)\n${result.output.split(/\r?\n/).slice(0, 20).map((l) => '    ' + l).join('\n')}`;

    return [violation(
      1,
      `${summary}${errorSummary}\n\nRemediation: run \`cd fsi-app && npx tsc --noEmit\` locally to see all errors. Fix the type errors. Do not push until tsc exits 0.`,
    )];
  },
};

// Exported for tests to mock tsc invocation if needed.
export const _findTsc = findTsc;
export const _runTypecheck = runTypecheck;
