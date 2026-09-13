// D7 Fix round 3 (docs/plans/defect-fix-plan-2026-09-12.md; the class behind PR #660's red and PR #640's
// own fix). A Node ESM `resolve` hook (module customization hook, node:module's `register()` API) that
// makes every BARE package specifier unresolvable, refusing before Node's own resolver ever looks in
// node_modules. This simulates the no-npm "Discipline engine unit tests" CI job locally and exactly: that
// job never runs `npm ci`, so a spawned script that statically imports an npm package dies with
// ERR_MODULE_NOT_FOUND. glob-portability.test.mjs already proves this for a test's own STATIC and
// TRANSITIVE relative-import graph (source text analysis, no I/O); it cannot see a SPAWNED child process
// (`spawnSync(process.execPath, [scriptPath])`, the shape check-vocabulary-drift.test.mjs itself uses to
// prove the real CLI's exit code), since that is a subprocess launch, not an import specifier. This hook
// is the runtime counterpart for exactly that gap: point a spawned child at it (via `--import` +
// no-npm-resolve-register.mjs) and its own imports are refused for real, not just pattern-matched.
//
// Lives under a `fixtures` directory (never imported, only ever referenced by file path and loaded via
// `--import`): the same by-rule F25 module-liveness exemption D7 Fix round 1 built, reused here rather
// than a second per-file allowlist entry.
//
// A specifier is allowed through unresolved-hook-side (`nextResolve`) iff it is a `node:` builtin or a
// relative/absolute/file: path; anything else (a bare package name, a tsconfig `@/` alias) is refused with
// the SAME error shape (`ERR_MODULE_NOT_FOUND`) a genuine no-npm-ci run produces.
export async function resolve(specifier, context, nextResolve) {
  const isBuiltin = specifier.startsWith("node:");
  const isPathLike =
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("file:") ||
    /^[a-zA-Z]:[\\/]/.test(specifier); // a Windows drive-letter absolute path (C:\... / C:/...)
  if (!isBuiltin && !isPathLike) {
    const err = new Error(
      `Cannot find package '${specifier}' imported from ${context.parentURL} (no-npm-resolve-hook: bare ` +
      `package specifiers are refused, simulating the no-npm CI job).`,
    );
    err.code = "ERR_MODULE_NOT_FOUND";
    throw err;
  }
  return nextResolve(specifier, context);
}
