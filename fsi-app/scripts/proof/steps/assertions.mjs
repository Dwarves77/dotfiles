// scripts/proof/steps/assertions.mjs -- PROOF-3 (lane proof3-chain-steps, 2026-10-07): the read-back assertions
// of the chain proof. Every assertion names its table and its predicate and compares one observed integer with
// a minimum (or a maximum), read from the LOCAL database through an injected `query(sql, params)`.
//
// Kinds (manifest chain-steps.json):
//   count             SELECT count(*) FROM public.<table> WHERE <predicate>      observed >= min
//   max               the same count                                              observed <= max
//   growth            count after the step minus count before it                  (after - before) >= min,
//                     or (before - after) >= min with direction "down"
//   any_of            several count alternatives; passes when any one passes (used where "did work" and "an explicit
//                     nothing was eligible" are both honest outcomes and the second is itself a recorded count)
//   snapshot_changed  rows of a pre-step snapshot (id, value) whose value differs now             >= min
// `min` is an integer or a SELECT (`minSql`) returning one integer, evaluated AFTER the step so it can read the
// step's own harness_runs row (for example the mint artifact's own count of rows it minted).
//
// The table is checked against a plain identifier pattern and the predicate is manifest text (repository
// content, reviewed like code) after template substitution of values that passed substitute()'s safe-value check.
// Nothing here ever returns a row, only integers, so an assertion result is safe to print on a public repository.

import { substitute, templateKeys } from "./manifest.mjs";

const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

function table(t) {
  if (typeof t !== "string" || !IDENT_RE.test(t)) throw new Error(`assertion table ${JSON.stringify(t)} is not a plain identifier`);
  return `public.${t}`;
}

/** The count SQL for one count-shaped assertion (or alternative). PURE. */
export function countSql(a, vars) {
  return `SELECT count(*)::int AS n FROM ${table(a.table)} WHERE ${substitute(a.predicate, vars)}`;
}

async function one(query, sql, params = []) {
  const rows = await query(sql, params);
  const v = rows?.[0] ? Object.values(rows[0])[0] : null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("the query did not return a number");
  return n;
}

async function resolveMin(a, vars, query) {
  if (Number.isInteger(a.min)) return a.min;
  return one(query, substitute(a.minSql, vars));
}

/** Counts taken BEFORE the step for every growth assertion: { [assertionId]: n }. */
export async function takeBaselines(assertions, vars, query) {
  const out = {};
  for (const a of assertions) {
    if (a.kind !== "growth") continue;
    out[a.id] = await one(query, countSql(a, vars));
  }
  return out;
}

/** Snapshots taken BEFORE the step: { [key]: Map(id -> value) }. `defs` is the step's `snapshots` list. */
export async function takeSnapshots(defs, vars, query, params = {}) {
  const out = {};
  for (const d of defs ?? []) {
    const rows = await query(substitute(d.sql, vars), (d.params ?? []).map((p) => params[p]));
    out[d.key] = new Map(rows.map((r) => [String(r.k), String(r.v)]));
  }
  return out;
}

/**
 * Evaluate every assertion of a step. Never throws for a failing assertion or a failing query: a failure is a
 * result with ok=false, an `observed` and an `error` text, so the caller can report the step name, the table, the
 * predicate and the observed value. Returns one result per assertion, in order.
 * @param {{assertions: object[], vars: object, query: Function, baselines?: object, snapshots?: object, snapshotDefs?: object[], snapshotParams?: object}} args
 */
