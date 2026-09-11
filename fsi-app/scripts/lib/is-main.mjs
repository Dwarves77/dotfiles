// THE CLI main-module guard (task 0.3b, 2026-09-11). The old idiom used across 36 files,
//   if (import.meta.url === `file://${process.argv[1]}`) { main(); }
// hand-builds the comparison string by prefixing `file://` onto the raw process.argv[1] path. On
// Windows that never equals import.meta.url: import.meta.url is a real file:// URL with forward
// slashes (file:///X:/repo/...), while process.argv[1] is Node's native path with backslashes
// (X:\repo\...), so the two sides are never equal and the guard is never true. Every CLI script using
// it silently exits 0 with no output when invoked directly on Windows, a runtime defect, not only a
// test-only one.
//
// isMainModule() is the fix: it builds the comparison URL through Node's own pathToFileURL(resolve(...))
// instead of string concatenation, so it agrees with import.meta.url on every platform. This is THE main
// guard from now on for every CLI script under fsi-app/scripts/** and fsi-app/.discipline/** (F44,
// invariant RD-68, enforces no new instance of the broken idiom re-entering either tree).
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** True when the current module was invoked directly (`node <file>`), false when it was only imported.
 *  @param {string} importMetaUrl the caller's own `import.meta.url` @returns {boolean} */
export function isMainModule(importMetaUrl) {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return pathToFileURL(resolve(argv1)).href === importMetaUrl;
}
