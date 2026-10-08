#!/usr/bin/env node
// scripts/proof/export-subset.mjs -- PROOF-2 (lane proof2-subset, 2026-10-07): a READ-ONLY, foreign-key-closed
// subset of production, written to a runner-local directory, for the chain proof's local stack.
//
// Design: the chain-proof design note section 4 (stage 9 item 1). The repo is PUBLIC, so the contract is hard:
//   - no row, title or text is ever printed or uploaded; the only output on any stream is counts and names
//     of tables and constraints. The export directory must resolve OUTSIDE the git workspace and lives only
//     for the job's life (the workflow's teardown removes it).
//   - the connection runs BEGIN, SET TRANSACTION READ ONLY, and ends in ROLLBACK; nothing here can write.
//   - the closure is derived from information_schema (referential_constraints + key_column_usage), never a
//     hand list: 115 tables rot a hand list. The only configuration is policy: which tables are excluded,
//     which are restricted to the seed set, which are copied whole.
//
// Closure rules (one rule per FK, applied the same way for every table):
//   DOWN  from the seed items: rows of any non-excluded table that reference an included row are included
//         (sections, claims, the agent_run_searches grounding pool in full per ADR-016, cross references,
//         obligations, signposts, theme rows, entity refs, corrections, ...). Down-walk starts at the seeds
//         and follows only through rows reached that way; it never starts from a parent-only table.
//   UP    every included row pulls its parent rows (sources, entities, institutions, reference tables) so
//         every FK resolves inside the subset. Up-pulled rows are not walked downward.
//   RESTRICTED parents (default: intelligence_items) are never pulled up: a child row pointing at a
//         non-seed item has that FK nulled when the column is nullable, else the row is dropped (a cross
//         reference needs both endpoints in the set).
//   EXCLUDED / EXTERNAL parents (profiles, organizations, community, notification, workspace, auth.*) are
//         never copied: a nullable FK to them is nulled, a NOT NULL FK drops the row. Fixture users are
//         created locally by a later lane.
//   Rows dropped or nulled cascade through a prune fixpoint, then verifyNoOrphans() is the guard: it runs on
//   the finished subset and the export FAILS naming the FK if any FK does not resolve.
//
// Exit codes: 0 wrote the export; 1 export failed (orphan, query error, unsafe out dir); 2 no credentials.

import { hash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, relative, isAbsolute, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { surfaceOf, SURFACES } from "../../src/lib/surface-of.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import { removeKey } from "./mem.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const DEFAULT_ITEMS = 40;
export const GRADES = ["record", "brief"];
const BATCH = 1000;

/** Tables never copied: identity, org, community, notification, workspace, cost and chain state. A name
 * pattern list, not a row list: it is POLICY, the closure itself still comes from information_schema. */
export const DEFAULT_EXCLUDE = [
  /^profiles$/, /^organizations?$/, /^org_/, /^community_/, /^notifications?$/, /^notification_/,
  /^user_/, /^workspace/, /^agent_runs$/, /^error_events$/, /^harness_runs$/, /^system_state/,
  /^funded_pass_runlock$/, /^mutation_leases$/, /^disposition_ledger$/,
];
/** Parents that are never pulled up from a child: only the seed rows exist. */
export const DEFAULT_RESTRICTED = ["intelligence_items"];
/** Tables copied whole before the up-walk (source resolution, sweep and host rating need every source). */
export const DEFAULT_FULL_TABLES = ["sources"];
/** Row-level exclusions applied the moment a row is read (a dropped row cascades through the prune). */
export const DEFAULT_ROW_EXCLUDE = {
  // the loader asserts no open fleet-budget-halt flag; never carry one in
  integrity_flags: (row) => row.subject_ref === "fleet-budget-halt",
};

/** Pick N seed ids spread across the four surfaces and the record/brief grades: round robin over the eight
 * (surface, grade) buckets in stable id order, topping up from whatever buckets still hold candidates.
 * Pure. @param {{id:string,item_type:string,domain:number|null,item_grade:string}[]} candidates */
export function pickSeeds(candidates, n = DEFAULT_ITEMS) {
  const buckets = new Map();
  for (const s of SURFACES) for (const g of GRADES) buckets.set(`${s}/${g}`, []);
  const sorted = [...candidates].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const c of sorted) {
    const surface = surfaceOf(c.item_type, c.domain);
    const grade = c.item_grade === "record" ? "record" : "brief";
    const b = buckets.get(`${surface}/${grade}`);
    if (b) b.push(c.id);
  }
  const order = [...buckets.keys()];
  const picked = [];
  let progressed = true;
  while (picked.length < n && progressed) {
    progressed = false;
    for (const k of order) {
      const b = buckets.get(k);
      if (b.length && picked.length < n) { picked.push(b.shift()); progressed = true; }
    }
  }
  return picked;
}

