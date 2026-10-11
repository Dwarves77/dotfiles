// F67: CLI main-guard class (lane R20, 2026-10-01; REG-1, 2026-10-11 absorbed the former F44 broken-main-guard
// as the second facet below, one row for one property). Facet B (this file's original): F44-era check
// catches the OLD broken `import.meta.url === file://${argv[1]}` string-concat idiom; this function
// catches the DIFFERENT, newer defect shape audited as F44-2a/2b/2c
// (docs/audits/app-audit-a4bc-scripts-completion-2026-09-30.md) and F-10/F-11
// (docs/audits/app-audit-a4cc-scripts-completion-2026-09-30.md): a CLI entrypoint that calls its own
// `main()` unconditionally AT MODULE SCOPE, with NO guard of any kind (not even a broken one). Merely
// importing such a file (a test asserting on one of its exports, a sibling script importing a shared
// constant) triggers a real run: stdin read, live network fetch, and in the worst case (F-10,
// emission-factors-desnz.mjs) a live Supabase read performed as a side effect of `node --test`.
//
// THE FIX, every call site in this repo now uses: `if (isMainModule(import.meta.url)) { main()... }` or
// the one-line form `if (isMainModule(import.meta.url)) await main();` (scripts/lib/is-main.mjs).
//
// WHAT THIS CHECKS. A line (trimmed) that starts with `main(`, `await main(`, or `main().catch(` is a
// VIOLATION unless either:
//   (a) the SAME line also contains a recognized guard token before the call (the one-line
//       `if (isMainModule(import.meta.url)) await main();` form), or
//   (b) the call sits inside a block opened by a line that carries a recognized guard token and ends
//       with `{` (the multi-line `if (isMainModule(...)) { ... main()... }` form), tracked by
//       INDENTATION, not brace counting: once a guard-opening line is seen, every subsequent line
//       indented strictly deeper than that opening line is "inside the guard", regardless of how many
//       statements (a creds check, a `createClient()` call, the `main()` call itself) sit between the
//       opening line and the call. This is necessary, not cosmetic: several real fixes in this repo put
//       more than one statement inside the guarded block before reaching `main()` (e.g.
//       backfill-lineage-edges.mjs, funded-pass-lock-golden.mjs), so a check that only looks at the ONE
//       immediately preceding line would false-positive on exactly the files this function exists to
//       let pass.
// This is intentionally narrow: it only recognizes the one guard idiom this repo standardizes on
// (isMainModule from scripts/lib/is-main.mjs), matching F44's own posture of flagging a known-broken
// shape rather than attempting a general call-graph analysis no static regex check can do reliably.
import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isTestFile } from './F25-module-liveness.mjs';

// Operator ruling, 2026-10-01 (two rounds): fixed, not flagged, both times. Round 1 scoped this to just
// scripts/producers/** + scripts/gen/* and flagged the rest for a follow-up lane; round 2 widened to
// the full fsi-app/scripts/** tree and fixed the 3 real violations that surfaced. Round 3 (this change)
// widens again to fsi-app/.discipline/**/*.mjs, covering the discipline engine's own three top-level
// runners (.discipline/runner.mjs, fitness/runner.mjs, consistency/runner.mjs), which carried the
// identical unguarded shape and are now fixed the same way. _archive/ stays excluded (filtered in
// enumerate() below): those files are confirmed dead (0 live importers, matches the audit's own
// disposition) and stay untracked by this gate, same posture F44 and F60 already take toward dead code.
const SCOPE_GLOBS = ['fsi-app/scripts/**/*.mjs', 'fsi-app/.discipline/**/*.mjs'];

