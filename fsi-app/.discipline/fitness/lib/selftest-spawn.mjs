// selftest-spawn.mjs, the ONE way a fitness function runs a selftest subprocess (lane GATES-1, 2026-10-04).
//
// F10, F11 and F12 each carried a verbatim copy of: existence check, spawnSync('node', [selftest]), tail the
// last 12 lines, return a violation on a non-zero exit. The selftests load TypeScript sources through jiti,
// an npm package, so they can only run where fsi-app's dependencies are installed (the "Fitness functions"
// job runs `npm ci`; the no-npm "Discipline engine unit tests" job does not). In the no-npm job the whole
// runner is spawned by runner.test.mjs and every one of these printed "FAILED" (an ERR_MODULE_NOT_FOUND
// stack) into the job log although nothing was wrong with the math.
//
// Contract:
//   - dependency absent  -> SKIP: a line naming the reason is logged and the function passes. A missing
//     install is a fact about the environment, not a failed proof (rule 15: a no-cred or no-install run is
//     diagnosable, never a false red). The authoritative run is the job that installed the dependencies.
//   - dependency present, selftest exits non-zero -> VIOLATION (the proof itself failed). This is the
//     attack case selftest-spawn.test.mjs pins with an injected runner.
//   - selftest file missing -> VIOLATION, always (a deleted proof must never read as a skip).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { violation, PASS } from './result.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { tryResolveAppDep } from '../../lib/resolve-dep.mjs';

/** The package every selftest loads first (createJiti). Resolved the way Node resolves it from fsi-app/. */
export const SELFTEST_DEP = 'jiti';

/** Reason string when `spec` does not resolve from fsi-app/, else null. */
export function missingDepReason(spec, resolveDep = tryResolveAppDep) {
  if (resolveDep(spec) !== null) return null;
  return `"${spec}" does not resolve from fsi-app/ (dependencies not installed in this job; the job that runs "npm ci" is the authoritative run)`;
}

function tailOf(result) {
  return ((result.stdout || '') + (result.stderr || ''))
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-12)
    .map((l) => '    ' + l)
    .join('\n');
}

/**
 * @param {{id: string, sentinel: string, missingMessage: string, failMessage: (status: number|null) => string,
 *          remediation: string}} spec
 * @param {{repoRoot?: string, exists?: Function, spawn?: Function, resolveDep?: Function, log?: Function}} [deps]
 *   every field injectable so the skip and attack paths run without a real install.
 * @returns {Array<{line: number, message: string}>}
 */
export function checkSelftest(spec, deps = {}) {
  const {
    repoRoot = getRepoRoot(),
    exists = existsSync,
    spawn = spawnSync,
    resolveDep = tryResolveAppDep,
    log = (m) => console.log(m),
  } = deps;
  const abs = join(repoRoot, spec.sentinel);
  if (!exists(abs)) return [violation(1, spec.missingMessage)];
  const skip = missingDepReason(SELFTEST_DEP, resolveDep);
  if (skip) {
    log(`  [${spec.id}] SKIP: ${skip}`);
    return PASS;
  }
  const result = spawn('node', [abs], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status === 0) return PASS;
  return [violation(1, `${spec.failMessage(result.status)}\n${tailOf(result)}\n\n${spec.remediation}`)];
}
