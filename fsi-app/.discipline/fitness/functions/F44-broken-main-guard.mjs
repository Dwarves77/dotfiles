// F44: broken-main-guard (task 0.3b, 2026-09-11). 36 files under fsi-app/scripts/** and
// fsi-app/.discipline/** used a CLI main guard that hand-builds a comparison string by prefixing
// `file://` onto process.argv[1]. On Windows import.meta.url is a real file:// URL with forward
// slashes while process.argv[1] is Node's native backslash path, so the hand-built string never equals
// import.meta.url and the guard is never true [CONFIRMED, grep across scripts + .discipline, task
// 0.3b]. [CORRECTED, fix round 1, reviewer-confirmed]: 31 of the 36 files had no fallback and silently
// exited 0 with no output when invoked directly on Windows, a runtime defect surfaced only because the
// pre-push suite's spawned-CLI tests returned empty stdout on the operator's Windows machine while
// passing on Linux CI; the other 5 (skill-map.mjs, skill-contract-map.mjs, bootstrap-test1.mjs,
// defect-signature-scan.mjs, no-generic-source-audit.mjs) carried a working
// `|| process.argv[1]?.endsWith(...)` fallback naming their own filename, which still called main()
// correctly despite the broken primary comparison, fragile but not silently broken.
//
// THE FIX, already built and consumed by this gate: scripts/lib/is-main.mjs's isMainModule() builds the
// comparison through Node's own pathToFileURL(resolve(argv[1])) instead of string concatenation, so it
// agrees with import.meta.url on every platform. This gate forbids the broken idiom from ever
// re-entering either tree; is-main.test.mjs carries the identical regression check at the
// no-npm-ci pre-push layer, so the guard is enforced twice (belt-and-suspenders, the same shape RD-11's
// transport-hold gate already uses in this repo).
import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isTestFile } from './F25-module-liveness.mjs';

const SCOPE_GLOBS = ['fsi-app/scripts/**/*.mjs', 'fsi-app/.discipline/**/*.mjs'];

// Matches the broken comparison regardless of the trailing `|| process.argv[1]?.endsWith(...)`
// fallback some call sites had already grown as a partial (and still broken) workaround.
const BROKEN_GUARD_RE = /import\.meta\.url\s*===\s*`file:\/\/\$\{\s*process\.argv\[1\]\s*\}`/;

/** Find every line in `content` carrying the broken main-guard idiom. Skips comment-only lines (a
 *  historical mention is not a live instance). PURE, no filesystem, no git. @param {string} content
 *  @returns {number[]} 1-based line numbers */
export function findBrokenMainGuards(content) {
  const lines = content.split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    if (BROKEN_GUARD_RE.test(line)) out.push(i + 1);
  });
  return out;
}

export const fitnessFunction = {
  id: 'F44',
  name: 'broken-main-guard',
  description:
    'A CLI main guard under fsi-app/scripts/** or fsi-app/.discipline/** must never compare ' +
    'import.meta.url against a hand-built file:// string concatenated with process.argv[1] - that ' +
    'comparison never equals on Windows (forward-slash file:// URL vs a native backslash path), so the ' +
    'guard is never true and the script silently exits 0 with no output. Use isMainModule() from ' +
    'scripts/lib/is-main.mjs instead, which normalizes both sides through pathToFileURL/resolve.',
  source: 'task 0.3b, 2026-09-11 (36 files, [CONFIRMED] by grep across scripts/** and .discipline/**)',

  enumerate() {
    // Test files excluded: a fixture that constructs the broken idiom as a literal string to feed
    // fitnessFunction.check() (see this function's own test file) is not a live call site.
    return globFiles(SCOPE_GLOBS).filter((f) => !isTestFile(f));
  },

  check(filepath, content) {
    const out = [];
    for (const line of findBrokenMainGuards(content)) {
      out.push(
        violation(
          line,
          'broken CLI main guard: import.meta.url compared against a hand-built `file://` + ' +
            'process.argv[1] string. This never equals import.meta.url on Windows (a real file:// URL ' +
            'uses forward slashes; process.argv[1] is a native backslash path there), so the guard is ' +
            'never true and the script silently exits 0 with no output when run directly. Use ' +
            'isMainModule(import.meta.url) from scripts/lib/is-main.mjs (task 0.3b) instead.'
        )
      );
    }
    return out;
  },
};