const CALL_RE = /^(?:await\s+)?main\(\)/;
// Recognizes every WORKING main-guard idiom live in this repo, not only isMainModule(): the shared
// helper, and the inlined `fileURLToPath(import.meta.url)` / `pathToFileURL(resolve(argv[1])).href`
// comparisons several producers already use correctly (ecb-fx-producer.mjs, eia-v2-petroleum-spot-
// producer.mjs, fetch-oil-bulletin.mjs, fetch-desnz-factors.mjs, eurostat-lc-lci-lev-producer.mjs). This
// function's job is to catch the ABSENCE of any guard, not to force a single idiom. F44 already governs
// which idiom is broken vs working.
const GUARD_TOKEN_RE = /isMainModule\(|fileURLToPath\(\s*import\.meta\.url\s*\)|pathToFileURL\(/;

const leadingWhitespace = (line) => line.match(/^[ \t]*/)[0].length;

/** Find every line in `content` carrying an unguarded top-level `main()` invocation. PURE, no
 *  filesystem, no git. @param {string} content @returns {number[]} 1-based line numbers */
export function findUnguardedMainInvocations(content) {
  const lines = content.split(/\r?\n/);
  const out = [];
  // Stack of indentation levels at which a recognized guard block was opened. "Inside a guard" means
  // this stack is non-empty. A line whose own indentation is <= the top of the stack has exited that
  // guard block (popped) before this line is evaluated.
  const guardIndentStack = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const isCommentOnly = trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
    if (trimmed === '') return;

    const indent = leadingWhitespace(line);
    if (!isCommentOnly) {
      while (guardIndentStack.length && indent <= guardIndentStack[guardIndentStack.length - 1]) {
        guardIndentStack.pop();
      }
    }

    if (!isCommentOnly && CALL_RE.test(trimmed)) {
      const guardIdx = line.search(GUARD_TOKEN_RE);
      const callIdx = line.indexOf('main(');
      const sameLineGuarded = guardIdx !== -1 && callIdx !== -1 && guardIdx < callIdx;
      const insideGuardBlock = guardIndentStack.length > 0;
      if (!sameLineGuarded && !insideGuardBlock) out.push(i + 1);
    }

    // A guard-opening line: carries a recognized guard token AND ends with `{` (opens a block). Every
    // subsequent line indented deeper than THIS line is inside the guard, however many statements away.
    if (!isCommentOnly && GUARD_TOKEN_RE.test(line) && trimmed.endsWith('{')) {
      guardIndentStack.push(indent);
    }
  });
  return out;
}

// Facet A, formerly F44: broken-main-guard (task 0.3b, 2026-09-11). 36 files under fsi-app/scripts/** and
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


/** Facet A (formerly F44): violations for the broken `import.meta.url === file://${argv[1]}` idiom. */
export function checkBrokenMainGuard(filepath, content) {
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
}

/** Facet B does not apply to confirmed-dead archive files or fixture modules (see enumerate()). */
export function isFacetBExcluded(filepath) {
  return filepath.startsWith('fsi-app/scripts/_archive/') || /\/fixtures(?:-dash)?\//.test(filepath);
}

export const fitnessFunction = {
  id: 'F67',
  name: 'cli-main-guard',
  description:
    'CLI main-guard class under fsi-app/scripts/** and fsi-app/.discipline/**. Facet A (formerly F44): a main ' +
    'guard must never compare import.meta.url against a hand-built file:// string concatenated with ' +
    'process.argv[1] (never equal on Windows, so the script silently exits 0). Facet B: a CLI script ' +
    'must never call its own main() unconditionally at module scope. A CLI script under fsi-app/scripts/** or fsi-app/.discipline/** must never call its own main() ' +
    'unconditionally at module scope. Merely importing such a file triggers a real run (stdin read, ' +
    'live fetch, or a live DB read/write). Guard the call with isMainModule(import.meta.url) from ' +
    'scripts/lib/is-main.mjs, either as `if (isMainModule(import.meta.url)) { main()... }` or the ' +
    'one-line `if (isMainModule(import.meta.url)) await main();` form.',
  source:
    'lane R20, 2026-10-01, F44-2a/2b/2c (app-audit-a4bc-scripts-completion-2026-09-30.md) and F-10/F-11 ' +
    '(app-audit-a4cc-scripts-completion-2026-09-30.md), [CONFIRMED] by reading each file in full.',

  enumerate() {
    // Test files excluded: a fixture that constructs either shape as a literal string to feed
    // fitnessFunction.check() (see this function's own test file) is not a live call site.
    // Facet B skips _archive/ (confirmed-dead files, 0 live importers) and /fixtures/ and /fixtures-dash/
    // (operator instruction, round 3: fixture modules feed test input and are never a CLI entrypoint) in
    // check() below; facet A keeps scanning them, as the former F44 did.
    return globFiles(SCOPE_GLOBS).filter((f) => !isTestFile(f));
  },

  check(filepath, content) {
    const out = [...checkBrokenMainGuard(filepath, content)];
    if (isFacetBExcluded(filepath)) return out;
    for (const line of findUnguardedMainInvocations(content)) {
      out.push(
        violation(
          line,
          'unguarded main() invocation: this call runs unconditionally at module scope with no ' +
            'isMainModule guard, so merely importing this file triggers a real run. Wrap it in ' +
            '`if (isMainModule(import.meta.url)) { ... }` (scripts/lib/is-main.mjs, F67).'
        )
      );
    }
    return out;
  },
};
