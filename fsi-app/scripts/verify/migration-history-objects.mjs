// migration-history-objects.mjs: verify the OBJECTS of the files applied outside the ledger (lane MIG-HIST-2, 2026-10-09).
//
// WHY. A migration file with no ledger row is either applied elsewhere (psql, the pooler, execute_sql: no row is written)
// or never applied. MIG-HIST-1 could not tell which: the audit compared statements, and for these files there is no stored
// statement to compare, so every one was reported "objects unverified" and none could pass. F24
// (.discipline/fitness/functions/F24-db-object-migration-home.mjs) checks the other direction (an object that exists has a
// migration home) against a committed catalog snapshot. This module is the converse, run where the database is: every
// object an outside-ledger file creates must exist in the live catalog, unless a LATER migration file ends that object's life.
//
// WHAT IS CHECKED (statement heads only; a dollar-quoted body is never searched, so a function body cannot launder an object):
//   table, view, function, index, policy (table + name), column (ALTER TABLE ... ADD COLUMN), constraint (ALTER TABLE ... ADD CONSTRAINT).
// WHAT ENDS AN OBJECT'S LIFE: a later file (higher numeric prefix) whose LAST statement about it is a DROP (or a RENAME away),
// or whose DROP of its table / its policy's table ends the table. A later file that drops and re-creates it leaves it live.
// A file with no extractable object (262: a loop over pg_policies) reports NO_CHECKABLE_OBJECTS, never a pass.
//
// RESULT per file: every expected object live (and at least one) -> OBJECTS_VERIFIED (a finding); every object ended later -> OBJECTS_UNVERIFIABLE (a finding, never a pass); any expected object absent ->
// OUTSIDE_OBJECT_MISSING (a failure: the file's own evidence that it ran is wrong, so it is never-applied, not applied
// elsewhere; the header and map entry are corrected through the executor refresh path, never by a hand-written ledger row).
//
// Pure core (a catalog value in, findings and failures out); the live catalog read is liveCatalog(client), read-only.
import { splitStatements } from "../migrations/migration-compare.mjs";

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QNAME = String.raw`(?:${IDENT}\.)?(${IDENT})`;
const unq = (s) => s.replace(/^"|"$/g, "").toLowerCase();

