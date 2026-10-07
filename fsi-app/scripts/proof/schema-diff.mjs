#!/usr/bin/env node
// schema-diff.mjs -- a normalised comparison of two local databases' public schemas (lane PROOF-1, coordinator
// ruling 2026-10-07). A is the proof schema (the production dump applied to the stack); B is replay_check (the
// migration files replayed onto an empty database). The diff says how far the migration files are from
// reproducing production, as a finding.
//
// Both sides are read with the same catalog query over the public schema and compared as sets of NAMES:
//   tables       table names
//   columns      table.column with its data type
//   functions    function name with its argument types
//   triggers     table.trigger
//   constraints  table.constraint with its type
// The report holds counts of what differs and the names (capped), never row data. It is a finding, not a gate:
// the exit code is 0 whenever both sides could be read.
//
// Usage: node scripts/proof/schema-diff.mjs --a <url> --b <url> --out <path>   (both loopback only)
// Exit: 0 = compared; 1 = a side could not be read; 2 = usage error or a non-loopback URL.

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { assertLoopbackDbUrl } from "./replay-migrations.mjs";
import { isMainModule } from "../lib/is-main.mjs";

export const CATEGORIES = Object.freeze(["tables", "columns", "functions", "triggers", "constraints"]);
const MAX_NAMES = 200;

export const CATALOG_QUERY = `select json_build_object(
 'tables', (select coalesce(json_agg(c.relname order by c.relname), '[]'::json) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p')),
 'columns', (select coalesce(json_agg(table_name || '.' || column_name || ' ' || data_type order by table_name, column_name), '[]'::json) from information_schema.columns where table_schema = 'public' and table_name in (select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p'))),
 'functions', (select coalesce(json_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' order by p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::json) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind in ('f', 'p')),
 'triggers', (select coalesce(json_agg(c.relname || '.' || t.tgname order by c.relname, t.tgname), '[]'::json) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal),
 'constraints', (select coalesce(json_agg(c.relname || '.' || k.conname || ' ' || k.contype order by c.relname, k.conname), '[]'::json) from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public')
)`;

/** Normalised set difference of two catalogs. PURE. */
export function diffCatalogs(a, b) {
  const result = {};
  let total = 0;
  for (const cat of CATEGORIES) {
    const A = new Set(a?.[cat] ?? []);
    const B = new Set(b?.[cat] ?? []);
    const onlyA = [...A].filter((x) => !B.has(x)).sort();
    const onlyB = [...B].filter((x) => !A.has(x)).sort();
    result[cat] = {
      a_count: A.size,
      b_count: B.size,
      only_in_a: onlyA.length,
      only_in_b: onlyB.length,
      names_only_in_a: onlyA.slice(0, MAX_NAMES),
      names_only_in_b: onlyB.slice(0, MAX_NAMES),
    };
    total += onlyA.length + onlyB.length;
  }
  return { schema: "chain-proof-schema-diff/1", a: "proof schema (production dump)", b: "replay_check (migration files)", differing_total: total, categories: result };
}

/** Read one side's catalog through psql. `spawn` is injectable. Returns the parsed catalog or null. */
export function readCatalog({ url, psql = "psql", spawn = spawnSync }) {
  const r = spawn(psql, [url, "-X", "-At", "-c", CATALOG_QUERY], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PGCONNECT_TIMEOUT: "10" } });
  if (r.error || r.status !== 0) return null;
  try { return JSON.parse(String(r.stdout).trim()); } catch { return null; }
}

/** One-screen summary. PURE. */
export function summarizeDiff(d) {
  const lines = [`Schema diff (proof schema vs replay_check): ${d.differing_total} differing name(s)`];
  for (const cat of CATEGORIES) {
    const c = d.categories[cat];
    lines.push(`  ${cat}: proof ${c.a_count}, replay ${c.b_count}, only in proof ${c.only_in_a}, only in replay ${c.only_in_b}`);
  }
  return lines.join("\n");
}

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

if (isMainModule(import.meta.url)) {
  const [a, b, out] = [arg("--a"), arg("--b"), arg("--out")];
  if (!a || !b || !out) { console.error("schema-diff: --a, --b and --out are required"); process.exit(2); }
  try { assertLoopbackDbUrl(a); assertLoopbackDbUrl(b); } catch (e) { console.error(`schema-diff: ${e.message}`); process.exit(2); }
  const ca = readCatalog({ url: a });
  const cb = readCatalog({ url: b });
  if (!ca || !cb) { console.error(`schema-diff: could not read the ${!ca ? "proof schema" : "replay_check"} catalog`); process.exit(1); }
  const d = diffCatalogs(ca, cb);
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), JSON.stringify(d, null, 2) + "\n", "utf8");
  console.log(summarizeDiff(d));
}
