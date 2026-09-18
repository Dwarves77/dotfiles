// F48: env-file-load-guarded (lane L41, 2026-09-17). A live script under fsi-app/scripts/** that loads
// the local env file with an UNGUARDED `process.loadEnvFile(...)` crashes with ENOENT wherever the file is
// absent: every maintenance.yml and brief-apply dispatch injects the environment from repository secrets
// and carries no .env.local, so the script dies before it reads a row and the run reads as a red that says
// nothing. Confirmed instances: holdings-audit.mjs (fixed by its own header note, earlier) and
// scripts/remediation/refetch-capped-worklist.mjs (the refetch-capped dry sizing run 35300237193 and its
// re-run 35300526245, both ENOENT at line 28 before any work). Every other live entry point already uses
// the guarded form `try { process.loadEnvFile(...) } catch { /* CI: env injected */ }`; this gate keeps
// them there. Scope: fsi-app/scripts/** minus the archived and scratch trees (_archive, _reground, tmp),
// which no lane runs. Test files excluded (a fixture that carries the literal is not a live call site).
import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isTestFile } from './F25-module-liveness.mjs';

const SCOPE_GLOBS = ['fsi-app/scripts/**/*.mjs'];
const EXCLUDED_DIRS = ['fsi-app/scripts/_archive/', 'fsi-app/scripts/_reground/', 'fsi-app/scripts/tmp/'];

const LOAD_RE = /process\.loadEnvFile\s*\(/;

/** Find every line that calls process.loadEnvFile outside a try block. A call is guarded when the same
 *  line opens a try (`try { process.loadEnvFile(...) }`) or one of the two preceding non-blank lines ends
 *  with `try {`. Comment-only lines are skipped (a historical mention is not a live call). PURE.
 *  @param {string} content @returns {number[]} 1-based line numbers */
export function findUnguardedEnvLoads(content) {
  const lines = content.split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    if (!LOAD_RE.test(line)) return;
    if (/\btry\s*\{/.test(line)) return;
    const prev = [];
    for (let j = i - 1; j >= 0 && prev.length < 2; j--) {
      const t = lines[j].trim();
      if (t) prev.push(t);
    }
    if (prev.some((t) => /\btry\s*\{\s*$/.test(t))) return;
    out.push(i + 1);
  });
  return out;
}

export function inScope(f) {
  return !EXCLUDED_DIRS.some((d) => f.startsWith(d)) && !isTestFile(f);
}

export const fitnessFunction = {
  id: 'F48',
  name: 'env-file-load-guarded',
  description:
    'A live script under fsi-app/scripts/** must load the local env file only inside a try block: ' +
    'try { process.loadEnvFile(...) } catch { /* CI: env injected */ }. An unguarded load crashes with ' +
    'ENOENT on every workflow dispatch (secrets inject the env; no .env.local exists there) before the ' +
    'script does any work, so the run reads as a red that says nothing.',
  source: 'lane L41, 2026-09-17 (refetch-capped dry runs 35300237193 and 35300526245, ENOENT at ' +
    'scripts/remediation/refetch-capped-worklist.mjs:28; holdings-audit.mjs carried the same defect before)',

  enumerate() {
    return globFiles(SCOPE_GLOBS).filter(inScope);
  },

  check(filepath, content) {
    const out = [];
    for (const line of findUnguardedEnvLoads(content)) {
      out.push(
        violation(
          line,
          'unguarded process.loadEnvFile: this crashes with ENOENT on every workflow dispatch (the ' +
            'environment is injected from secrets; no .env.local exists on the runner) before the script ' +
            'does any work. Wrap it: try { process.loadEnvFile(...) } catch { /* CI: env injected */ }.'
        )
      );
    }
    return out;
  },
};
