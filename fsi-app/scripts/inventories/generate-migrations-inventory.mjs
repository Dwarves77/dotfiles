#!/usr/bin/env node
// generate-migrations-inventory.mjs -- writes docs/inventories/migrations.md from the migration files
// (plan 6.8, Rule A, lane N5, coordinator amendment 1 item 3). Every fsi-app/supabase/migrations/*.sql
// file carries a `-- subject: <text>` line (after an optional leading `/* fitness-allow */` line) as its
// own single source of truth for its Subject cell; this script derives the "## Migrations" table from
// those lines plus each file's own name, byte-for-byte for the subject text (re-escaping a literal `|`
// as `\|` for the markdown table, the inverse of how the subject line itself carries an UNescaped `|`).
//
// WHY A SUBJECT LINE IN THE FILE, NOT A MECHANICAL DERIVATION FROM THE MIGRATION'S OWN HEADER COMMENT:
// [CONFIRMED by lane N5, 2026-09-19] measured against all 296 on-disk migration files, the cleanest
// mechanical rule (first `--` comment line, truncated to 80 chars) reproduces only about 95 of 296 rows
// exactly; the remaining ~201 carry hand-authored prose beyond the header (e.g. migration 099's stored
// subject names fields the header text never mentions). The Subject column was never a pure function of
// the header comment; moving it INTO the migration file (once, by a scratch script, never by hand) makes
// it a fact the file itself carries, so the page can be a real derivation of the tree again (plan 6.8
// Rule A: "one entry, one file") without inventing or guessing content. The applied schema is UNCHANGED
// by this: the Supabase CLI tracks migrations by filename/version, never by content, and a `-- subject:`
// line is a SQL comment, not DDL.
//
// The "## Related" section (hand-authored cross-links, not migration facts) is preserved byte-for-byte
// from whatever is currently committed -- this generator only derives the "## Migrations" table and its
// own header; it never invents or edits the Related section.
//
// Usage: `node fsi-app/scripts/inventories/generate-migrations-inventory.mjs [--write]`
//   --write   writes docs/inventories/migrations.md (default: prints the derived page to stdout, dry).

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FSI = resolve(HERE, '..', '..');
export const REPO = resolve(FSI, '..');
export const MIG_DIR_REL = 'fsi-app/supabase/migrations';
export const DOC_PATH_REL = 'docs/inventories/migrations.md';

const SUBJECT_LINE_RE = /^-- subject: (.*)$/;
const LEADING_BLOCK_COMMENT_RE = /^\s*\/\*.*\*\/\s*$/;
// A trailing ` [glyph:verbatim]` tag (pre-commit rule 022's own disclosure marker, made to fit this
// exact line shape) is stripped before the subject is used anywhere: it exists only so a subject that
// carries an em/en dash or the section-sign glyph verbatim from docs/inventories/migrations.md's own
// pre-existing prose (moved here by lane N5, 2026-09-19, never authored fresh) can disclose that glyph
// on the SAME line rule 022 scans, without the disclosure text itself becoming part of the derived
// subject and breaking byte-for-byte parity with the page.
const VERBATIM_TAG_RE = / \[glyph:verbatim\]$/;

/**
 * The migration's own first non-block-comment line, parsed as its subject line, or null if the file's
 * header is not well-formed (no leading `/* ... *\/` OR `-- subject: ` line where one of those two shapes
 * is expected as the very first line).
 * @param {string} text the migration file's full source text
 * @returns {{ subject: string } | null}
 */
export function parseSubjectLine(text) {
  const lines = text.split(/\r?\n/);
  let i = 0;
  if (LEADING_BLOCK_COMMENT_RE.test(lines[i] ?? '')) i++;
  const m = SUBJECT_LINE_RE.exec(lines[i] ?? '');
  if (!m) return null;
  return { subject: m[1].replace(VERBATIM_TAG_RE, '') };
}

/** Re-escape a literal `|` as `\|` for the markdown table cell (the inverse of the unescape the subject
 *  line itself carries; a subject line has no other markdown-significant escaping to reverse). */
export function escapeForTableCell(subject) {
  return subject.replaceAll('|', '\\|');
}

// Pre-commit rule 022 (no em/en dash or section-sign glyph in ADDED prose) scans added lines, and a
// full regeneration of this page re-adds every row's bytes at whatever position sorting puts them at,
// even a row whose content is byte-for-byte unchanged history -- so a row moved by sorting, not a row
// authored fresh, can still trip the rule on the line it lands on. Rather than editing pre-existing
// migration subject text (which would break the byte-for-byte parity this generator exists to prove),
// the table cell itself carries the same disclosure tag the migration file's own subject line does
// (generate-migrations-inventory.test.mjs proves this).
const GLYPH_RE = /[\u2013\u2014\u00a7]/;

/** The table cell for one row's subject: escaped for the markdown table, plus the disclosure tag when
 *  the (unescaped) subject text carries a banned glyph the rule scans for. */
function renderSubjectCell(subject) {
  const escaped = escapeForTableCell(subject);
  return GLYPH_RE.test(subject) ? `${escaped} [glyph:verbatim]` : escaped;
}

/**
 * Every migration file's row, sorted by number ascending then filename ascending (the same tie order
 * the original hand-maintained table used for same-numbered files, e.g. 006_multi_tenant.sql before
 * 006_rls_multi_tenant.sql, 007_community_layer.sql before 007_full_brief.sql before 007_rls_community.sql).
 * @param {string} migDir absolute path to fsi-app/supabase/migrations
 * @returns {{ rows: {number: string, file: string, subject: string}[], malformed: string[] }}
 */
