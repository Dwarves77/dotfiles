// F48: env-file-load-guarded (lane L41, 2026-09-17; extended to "one home" by lane T2, 2026-09-19).
//
// Two defects, one gate. (1) L41: a live script under fsi-app/scripts/** that loads the local env file with
// an UNGUARDED `process.loadEnvFile(...)` crashes with ENOENT wherever the file is absent: every
// maintenance.yml and brief-apply dispatch injects the environment from repository secrets and carries no
// .env.local, so the script dies before it reads a row (refetch-capped dry runs 35300237193 and 35300526245,
// ENOENT at scripts/remediation/refetch-capped-worklist.mjs:28). (2) T2: a script that loads the env file
// from disk on its own defeats every test that strips the credential variables from a child's environment
// and expects a refusal or a self-skip, in the one worktree that HAS an env file and nowhere else. It
// happened twice in two days (check-vocabulary-drift, 2026-09-18, lane T1; ecb-fx-producer, 2026-09-19),
// and by the operator's ruling the second occurrence gets a class fix: ONE loader, ONE switch, and this
// gate keeps every script on it.
//
// The rule, three checks:
//   (a) A live script (fsi-app/scripts/** and fsi-app/src/**, minus the archived, reground and scratch
//       trees, minus test files) may not call `process.loadEnvFile` at all, guarded or not. The one home is
//       fsi-app/scripts/lib/env-file.mjs (`loadLocalEnvFile()`, guarded, never throws, switched off by
//       FSI_NO_ENV_FILE). A try block around a bare call no longer passes: it was the L41 rule, and it is
//       what let the T2 defect exist ninety times over.
//   (b) A test file that strips a credential variable from an env object by hand (`delete env.X`,
//       `X: undefined`, `X: ""`) in a test that spawns a child process must build that environment with
//       `withoutCredentials()` from the same module instead: stripping alone leaves the switch off, and
//       the child reads the file back.
//   (c) A test file that spawns a child process and asserts a credentials refusal ON THE CHILD'S OWN
//       RESULT (an assertion line mentioning "creds" or "credential" that also references `.stderr`,
//       `.stdout` or `.status`) must use `withoutCredentials()` too: relying on the ambient environment
//       having no credentials is exactly the ecb-fx failure. A creds/credential assertion on anything else
//       (a plain object, a pure function's return value) is a unit test, not a claim about the spawned
//       child, and is not in scope.
// Comment-only lines are never live calls. Test files are the *.test.mjs / *.selftest.mjs / *.npmtest.mjs /
// *.golden.mjs / __tests__ set F25 defines.
import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isTestFile } from './F25-module-liveness.mjs';

export const ENV_FILE_HOME = 'fsi-app/scripts/lib/env-file.mjs';
const SCOPE_GLOBS = ['fsi-app/scripts/**/*.mjs', 'fsi-app/src/**/*.mjs'];
const EXCLUDED_DIRS = ['fsi-app/scripts/_archive/', 'fsi-app/scripts/_reground/', 'fsi-app/scripts/tmp/', 'fsi-app/src/_archive/'];
const TEST_SCOPE_GLOBS = ['fsi-app/scripts/**/*.mjs', 'fsi-app/src/**/*.mjs'];

