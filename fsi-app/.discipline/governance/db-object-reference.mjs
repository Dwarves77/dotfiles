// DB-OBJECT-REFERENCE (lane L32, 2026-09-17): the census the system health audit ran by hand, as a
// standing gate. GOVERNING SKILL: remediation-discipline (Section 4 category 45, one home per concept and
// the count can only fall) and category 9 (the half-slice defect, F14). Operator, 2026-09-17: "wire or
// remove the dead code audit"; "what audits are you running of complete code and files and supabase?"
//
// WHAT IT ANSWERS, with no database connection: which tables and functions the committed migration tree
// defines that nothing references. The schema is REPLAYED statement by statement (CREATE, DROP, RENAME in
// file order, last statement wins), which is what makes the static answer equal the live catalog: on
// 2026-09-17 the replay read 120 tables, 6 views and 95 functions against a live catalog of 121 tables
// (one ad hoc snapshot table with no migration, the schema-drift audit's business), 6 views and 95
// functions. F14's own create-only scan over-counts dropped tables; this module is the one home of schema
// derivation and F14 reads it too.
//
// REFERENCES. A table is referenced when code reads or writes it (F14's scanCode: .from("t").op, the
// guarded-write helpers, embedded selects), when SQL reads or writes it outside its own DDL (F14's scanSql:
// FROM, JOIN, REFERENCES, INSERT INTO, UPDATE, so a trigger or a view counts), or when non-comment code
// names it as a bare word (a helper taking the table name as a string). A function is referenced when code
// calls it (.rpc("f") or a bare word outside comments) or when SQL names it outside its own CREATE, DROP,
// COMMENT, GRANT or ALTER (a trigger's EXECUTE FUNCTION, a call from another function, a policy).
//
// TWO NUMBERS AND ONE STRICT SET. (1) UNREFERENCED tables: no reference of any kind, minus the reason-
// bearing allowlist (an operator decision to keep a table the code does not touch, with its date), a
// both-ways ratchet. (2) UNREAD tables: no reader of any kind (code select, SQL FROM/JOIN, a view) even
// though something writes them, the trigger-written write-only class F14 could not see (the audit's
// intelligence_item_versions), a both-ways ratchet. (3) UNREFERENCED functions: strict, zero, minus the
// allowlist. The allowlist is audited: an entry whose object is gone or is now referenced is a violation.
//
// PURE CORE + INJECTED SCANS: every function below takes text or scanned maps; the fitness function F47
// does the file reads. Negative-tested with synthetic schemas (a table nothing names must be reported).
import { scanCode, scanSql } from './producer-consumer-orphan.mjs';

const ID = String.raw`(?:public\.)?"?([a-z_][a-z0-9_]*)"?`;
const STMT_RE = new RegExp([
  String.raw`(?<createTable>create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${ID})`,
  String.raw`(?<dropTable>drop\s+table\s+(?:if\s+exists\s+)?${ID})`,
  String.raw`(?<renameTable>alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${ID}\s+rename\s+to\s+"?([a-z_][a-z0-9_]*)"?)`,
  String.raw`(?<createView>create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?${ID})`,
  String.raw`(?<dropView>drop\s+(?:materialized\s+)?view\s+(?:if\s+exists\s+)?${ID})`,
  String.raw`(?<createFunction>create\s+(?:or\s+replace\s+)?function\s+${ID}\s*\()`,
  String.raw`(?<dropFunction>drop\s+function\s+(?:if\s+exists\s+)?${ID})`,
].join('|'), 'gi');