const RE = {
  table: new RegExp(String.raw`^create\s+(?:unlogged\s+|temp(?:orary)?\s+)?table\s+(?:if\s+not\s+exists\s+)?${QNAME}`, "i"),
  view: new RegExp(String.raw`^create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?${QNAME}`, "i"),
  func: new RegExp(String.raw`^create\s+(?:or\s+replace\s+)?(?:function|procedure)\s+${QNAME}\s*\(`, "i"),
  index: new RegExp(String.raw`^create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(${IDENT})\s+on\s+(?:only\s+)?${QNAME}`, "i"),
  policy: new RegExp(String.raw`^create\s+policy\s+(${IDENT})\s+on\s+${QNAME}`, "i"),
  alterTable: new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${QNAME}\s+([\s\S]*)$`, "i"),
  dropWhat: new RegExp(String.raw`^drop\s+(table|view|materialized\s+view|function|procedure|index|policy)\s+(?:if\s+exists\s+)?([\s\S]*)$`, "i"),
};

const key = (o) => `${o.kind}:${o.table ? `${o.table}.` : ""}${o.name}`;

/** Split a comma list at depth 0 (parentheses), for the clauses of an ALTER TABLE. */
function topLevelClauses(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const c of s) {
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (c === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Objects a statement list CREATES, in statement order: [{kind, name, table?}]. */
export function extractObjects(sql) {
  const out = [];
  for (const st of splitStatements(sql)) {
    let m;
    if ((m = RE.table.exec(st))) out.push({ kind: "table", name: unq(m[1]) });
    else if ((m = RE.view.exec(st))) out.push({ kind: "view", name: unq(m[1]) });
    else if ((m = RE.func.exec(st))) out.push({ kind: "function", name: unq(m[1]) });
    else if ((m = RE.index.exec(st))) out.push({ kind: "index", name: unq(m[1]), table: unq(m[2]) });
    else if ((m = RE.policy.exec(st))) out.push({ kind: "policy", name: unq(m[1]), table: unq(m[2]) });
    else if ((m = RE.alterTable.exec(st))) {
      const table = unq(m[1]);
      for (const clause of topLevelClauses(m[2])) {
        let c;
        if ((c = new RegExp(String.raw`^add\s+column\s+(?:if\s+not\s+exists\s+)?(${IDENT})`, "i").exec(clause))) out.push({ kind: "column", name: unq(c[1]), table });
        else if ((c = new RegExp(String.raw`^add\s+constraint\s+(${IDENT})`, "i").exec(clause))) out.push({ kind: "constraint", name: unq(c[1]), table });
      }
    }
  }
  return out;
}

/** Objects a statement list ENDS the life of, in statement order: the same shape, plus `rename: true` for a rename away. */
export function extractEnds(sql) {
  const out = [];
  for (const st of splitStatements(sql)) {
    let m;
    if ((m = RE.dropWhat.exec(st))) {
      const what = m[1].toLowerCase().replace(/\s+/g, " ");
      const rest = m[2];
      if (what === "policy") {
        const p = new RegExp(String.raw`^(${IDENT})\s+on\s+${QNAME}`, "i").exec(rest);
        if (p) out.push({ kind: "policy", name: unq(p[1]), table: unq(p[2]) });
      } else {
        for (const part of rest.split(/,(?![^(]*\))/)) {
          const n = new RegExp(`^\\s*${QNAME}`, "i").exec(part);
          if (!n) continue;
          const kind = what === "materialized view" ? "view" : what === "procedure" ? "function" : what;
          out.push({ kind, name: unq(n[1]) });
        }
      }
    } else if ((m = RE.alterTable.exec(st))) {
      const table = unq(m[1]);
      for (const clause of topLevelClauses(m[2])) {
        let c;
        if ((c = new RegExp(String.raw`^drop\s+column\s+(?:if\s+exists\s+)?(${IDENT})`, "i").exec(clause))) out.push({ kind: "column", name: unq(c[1]), table });
        else if ((c = new RegExp(String.raw`^drop\s+constraint\s+(?:if\s+exists\s+)?(${IDENT})`, "i").exec(clause))) out.push({ kind: "constraint", name: unq(c[1]), table });
        else if ((c = new RegExp(String.raw`^rename\s+column\s+(${IDENT})\s+to\b`, "i").exec(clause))) out.push({ kind: "column", name: unq(c[1]), table, rename: true });
        else if ((c = new RegExp(String.raw`^rename\s+constraint\s+(${IDENT})\s+to\b`, "i").exec(clause))) out.push({ kind: "constraint", name: unq(c[1]), table, rename: true });
      }
    }
    if ((m = new RegExp(String.raw`^alter\s+policy\s+(${IDENT})\s+on\s+${QNAME}\s+rename\s+to\b`, "i").exec(st))) out.push({ kind: "policy", name: unq(m[1]), table: unq(m[2]), rename: true });
    else if ((m = new RegExp(String.raw`^alter\s+index\s+(?:if\s+exists\s+)?${QNAME}\s+rename\s+to\b`, "i").exec(st))) out.push({ kind: "index", name: unq(m[1]), rename: true });
    else if ((m = new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?${QNAME}\s+rename\s+to\b`, "i").exec(st))) out.push({ kind: "table", name: unq(m[1]), rename: true });
  }
  return out;
}

const prefixOf = (file) => {
  const m = /^(\d+)_/.exec(file);
  return m ? BigInt(m[1]) : null;
};

const EVENTS = new WeakMap();

/** Every file's lifecycle events, in numeric prefix order (computed once per files map). */
function lifecycle(files) {
  let ev = EVENTS.get(files);
  if (ev) return ev;
  ev = [...files.entries()]
    .filter(([f]) => prefixOf(f) != null)
    .sort(([a], [b]) => (prefixOf(a) < prefixOf(b) ? -1 : prefixOf(a) > prefixOf(b) ? 1 : a < b ? -1 : 1))
    .map(([file, text]) => {
      const events = [];
      for (const st of splitStatements(text)) {
        for (const c of extractObjects(`${st};`)) events.push({ type: "create", obj: c });
        for (const e of extractEnds(`${st};`)) events.push({ type: "end", obj: e });
      }
      return { file, prefix: prefixOf(file), events };
    });
  EVENTS.set(files, ev);
  return ev;
}

/**
 * Does a later file end this object's life? Walks the later files in numeric order; within a file, statements in order. The
 * last event wins (create = live, drop or rename-away = ended). A dropped or renamed-away TABLE ends its columns, indexes,
 * policies and constraints; a later create of that table makes them expected again.
 * @returns {string|null} the file that ended it, or null when it is still expected live
 */
export function endedBy(obj, file, files) {
  const me = prefixOf(file);
  if (me == null) return null;
  let ended = null;
  const target = key(obj);
  for (const f of lifecycle(files)) {
    if (f.prefix <= me) continue;
    for (const { type, obj: o } of f.events) {
      if (type === "create") { if (key(o) === target || (obj.table && o.kind === "table" && o.name === obj.table)) ended = null; }
      else if (key(o) === target || (obj.table && o.kind === "table" && o.name === obj.table)) ended = f.file;
    }
  }
  return ended;
}

