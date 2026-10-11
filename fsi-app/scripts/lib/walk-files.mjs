import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

/** Recursively collect every file under `dir` whose extension is in `extSet`, skipping any directory whose
 * NAME is in `skipDirSet`. Silently skips unreadable directories/files (permission errors, races) rather
 * than throwing, a best-effort corpus scan, matching the callers' prior behaviour.
 * @param {string} dir
 * @param {Set<string>} extSet e.g. new Set([".ts", ".mjs"])
 * @param {Set<string>} skipDirSet e.g. new Set(["node_modules", ".git"])
 * @param {string[]} [out]
 * @returns {string[]}
 */
export function walkFiles(dir, extSet, skipDirSet, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (skipDirSet.has(name)) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walkFiles(full, extSet, skipDirSet, out);
    else if (extSet.has(extname(name))) out.push(full);
  }
  return out;
}
