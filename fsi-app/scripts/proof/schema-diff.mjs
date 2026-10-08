#!/usr/bin/env node
// schema-diff.mjs -- the chain proof's SCHEMA ORACLE GATE (lane PROOF-1, coordinator reversal 2026-10-07).
//
// The stack's schema is built by replaying the repo's migration files (replay-migrations.mjs). A schema-only dump of
// production, applied to a second database on the same stack (apply-schema-dump.mjs), is the oracle. This script
// reads both public schemas through the same catalog query and compares them, normalised. The difference must be
// EMPTY: if it is not, it exits 1 and the job fails at this step, with the counts and the names of the differing
// objects in the log and in the artifact (replay-schema-diff.json).
//
// WHAT IS COMPARED, per object, as name plus a hash of the normalised definition (whitespace collapsed):
//   tables       relation name with its kind and row level security flags
//   columns      table.column with its data type, nullability, default and identity/generated setting
//   constraints  table.constraint with its type and definition
//   indexes      table.index with its definition
//   functions    name(argument types) with its full definition (extension members excluded)
//   triggers     table.trigger with its definition
//   policies     table.policy with its command, roles, USING and WITH CHECK
// A difference is an object only on one side, or on both sides with a different definition ("changed").
// The report holds counts and names only. It never holds a definition's text and never row data.
//
// Usage: node scripts/proof/schema-diff.mjs --replayed <url> --oracle <url> --out <path>   (both loopback only)
// Exit: 0 = identical; 1 = they differ, or a side could not be read; 2 = usage error or a non-loopback URL.

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { assertLoopbackDbUrl } from "./replay-migrations.mjs";
import { isMainModule } from "../lib/is-main.mjs";

export const CATEGORIES = Object.freeze(["tables", "columns", "constraints", "indexes", "functions", "triggers", "policies"]);
const MAX_NAMES = 200;
const MAX_LOGGED = 40;

// Every category is an object { name: md5-of-normalised-definition }. N() collapses whitespace.
const N = (expr) => `regexp_replace(${expr}, '\\s+', ' ', 'g')`;
const PUBLIC_RELS = `(select c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p'))`;

export const CATALOG_QUERY = `select json_build_object(
 'tables', (select coalesce(json_object_agg(r.relname, md5(r.relkind::text || r.relrowsecurity::text || r.relforcerowsecurity::text)), '{}'::json) from ${PUBLIC_RELS} r),
 'columns', (select coalesce(json_object_agg(r.relname || '.' || a.attname, md5(${N("format_type(a.atttypid, a.atttypmod) || ' ' || a.attnotnull::text || ' ' || coalesce(pg_get_expr(d.adbin, d.adrelid), '') || ' ' || a.attidentity::text || a.attgenerated::text")})), '{}'::json) from ${PUBLIC_RELS} r join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum),
 'constraints', (select coalesce(json_object_agg(r.relname || '.' || k.conname, md5(${N("k.contype::text || ' ' || pg_get_constraintdef(k.oid)")})), '{}'::json) from ${PUBLIC_RELS} r join pg_constraint k on k.conrelid = r.oid),
 'indexes', (select coalesce(json_object_agg(i.tablename || '.' || i.indexname, md5(${N("i.indexdef")})), '{}'::json) from pg_indexes i where i.schemaname = 'public'),
 'functions', (select coalesce(json_object_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', md5(${N("pg_get_functiondef(p.oid)")})), '{}'::json) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind in ('f', 'p') and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')),
 'triggers', (select coalesce(json_object_agg(r.relname || '.' || t.tgname, md5(${N("pg_get_triggerdef(t.oid)")})), '{}'::json) from ${PUBLIC_RELS} r join pg_trigger t on t.tgrelid = r.oid and not t.tgisinternal),
 'policies', (select coalesce(json_object_agg(pl.tablename || '.' || pl.policyname, md5(${N("pl.cmd || ' ' || pl.roles::text || ' ' || coalesce(pl.qual, '') || ' ' || coalesce(pl.with_check, '') || ' ' || pl.permissive")})), '{}'::json) from pg_policies pl where pl.schemaname = 'public')
)`;