export async function evaluateAssertions({ assertions, vars, query, baselines = {}, snapshots = {}, snapshotDefs = [], snapshotParams = {} }) {
  const results = [];
  for (const a of assertions) {
    const base = { id: a.id, kind: a.kind, table: a.table ?? null, predicate: null, expect: null, observed: null, ok: false, error: null };
    try {
      if (a.kind === "count" || a.kind === "max") {
        base.predicate = substitute(a.predicate, vars);
        const observed = await one(query, countSql(a, vars));
        base.observed = observed;
        if (a.kind === "count") { const min = await resolveMin(a, vars, query); base.expect = `>= ${min}`; base.ok = observed >= min; }
        else { base.expect = `<= ${a.max}`; base.ok = observed <= a.max; }
      } else if (a.kind === "growth") {
        base.predicate = substitute(a.predicate, vars);
        const before = baselines[a.id];
        if (!Number.isFinite(before)) throw new Error("no baseline was taken before the step");
        const after = await one(query, countSql(a, vars));
        const delta = a.direction === "down" ? before - after : after - before;
        const min = await resolveMin(a, vars, query);
        base.observed = delta;
        base.expect = `${a.direction === "down" ? "fell" : "grew"} by >= ${min} (before ${before}, after ${after})`;
        base.ok = delta >= min;
      } else if (a.kind === "any_of") {
        const parts = [];
        let ok = false;
        for (const alt of a.of) {
          const pred = substitute(alt.predicate, vars);
          const observed = await one(query, countSql(alt, vars));
          const min = await resolveMin(alt, vars, query);
          const pass = observed >= min;
          ok = ok || pass;
          parts.push({ table: alt.table, predicate: pred, observed, expect: `>= ${min}`, ok: pass });
        }
        base.table = a.of.map((x) => x.table).join(" | ");
        base.predicate = parts.map((p) => `[${p.table}: ${p.predicate}]`).join(" OR ");
        base.observed = parts.map((p) => p.observed);
        base.expect = parts.map((p) => p.expect).join(" OR ");
        base.alternatives = parts;
        base.ok = ok;
      } else if (a.kind === "snapshot_changed") {
        const before = snapshots[a.snapshot];
        const def = snapshotDefs.find((d) => d.key === a.snapshot);
        if (!before || !def) throw new Error(`no snapshot named ${a.snapshot} was taken`);
        const rows = await query(substitute(def.sql, vars), (def.params ?? []).map((p) => snapshotParams[p]));
        let changed = 0;
        for (const r of rows) if (before.has(String(r.k)) && before.get(String(r.k)) !== String(r.v)) changed += 1;
        const min = await resolveMin(a, vars, query);
        base.predicate = `snapshot ${a.snapshot} (${before.size} row(s)) value differs now`;
        base.observed = changed;
        base.expect = `>= ${min}`;
        base.ok = changed >= min;
      }
    } catch (e) {
      base.ok = false;
      base.error = e instanceof Error ? e.message : String(e);
    }
    results.push(base);
  }
  return results;
}

/** The assertions the runner adds to every script step itself. PURE. These are real manifest-shaped
 *  assertions, named so a failure reads the same as any other.
 *  - harness-row: the step's family landed a row carrying the step's own run id (rule 17: the harness records it).
 *  - upstream-linked: a chained step's row carries the upstream step's run id (the hand-off held).
 *  - loop-carried: a step that inherits the sweep's loop run id carries it (ADR-031). */
export function autoAssertions(step) {
  const out = [];
  const fam = `harness_family = '${step.family}' AND github_run_id = '{{run_id}}'`;
  out.push({ id: "harness-row", kind: "count", table: "harness_runs", predicate: fam, min: 1 });
  if (step.upstream) out.push({ id: "upstream-linked", kind: "count", table: "harness_runs", predicate: `${fam} AND upstream_run_id = '{{upstream_run_id}}'`, min: 1 });
  if (step.loop) out.push({ id: "loop-carried", kind: "count", table: "harness_runs", predicate: `${fam} AND config->>'loop_run_id' = '{{loop_run_id}}'`, min: 1 });
  return out;
}

/** One line a failed assertion is reported as. PURE. */
export function describeFailure(stepId, r) {
  const where = r.table ? `${r.table} WHERE ${r.predicate}` : String(r.predicate);
  const observed = Array.isArray(r.observed) ? `[${r.observed.join(", ")}]` : String(r.observed);
  return `chain step "${stepId}" failed assertion "${r.id}": ${where}: observed ${observed}, expected ${r.expect}${r.error ? ` (${r.error})` : ""}`;
}

