// File-content reading helper for fitness functions.
// Reads relative paths against getRepoRoot(); caches per invocation so multiple
// functions scanning the same file don't re-read it.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getRepoRoot } from '../../lib/context.mjs';

const _cache = new Map();

export function readFile(relPath) {
  if (_cache.has(relPath)) return _cache.get(relPath);
  const abs = join(getRepoRoot(), relPath);
  if (!existsSync(abs)) {
    _cache.set(relPath, null);
    return null;
  }
  const content = readFileSync(abs, 'utf-8');
  _cache.set(relPath, content);
  return content;
}

// Test-only: reset cache so successive tests can exercise different content.
export function _clearCache() {
  _cache.clear();
}

// Detect a trailing `// fitness-allow: <function-id> (reason)` override on a line.
// Returns true if the line should be skipped for the given function id.
// Override format requires non-empty parenthetical reason.
export function isOverridden(line, functionId) {
  const re = new RegExp(`(?://|#|/\\*).*\\bfitness-allow:\\s*${functionId}\\s*\\(([^)]+)\\)`);
  return re.test(line);
}
