// ADR (Architectural Decision Record) loader.
// Reads docs/decisions/ADR-NNN-*.md files, parses YAML-style frontmatter,
// returns array of ADR records. Minimal frontmatter parser (no js-yaml dep).
//
// Expected frontmatter shape:
//   ---
//   id: ADR-001
//   title: Platform model
//   status: accepted | proposed | deprecated | superseded
//   date: 2026-05-20
//   scope:
//     - "glob-pattern-1"
//     - "glob-pattern-2"
//   supersedes: null | ADR-NNN
//   related:
//     - ADR-NNN
//   ---
//
// The Nygard body sections (Context, Decision, Consequences, Alternatives Considered)
// are NOT parsed by the loader; the loader's job is to expose enough metadata for
// the 13th binding rule to do scope intersection.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getRepoRoot } from './context.mjs';

const ADR_DIR_RELATIVE = 'docs/decisions';
const ADR_FILENAME_RE = /^ADR-(\d{3})-[a-z0-9-]+\.md$/;
const VALID_STATUS = new Set(['proposed', 'accepted', 'deprecated', 'superseded']);

// Public: list all ADRs (regardless of status).
export function listAllAdrs() {
  const dir = join(getRepoRoot(), ADR_DIR_RELATIVE);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((f) => ADR_FILENAME_RE.test(f))
    .map((f) => loadAdr(join(ADR_DIR_RELATIVE, f)))
    .filter(Boolean);
}

// Public: list only accepted ADRs (the set the cross-reference rule enforces).
export function listAcceptedAdrs() {
  return listAllAdrs().filter((adr) => adr.status === 'accepted');
}

// Public: load a single ADR from a relative path. Returns null on error.
export function loadAdr(relPath) {
  const abs = join(getRepoRoot(), relPath);
  if (!existsSync(abs)) return null;
  const content = readFileSync(abs, 'utf-8');
  return parseAdrContent(relPath, content);
}

// Exposed for testing.
export function parseAdrContent(relPath, content) {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]+?)\r?\n---/);
  if (!frontmatterMatch) {
    return { _error: `ADR ${relPath} has no YAML frontmatter`, filePath: relPath };
  }
  const fm = parseMinimalYaml(frontmatterMatch[1]);
  const errors = [];

  if (!fm.id || !/^ADR-\d{3}$/.test(fm.id)) {
    errors.push(`invalid id "${fm.id}" (expected ADR-NNN format)`);
  }
  if (!fm.title || typeof fm.title !== 'string') {
    errors.push('missing or invalid title');
  }
  if (!fm.status || !VALID_STATUS.has(fm.status)) {
    errors.push(`invalid status "${fm.status}" (expected one of: ${[...VALID_STATUS].join(', ')})`);
  }
  if (!fm.date || !/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) {
    errors.push(`invalid date "${fm.date}" (expected YYYY-MM-DD)`);
  }
  if (!Array.isArray(fm.scope)) {
    errors.push(`scope must be a list (got ${typeof fm.scope})`);
  }

  return {
    id: fm.id,
    title: fm.title,
    status: fm.status,
    date: fm.date,
    scope: Array.isArray(fm.scope) ? fm.scope : [],
    supersedes: fm.supersedes || null,
    related: Array.isArray(fm.related) ? fm.related : [],
    filePath: relPath,
    _errors: errors,
  };
}

// Minimal YAML parser supporting:
//   key: value           string or null
//   key: 123             number
//   key:                 array-of-strings (next lines starting with `  - `)
//     - item1
//     - "item2"
// Comments (#) ignored. Quoted strings stripped. Pretty narrow on purpose.
function parseMinimalYaml(yamlText) {
  const out = {};
  const lines = yamlText.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }
    const kvMatch = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (!kvMatch) {
      i++;
      continue;
    }
    const [, key, rawValue] = kvMatch;
    const value = stripInlineComment(rawValue).trim();

    if (value === '') {
      // Array follows? Look at next indented lines starting with `- `
      const items = [];
      i++;
      while (i < lines.length && /^\s+-\s+/.test(lines[i])) {
        const itemMatch = lines[i].match(/^\s+-\s+(.+)$/);
        if (itemMatch) items.push(unquote(itemMatch[1].trim()));
        i++;
      }
      out[key] = items;
      continue;
    }
    if (value === 'null' || value === '~') {
      out[key] = null;
    } else if (/^-?\d+$/.test(value)) {
      out[key] = parseInt(value, 10);
    } else {
      out[key] = unquote(value);
    }
    i++;
  }
  return out;
}

function stripInlineComment(s) {
  // Drop trailing # comment if not inside quotes
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) return s.slice(0, i);
  }
  return s;
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// Simple glob match for ADR scope. Reuses semantics from fitness/lib/glob.mjs.
// Supports: 'dir/', 'dir/**/*.ext', 'dir/**/file.ext', '**/file', 'exact/path/file'
export function matchScopeGlob(filepath, glob) {
  const normPath = filepath.replaceAll('\\', '/');
  const normGlob = glob.replaceAll('\\', '/');

  // dir/**/*.ext
  const dirGlobExt = normGlob.match(/^(.+\/)\*\*\/\*\.(.+)$/);
  if (dirGlobExt) {
    const [, dir, ext] = dirGlobExt;
    return normPath.startsWith(dir) && normPath.endsWith('.' + ext);
  }
  // dir/**/filename
  const dirGlobFile = normGlob.match(/^(.+\/)\*\*\/(.+)$/);
  if (dirGlobFile) {
    const [, dir, suffix] = dirGlobFile;
    return normPath.startsWith(dir) && (normPath.endsWith('/' + suffix) || normPath === dir + suffix);
  }
  // dir/**
  if (normGlob.endsWith('/**')) {
    const dir = normGlob.slice(0, -3);
    return normPath.startsWith(dir + '/') || normPath === dir;
  }
  // **/filename
  if (normGlob.startsWith('**/')) {
    const suffix = normGlob.slice(3);
    return normPath.endsWith('/' + suffix) || normPath === suffix || normPath.endsWith(suffix);
  }
  // dir/  (trailing slash; recursive)
  if (normGlob.endsWith('/')) {
    return normPath.startsWith(normGlob);
  }
  // dir/*.ext  (single level)
  const singleLevel = normGlob.match(/^(.+?)\/\*\.(.+)$/);
  if (singleLevel) {
    const [, dir, ext] = singleLevel;
    return normPath.startsWith(dir + '/') &&
           normPath.endsWith('.' + ext) &&
           !normPath.slice(dir.length + 1).includes('/');
  }
  // exact match
  return normPath === normGlob;
}

// Returns the array of ADRs whose scope intersects the given file paths.
export function findIntersectingAdrs(stagedFilePaths, adrs = null) {
  const allAdrs = adrs || listAcceptedAdrs();
  const intersecting = [];
  for (const adr of allAdrs) {
    if (adr._errors && adr._errors.length > 0) continue; // skip malformed ADRs
    const hit = adr.scope.some((g) => stagedFilePaths.some((p) => matchScopeGlob(p, g)));
    if (hit) intersecting.push(adr);
  }
  return intersecting;
}