/** Item ids named by a committed record-briefs batch file ({ entries: [{ item_id }] }). Pure given the text. */
export function readPinnedIds(text) {
  const parsed = JSON.parse(text);
  const ids = (parsed.entries ?? []).map((e) => e.item_id).filter((x) => typeof x === "string" && x.length > 0);
  if (ids.length === 0) throw new Error("export-subset: the pin file names no item ids");
  return [...new Set(ids)];
}

const q = (ident) => `"${String(ident).replace(/"/g, '""')}"`;

/** The FK graph from information_schema, composite keys paired by position. Parents may live in another
 * schema (auth.users): those are marked external. @returns {Promise<{name,child,parent,parentSchema,cols:{c,p}[],external:boolean}[]>} */
export async function fetchFkGraph(client) {
  const { rows } = await client.query(`
    SELECT kcu.constraint_name AS name, kcu.table_name AS child, kcu.column_name AS child_col,
           kcu.ordinal_position AS pos, ukcu.table_schema AS parent_schema,
           ukcu.table_name AS parent, ukcu.column_name AS parent_col
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_schema = rc.constraint_schema AND kcu.constraint_name = rc.constraint_name
    JOIN information_schema.key_column_usage ukcu
      ON ukcu.constraint_schema = rc.unique_constraint_schema
     AND ukcu.constraint_name = rc.unique_constraint_name
     AND ukcu.ordinal_position = kcu.position_in_unique_constraint
    WHERE kcu.table_schema = 'public'
    ORDER BY kcu.table_name, kcu.constraint_name, kcu.ordinal_position`);
  const byName = new Map();
  for (const r of rows) {
    const key = `${r.child}.${r.name}`;
    if (!byName.has(key)) {
      byName.set(key, { name: r.name, child: r.child, parent: r.parent, parentSchema: r.parent_schema, cols: [], external: r.parent_schema !== "public" });
    }
    byName.get(key).cols.push({ c: r.child_col, p: r.parent_col });
  }
  return [...byName.values()];
}

/** Public base tables, their columns (nullability) and primary key columns. */
export async function fetchCatalog(client) {
  const cols = await client.query(`
    SELECT c.table_name AS t, c.column_name AS col, (c.is_nullable = 'YES') AS nullable
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' ORDER BY c.table_name, c.ordinal_position`);
  const pks = await client.query(`
    SELECT tc.table_name AS t, kcu.column_name AS col
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_schema = tc.constraint_schema AND kcu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position`);
  const tables = new Map();
  for (const r of cols.rows) {
    if (!tables.has(r.t)) tables.set(r.t, { columns: new Map(), pk: [] });
    tables.get(r.t).columns.set(r.col, { nullable: r.nullable });
  }
  for (const r of pks.rows) tables.get(r.t)?.pk.push(r.col);
  return tables;
}

const keyOf = (vals) => JSON.stringify(vals);
function rowKey(tinfo, row) {
  return tinfo.pk.length ? keyOf(tinfo.pk.map((c) => row[c])) : keyOf(row);
}

/** Orphan check over a finished subset. Pure. Returns the list of violated FKs (empty = closed).
 * @param {Map<string, Map<string, object>>} subset table -> key -> row */
