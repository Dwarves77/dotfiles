// no-npm-sandbox.mjs, CI parity for the no-npm discipline suite (lane CI-PARITY, 2026-09-28).
//
// THE DEFECT [CONFIRMED]. CI's "Discipline engine unit tests" job (.github/workflows/discipline.yml, job
// test-discipline-engine) runs run-test-suite.sh on a fresh checkout and never runs `npm ci`, so no npm
// install is reachable from the checkout. Locally one always is: the main checkout's own
// fsi-app/node_modules, or, in a linked worktree, the shared link beside the worktrees
// (hooks/lib/worktree-node-modules.sh, RD-85). run-test-suite.sh's contract ("every discovered test MUST
// import only node: builtins + relative .mjs"; npm-dependent tests carry .npmtest.mjs instead) was
// enforced by the file SUFFIX alone, so a .test.mjs file that reached an npm package passed the push
// gate every time and failed only on GitHub. Six Discipline-engine runs on lane/quarantine-disposition
// failed that way (36450339377, 36452918342, 36457254250, 36459142897, 36461566541, 36463279310), each
// with "Cannot find package '@supabase/supabase-js' imported from .../scripts/plan-quarantine-
// disposition.mjs". [CONFIRMED by replay] each sha, in an isolated clone under .claude/worktrees/ with
// origin/master pinned to that run's push-time base, passed the FULL pre-push hook as it existed at the
// sha ("all 4 checks pass; push proceeding"); under this sandbox the same step 3 fails with CI's own
// error on CI's own test. (Correction, same lane: a first replay reported "1805/1805 passed" from a
// `| tail -30` pipe that hid the exit code and showed only the second of xargs' two node --test
// batches; withdrawn, re-measured as above.)
//
// THE RULE THIS FILE ENFORCES. Reproduce exactly what CI lacks, and nothing more: a package may not be
// resolved from a node_modules directory that belongs to the CHECKOUT, meaning a node_modules whose
// parent directory is (a) inside a checkout root or (b) a checkout root or one of its ancestors (the
// shared `.claude/worktrees/node_modules` link sits at an ancestor of every linked worktree). Checkout
// roots are this worktree's root AND the main checkout's root, because Node realpaths through the
// shared junction and a resolved path then lands in the main checkout's fsi-app/node_modules.
// A node_modules anywhere else (a test's own fixture tree under os.tmpdir(), e.g.
// .discipline/lib/resolve-dep.test.mjs) is untouched, exactly as it is untouched in CI. The first draft
// of this file blocked ALL node_modules lookups and false-failed resolve-dep.test.mjs's two fixture
// tests on the tip; that over-reach is recorded here rather than silently narrowed.
//
// TWO RESOLUTION PATHS, BOTH COVERED.
//   1. CJS require() / createRequire().resolve() (scripts/lib/db.mjs's lazy supabase require): the
//      candidate directory list Module._nodeModulePaths returns is filtered by the rule above, so the
//      failure is Node's own MODULE_NOT_FOUND, the same error CI's absence produces.
//   2. ESM import / import() (plan-quarantine-disposition.mjs's `await import("@supabase/supabase-js")`):
//      a node:module customization hook lets Node resolve normally, then refuses a result that lies
//      under a blocked node_modules, throwing ERR_MODULE_NOT_FOUND with CI's own message shape.
//
// WIRING. run-test-suite.sh runs `node --import ./fsi-app/.discipline/lib/no-npm-sandbox.mjs --test ...`,
// the one command both CI and pre-push step 3 call. Never used by run-npmtest-suites.sh or any other
// step that runs after `npm ci`; those are meant to resolve npm packages.

