// F59: dep-path-resolved (2026-09-27, invariant RD-85).
//
// Tooling finds an fsi-app npm dependency the way Node resolves it (fsi-app/.discipline/lib/
// resolve-dep.mjs, or require.resolve with paths: [fsi-app]), never by building the literal path
// fsi-app/node_modules/<pkg>. In a linked worktree that path does not exist: dependencies resolve
// from the main checkout's shared install through the ONE link beside the worktrees
// (.claude/worktrees/node_modules, hooks/lib/worktree-node-modules.sh), because a link INSIDE a
// worktree lets `git worktree remove` empty the shared install [CONFIRMED 2026-09-27]. Five consumers
// hard-coded the path when this landed (F9's tsc lookup, run-npmtest-suites.sh's presence check, two
// rendering-guard reads of leaflet.css, next.config.ts's Turbopack root); each would have failed in
// that layout, and next.config.ts did [CONFIRMED: Turbopack refused to build]. This gate keeps a new
// one from landing.
//
// Flags, on a non-comment line: any fsi-app/node_modules path (either separator); a path join
// of 'fsi-app' then 'node_modules'; a join of 'node_modules' then '.bin'; a join of __dirname with
// 'node_modules'. Directory-SKIP lists that merely name 'node_modules' are not paths and never match.
// Exempt: the resolver itself, the layout owner (worktree-node-modules.sh), this file, tests (which
// build fixture layouts on purpose) and the invariant registry (prose, not code).
import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';

const SCOPE_GLOBS = [
  'fsi-app/.discipline/**/*.mjs',
  'fsi-app/.discipline/**/*.sh',
  'fsi-app/.discipline/hooks/*',
  'fsi-app/scripts/**/*.mjs',
  'fsi-app/*.ts',
  'fsi-app/*.mjs',
  '.github/workflows/*.yml',
];

const EXEMPT_FILES = new Set([
  'fsi-app/.discipline/lib/resolve-dep.mjs',
  'fsi-app/.discipline/hooks/lib/worktree-node-modules.sh',
  'fsi-app/.discipline/fitness/functions/F59-dep-path-resolved.mjs',
]);

// The invariant registry is prose describing mechanisms, not code that builds paths.
const isProse = (f) => f.startsWith('fsi-app/.discipline/governance/invariants.d/');

const isTestFile = (f) => /\.(test|npmtest|selftest)\.mjs$/.test(f) || /\.golden(\.test)?\.mjs$/.test(f);

const PATTERNS = [
  { re: /fsi-app[\\/]+node_modules\b/, what: 'a literal fsi-app/node_modules path' },
  { re: /['"`]fsi-app['"`]\s*,\s*['"`]node_modules['"`]/, what: "a join of 'fsi-app' and 'node_modules'" },
  { re: /['"`]node_modules['"`]\s*,\s*['"`]\.bin['"`]/, what: "a join of 'node_modules' and '.bin'" },
  { re: /__dirname\s*,\s*['"`]node_modules['"`]/, what: "a join of __dirname and 'node_modules'" },
];

/** Line numbers (1-based) and descriptions of every hard-coded dependency path in `content`. */
export function findHardcodedDepPaths(content) {
  const out = [];
  String(content ?? '').split('\n').forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('#') || t.startsWith('*') || t.startsWith('/*')) return;
    for (const { re, what } of PATTERNS) {
      if (re.test(line)) { out.push({ line: i + 1, what }); break; }
    }
  });
  return out;
}

export const fitnessFunction = {
  id: 'F59',
  name: 'dep-path-resolved',
  description:
    'Tooling resolves an fsi-app npm dependency the way Node does (lib/resolve-dep.mjs or ' +
    'require.resolve from fsi-app/), never via a hard-coded fsi-app/node_modules path, which does ' +
    'not exist in a linked worktree (deps resolve there through the one shared link beside the ' +
    'worktrees, RD-85).',
  source: 'docs/ops/session-log.d/2026-09-27-worktree-node-modules.md; invariant RD-85',

  enumerate() {
    return globFiles(SCOPE_GLOBS).filter((f) => !isTestFile(f) && !isProse(f) && !EXEMPT_FILES.has(f));
  },

  check(filepath, content) {
    return findHardcodedDepPaths(content).map(({ line, what }) =>
      violation(
        line,
        `${what}: resolve the dependency with resolveAppDep()/tryResolveAppDep() ` +
          '(fsi-app/.discipline/lib/resolve-dep.mjs) or require.resolve(spec, { paths: [fsiAppDir] }); ' +
          'in a linked worktree fsi-app/node_modules does not exist (RD-85).'
      )
    );
  },
};