export function findOrphans(subset, fks) {
  const bad = [];
  for (const fk of fks) {
    const childRows = subset.get(fk.child);
    if (!childRows || childRows.size === 0) continue;
    const parentRows = subset.get(fk.parent);
    const parentIndex = new Set();
    if (parentRows) for (const pr of parentRows.values()) parentIndex.add(keyOf(fk.cols.map((x) => pr[x.p] ?? null)));
    let count = 0;
    for (const row of childRows.values()) {
      const vals = fk.cols.map((x) => row[x.c] ?? null);
      if (vals.every((v) => v === null)) continue;
      if (vals.some((v) => v === null)) continue; // MATCH SIMPLE: a partly null key is not checked
      if (fk.external) { count++; continue; } // any surviving value pointing outside public is a leak
      if (!parentIndex.has(keyOf(vals))) count++;
    }
    if (count) bad.push({ fk: `${fk.child}.${fk.name}`, child: fk.child, parent: fk.parent, orphans: count });
  }
  return bad;
}

/** Throws naming the first violated FK (names and counts only, never values). */
export function verifyNoOrphans(subset, fks) {
  const bad = findOrphans(subset, fks);
  if (bad.length) {
    const first = bad[0];
    const e = new Error(`orphan check failed: FK ${first.fk} (${first.child} -> ${first.parent}) has ${first.orphans} unresolved row(s); ${bad.length} FK(s) violated in total`);
    e.orphans = bad;
    throw e;
  }
}

/** Tables parent-first (Kahn); a cycle falls back to name order for the members left. */
export function fkOrder(tableNames, fks) {
  const names = new Set(tableNames);
  const deps = new Map([...names].map((t) => [t, new Set()]));
  for (const fk of fks) {
    if (fk.external || fk.child === fk.parent) continue;
    if (names.has(fk.child) && names.has(fk.parent)) deps.get(fk.child).add(fk.parent);
  }
  const out = [];
  const remaining = new Set(names);
  while (remaining.size) {
    const ready = [...remaining].filter((t) => [...deps.get(t)].every((d) => !remaining.has(d))).sort();
    if (ready.length === 0) { out.push(...[...remaining].sort()); break; }
    for (const t of ready) { out.push(t); removeKey(remaining, t); }
  }
  return out;
}

const chunks = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

/** Rows of `table` whose `cols` match any of `tuples` (single column: = ANY; composite: tuple IN unnest). */
async function selectMatching(client, table, cols, tuples) {
  const out = [];
  for (const part of chunks(tuples, BATCH)) {
    if (cols.length === 1) {
      const r = await client.query(`SELECT to_jsonb(t) AS r FROM public.${q(table)} t WHERE t.${q(cols[0])} = ANY($1)`, [part.map((x) => x[0])]);
      for (const x of r.rows) out.push(x.r);
    } else {
      const lhs = cols.map((c) => `t.${q(c)}::text`).join(", ");
      const arrs = cols.map((_, i) => `unnest($${i + 1}::text[])`).join(", ");
      const r = await client.query(
        `SELECT to_jsonb(t) AS r FROM public.${q(table)} t WHERE (${lhs}) IN (SELECT ${arrs})`,
        cols.map((_, i) => part.map((x) => String(x[i]))),
      );
      for (const x of r.rows) out.push(x.r);
    }
  }
  return out;
}

/**
 * The closure. @param {{client:{query:Function}, seedIds:string[], catalog:Map, fks:object[], exclude:RegExp[],
 * restricted:string[], fullTables:string[], rowExclude:Record<string,Function>}} args
 * @returns {Promise<{subset:Map<string,Map<string,object>>, stats:{nulled:Record<string,number>, dropped:Record<string,number>, skipped:{table:string,reason:string}[]}}>}
 */
