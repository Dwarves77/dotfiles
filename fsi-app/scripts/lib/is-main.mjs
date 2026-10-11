import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** True when the current module was invoked directly (`node <file>`), false when it was only imported.
 *  @param {string} importMetaUrl the caller's own `import.meta.url` @returns {boolean} */
export function isMainModule(importMetaUrl) {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return pathToFileURL(resolve(argv1)).href === importMetaUrl;
}