/** Normalised comparison of two catalogs (each category a { name: hash } map). PURE. */
export function diffCatalogs(replayed, oracle) {
  const categories = {};
  let total = 0;
  for (const cat of CATEGORIES) {
    const A = replayed?.[cat] ?? {};
    const B = oracle?.[cat] ?? {};
    const onlyA = Object.keys(A).filter((k) => !(k in B)).sort();
    const onlyB = Object.keys(B).filter((k) => !(k in A)).sort();
    const changed = Object.keys(A).filter((k) => k in B && A[k] !== B[k]).sort();
    categories[cat] = {
      replayed_count: Object.keys(A).length,
      oracle_count: Object.keys(B).length,
      only_in_replayed: onlyA.length,
      only_in_oracle: onlyB.length,
      changed: changed.length,
      names_only_in_replayed: onlyA.slice(0, MAX_NAMES),
      names_only_in_oracle: onlyB.slice(0, MAX_NAMES),
      names_changed: changed.slice(0, MAX_NAMES),
    };
    total += onlyA.length + onlyB.length + changed.length;
  }
  return {
    schema: "chain-proof-schema-diff/2",
    replayed: "the stack, built by replaying the migration files",
    oracle: "schema-only dump of production",
    differing_total: total,
    identical: total === 0,
    categories,
  };
}

/** Read one side's catalog through psql. `spawn` is injectable. Returns the parsed catalog or null. */
export function readCatalog({ url, psql = "psql", spawn = spawnSync }) {
  const r = spawn(psql, [url, "-X", "-At", "-c", CATALOG_QUERY], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PGCONNECT_TIMEOUT: "10" } });
  if (r.error || r.status !== 0) return null;
  try { return JSON.parse(String(r.stdout).trim()); } catch { return null; }
}

/** The log text: counts per category, then the names of what differs (capped). PURE. */
export function summarizeDiff(d) {
  const lines = [d.identical ? "Schema oracle: the replayed schema and the production dump are IDENTICAL" : `Schema oracle: FAILED, ${d.differing_total} differing object(s) between the replayed schema and the production dump`];
  for (const cat of CATEGORIES) {
    const c = d.categories[cat];
    lines.push(`  ${cat}: replayed ${c.replayed_count}, oracle ${c.oracle_count}, only in replayed ${c.only_in_replayed}, only in oracle ${c.only_in_oracle}, changed ${c.changed}`);
  }
  for (const cat of CATEGORIES) {
    const c = d.categories[cat];
    for (const [label, names, n] of [["only in replayed", c.names_only_in_replayed, c.only_in_replayed], ["only in oracle", c.names_only_in_oracle, c.only_in_oracle], ["changed", c.names_changed, c.changed]]) {
      if (n === 0) continue;
      lines.push(`  ${cat} ${label}: ${names.slice(0, MAX_LOGGED).join(", ")}${n > MAX_LOGGED ? `, and ${n - MAX_LOGGED} more` : ""}`);
    }
  }
  return lines.join("\n");
}

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

if (isMainModule(import.meta.url)) {
  const [replayedUrl, oracleUrl, out] = [arg("--replayed"), arg("--oracle"), arg("--out")];
  if (!replayedUrl || !oracleUrl || !out) { console.error("schema-diff: --replayed, --oracle and --out are required"); process.exit(2); }
  try { assertLoopbackDbUrl(replayedUrl); assertLoopbackDbUrl(oracleUrl); } catch (e) { console.error(`schema-diff: ${e.message}`); process.exit(2); }
  const replayed = readCatalog({ url: replayedUrl });
  const oracle = readCatalog({ url: oracleUrl });
  if (!replayed || !oracle) { console.error(`schema-diff: could not read the ${!replayed ? "replayed" : "oracle"} schema; the oracle gate cannot pass`); process.exit(1); }
  const d = diffCatalogs(replayed, oracle);
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), JSON.stringify(d, null, 2) + "\n", "utf8");
  (d.identical ? console.log : console.error)(summarizeDiff(d));
  process.exit(d.identical ? 0 : 1);
}