import Module, { register } from 'node:module';
import { execFileSync } from 'node:child_process';
import { realpathSync, existsSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const IS_WIN = process.platform === 'win32';

function norm(p) {
  let out = resolve(p);
  try { out = realpathSync.native(out); } catch { /* a candidate dir that does not exist stays as-is */ }
  out = out.replace(/[\\/]+$/, '');
  return IS_WIN ? out.toLowerCase() : out;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = resolve(HERE, '..', '..', '..'); // .discipline/lib -> fsi-app -> repo root

function mainCheckoutRoot() {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: WORKTREE_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return common ? dirname(common) : null;
  } catch {
    return null;
  }
}

const CHECKOUT_ROOTS = [...new Set([WORKTREE_ROOT, mainCheckoutRoot()].filter(Boolean).map(norm))];

// The REAL (symlink/junction-resolved) location of every install the checkout reaches. Node's ESM
// resolver hands back a realpathed URL, so an install reached through a link whose TARGET lies outside
// every checkout root (a standalone clone under .claude/worktrees/ reaching the shared link, a pnpm-style
// store) would otherwise slip past the structural rule below; found while building this lane's own replay
// clone. Two sources, computed BEFORE the CJS patch below is installed: (a) where fsi-app's dependencies
// actually resolve from, asked of Node (the RD-85 probe `next`, via require.resolve with an explicit
// `paths`, the form F59 prescribes; never a hand-joined node_modules path), cut back to its node_modules
// directory; (b) any node_modules that exists at a checkout root or an ancestor of one.
const requireHere = Module.createRequire(import.meta.url);
function installDirOf(resolvedFile) {
  const parts = resolvedFile.split(/[\\/]/);
  const i = parts.lastIndexOf('node_modules');
  return i === -1 ? null : parts.slice(0, i + 1).join(sep);
}
const BLOCKED_INSTALL_REALPATHS = (() => {
  const out = new Set();
  for (const root of CHECKOUT_ROOTS) {
    try {
      const hit = requireHere.resolve('next/package.json', { paths: [resolve(root, 'fsi-app')] });
      const dir = installDirOf(realpathSync.native(hit));
      if (dir) out.add(norm(dir));
    } catch { /* no install reachable from this root: nothing to block, as in CI */ }
    let dir = root;
    for (;;) {
      const nm = resolve(dir, 'node_modules');
      if (existsSync(nm)) out.add(norm(nm));
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return [...out];
})();

// True when node_modules directory `nmDir` belongs to a checkout (see the rule in the header).
export function isCheckoutNodeModules(nmDir, roots = CHECKOUT_ROOTS) {
  const parent = norm(dirname(nmDir));
  const s = IS_WIN ? '\\' : sep;
  return roots.some((root) =>
    parent === root || parent.startsWith(root + s) || root.startsWith(parent + s));
}

// 1) CJS: drop the checkout's node_modules from every module's search list.
const originalNodeModulePaths = Module._nodeModulePaths;
Module._nodeModulePaths = function sandboxedNodeModulePaths(from) {
  return originalNodeModulePaths.call(this, from).filter((d) => !isCheckoutNodeModules(d));
};

// 2) ESM: resolve normally, then refuse a result under a checkout node_modules. The hook runs on
// Node's loader thread, so the roots travel as `data` and the check is restated there (plain string
// logic, no imports needed).
const HOOK_SOURCE = `
let ROOTS = [];
let INSTALLS = [];
let WIN = false;
export function initialize(data) { ROOTS = data.roots; INSTALLS = data.installs; WIN = data.win; }
function blocked(filePath) {
  const p = WIN ? filePath.toLowerCase() : filePath;
  const s = WIN ? '\\\\' : '/';
  if (INSTALLS.some((i) => p === i || p.startsWith(i + s))) return true;
  const m = p.split(s);
  for (let i = 0; i < m.length; i++) {
    if (m[i] !== 'node_modules') continue;
    const parent = m.slice(0, i).join(s);
    if (ROOTS.some((r) => parent === r || parent.startsWith(r + s) || r.startsWith(parent + s))) return true;
  }
  return false;
}
export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  if (result.url && result.url.startsWith('file:')) {
    const filePath = decodeURIComponent(new URL(result.url).pathname.replace(/^\\/([A-Za-z]:)/, '$1'))
      .split('/').join(WIN ? '\\\\' : '/');
    if (blocked(filePath)) {
      const err = new Error(
        "Cannot find package '" + specifier + "' imported from " + (context.parentURL || 'unknown') +
        " (no-npm-sandbox: the no-npm suite runs with no npm install reachable from the checkout, as CI's " +
        "test-discipline-engine job does; a test that needs this package belongs in *.npmtest.mjs)");
      err.code = 'ERR_MODULE_NOT_FOUND';
      throw err;
    }
  }
  return result;
}
`;

register(`data:text/javascript,${encodeURIComponent(HOOK_SOURCE)}`, import.meta.url, {
  data: { roots: CHECKOUT_ROOTS, installs: BLOCKED_INSTALL_REALPATHS, win: IS_WIN },
});
