// migration-compare.mjs -- the ONE definition of "does this migration file say what production ran"
// (lane MIG-HIST-1, 2026-10-07). Shared by the APPLIED-MAP generator (build-applied-map.mjs) and the
// hard data audit (scripts/verify/migration-history-audit.mjs) so the map and the gate can never
// disagree about a row. Pure: no filesystem, no database, no network.
//
// Normalisation (the same idea as the 2026-10-07 export's reconcile step): comments are removed (line
// and block, outside quoted text), the text is split into statements outside quotes and dollar-quoted
// bodies, a transaction wrapper (BEGIN, COMMIT) is dropped (the migration runner supplies the
// transaction, and the stored statements never carry one), and each statement is compared with all
// whitespace removed and a trailing semicolon ignored.
//
// Classes of a (stored statements, file text) pair:
//   identical      the two statement lists are equal in order (comments and whitespace aside).
//   comments-only  not equal as raw lists (a BEGIN or COMMIT wrapper in one side), or not equal in order, but every file statement appears in the stored text and every
//                  stored statement that is not in the file is a FRAGMENT (does not begin with an SQL
//                  command word). That is exactly the artefact of the Supabase CLI splitting a comment
//                  that contains a semicolon: the tail of the comment is stored as a stray "statement".
//   code-differs   anything else (a statement the file has that production did not run, or the reverse).

/** Remove `--` and block comments outside single-quoted strings and dollar-quoted bodies. */
export function stripSqlComments(sql) {
  const s = String(sql);
  let out = '';
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    const d = s[i + 1];
    if (c === '-' && d === '-') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; out += ' '; continue; }
    if (c === "'") {
      let j = i + 1;
      while (j < n) { if (s[j] === "'" && s[j + 1] === "'") j += 2; else if (s[j] === "'") break; else j++; }
      out += s.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(s.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        const e = s.indexOf(tag, i + tag.length);
        const j = e < 0 ? n : e + tag.length;
        // A dollar-quoted body is SQL (a function or DO body): comments inside it differ between the file
        // and the stored text exactly as comments outside it do, so they are removed there too.
        out += e < 0 ? s.slice(i, j) : tag + stripSqlComments(s.slice(i + tag.length, e)) + tag;
        i = j; continue;
      }
    }
    out += c; i++;
  }
  return out;
}

