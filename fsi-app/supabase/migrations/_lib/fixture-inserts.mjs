// fixture-inserts.mjs: shared helper for the static tests of migrations whose self-check writes fixture rows
// (lane SEC-3b-F, 2026-10-08; lifted from the per-test parser of 372_profiles_read.test.mjs, lane SEC-5).
//
// WHY. A migration self-check inserts fixture rows into live tables, and a fixture that violates the table's real
// definition aborts the apply AFTER the migration's logic already ran: 372 apply 2 (23502, profiles.region is NOT NULL
// DEFAULT '{}' and the fixture inserted an explicit NULL) and 370's apply (23514, org_watchlist.item_type admits
// source, reg, signal, research, operations, market_series and the fixture wrote 'item'). Nothing in CI executes
// Postgres, so the check is made statically: every fixture INSERT (and every UPDATE ... SET col = 'literal') in a
// migration is parsed and compared with the table definition REBUILT FROM THE MIGRATION TREE (CREATE TABLE, ALTER
// TABLE ADD/DROP COLUMN, SET/DROP DEFAULT, SET/DROP NOT NULL, ADD/DROP CONSTRAINT ... CHECK, DROP TABLE, in file order),
// so a fact cannot drift from the migration that creates it.
//
// WHAT IS CHECKED, per INSERT: the table and every written column exist; no GENERATED ALWAYS column is written; every
// NOT NULL column without a default is written; no NOT NULL column is given a literal NULL; every string literal written to
// a column that carries a single-column IN-list CHECK is in the list (NULL only if the column is nullable). Values
// that are not literals (a PL/pgSQL variable, an expression) are opaque and are not judged. Per UPDATE ... SET col =
// 'literal': the column exists and the literal is in the column's IN-list. Not checked (stated, not hidden): foreign
// keys and unique constraints beyond what the caller asserts, multi-column or compound CHECKs, types, lengths.
//
// No SQL parser dependency; node builtins only (the no-npm discipline glob).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ---- scanning ------------------------------------------------------------------------------------------------------

/** Remove -- and block comments outside string literals and dollar quotes. Dollar-quoted bodies are kept or dropped. */
export function stripSql(text, { keepDollarBodies = true } = {}) {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const two = text.slice(i, i + 2);
    if (two === "--") { while (i < n && text[i] !== "\n") i++; continue; }
    if (two === "/*") { const e = text.indexOf("*/", i + 2); i = e === -1 ? n : e + 2; continue; }
    if (c === "'") {
      let j = i + 1;
      while (j < n) { if (text[j] === "'" && text[j + 1] === "'") j += 2; else if (text[j] === "'") break; else j++; }
      out += text.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_]\w*)?\$/.exec(text.slice(i, i + 40));
      if (m) {
        const tag = m[0];
        const e = text.indexOf(tag, i + tag.length);
        if (e !== -1) {
          const body = text.slice(i + tag.length, e);
          out += keepDollarBodies ? tag + stripSql(body, { keepDollarBodies }) + tag : tag + tag;
          i = e + tag.length; continue;
        }
      }
    }
    out += c; i++;
  }
  return out;
}

/** Split on top-level commas (outside parens, brackets and string literals). */
export function splitTop(text, sep = ",") {
  const parts = [];
  let depth = 0, cur = "", i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "'") {
      let j = i + 1;
      while (j < text.length) { if (text[j] === "'" && text[j + 1] === "'") j += 2; else if (text[j] === "'") break; else j++; }
      cur += text.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (c === sep && depth === 0) { parts.push(cur); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim() !== "") parts.push(cur);
  return parts;
}

