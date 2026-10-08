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
import { globFiles } from '../lib/glob.mjs';
import { readFile } from '../lib/file-content.mjs';
import { commentsOnly } from '../../governance/coverage-scan.mjs';

// Sentinel filepath: the runner enumerates this single "file" and calls check()
// on it. The check then runs tsc against the whole fsi-app project.
const SENTINEL = 'fsi-app/tsconfig.json';

// STATIC GUARDS (lane GATE-8, 2026-10-08, AUD-AT-4 B8-02, B8-03). "tsc exits 0" is only as strong as the set of
// files tsc is asked to check. Two honest-looking edits make a type-broken file pass it: excluding the file in
// tsconfig.json, and putting the `@ts-nocheck` directive at its top. Neither needs tsc to detect, so both are
// read here from the files, before the compiler runs, and reported whether or not tsc resolves.
//   - `@ts-nocheck` as a directive comment in any file under src: a violation naming the file.
//   - a tsconfig.json `exclude` entry beyond the three the project documents (node_modules, supabase/functions, the
//     src/_archive sunset directory): a violation naming the entry. `include` must still cover every .ts and .tsx.
export const ALLOWED_TSCONFIG_EXCLUDES = Object.freeze(['node_modules', 'supabase/functions', 'src/_archive', '.next', 'dist', 'build']);

/** Pure. `tsconfigText`: the file text; `srcFiles`: [{ path, content }] for the .ts and .tsx files under src. */
export function staticTypecheckViolations({ tsconfigText, srcFiles }) {
  const out = [];
  let cfg = null;
  try {
    // tsconfig.json is JSON with comments: strip them before parsing
    cfg = JSON.parse(String(tsconfigText).replace(/^\s*\/\/.*$/gm, ''));
  } catch { cfg = null; }
  if (cfg === null) {
    out.push('fsi-app/tsconfig.json could not be parsed, so what tsc checks cannot be verified.');
  } else {
    for (const e of Array.isArray(cfg.exclude) ? cfg.exclude : []) {
      const norm = String(e).replace(/^\.\//, '').replace(/\/+$/, '');
      if (!ALLOWED_TSCONFIG_EXCLUDES.includes(norm)) {
        out.push(`fsi-app/tsconfig.json excludes "${e}", which hides files from the type check. Only ${ALLOWED_TSCONFIG_EXCLUDES.slice(0, 3).join(', ')} are documented exclusions; fix the type error instead of excluding the file.`);
      }
    }
    const inc = Array.isArray(cfg.include) ? cfg.include.map(String) : [];
    for (const need of ['**/*.ts', '**/*.tsx']) {
      if (!inc.includes(need)) out.push(`fsi-app/tsconfig.json include no longer lists "${need}", so some source files are not type checked.`);
    }
    if (Array.isArray(cfg.files) && cfg.files.length > 0 && inc.length === 0) out.push('fsi-app/tsconfig.json narrows the project to an explicit files list.');
  }
  for (const f of srcFiles) {
    if (!f.content.includes('@ts-nocheck')) continue;
    if (/@ts-nocheck/.test(commentsOnly(f.content))) out.push(`${f.path} carries a @ts-nocheck directive, which turns the type check off for the whole file. Fix the types.`);
  }
  return out;
}

let _staticCache = null;
function realStaticViolations() {
  if (_staticCache) return _staticCache;
  const tsconfigText = readFile('fsi-app/tsconfig.json') ?? '';
  const srcFiles = [];
  for (const p of globFiles(['fsi-app/src/**/*.{ts,tsx}'])) {
    const content = readFile(p);
    if (content !== null) srcFiles.push({ path: p, content });
  }
  _staticCache = staticTypecheckViolations({ tsconfigText, srcFiles });
  return _staticCache;
}

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

    const { typecheck = runTypecheck, log = (m) => console.log(m), staticViolations = realStaticViolations } = deps;
    const guards = staticViolations().map((m) => violation(1, m));
    const result = typecheck();
    if (result.ok) return guards.length ? guards : PASS;

    // Lane GATES-1 (2026-10-04): the compiler not resolving is a fact about the environment (a job that
    // never ran "npm ci", such as the no-npm Discipline engine unit tests job, which spawns this whole
    // runner from runner.test.mjs), not a type error. Report a SKIP with the reason; the job that installed
    // the dependencies is the authoritative run. A tsc that runs and fails is still a violation, below.
    if (result.errCode === 'TSC_NOT_FOUND') {
      log(`  [F9] SKIP: ${result.output}`);
      return guards.length ? guards : PASS;
    }

    // Parse tsc output for the first few error locations
    const lines = result.output.split(/\r?\n/);
    const errorLines = lines.filter((l) => /error TS\d+:/.test(l)).slice(0, 5);

    const summary = `TypeScript compilation failed (tsc --noEmit exit code ${result.errCode}).`;
    const errorSummary = errorLines.length > 0
      ? `\nFirst ${errorLines.length} error(s):\n${errorLines.map((l) => '    ' + l).join('\n')}`
      : `\n(no error lines parsed; raw output below)\n${result.output.split(/\r?\n/).slice(0, 20).map((l) => '    ' + l).join('\n')}`;

    return [...guards, violation(
      1,
      `${summary}${errorSummary}\n\nRemediation: run \`cd fsi-app && npx tsc --noEmit\` locally to see all errors. Fix the type errors. Do not push until tsc exits 0.`,
    )];
  },
};

// Exported for tests to mock tsc invocation if needed.
export const _findTsc = findTsc;
