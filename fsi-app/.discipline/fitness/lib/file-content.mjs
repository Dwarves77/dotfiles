// File-content reading helper for fitness functions.
// Reads relative paths against getRepoRoot(); caches per invocation so multiple
// functions scanning the same file don't re-read it.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getRepoRoot } from '../../lib/context.mjs';
import { commentsOnly } from '../../governance/coverage-scan.mjs';

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
//
// Lane GATE-8 (2026-10-08, AUD-AT-4 B1-04, B1-21, B2-07, B2-16, B5-12, B5-43, B5-58, B5-66): the marker must sit
// in a real comment. The old test looked for the marker after a comment opener anywhere on the line, so a string
// literal holding both (a quoted "// fitness-allow: F13 (x)") passed as an override. The line is lexed on its
// own and only its comment text is read. A line whose first character is a hash (a workflow or shell comment
// line) is also a marker home. A caller that holds the whole file should use overrideLines() in ./code-scan.mjs,
// which lexes the file once and also handles a marker inside a template literal that spans lines.
export function isOverridden(line, functionId) {
  const text = String(line ?? '');
  const re = new RegExp(`\\bfitness-allow:\\s*${functionId}\\s*\\(([^)]+)\\)`);
  if (re.test(commentsOnly(text))) return true;
  return /^\s*#/.test(text) && re.test(text);
}