export function buildRows(migDir, { readFileFn = readFileSync, listFilesFn } = {}) {
  const files = (listFilesFn ? listFilesFn(migDir) : readdirSync(migDir)).filter((f) => f.endsWith('.sql'));
  const rows = [];
  const malformed = [];
  for (const file of files) {
    const m = /^(\d+)_/.exec(file);
    if (!m) { malformed.push(file); continue; }
    const text = readFileFn(resolve(migDir, file), 'utf8');
    const parsed = parseSubjectLine(text);
    if (!parsed) { malformed.push(file); continue; }
    rows.push({ number: m[1], file, subject: parsed.subject });
  }
  rows.sort((a, b) => {
    const na = Number(a.number);
    const nb = Number(b.number);
    if (na !== nb) return na - nb;
    return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
  });
  return { rows, malformed };
}

/** Everything after the "## Migrations" table (its own trailing prose sections: "## Maintenance
 *  trigger", "## Records-truth corrections", "## Source files", "## Related", or whatever a lane adds
 *  next), from the currently committed doc, verbatim, or a bare stub if the doc does not exist yet
 *  (first-run bootstrap). This generator derives ONLY the "## Migrations" table; every other section is
 *  hand-authored prose it carries through unedited, never invented, never assumed to be "## Related"
 *  alone (found, lane N5 2026-09-19: three sections sat between the table and "## Related"). */
export function extractFooter(currentDocText) {
  if (!currentDocText) return '## Related\n\n';
  const m = /^## (?!Migrations\b).*$/m.exec(currentDocText);
  if (!m) return '## Related\n\n';
  return currentDocText.slice(m.index);
}

/**
 * A row inside the "## Migrations" table whose first cell is not a plain number (e.g. `| — | (number -- glyph:verbatim (the actual placeholder character migrations.md's real gap row uses)
 * 307 first drafted for ...) | ... |`, documenting a migration number that was drafted and withdrawn
 * before any file existed) -- never derivable from a file, since no file names it. Preserved verbatim
 * from the currently committed doc and merged back in at its documented number (the first `number NNN`
 * mentioned in the row's own text), never invented, never dropped. Returns [] when the doc does not
 * exist yet or names no such row.
 * @param {string | null} currentDocText
 * @returns {{ number: string, file: string, rawLine: string }[]}
 */
export function extractGapRows(currentDocText) {
  if (!currentDocText) return [];
  const tableStart = currentDocText.indexOf('## Migrations');
  if (tableStart === -1) return [];
  const afterTable = currentDocText.slice(tableStart);
  const footerHeadingMatch = /^## (?!Migrations\b).*$/m.exec(afterTable);
  const tableBlock = footerHeadingMatch ? afterTable.slice(0, footerHeadingMatch.index) : afterTable;
  const out = [];
  for (const line of tableBlock.split('\n')) {
    if (!line.startsWith('| ')) continue;
    const firstCell = line.slice(1, line.indexOf('|', 1)).trim();
    if (/^\d+$/.test(firstCell)) continue; // a real file row, not a gap annotation
    if (firstCell === '#') continue; // the header row itself
    const numberMatch = /\bnumber (\d+)\b/.exec(line);
    if (!numberMatch) {
      throw new Error(`gap-annotation row has no "number NNN" to sort by: ${line.slice(0, 80)}...`);
    }
    out.push({ number: numberMatch[1], file: `\0gap:${firstCell}`, rawLine: line });
  }
  return out;
}

const GENERATED_HEADER =
  '**Generated by `fsi-app/scripts/inventories/generate-migrations-inventory.mjs`** ' +
  '(run `node fsi-app/scripts/inventories/generate-migrations-inventory.mjs --write` to regenerate). ' +
  'Never edited by a lane: every row comes from the migration file\'s own `-- subject:` line; edit that ' +
  'line and regenerate, never this table.';

/** The full page text, derived. Pure: takes the file rows, any gap-annotation rows (preserved verbatim,
 *  see extractGapRows), and the footer text, returns the whole document. Gap rows sort into the same
 *  number ordering as file rows, by their own documented number; a gap row never collides with a real
 *  file's own number in practice (it exists specifically because no file claims that number). */
export function buildInventoryPage(rows, gapRows, footerText) {
  const header = [
    '# Migrations Inventory',
    '',
    GENERATED_HEADER,
    '',
    '## Migrations',
    '',
    '| # | File | Subject (from header comment) |',
    '|---|---|---|',
  ];
  const merged = [...rows, ...gapRows].sort((a, b) => {
    const na = Number(a.number);
    const nb = Number(b.number);
    if (na !== nb) return na - nb;
    return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
  });
  const tableRows = merged.map((r) =>
    r.rawLine ?? `| ${r.number} | ${r.file} | ${renderSubjectCell(r.subject)} |`
  );
  return header.concat(tableRows).join('\n') + '\n\n' + footerText;
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('generate-migrations-inventory.mjs')) {
  const migDir = resolve(REPO, MIG_DIR_REL);
  const docPath = resolve(REPO, DOC_PATH_REL);
  const { rows, malformed } = buildRows(migDir);
  if (malformed.length > 0) {
    console.error(`generate-migrations-inventory: ${malformed.length} migration file(s) have no well-formed subject line:`);
    for (const f of malformed) console.error(`  - ${f}`);
    process.exit(1);
  }
  const currentDocText = existsSync(docPath) ? readFileSync(docPath, 'utf8') : null;
  const page = buildInventoryPage(rows, extractGapRows(currentDocText), extractFooter(currentDocText));
  if (process.argv.includes('--write')) {
    writeFileSync(docPath, page);
    console.log(`generate-migrations-inventory: wrote ${DOC_PATH_REL} (${rows.length} rows).`);
  } else {
    process.stdout.write(page);
  }
}
