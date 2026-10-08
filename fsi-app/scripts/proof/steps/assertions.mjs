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

import { substitute } from "./manifest.mjs";

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