/** Index of the paren that closes the one opening at `open`, honouring string literals. */
function matchParen(text, open) {
  let depth = 0, i = open;
  while (i < text.length) {
    const c = text[i];
    if (c === "'") {
      let j = i + 1;
      while (j < text.length) { if (text[j] === "'" && text[j + 1] === "'") j += 2; else if (text[j] === "'") break; else j++; }
      i = j + 1; continue;
    }
    if (c === "(") depth++;
    if (c === ")") { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

const ident = (s) => s.replace(/^"|"$/g, "").toLowerCase();
const unqualify = (s) => ident(s.trim().replace(/^public\./i, ""));

// ---- the schema, rebuilt from the migration tree --------------------------------------------------------------------

function statements(text) {
  const stripped = stripSql(text, { keepDollarBodies: false });
  const out = [];
  let cur = "", i = 0;
  while (i < stripped.length) {
    const c = stripped[i];
    if (c === "'") {
      let j = i + 1;
      while (j < stripped.length) { if (stripped[j] === "'" && stripped[j + 1] === "'") j += 2; else if (stripped[j] === "'") break; else j++; }
      cur += stripped.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === ";") { out.push(cur.trim().replace(/\s+/g, " ")); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim().replace(/\s+/g, " "));
  return out;
}

function listFromCheck(expr, col) {
  // Only the two shapes that constrain ONE column to a literal list: (col IN (...)) and (col IS NULL OR col IN (...)).
  const e = expr.trim().replace(/^\(+|\)+$/g, (m) => m).trim();
  const re = new RegExp("^\\(*\\s*(?:" + col + "\\s+IS\\s+NULL\\s+OR\\s+)?(?:\\(?\\s*)?" + col + "\\s+IN\\s*\\(([^()]*)\\)\\s*\\)*$", "i");
  // The stored form PostgreSQL prints, and migration 270's: col = ANY (ARRAY['a'::text, 'b'::text]).
  const reAny = new RegExp("^\\(*\\s*(?:" + col + "\\s+IS\\s+NULL\\s+OR\\s+)?(?:\\(?\\s*)?" + col + "\\s*=\\s*ANY\\s*\\(\\s*\\(?\\s*ARRAY\\s*\\[(.*)\\]\\s*\\)*\\s*\\)*$", "is");
  const m = re.exec(e) || reAny.exec(e);
  if (!m) return null;
  const vals = [...m[1].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'"));
  const rest = m[1].replace(/'(?:[^']|'')*'/g, "").replace(/::\w+/g, "").replace(/[\s,]/g, "");
  if (vals.length === 0 || rest !== "") return null;
  return { values: new Set(vals), nullOk: /IS\s+NULL\s+OR/i.test(e) };
}

function checkExprs(def) {
  const out = [];
  const re = /\bCHECK\s*\(/gi;
  let m;
  while ((m = re.exec(def))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(def, open);
    if (close === -1) break;
    out.push(def.slice(open + 1, close));
    re.lastIndex = close;
  }
  return out;
}

function parseColumn(table, name, def) {
  const col = {
    name,
    notNull: /\bNOT NULL\b/i.test(def) || /\bPRIMARY KEY\b/i.test(def),
    hasDefault: /\bDEFAULT\b/i.test(def) || /\bGENERATED\b[^,]*\bAS\b/i.test(def) || /^(big)?serial\b/i.test(def),
    generated: /\bGENERATED ALWAYS AS\b/i.test(def),
    references: (/\bREFERENCES\s+(?:public\.)?"?(\w+)"?/i.exec(def) || [])[1] || null,
    checks: new Map(),
  };
  const named = /\bCONSTRAINT\s+"?(\w+)"?\s+CHECK\s*\(/i.exec(def);
  checkExprs(def).forEach((expr, i) => {
    const key = (i === 0 && named ? named[1] : table + "_" + name + "_check" + (i === 0 ? "" : String(i))).toLowerCase();
    col.checks.set(key, { expr, list: listFromCheck(expr, name) });
  });
  return col;
}

/** Build { tables: Map<name, { columns: Map<name, col>, checks: Map<key, { col, list }> }> } from the migrations below `before`. */
export function buildSchema(dir, { before = Infinity } = {}) {
  const files = readdirSync(dir)
    .filter((f) => /^\d+_.*\.sql$/.test(f) && parseInt(f, 10) < before)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
  const tables = new Map();
  const dropConstraint = (t, name) => {
    const key = name.toLowerCase();
    t.checks.delete(key);
    for (const c of t.columns.values()) c.checks.delete(key);
  };
  const addTableCheck = (t, name, expr) => {
    const cols = [...t.columns.keys()].filter((c) => new RegExp("\\b" + c + "\\b", "i").test(expr));
    const col = cols.length === 1 ? cols[0] : null;
    t.checks.set(name.toLowerCase(), { col, expr, list: col ? listFromCheck(expr, col) : null });
  };
  for (const f of files) {
    for (const s of statements(readFileSync(join(dir, f), "utf8"))) {
      let m = /^CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?"?(\w+)"? \((.*)\)(?: (?:PARTITION|WITH|TABLESPACE|INHERITS).*)?$/i.exec(s);
      if (m) {
        const name = ident(m[1]);
        if (tables.has(name) && /IF NOT EXISTS/i.test(s)) continue;
        const t = { columns: new Map(), checks: new Map() };
        tables.set(name, t);
        // A table-level CHECK may name a column declared AFTER it, so table checks are applied once every column is known.
        const deferred = [];
        for (const el of splitTop(m[2]).map((x) => x.trim())) {
          if (/^(CONSTRAINT\s+"?(\w+)"?\s+)?CHECK\s*\(/i.test(el)) {
            deferred.push(el);
          } else if (/^(CONSTRAINT\s+"?\w+"?\s+)?(PRIMARY KEY|UNIQUE|FOREIGN KEY|EXCLUDE|LIKE)\b/i.test(el)) {
            const pk = /PRIMARY KEY\s*\(([^)]*)\)/i.exec(el);
            if (pk) for (const c of pk[1].split(",")) { const col = t.columns.get(ident(c.trim())); if (col) col.notNull = true; }
          } else {
            const cm = /^"?(\w+)"?\s+(.*)$/s.exec(el);
            if (cm) t.columns.set(ident(cm[1]), parseColumn(name, ident(cm[1]), cm[2]));
          }
        }
        for (const el of deferred) {
          const cn = /^CONSTRAINT\s+"?(\w+)"?/i.exec(el);
          addTableCheck(t, cn ? cn[1] : name + "_check" + t.checks.size, checkExprs(el)[0]);
        }
        continue;
      }
      m = /^DROP TABLE (?:IF EXISTS )?(.*?)(?: CASCADE| RESTRICT)?$/i.exec(s);
      if (m) { for (const n of m[1].split(",")) tables.delete(unqualify(n)); continue; }
      m = /^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?(?:public\.)?"?(\w+)"? RENAME COLUMN "?(\w+)"? TO "?(\w+)"?$/i.exec(s);
      if (m) {
        const t = tables.get(ident(m[1]));
        const c = t && t.columns.get(ident(m[2]));
        if (c) { t.columns.delete(ident(m[2])); c.name = ident(m[3]); t.columns.set(c.name, c); }
        continue;
      }
      m = /^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?(?:public\.)?"?(\w+)"? (.*)$/i.exec(s);
      if (!m) continue;
      const t = tables.get(ident(m[1]));
      if (!t) continue;
      for (const act of splitTop(m[2]).map((x) => x.trim())) {
        let a;
        if ((a = /^ADD COLUMN (?:IF NOT EXISTS )?"?(\w+)"? (.*)$/is.exec(act))) {
          if (!(t.columns.has(ident(a[1])) && /IF NOT EXISTS/i.test(act))) t.columns.set(ident(a[1]), parseColumn(ident(m[1]), ident(a[1]), a[2]));
        } else if ((a = /^DROP COLUMN (?:IF EXISTS )?"?(\w+)"?/i.exec(act))) {
          t.columns.delete(ident(a[1]));
          for (const [k, v] of t.checks) if (v.col === ident(a[1])) t.checks.delete(k);
        } else if ((a = /^ALTER COLUMN "?(\w+)"? SET DEFAULT/i.exec(act))) {
          const c = t.columns.get(ident(a[1])); if (c) c.hasDefault = true;
        } else if ((a = /^ALTER COLUMN "?(\w+)"? DROP DEFAULT/i.exec(act))) {
          const c = t.columns.get(ident(a[1])); if (c) c.hasDefault = false;
        } else if ((a = /^ALTER COLUMN "?(\w+)"? SET NOT NULL/i.exec(act))) {
          const c = t.columns.get(ident(a[1])); if (c) c.notNull = true;
        } else if ((a = /^ALTER COLUMN "?(\w+)"? DROP NOT NULL/i.exec(act))) {
          const c = t.columns.get(ident(a[1])); if (c) c.notNull = false;
        } else if ((a = /^ADD CONSTRAINT "?(\w+)"? CHECK\s*\(/i.exec(act))) {
          addTableCheck(t, a[1], checkExprs(act)[0]);
        } else if (/^ADD CHECK\s*\(/i.test(act)) {
          addTableCheck(t, ident(m[1]) + "_check" + t.checks.size, checkExprs(act)[0]);
        } else if ((a = /^DROP CONSTRAINT (?:IF EXISTS )?"?(\w+)"?/i.exec(act))) {
          dropConstraint(t, a[1]);
        } else if ((a = /^ADD (?:CONSTRAINT "?\w+"? )?PRIMARY KEY\s*\(([^)]*)\)/i.exec(act))) {
          for (const c of a[1].split(",")) { const col = t.columns.get(ident(c.trim())); if (col) col.notNull = true; }
        }
      }
    }
  }
  return { tables };
}

/** The IN-list CHECKs that constrain one column of one table: [{ key, values, nullOk }]. */
export function columnLists(schema, table, column) {
  const t = schema.tables.get(table);
  if (!t) return [];
  const out = [];
  const c = t.columns.get(column);
  if (c) for (const [key, v] of c.checks) if (v.list) out.push({ key, ...v.list });
  for (const [key, v] of t.checks) if (v.col === column && v.list) out.push({ key, ...v.list });
  return out;
}

// ---- fixture statements ---------------------------------------------------------------------------------------------

function literal(tok) {
  const t = tok.trim().replace(/::\w+(\[\])?$/, "");
  if (/^NULL$/i.test(t)) return { kind: "null" };
  let m = /^'((?:[^']|'')*)'$/s.exec(t);
  if (m) return { kind: "string", value: m[1].replace(/''/g, "'") };
  if (/^(true|false)$/i.test(t)) return { kind: "bool", value: t.toLowerCase() };
  if (/^-?\d+(\.\d+)?$/.test(t)) return { kind: "number", value: t };
  return { kind: "opaque", text: tok.trim() };
}

/** Expand every format('<fmt>', args...) whose format string starts with INSERT or UPDATE into plain SQL text with the
 *  %L, %s and %I placeholders replaced by the argument text; the call is blanked out of `text` so a direct scan does not
 *  see its format string twice. Returns { text, expanded: string[] }. */
function expandFormats(text) {
  const expanded = [];
  let out = "";
  let i = 0;
  const re = /\bformat\s*\(\s*'/g;
  for (;;) {
    re.lastIndex = i;
    const m = re.exec(text);
    if (!m) { out += text.slice(i); break; }
    const open = text.indexOf("(", m.index);
    const close = matchParen(text, open);
    if (close === -1) { out += text.slice(i); break; }
    const inner = text.slice(open + 1, close);
    const parts = splitTop(inner);
    const fmtTok = parts[0].trim();
    const fm = /^'((?:[^']|'')*)'$/s.exec(fmtTok);
    if (fm && /^\s*(INSERT INTO|UPDATE)\b/i.test(fm[1])) {
      const args = parts.slice(1).map((x) => x.trim());
      let k = 0;
      expanded.push(fm[1].replace(/''/g, "'").replace(/%[LsI]/g, () => (k < args.length ? args[k++] : "NULL")));
      out += text.slice(i, m.index) + " ";
    } else {
      out += text.slice(i, close + 1);
    }
    i = close + 1;
  }
  return { text: out, expanded };
}

function tuples(text, from) {
  const rows = [];
  let i = from;
  for (;;) {
    while (i < text.length && /[\s,]/.test(text[i])) i++;
    if (text[i] !== "(") break;
    const close = matchParen(text, i);
    if (close === -1) break;
    rows.push(splitTop(text.slice(i + 1, close)).map((x) => x.trim()));
    i = close + 1;
  }
  return rows;
}

/** Every INSERT INTO <table> (cols) VALUES ... in `sql` (comments already stripped, dollar bodies kept), including those
 *  inside format('INSERT ...', args). Returns [{ table, schemaName, cols, rows: [[literal...]] }]. */
export function parseInserts(sql) {
  const { text, expanded } = expandFormats(sql);
  const out = [];
  const scan = (src) => {
    const re = /\bINSERT\s+INTO\s+((?:\w+\.)?"?\w+"?)\s*\(([^)]*)\)\s*VALUES\b/gi;
    let m;
    while ((m = re.exec(src))) {
      const qual = m[1].replace(/"/g, "").toLowerCase();
      const [schemaName, table] = qual.includes(".") ? qual.split(".") : ["public", qual];
      out.push({ table, schemaName, cols: m[2].split(",").map((c) => ident(c.trim())), rows: tuples(src, re.lastIndex).map((r) => r.map(literal)) });
    }
  };
  scan(text);
  for (const e of expanded) scan(e);
  return out;
}

/** Every UPDATE <table> SET col = <literal>, ... in `sql`, including format('UPDATE ...') ones: [{ table, sets: [{col, lit}] }]. */
export function parseUpdates(sql) {
  const { text, expanded } = expandFormats(sql);
  const out = [];
  const scan = (src) => {
    const re = /\bUPDATE\s+(?:public\.)?"?(\w+)"?\s+SET\s+([^;]*?)(?=\s+WHERE\b|;|$|\s+RETURNING\b)/gis;
    let m;
    while ((m = re.exec(src))) {
      const sets = [];
      for (const a of splitTop(m[2])) {
        const am = /^\s*"?(\w+)"?\s*=\s*(.*)$/s.exec(a);
        if (am) sets.push({ col: ident(am[1]), lit: literal(am[2]) });
      }
      out.push({ table: m[1].toLowerCase(), sets });
    }
  };
  scan(text);
  for (const e of expanded) scan(e);
  return out;
}

/** Back-compat for 372's per-table reader: [{ cols, values }] with `values` the raw VALUES text up to the closing ';'. */
export function insertBlocks(sql, table) {
  const out = [];
  const re = new RegExp("INSERT INTO public\\." + table + " \\(([^)]*)\\) VALUES([^;]*);", "g");
  for (const m of sql.matchAll(re)) out.push({ cols: m[1].split(",").map((c) => c.trim()), values: m[2] });
  return out;
}

// ---- the check ------------------------------------------------------------------------------------------------------

/** Compare parsed inserts and updates with the rebuilt schema. `external` describes tables the migration tree does not
 *  create: { "auth.users": { columns: ["id", ...], required: ["id"] } }. Returns a list of violation strings. */
export function checkFixtures({ inserts, updates = [], schema, external = {} }) {
  const bad = [];
  for (const ins of inserts) {
    const label = ins.schemaName + "." + ins.table;
    const ext = external[label];
    if (ext) {
      for (const c of ins.cols) if (!ext.columns.includes(c)) bad.push(label + "." + c + ": not a column of the external table (assumed definition)");
      for (const c of ext.required || []) if (!ins.cols.includes(c)) bad.push(label + ": required column " + c + " is not written");
      continue;
    }
    if (ins.schemaName !== "public") { bad.push(label + ": a non-public table with no external definition supplied"); continue; }
    const t = schema.tables.get(ins.table);
    if (!t) { bad.push(label + ": the table is not defined by the migration tree"); continue; }
    for (const c of ins.cols) {
      const col = t.columns.get(c);
      if (!col) { bad.push(label + "." + c + ": no such column in the migration tree"); continue; }
      if (col.generated) bad.push(label + "." + c + ": a GENERATED ALWAYS column cannot be written");
    }
    for (const col of t.columns.values()) {
      if (col.notNull && !col.hasDefault && !ins.cols.includes(col.name)) bad.push(label + "." + col.name + ": NOT NULL with no default and not written (23502)");
    }
    for (const row of ins.rows) {
      if (row.length !== ins.cols.length) { bad.push(label + ": a VALUES row has " + row.length + " values for " + ins.cols.length + " columns"); continue; }
      ins.cols.forEach((cname, i) => {
        const col = t.columns.get(cname);
        if (!col) return;
        const v = row[i];
        if (v.kind === "null" && col.notNull) bad.push(label + "." + cname + ": explicit NULL into a NOT NULL column (23502)");
        if (v.kind === "string") {
          for (const l of columnLists(schema, ins.table, cname)) {
            if (!l.values.has(v.value)) bad.push(label + "." + cname + ": '" + v.value + "' violates " + l.key + " (allowed: " + [...l.values].join(", ") + ") (23514)");
          }
        }
      });
    }
  }
  for (const up of updates) {
    const t = schema.tables.get(up.table);
    if (!t) continue;
    for (const s of up.sets) {
      if (!t.columns.has(s.col)) { bad.push("update public." + up.table + "." + s.col + ": no such column in the migration tree"); continue; }
      if (s.lit.kind === "null" && t.columns.get(s.col).notNull) bad.push("update public." + up.table + "." + s.col + ": SET to NULL on a NOT NULL column");
      if (s.lit.kind === "string") {
        for (const l of columnLists(schema, up.table, s.col)) {
          if (!l.values.has(s.lit.value)) bad.push("update public." + up.table + "." + s.col + ": '" + s.lit.value + "' violates " + l.key + " (allowed: " + [...l.values].join(", ") + ") (23514)");
        }
      }
    }
  }
  return bad;
}