// ---- schema names (CHAIN-5, 2026-10-09) ------------------------------------------------------------------
// The assertion SQL names tables and columns that were once typed from migrations and run artifacts. Before the
// first step runs, every table an assertion reads is looked up in the LIVE stack's information_schema, and every
// statement the manifest will send (assertion counts, minSql, var queries, setup, snapshots, the runner's own
// automatic assertions) is planned with EXPLAIN against the stack's catalog, so a wrong column is a named problem
// found up front, with the columns the stack really has for that table, not a database message at step 9.

/** Template values the planning pass substitutes; EXPLAIN never reads a row, so any safe value works. */
const PLAN_VALUES = Object.freeze({ run_id: "0", loop_run_id: "0", upstream_run_id: "0", started_at: "1970-01-01 00:00:00+00" });

/** The statements a manifest will send, with where each comes from. PURE.
 *  @returns {{where: string, sql: string, params: number, table: string|null}[]} */
export function schemaStatements(manifest) {
  const out = [];
  for (const step of manifest.steps) {
    const at = (w) => `step ${step.id} ${w}`;
    const asserts = [...(step.kind === "script" ? autoAssertions(step) : []), ...(step.assertions ?? [])];
    for (const a of asserts) {
      const alts = a.kind === "any_of" ? a.of : [a];
      alts.forEach((alt, i) => {
        const label = a.kind === "any_of" ? `assertion ${a.id}[${i}]` : `assertion ${a.id}`;
        if (a.kind !== "snapshot_changed") out.push({ where: at(label), sql: `SELECT count(*)::int AS n FROM ${table(alt.table)} WHERE ${alt.predicate}`, params: 0, table: alt.table });
        if (typeof alt.minSql === "string") out.push({ where: at(`${label} minSql`), sql: alt.minSql, params: 0, table: alt.table ?? null });
      });
    }
    for (const q of step.var_queries ?? []) out.push({ where: at(`var query ${q.name}`), sql: q.sql, params: 0, table: null });
    for (const [i, st] of (step.setup ?? []).entries()) out.push({ where: at(`setup[${i}]`), sql: st.sql, params: (st.params ?? []).length, table: null });
    for (const d of step.snapshots ?? []) out.push({ where: at(`snapshot ${d.key}`), sql: d.sql, params: (d.params ?? []).length, table: null });
  }
  return out;
}

/** The distinct public tables the manifest's assertions read. PURE. */
export function assertionTables(manifest) {
  const t = new Set();
  for (const s of schemaStatements(manifest)) if (s.table) t.add(s.table);
  return [...t].sort();
}

/**
 * Check the manifest's names against the live stack. Never throws for a missing name; returns the problems.
 * @param {{manifest: object, query: Function}} args
 * @returns {Promise<{ok: boolean, problems: string[], tables: Record<string, number>, statements: number}>}
 */
export async function verifySchemaNames({ manifest, query }) {
  const problems = [];
  const names = assertionTables(manifest);
  const cols = new Map();
  const rows = await query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name, ordinal_position",
    [names],
  );
  for (const r of rows ?? []) {
    if (!cols.has(r.table_name)) cols.set(r.table_name, []);
    cols.get(r.table_name).push(r.column_name);
  }
  for (const n of names) if (!cols.has(n)) problems.push(`table public.${n} is not in the stack's information_schema`);

  const statements = schemaStatements(manifest);
  for (const st of statements) {
    if (st.table && !cols.has(st.table)) continue; // already named above
    try {
      const vars = {};
      for (const k of templateKeys(st.sql)) vars[k] = PLAN_VALUES[k.split(".")[0]];
      await query(`EXPLAIN (COSTS OFF) ${substitute(st.sql, vars)}`, Array.from({ length: st.params }, () => []));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const have = st.table && cols.has(st.table) && /column|does not exist/i.test(msg) ? ` (public.${st.table} has: ${cols.get(st.table).join(", ")})` : "";
      problems.push(`${st.where}: ${msg.replace(/\s+/g, " ").slice(0, 200)}${have}`);
    }
  }
  return { ok: problems.length === 0, problems, tables: Object.fromEntries([...cols].map(([k, v]) => [k, v.length])), statements: statements.length };
}
