// resolve-dep.mjs, the ONE way discipline tooling finds an fsi-app npm dependency on disk
// (2026-09-27, invariant RD-85).
//
// Resolves a package specifier ("typescript/bin/tsc", "leaflet/dist/leaflet.css") exactly the way
// Node resolves an import from fsi-app/: fsi-app/node_modules first, then every parent directory's
// node_modules. The path `fsi-app/node_modules/<pkg>` is never assumed, because it is not where the
// package lives in a linked worktree: there the install is shared through ONE link beside the
// worktrees (`.claude/worktrees/node_modules`, created by hooks/lib/worktree-node-modules.sh), so no
// link inside any worktree can lead a remover into the shared install. On a normal `npm ci`
// checkout (CI, Vercel, the main checkout) the first lookup hits and this is identical to the old
// literal path. F59 fails CI on a new hard-coded `fsi-app/node_modules` path outside this module.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { getRepoRoot } from './context.mjs';

/** Absolute path of `spec` as resolved from fsi-app/. Throws MODULE_NOT_FOUND when it is not installed. */
export function resolveAppDep(spec, { repoRoot = getRepoRoot() } = {}) {
  return createRequire(join(repoRoot, 'fsi-app', 'package.json')).resolve(spec);
}

/** Like resolveAppDep, but null instead of throwing when the dependency is not installed. */
export function tryResolveAppDep(spec, opts) {
  try {
    return resolveAppDep(spec, opts);
  } catch {
    return null;
  }
}
