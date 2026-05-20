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
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { violation, PASS } from '../lib/result.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

// Sentinel filepath: the runner enumerates this single "file" and calls check()
// on it. The check then runs tsc against the whole fsi-app project.
const SENTINEL = 'fsi-app/tsconfig.json';

function findTsc() {
  // Prefer the npx-resolved local tsc; fall back to a system tsc if npx fails.
  const localTsc = join(getRepoRoot(), 'fsi-app', 'node_modules', '.bin', 'tsc');
  const localTscWindows = localTsc + '.cmd';
  if (existsSync(localTsc)) return localTsc;
  if (existsSync(localTscWindows)) return localTscWindows;
  return null;
}

function runTypecheck() {
  const tsc = findTsc();
  const fsiAppDir = join(getRepoRoot(), 'fsi-app');
  // spawnSync with shell:true handles both POSIX `tsc` and Windows `tsc.cmd` shims.
  // Local tsc is preferred (no network); npx fallback only if local not installed.
  const cmd = tsc ? `"${tsc}" --noEmit -p "${fsiAppDir}"` : `npx --no-install tsc --noEmit -p "${fsiAppDir}"`;
  const result = spawnSync(cmd, {
    shell: true,
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

  check(filepath, _content) {
    if (filepath !== SENTINEL) return PASS;

    const result = runTypecheck();
    if (result.ok) return PASS;

    // Parse tsc output for the first few error locations
    const lines = result.output.split(/\r?\n/);
    const errorLines = lines.filter((l) => /error TS\d+:/.test(l)).slice(0, 5);

    const summary = `TypeScript compilation failed (tsc --noEmit exit code ${result.errCode}).`;
    const errorSummary = errorLines.length > 0
      ? `\nFirst ${errorLines.length} error(s):\n${errorLines.map((l) => '    ' + l).join('\n')}`
      : '\n(no error lines parsed; see full output by running: cd fsi-app && npx tsc --noEmit)';

    return [violation(
      1,
      `${summary}${errorSummary}\n\nRemediation: run \`cd fsi-app && npx tsc --noEmit\` locally to see all errors. Fix the type errors. Do not push until tsc exits 0.`,
    )];
  },
};

// Exported for tests to mock tsc invocation if needed.
export const _findTsc = findTsc;
export const _runTypecheck = runTypecheck;