const LOAD_RE = /process\.loadEnvFile\s*\(/;
const CREDENTIAL_NAMES = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL', 'DATABASE_URL', 'SUPABASE_DB_PASSWORD'];
const STRIP_RE = new RegExp(`(?:\\bdelete\\s+[\\w$.\\[\\]"']+\\.(?:${CREDENTIAL_NAMES.join('|')})\\b)|(?:\\b(?:${CREDENTIAL_NAMES.join('|')})\\s*:\\s*(?:undefined|""|''))`);
const SPAWN_RE = /\b(?:spawnSync|execFileSync|execSync|spawn|execFile|exec)\s*\(/;
const CREDS_ASSERT_RE = /\bassert(?:\.\w+)?\s*\([^\n]*(?:creds|credential)/i;
const CHILD_RESULT_RE = /\.(?:stderr|stdout|status)\b/;
const HELPER_RE = /\bwithoutCredentials\s*\(/;

const isComment = (line) => {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
};

/** (a) Every non-comment line that calls process.loadEnvFile. Guarded or not: the only home is
 *  ENV_FILE_HOME. PURE. @param {string} content @returns {number[]} 1-based line numbers */
export function findBareEnvLoads(content) {
  const out = [];
  content.split(/\r?\n/).forEach((line, i) => {
    if (isComment(line)) return;
    if (LOAD_RE.test(line)) out.push(i + 1);
  });
  return out;
}

/** (b) Lines in a TEST file that strip a credential variable by hand while the file never calls
 *  withoutCredentials(), IN A TEST THAT SPAWNS A CHILD PROCESS. Empty when the helper is used
 *  anywhere in the file, or when the file has no spawn call at all (the same precondition check
 *  (c) already applies): stripping a credential from an in-process object to unit-test a pure
 *  function hands nothing back to a child, so no env file can defeat it (lane T2, 2026-09-19,
 *  data-public-surface-slugs.test.mjs). PURE. */
export function findUnswitchedCredentialStrips(content) {
  if (HELPER_RE.test(content)) return [];
  const lines = content.split(/\r?\n/);
  if (!lines.some((l) => !isComment(l) && SPAWN_RE.test(l))) return [];
  const out = [];
  lines.forEach((line, i) => {
    if (isComment(line)) return;
    if (STRIP_RE.test(line)) out.push(i + 1);
  });
  return out;
}

/** (c) In a TEST file that spawns a child process, the assertion lines that claim a credentials refusal
 *  ON THE SPAWNED CHILD'S OWN RESULT (its `.stderr`, `.stdout` or `.status`) while the file never calls
 *  withoutCredentials(). A refusal a child makes is visible only on its result; an assertion mentioning
 *  creds/credential on anything else (a plain object, a pure function's return value) is a unit test, not
 *  a claim about the spawned child, and is not flagged (lane T2 amendment, 2026-09-19:
 *  market-eia-v2-petroleum-spot-parser.test.mjs line 243 asserts on `decideApply()`'s plain-object return
 *  value in a file that separately spawns a child for an unrelated ENABLED-gate test; the file-wide "any
 *  spawn anywhere" precondition alone flagged it, the same false-positive shape check (b) had). PURE. */
export function findAmbientCredentialAssertions(content) {
  if (HELPER_RE.test(content)) return [];
  const lines = content.split(/\r?\n/);
  if (!lines.some((l) => !isComment(l) && SPAWN_RE.test(l))) return [];
  const out = [];
  lines.forEach((line, i) => {
    if (isComment(line)) return;
    if (CREDS_ASSERT_RE.test(line) && CHILD_RESULT_RE.test(line)) out.push(i + 1);
  });
  return out;
}

const excluded = (f) => EXCLUDED_DIRS.some((d) => f.startsWith(d));
/** Live-script scope for check (a). */
export function inScope(f) {
  return !excluded(f) && !isTestFile(f) && f !== ENV_FILE_HOME;
}
/** Test-file scope for checks (b) and (c). */
export function inTestScope(f) {
  return !excluded(f) && isTestFile(f);
}

export const fitnessFunction = {
  id: 'F48',
  name: 'env-file-load-guarded',
  description:
    'The local env file is loaded only through fsi-app/scripts/lib/env-file.mjs (loadLocalEnvFile: guarded, ' +
    'never throws, switched off by FSI_NO_ENV_FILE). A bare process.loadEnvFile in any live script under ' +
    'fsi-app/scripts/** or fsi-app/src/** fails, guarded or not; a test that strips credentials by hand or ' +
    'asserts a credentials refusal on a spawned child must build its environment with withoutCredentials(), ' +
    'or a checkout that has an env file hands the credentials straight back.',
  source: 'lane L41, 2026-09-17 (refetch-capped dry runs 35300237193 and 35300526245, ENOENT at ' +
    'scripts/remediation/refetch-capped-worklist.mjs:28); lane T2, 2026-09-19 (the same no-credential test ' +
    'class defeated twice in two days by per-script loads: check-vocabulary-drift on 2026-09-18, ' +
    'ecb-fx-producer on 2026-09-19, each refusing lane M2\'s push in the one worktree with an env file)',

  enumerate() {
    const live = globFiles(SCOPE_GLOBS).filter(inScope);
    const tests = globFiles(TEST_SCOPE_GLOBS).filter(inTestScope);
    return [...new Set([...live, ...tests])];
  },

  check(filepath, content) {
    const out = [];
    if (inTestScope(filepath)) {
      for (const line of findUnswitchedCredentialStrips(content)) {
        out.push(violation(line,
          'a credential variable is stripped by hand, and this file never calls withoutCredentials(): ' +
          'stripping leaves the env-file load ON, so in a checkout that has fsi-app/.env.local the child ' +
          'reads the credentials back and "no credentials" is false. Build the env with ' +
          'withoutCredentials() from fsi-app/scripts/lib/env-file.mjs.'));
      }
      for (const line of findAmbientCredentialAssertions(content)) {
        out.push(violation(line,
          'a spawned child is asserted to refuse for missing credentials, but its environment is inherited: ' +
          'in a checkout that has fsi-app/.env.local the child loads the credentials and never refuses. ' +
          'Spawn it with env: withoutCredentials() from fsi-app/scripts/lib/env-file.mjs.'));
      }
      return out;
    }
    for (const line of findBareEnvLoads(content)) {
      out.push(violation(line,
        'bare process.loadEnvFile: the one home for the env-file load is fsi-app/scripts/lib/env-file.mjs. ' +
        'Import { loadLocalEnvFile } from there and call it; it is guarded (no ENOENT on a workflow ' +
        'dispatch) and honours FSI_NO_ENV_FILE so no-credential tests stay hermetic.'));
    }
    return out;
  },
};