/** Strip SQL comments so a commented-out statement never counts. */
export function stripSqlComments(sql) {
  return String(sql).replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Replay CREATE/DROP/RENAME in order over [{file, content}] (sorted by the caller). Returns
 *  {tables, views, functions}: Map(name -> defining file). */
export function replaySchema(migrationTexts) {
  const tables = new Map(); const views = new Map(); const functions = new Map();
  for (const { file, content } of migrationTexts) {
    const text = stripSqlComments(content);
    STMT_RE.lastIndex = 0;
    let m;
    while ((m = STMT_RE.exec(text)) !== null) {
      const g = m.groups;
      const names = m.slice(1).filter(Boolean).slice(1); // drop the whole-group capture, keep ID captures
      const name = (names[0] || '').toLowerCase();
      if (!name) continue;
      if (g.createTable) tables.set(name, file);
      else if (g.dropTable) tables.delete(name);
      else if (g.renameTable) { tables.delete(name); tables.set(String(names[1]).toLowerCase(), file); }
      else if (g.createView) views.set(name, file);
      else if (g.dropView) views.delete(name);
      else if (g.createFunction) functions.set(name, file);
      else if (g.dropFunction) functions.delete(name);
    }
  }
  return { tables, views, functions };
}

/** Non-comment lines of a source file (line comments and block comments removed). */
export function codeWithoutComments(content) {
  return String(content).replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
}

/** scripts/lib/db.mjs read helpers take the table name as a string-literal first argument (readAll,
 *  readAllByIds, exactCount, readOne); F14's scanCode sees only .from("t").select. Mirrors its GUARDED_WRITE_RE. */
export const READ_HELPER_RE = /\b(?:readAll|readAllByIds|readOne|exactCount|countRows)\(\s*['"`]([a-z_][a-z0-9_]*)['"`]/g;

const word = (n) => new RegExp(String.raw`(^|[^A-Za-z0-9_])${n}($|[^A-Za-z0-9_])`, 'g');
const count = (re, s) => (s.match(re) || []).length;

/** SQL references to a function beyond its own DDL (CREATE, DROP, COMMENT ON, GRANT/REVOKE, ALTER). */
export function functionSqlReferences(name, sqlText) {
  const all = count(word(name), sqlText);
  const ddl = count(new RegExp(String.raw`(create\s+(?:or\s+replace\s+)?function|drop\s+function(?:\s+if\s+exists)?|comment\s+on\s+function|grant\s+[^;\n]*?\s+on\s+function|revoke\s+[^;\n]*?\s+on\s+function|alter\s+function)\s+(?:public\.)?"?${name}"?`, 'gi'), sqlText);
  return Math.max(0, all - ddl);
}

/** SQL references to a table beyond its own DDL (the statements that mention a table because they define
 *  or decorate it, not because they use it). */
export function tableSqlReferences(name, sqlText) {
  const all = count(word(name), sqlText);
  const ddl = count(new RegExp(String.raw`(create\s+(?:unlogged\s+)?table(?:\s+if\s+not\s+exists)?|drop\s+table(?:\s+if\s+exists)?|alter\s+table(?:\s+if\s+exists)?(?:\s+only)?|comment\s+on\s+(?:table|column)|create\s+(?:unique\s+)?index(?:\s+concurrently)?(?:\s+if\s+not\s+exists)?\s+[a-z0-9_"]+\s+on|create\s+policy\s+[^\n]*?\s+on|alter\s+policy\s+[^\n]*?\s+on|drop\s+policy(?:\s+if\s+exists)?\s+[^\n]*?\s+on|create\s+(?:or\s+replace\s+)?trigger\s+[^\n]*?\s+on|drop\s+trigger(?:\s+if\s+exists)?\s+[^\n]*?\s+on|grant\s+[^;\n]*?\s+on(?:\s+table)?|revoke\s+[^;\n]*?\s+on(?:\s+table)?|publication\s+[^\n]*?\s+(?:add|set|drop)\s+table)\s+(?:public\.)?"?${name}"?(?:\.[a-z_]+)?(?![a-z0-9_])`, 'gi'), sqlText);
  return Math.max(0, all - ddl);
}

/**
 * The report. Inputs: schema from replaySchema; codeFiles [{file, content}] (non-test source); migrationTexts
 * [{file, content}]; allowlist {tables: {name: {reason, decidedOn}}, functions: {...}}.
 */
export function buildReferenceReport({ schema, codeFiles, migrationTexts, allowlist = { tables: {}, functions: {} } }) {
  const code = scanCode(codeFiles);
  const sql = scanSql(migrationTexts);
  const codeText = codeFiles.map((f) => codeWithoutComments(f.content)).join('\n');
  const helperReads = new Map();
  for (const m of codeText.matchAll(READ_HELPER_RE)) helperReads.set(m[1], (helperReads.get(m[1]) || 0) + 1);
  const sqlText = migrationTexts.map((f) => stripSqlComments(f.content)).join('\n');
  const viewText = [...schema.views.keys()].join(' ');
  const tables = [];
  for (const [name, definedIn] of schema.tables) {
    const codeRead = (code.readers.get(name) || []).length + (helperReads.get(name) || 0);
    const codeWrite = (code.writers.get(name) || []).length;
    const codeWord = count(word(name), codeText);
    const sqlRead = sql.sqlReaders.has(name) ? 1 : 0;
    const sqlWrite = sql.sqlWriters.has(name) ? 1 : 0;
    const sqlOther = tableSqlReferences(name, sqlText);
    const referenced = codeRead + codeWrite + codeWord + sqlRead + sqlWrite + sqlOther > 0;
    const read = codeRead + sqlRead > 0 || viewText.includes(name);
    tables.push({ name, definedIn, codeRead, codeWrite, codeWord, sqlRead, sqlWrite, sqlOther, referenced, read });
  }
  const functions = [];
  for (const [name, definedIn] of schema.functions) {
    const rpc = (code.rpcCalls.get(name) || []).length;
    const codeWord = count(word(name), codeText);
    const sqlRefs = functionSqlReferences(name, sqlText);
    functions.push({ name, definedIn, rpc, codeWord, sqlRefs, referenced: rpc + codeWord + sqlRefs > 0 });
  }
  const al = allowlist || {}; const alT = al.tables || {}; const alF = al.functions || {};
  const unreferencedTables = tables.filter((t) => !t.referenced && !alT[t.name]);
  const unreadTables = tables.filter((t) => t.referenced && !t.read && !alT[t.name]);
  const unreferencedFunctions = functions.filter((f) => !f.referenced && !alF[f.name]);
  const allowlistIssues = [];
  for (const [name, entry] of Object.entries(alT)) {
    const t = tables.find((x) => x.name === name);
    if (!t) allowlistIssues.push({ name, kind: 'table', issue: 'allowlisted but not in the committed schema (remove the entry)' });
    else if (t.referenced && t.read) allowlistIssues.push({ name, kind: 'table', issue: 'allowlisted but referenced and read (remove the entry)' });
    if (!entry || !entry.reason || !entry.decidedOn) allowlistIssues.push({ name, kind: 'table', issue: 'allowlist entry needs a reason and a decidedOn date' });
  }
  for (const [name, entry] of Object.entries(alF)) {
    const f = functions.find((x) => x.name === name);
    if (!f) allowlistIssues.push({ name, kind: 'function', issue: 'allowlisted but not in the committed schema (remove the entry)' });
    else if (f.referenced) allowlistIssues.push({ name, kind: 'function', issue: 'allowlisted but referenced (remove the entry)' });
    if (!entry || !entry.reason || !entry.decidedOn) allowlistIssues.push({ name, kind: 'function', issue: 'allowlist entry needs a reason and a decidedOn date' });
  }
  return { tables, functions, unreferencedTables, unreadTables, unreferencedFunctions, allowlistIssues };
}
