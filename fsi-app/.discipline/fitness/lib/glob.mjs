// File enumeration helpers for fitness functions. Glob-based; whole-repo by default.
// Uses fs.readdirSync recursive scan; simple but adequate for the codebase size.
//
// Each fitness function calls globFiles([pattern1, pattern2, ...]) and gets back
// a deduplicated list of repo-relative file paths matching any of the patterns.
//
// Patterns supported (kept narrow on purpose; if more complex globbing is needed,
// a future pass can swap in glob/fast-glob):
//   - 'dir/'                 every file recursively under dir/
//   - 'dir/**/*.ext'         every .ext file recursively under dir/
//   - 'dir/**/*.{ext1,ext2}' every .ext1 or .ext2 file recursively under dir/
//   - 'exact/path/file.ts'   exact match

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { getRepoRoot } from '../../lib/context.mjs';

// Directories skipped during recursive walk. Conservative list: only directories
// universally known to be build/tool output. NOT included: `coverage` (would skip
// the legitimate /api/admin/coverage route file). If test-coverage output ever
// lands at fsi-app/coverage/, add a path-based exclusion instead of a name-based one.
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.vercel']);

export function globFiles(patterns) {
  const root = getRepoRoot();
  const all = new Set();
  for (const pattern of patterns) {
    for (const file of expandPattern(root, pattern)) {
      all.add(file);
    }
  }
  return Array.from(all).sort();
}

function expandPattern(root, pattern) {
  // Normalize pattern separator
  const normalized = pattern.replaceAll('\\', '/');

  // Brace expansion: foo/**/*.{ext1,ext2} → multiple sub-patterns
  const braceMatch = normalized.match(/^(.+)\{([^{}]+)\}(.*)$/);
  if (braceMatch) {
    const [, prefix, opts, suffix] = braceMatch;
    const results = [];
    for (const opt of opts.split(',')) {
      results.push(...expandPattern(root, prefix + opt.trim() + suffix));
    }
    return results;
  }

  // dir/ (trailing slash; recursive walk of dir contents).
  // Checked BEFORE the exact-path branch so patterns like "docs/decisions/"
  // are treated as directory walks rather than missing files.
  if (normalized.endsWith('/')) {
    const baseDir = normalized.slice(0, -1);
    const absBase = join(root, baseDir);
    if (!existsSync(absBase)) return [];
    return walkRecursive(absBase, root);
  }

  // Exact path (no glob chars)
  if (!normalized.includes('*') && !normalized.includes('**')) {
    const abs = join(root, normalized);
    if (existsSync(abs) && statSync(abs).isFile()) {
      return [normalized];
    }
    return [];
  }

  // dir/** or dir/**/*.ext pattern
  const recursiveMatch = normalized.match(/^(.+?)\/\*\*\/?(.*)$/);
  if (recursiveMatch) {
    const [, baseDir, tail] = recursiveMatch;
    const absBase = join(root, baseDir);
    if (!existsSync(absBase)) return [];
    const allFiles = walkRecursive(absBase, root);
    if (!tail) return allFiles.filter((f) => f.startsWith(baseDir + '/'));
    return allFiles.filter((f) => f.startsWith(baseDir + '/') && matchesTail(f, tail));
  }

  // dir/*.ext (single-level)
  const singleLevelMatch = normalized.match(/^(.+?)\/\*\.(.+)$/);
  if (singleLevelMatch) {
    const [, baseDir, ext] = singleLevelMatch;
    const absBase = join(root, baseDir);
    if (!existsSync(absBase)) return [];
    return readdirSync(absBase)
      .filter((f) => f.endsWith('.' + ext))
      .map((f) => baseDir + '/' + f);
  }

  return [];
}

function matchesTail(filepath, tail) {
  // tail is something like '*.ext' or '*.{ext1,ext2}' or 'NAME.ext'
  if (tail.startsWith('*.')) {
    const ext = tail.slice(1);
    return filepath.endsWith(ext);
  }
  // Exact filename tail
  return filepath.endsWith('/' + tail);
}

function walkRecursive(absDir, root) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walkRecursive(abs, root));
    } else if (entry.isFile()) {
      out.push(relative(root, abs).split(sep).join('/'));
    }
  }
  return out;
}

// Exported for tests.
export const _expandPattern = expandPattern;
export const _matchesTail = matchesTail;
