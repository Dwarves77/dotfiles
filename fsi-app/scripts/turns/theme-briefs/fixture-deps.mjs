// fixture-deps.mjs: the in-memory database the theme-briefs CLIs run over with --fixture <corpus.json>
// (lane S3-C). Implements exactly the four dep shapes the export and apply steps inject, over a plain
// { tables: { name: [rows] } } object, so both runtimes can be fired end to end (dry, and with --execute
// into memory) with no database, no network and no credentials. The tests use it too, so what the CLIs do
// under --fixture is what the tests prove.
//
// Faithful where it matters: readAll applies the same eq / in / limit filters a match callback uses and
// orders by the requested column(s); a selected column the table's rows never carry and that the corpus
// lists under `missing_columns` throws the way PostgREST does ("column ... does not exist"), which is how a
// database before migration 351 behaves; guardedInsert / guardedUpdate refuse a row carrying such a column.
// It does NOT model RLS, triggers or snapshots (the prior snapshot is returned as the string "fixture").

class Query {
  constructor() { this.filters = []; this.max = null; }
  eq(col, val) { this.filters.push((r) => r[col] === val); return this; }
  in(col, vals) { const s = new Set(vals); this.filters.push((r) => s.has(r[col])); return this; }
  limit(n) { this.max = n; return this; }
  run(rows) {
    let out = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.max !== null) out = out.slice(0, this.max);
    return out;
  }
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * @param {{tables:Record<string,object[]>, missing_columns?:Record<string,string[]>}} corpus
 * @returns {{readAll:Function, readAllByIds:Function, guardedInsert:Function, guardedUpdate:Function, tables:Record<string,object[]>}}
 */
export function fixtureDeps(corpus) {
  const tables = {};
  for (const [k, v] of Object.entries(corpus.tables || {})) tables[k] = v.map((r) => ({ ...r }));
  const missing = corpus.missing_columns || {};
  const cols = (columns) => String(columns).split(",").map((c) => c.trim()).filter(Boolean);
  const rowsOf = (table) => {
    if (!tables[table]) throw new Error(`relation "${table}" does not exist`);
    return tables[table];
  };
  const checkColumns = (table, columns) => {
    for (const c of cols(columns)) {
      if ((missing[table] || []).includes(c)) throw new Error(`column ${table}.${c} does not exist`);
    }
  };
  const project = (r, columns) => {
    if (String(columns).trim() === "*") return { ...r };
    const o = {};
    for (const c of cols(columns)) o[c] = r[c] === undefined ? null : r[c];
    return o;
  };

  async function readAll(table, columns = "*", { match, orderBy } = {}) {
    checkColumns(table, columns);
    const q = new Query();
    if (match) match(q);
    const order = orderBy === undefined ? [] : Array.isArray(orderBy) ? orderBy : [orderBy];
    const rows = q.run(rowsOf(table)).slice().sort((a, b) => {
      for (const c of order) { const d = cmp(a[c], b[c]); if (d) return d; }
      return 0;
    });
    return rows.map((r) => project(r, columns));
  }

  async function readAllByIds(table, columns, ids, { idColumn = "id" } = {}) {
    return readAll(table, columns, { orderBy: idColumn, match: (q) => q.in(idColumn, ids) });
  }

  function checkRow(table, row) {
    for (const c of Object.keys(row)) {
      if ((missing[table] || []).includes(c)) throw new Error(`column ${table}.${c} does not exist`);
    }
  }

  async function guardedInsert(table, row) {
    checkRow(table, row);
    rowsOf(table).push({ ...row });
    return { inserted: { ...row }, snapshot: "fixture" };
  }

  async function guardedUpdate(table, applyMatch, patch) {
    checkRow(table, patch);
    const q = new Query();
    applyMatch(q);
    const hit = q.run(rowsOf(table));
    for (const r of hit) Object.assign(r, patch);
    return { updated: hit.length, snapshot: "fixture", rows: hit };
  }

  return { readAll, readAllByIds, guardedInsert, guardedUpdate, tables };
}