/** Split comment-stripped SQL into statements at semicolons outside quoted and dollar-quoted text. */
export function splitStatements(sql) {
  const s = stripSqlComments(sql);
  const out = [];
  let cur = '';
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === "'") {
      let j = i + 1;
      while (j < n) { if (s[j] === "'" && s[j + 1] === "'") j += 2; else if (s[j] === "'") break; else j++; }
      cur += s.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(s.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        const e = s.indexOf(tag, i + tag.length);
        const j = e < 0 ? n : e + tag.length;
        cur += s.slice(i, j); i = j; continue;
      }
    }
    if (c === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const WRAPPER_RE = /^(begin|commit)(\s+transaction)?$/i;
const COMMAND_WORD_RE = /^(create|alter|drop|insert|update|delete|select|grant|revoke|comment|do|with|set|reset|truncate|notify|perform|call|execute|copy|vacuum|analyze|refresh|lock|cluster|reindex|explain|values|merge|import|security|savepoint|release|rollback|abort|start)\b/i;

/** Normalised statement keys (whitespace removed), transaction wrappers dropped. */
export function statementKeys(sql) {
  return splitStatements(sql)
    .filter((st) => !WRAPPER_RE.test(st.trim()))
    .map((st) => st.replace(/\s+/g, ''));
}

/** True when a stored statement is a stray comment fragment, not a command. */
export function isFragment(statementText) {
  return !COMMAND_WORD_RE.test(statementText.trim());
}

/**
 * Compare production's stored statements to a repo file's text.
 * @returns {{ kind: 'identical'|'comments-only'|'code-differs', fileOnly: string[], storedOnly: string[] }}
 */
export function compareStored(storedText, fileText) {
  const strictStored = splitStatements(storedText).map((st) => st.replace(/\s+/g, ''));
  const strictFile = splitStatements(fileText).map((st) => st.replace(/\s+/g, ''));
  if (strictStored.length === strictFile.length && strictStored.every((k, i) => k === strictFile[i])) {
    return { kind: 'identical', fileOnly: [], storedOnly: [] };
  }
  const stored = splitStatements(storedText).filter((st) => !WRAPPER_RE.test(st.trim()));
  const storedKeys = stored.map((st) => st.replace(/\s+/g, ''));
  const fileKeys = statementKeys(fileText);
  if (storedKeys.length === fileKeys.length && storedKeys.every((k, i) => k === fileKeys[i])) {
    return { kind: 'comments-only', fileOnly: [], storedOnly: [] };
  }
  const storedSet = new Set(storedKeys);
  const fileSet = new Set(fileKeys);
  const fileOnly = fileKeys.filter((k) => !storedSet.has(k));
  const storedOnlyIdx = storedKeys.map((k, i) => (fileSet.has(k) ? -1 : i)).filter((i) => i >= 0);
  const realStoredOnly = storedOnlyIdx.filter((i) => !isFragment(stored[i]));
  if (fileOnly.length === 0 && realStoredOnly.length === 0) {
    return { kind: 'comments-only', fileOnly: [], storedOnly: [] };
  }
  return {
    kind: 'code-differs',
    fileOnly,
    storedOnly: realStoredOnly.map((i) => storedKeys[i]),
  };
}

/** The stored text is an apply-record note, not SQL (migrations 157 to 162). */
export function isApplyRecordStub(storedText) {
  return /^\s*apply-record:/.test(String(storedText));
}

/** Marker line that separates a recovered file's header from its verbatim body. */
export const RECOVERED_BODY_MARKER = '-- ---- recovered statements below, verbatim from schema_migrations.statements ----';

/** Text of a recovered file after the marker line (exact bytes), or null when there is no marker. */
export function recoveredBody(fileText) {
  const t = String(fileText).replace(/\r\n/g, '\n');
  const idx = t.indexOf(`\n${RECOVERED_BODY_MARKER}\n`);
  if (idx < 0) return null;
  return t.slice(idx + RECOVERED_BODY_MARKER.length + 2);
}

/** Every statement of `part` (normalised) appears in `whole`: used for residue files. */
export function statementsContained(partText, wholeText) {
  const whole = new Set(statementKeys(wholeText));
  const part = statementKeys(partText);
  return part.length > 0 && part.every((k) => whole.has(k));
}

const STATUS_FIRST_LINE_RE = /^\/\*\s*status:\s*(.*?)\s*\*\/\s*$/;
const STATUS_DASH_LINE_RE = /^--\s*status:\s*(.*)$/;

/** The status carried by the file's first line (`status: ...` in a one-line block comment or a `--`
 *  comment), or null. */
export function firstLineStatus(fileText) {
  const first = String(fileText).split(/\r?\n/, 1)[0] ?? '';
  const m = STATUS_FIRST_LINE_RE.exec(first) ?? STATUS_DASH_LINE_RE.exec(first);
  return m ? m[1] : null;
}

/** Status token classes the first-line status may open with. */
export const STATUS_TOKENS = Object.freeze({
  'never-applied': /^NEVER APPLIED\b/,
  'outside-ledger': /^APPLIED OUTSIDE LEDGER\b/,
  'duplicate-prefix': /^NO LEDGER ROW, duplicate prefix, unverified\b/,
  'applied-under-ledger': /^APPLIED UNDER LEDGER VERSION\b/,
});

const NOT_APPLIED_HEADER_RE = /^--\s*NOT APPLIED\b/;

/** The two-track marker a lane writes into a new migration's header ("-- NOT APPLIED. Authored by lane ..."),
 *  within the first 30 lines. It is how a file the map names nowhere says it is not applied yet: never-applied is
 *  DERIVED from this header (see supabase/migrations/_lib/applied-status.mjs), never committed as a map entry, and
 *  never read as evidence about a file that has a ledger row. */
export function declaresNotApplied(fileText) {
  return String(fileText).split(/\r?\n/, 30).some((l) => NOT_APPLIED_HEADER_RE.test(l));
}

/** Which status token class the file's first line carries, or null. */
export function statusClassOfFile(fileText) {
  const st = firstLineStatus(fileText);
  if (st == null) return null;
  for (const [cls, re] of Object.entries(STATUS_TOKENS)) if (re.test(st)) return cls;
  return null;
}