export async function buildClosure({ client, seedIds, catalog, fks, exclude = DEFAULT_EXCLUDE, restricted = DEFAULT_RESTRICTED, fullTables = DEFAULT_FULL_TABLES, rowExclude = DEFAULT_ROW_EXCLUDE }) {
  const isExcluded = (t) => exclude.some((re) => re.test(t));
  const subset = new Map();
  const up = new Set(); // "table\u0000key" rows pulled only as a parent
  const stats = { nulled: {}, dropped: {}, skipped: [] };
  const bump = (m, t, n = 1) => { m[t] = (m[t] ?? 0) + n; };
  const fksOf = new Map(); // child -> fks
  const childrenOf = new Map(); // parent -> fks
  for (const fk of fks) {
    if (!fksOf.has(fk.child)) fksOf.set(fk.child, []);
    fksOf.get(fk.child).push(fk);
    if (!fk.external) { if (!childrenOf.has(fk.parent)) childrenOf.set(fk.parent, []); childrenOf.get(fk.parent).push(fk); }
  }
  const tinfo = (t) => catalog.get(t);
  const rowsOf = (t) => { if (!subset.has(t)) subset.set(t, new Map()); return subset.get(t); };

  /** Add rows to a table, returning the genuinely new ones. */
  const add = (t, rows, asUp) => {
    const info = tinfo(t);
    const m = rowsOf(t);
    const fresh = [];
    for (const row of rows) {
      if (rowExclude[t]?.(row)) { bump(stats.dropped, t); continue; }
      const k = rowKey(info, row);
      if (m.has(k)) {
        // reached by the down-walk after being pulled only as a parent: promote so its children are walked
        if (!asUp && removeKey(up, `${t}\u0000${k}`)) fresh.push(m.get(k));
        continue;
      }
      m.set(k, row);
      if (asUp) up.add(`${t}\u0000${k}`);
      fresh.push(row);
    }
    return fresh;
  };

  /** Apply the null/drop rules for excluded, external and restricted parents to fresh rows; returns the
   * rows that survive plus the parent lookups still needed. */
  const resolve = (t, fresh, needed) => {
    const info = tinfo(t);
    const m = rowsOf(t);
    const survivors = [];
    for (const row of fresh) {
      let alive = true;
      for (const fk of fksOf.get(t) ?? []) {
        const vals = fk.cols.map((x) => row[x.c] ?? null);
        if (vals.some((v) => v === null)) continue;
        const blocked = fk.external || isExcluded(fk.parent) || !catalog.has(fk.parent);
        const outsideSeed = restricted.includes(fk.parent) && !(subset.get(fk.parent)?.size && [...subset.get(fk.parent).values()].some((pr) => fk.cols.every((x, i) => pr[x.p] === vals[i])));
        if (blocked || outsideSeed) {
          const nullable = fk.cols.every((x) => info.columns.get(x.c)?.nullable);
          if (nullable) { for (const x of fk.cols) row[x.c] = null; bump(stats.nulled, `${t}.${fk.name}`); }
          else { alive = false; break; }
        } else if (!restricted.includes(fk.parent)) {
          const have = subset.get(fk.parent);
          const pinfo = tinfo(fk.parent);
          const isPk = pinfo && fk.cols.length === pinfo.pk.length && fk.cols.every((x, i) => x.p === pinfo.pk[i]);
          const present = have && (isPk ? have.has(keyOf(vals)) : [...have.values()].some((pr) => fk.cols.every((x, i) => pr[x.p] === vals[i])));
          if (!present) {
            const nk = `${fk.parent}\u0000${fk.cols.map((x) => x.p).join(",")}`;
            if (!needed.has(nk)) needed.set(nk, { table: fk.parent, cols: fk.cols.map((x) => x.p), tuples: new Map() });
            needed.get(nk).tuples.set(keyOf(vals), vals);
          }
        }
      }
      if (alive) survivors.push(row);
      else { removeKey(m, rowKey(info, row)); bump(stats.dropped, t); }
    }
    return survivors;
  };

  const seeds = await selectMatching(client, "intelligence_items", ["id"], seedIds.map((id) => [id]));
  let downFrontier = new Map(); // table -> rows to walk down from
  const pendingResolve = [];
  const seedFresh = add("intelligence_items", seeds, false);
  pendingResolve.push(["intelligence_items", seedFresh]);
  downFrontier.set("intelligence_items", seedFresh);
  for (const t of fullTables) {
    if (!catalog.has(t) || isExcluded(t)) continue;
    const r = await client.query(`SELECT to_jsonb(t) AS r FROM public.${q(t)} t`);
    pendingResolve.push([t, add(t, r.rows.map((x) => x.r), true)]);
  }

  for (let guard = 0; guard < 200; guard++) {
    const needed = new Map();
    for (const [t, fresh] of pendingResolve.splice(0)) {
      const kept = resolve(t, fresh, needed);
      if (downFrontier.has(t)) downFrontier.set(t, kept.filter((r) => !up.has(`${t}\u0000${rowKey(tinfo(t), r)}`)));
    }
    // parents
    for (const nd of needed.values()) {
      const rows = await selectMatching(client, nd.table, nd.cols, [...nd.tuples.values()]);
      pendingResolve.push([nd.table, add(nd.table, rows, true)]);
    }
    // children of the down frontier
    const nextDown = new Map();
    for (const [t, rows] of downFrontier) {
      if (!rows.length) continue;
      for (const fk of childrenOf.get(t) ?? []) {
        if (isExcluded(fk.child) || !catalog.has(fk.child) || restricted.includes(fk.child)) continue; // restricted tables hold only the seeds
        const tuples = [...new Map(rows.map((r) => { const v = fk.cols.map((x) => r[x.p]); return [keyOf(v), v]; })).values()].filter((v) => v.every((x) => x !== null && x !== undefined));
        if (!tuples.length) continue;
        const found = await selectMatching(client, fk.child, fk.cols.map((x) => x.c), tuples);
        const fresh = add(fk.child, found, false);
        if (fresh.length) {
          pendingResolve.push([fk.child, fresh]);
          nextDown.set(fk.child, [...(nextDown.get(fk.child) ?? []), ...fresh]);
        }
      }
    }
    downFrontier = nextDown;
    if (pendingResolve.length === 0 && downFrontier.size === 0) break;
    if (guard === 199) throw new Error("closure did not converge in 200 rounds");
  }

  // prune fixpoint: a row whose parent was dropped follows it
  for (let changed = true; changed;) {
    changed = false;
    for (const [t, m] of subset) {
      const info = tinfo(t);
      for (const [k, row] of [...m]) {
        for (const fk of fksOf.get(t) ?? []) {
          if (fk.external) continue;
          const vals = fk.cols.map((x) => row[x.c] ?? null);
          if (vals.some((v) => v === null)) continue;
          const pm = subset.get(fk.parent);
          const found = pm && [...pm.values()].some((pr) => fk.cols.every((x, i) => pr[x.p] === vals[i]));
          if (!found) {
            const nullable = fk.cols.every((x) => info.columns.get(x.c)?.nullable);
            if (nullable) { for (const x of fk.cols) row[x.c] = null; bump(stats.nulled, `${t}.${fk.name}`); }
            else { removeKey(m, k); bump(stats.dropped, t); }
            changed = true;
            break;
          }
        }
      }
    }
  }
  for (const [t, m] of [...subset]) if (m.size === 0) removeKey(subset, t);
  return { subset, stats };
}