/**
 * Pure verifier.
 * @param {object} p
 * @param {Map<string,string>} p.files every migration file name to its text
 * @param {{file:string,class:string}[]} p.entries the map's keyed file entries (fileEntries(map))
 * @param {{tables:Set<string>,views:Set<string>,functions:Set<string>,indexes:Set<string>,policies:Set<string>,columns:Set<string>,constraints:Set<string>}} p.catalog
 *   policies "table.name", columns "table.column", constraints "table.name" (lower case, schema public)
 * @returns {{ failures: {code:string,key:string,detail:string}[], findings: string[] }}
 */
export function verifyOutsideLedger({ files, entries, catalog }) {
  const failures = [];
  const findings = [];
  const has = (o) => {
    switch (o.kind) {
      case "table": return catalog.tables.has(o.name) || catalog.views.has(o.name);
      case "view": return catalog.views.has(o.name) || catalog.tables.has(o.name);
      case "function": return catalog.functions.has(o.name);
      case "index": return catalog.indexes.has(o.name);
      case "policy": return catalog.policies.has(`${o.table}.${o.name}`);
      case "column": return catalog.columns.has(`${o.table}.${o.name}`);
      case "constraint": return catalog.constraints.has(`${o.table}.${o.name}`);
      default: return false;
    }
  };
  for (const f of entries) {
    if (f.class !== "outside-ledger") continue;
    const text = files.get(f.file);
    if (text == null) continue;
    const seen = new Set();
    const objs = extractObjects(text).filter((o) => (seen.has(key(o)) ? false : (seen.add(key(o)), true)));
    if (objs.length === 0) { findings.push(`NO_CHECKABLE_OBJECTS ${f.file}: creates no object a catalog read can name; its objects stay unverified`); continue; }
    let live = 0;
    let ended = 0;
    const missing = [];
    for (const o of objs) {
      const by = endedBy(o, f.file, files);
      if (by) { ended++; continue; }
      if (has(o)) live++; else missing.push(`${o.kind} ${o.table ? `${o.table}.` : ""}${o.name}`);
    }
    if (missing.length) {
      failures.push({
        code: "OUTSIDE_OBJECT_MISSING",
        key: f.file,
        detail: `${missing.length} of ${objs.length} objects absent from the live catalog (${missing.slice(0, 4).join(", ")}${missing.length > 4 ? ", ..." : ""}): the file did not run elsewhere, so it is never-applied, not outside-ledger; correct its header and map entry through the executor refresh path`,
      });
    } else if (live === 0) {
      findings.push(`OBJECTS_UNVERIFIABLE ${f.file}: all ${ended} objects it creates were ended by later files, so the live catalog cannot show it ran; not a pass`);
    } else {
      findings.push(`OBJECTS_VERIFIED ${f.file}: ${live} live, ${ended} ended by a later file, 0 missing`);
    }
  }
  return { failures, findings };
}

/** A catalog value with nothing in it (a fixture base). */
export const emptyCatalog = () => ({ tables: new Set(), views: new Set(), functions: new Set(), indexes: new Set(), policies: new Set(), columns: new Set(), constraints: new Set() });

/** The one read-only catalog query. Rows: kind, a, b (b null where unused). */
export const CATALOG_SQL = `
SELECT 'table' AS kind, c.relname::text AS a, NULL::text AS b FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
UNION ALL SELECT 'view', c.relname::text, NULL FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
UNION ALL SELECT 'function', p.proname::text, NULL FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
UNION ALL SELECT 'index', indexname::text, tablename::text FROM pg_indexes WHERE schemaname = 'public'
UNION ALL SELECT 'policy', tablename::text, policyname::text FROM pg_policies WHERE schemaname = 'public'
UNION ALL SELECT 'column', table_name::text, column_name::text FROM information_schema.columns WHERE table_schema = 'public'
UNION ALL SELECT 'constraint', c.relname::text, k.conname::text FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'`;

/** Fold the rows of CATALOG_SQL into the catalog value (names lower-cased). */
export function catalogFromRows(rows) {
  const cat = emptyCatalog();
  for (const r of rows) {
    const a = String(r.a).toLowerCase();
    const b = r.b == null ? null : String(r.b).toLowerCase();
    if (r.kind === "table") cat.tables.add(a);
    else if (r.kind === "view") cat.views.add(a);
    else if (r.kind === "function") cat.functions.add(a);
    else if (r.kind === "index") cat.indexes.add(a);
    else if (r.kind === "policy") cat.policies.add(`${a}.${b}`);
    else if (r.kind === "column") cat.columns.add(`${a}.${b}`);
    else if (r.kind === "constraint") cat.constraints.add(`${a}.${b}`);
  }
  return cat;
}

/** Read the live catalog through an already-connected read-only client. */
export async function liveCatalog(client) {
  const { rows } = await client.query(CATALOG_SQL);
  return catalogFromRows(rows);
}