/** Write the JSONL files and the manifest. Returns the manifest (counts and hashes only). */
export function writeSubset({ subset, order, outDir, stats, now, writeFileFn = writeFileSync, mkdirFn = mkdirSync }) {
  mkdirFn(outDir, { recursive: true });
  const tables = [];
  let n = 0;
  for (const t of order) {
    const m = subset.get(t);
    if (!m || m.size === 0) continue;
    n++;
    const file = `${String(n).padStart(3, "0")}_${t}.jsonl`;
    const body = [...m.values()].map((r) => JSON.stringify(r)).join("\n") + "\n";
    writeFileFn(join(outDir, file), body, "utf8");
    tables.push({ table: t, file, rows: m.size, sha256: hash("sha256", body) });
  }
  const manifest = {
    version: 1,
    generated_at: now,
    note: "counts and hashes only; rows live in the sibling JSONL files and must never leave the runner",
    tables,
    nulled_fk_columns: stats.nulled,
    dropped_rows: stats.dropped,
  };
  writeFileFn(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`, "utf8");
  return manifest;
}

/** The export directory must not be inside the git workspace (a later artifact upload or commit could
 * otherwise carry it). @returns {boolean} */
export function isOutsideWorkspace(outDir, root = REPO_ROOT) {
  const rel = relative(resolve(root), resolve(outDir));
  return rel.startsWith("..") || isAbsolute(rel);
}

/**
 * @param {{client:{query:Function}, outDir:string, items?:number, now?:string, root?:string, log?:Function,
 *  exclude?:RegExp[], restricted?:string[], fullTables?:string[], rowExclude?:object, writeFileFn?:Function, mkdirFn?:Function}} args
 */
export async function exportSubset(args) {
  const { client, outDir, items = DEFAULT_ITEMS, now = new Date().toISOString(), root = REPO_ROOT, log = (m) => console.log(m) } = args;
  if (!isOutsideWorkspace(outDir, root)) throw new Error("export-subset: --out must resolve outside the git workspace (the subset must never be committable or uploadable)");
  await client.query("BEGIN");
  try {
    await client.query("SET TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '300s'");
    const catalog = await fetchCatalog(client);
    const fks = await fetchFkGraph(client);
    const cand = await client.query(
      "SELECT id, item_type, domain, item_grade FROM public.intelligence_items WHERE provenance_status = 'verified' ORDER BY id",
    );
    const pinned = args.pinIds ?? [];
    if (pinned.length) {
      const have = await client.query("SELECT id FROM public.intelligence_items WHERE id = ANY($1)", [pinned]);
      if (have.rows.length !== pinned.length) throw new Error(`export-subset: ${pinned.length - have.rows.length} of ${pinned.length} pinned item ids do not exist in the source`);
    }
    const pinnedSet = new Set(pinned);
    const seedIds = [...pinned, ...pickSeeds(cand.rows.filter((c) => !pinnedSet.has(c.id)), items)];
    if (seedIds.length === 0) throw new Error("export-subset: no verified items to seed from");
    const { subset, stats } = await (args.closureFn ?? buildClosure)({
      client, seedIds, catalog, fks,
      exclude: args.exclude, restricted: args.restricted, fullTables: args.fullTables, rowExclude: args.rowExclude,
    });
    verifyNoOrphans(subset, fks);
    const order = fkOrder([...subset.keys()], fks);
    const manifest = writeSubset({ subset, order, outDir, stats, now, writeFileFn: args.writeFileFn, mkdirFn: args.mkdirFn });
    const total = manifest.tables.reduce((a, t) => a + t.rows, 0);
    log(`export-subset: seeds=${seedIds.length} pinned=${pinned.length} tables=${manifest.tables.length} rows=${total} orphans=0`);
    for (const t of manifest.tables) log(`  ${t.table}: ${t.rows}`);
    return manifest;
  } finally {
    try { await client.query("ROLLBACK"); } catch { /* connection already gone */ }
  }
}

export async function runCli(argv, deps = {}) {
  const { log = (m) => console.log(m), errorLog = (m) => console.error(m), connect } = deps;
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const outDir = arg("--out");
  if (!outDir) { errorLog("export-subset: --out <dir> is required."); return 1; }
  const items = Number(arg("--items") ?? DEFAULT_ITEMS);
  let pinIds = [];
  const pinPath = arg("--pin-ids-from");
  if (pinPath !== undefined) {
    try { pinIds = readPinnedIds(readFileSync(resolve(pinPath), "utf8")); }
    catch (e) { errorLog(`export-subset: pin file unusable: ${e instanceof Error ? e.message : String(e)}`); return 1; }
  }
  if (!Number.isInteger(items) || items < 1) { errorLog("export-subset: --items must be a positive integer."); return 1; }
  const open = connect ?? (async () => (await import("../lib/pg-conn.mjs")).connectPg());
  let client;
  try { client = await open(); } catch { client = null; }
  if (!client) { errorLog("export-subset: no database connection (SUPABASE_DB_PASSWORD / NEXT_PUBLIC_SUPABASE_URL unset?), self-skip."); return 2; }
  try {
    await exportSubset({ client, outDir, items, pinIds, log });
    return 0;
  } catch (e) {
    // the orphan check runs before any file is written, so a failed export leaves no partial subset;
    // the message carries table and constraint names only
    errorLog(`export-subset: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

if (isMainModule(import.meta.url)) {
  runCli(process.argv.slice(2)).then((c) => process.exit(c));
}
