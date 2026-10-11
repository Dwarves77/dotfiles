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
//   grants       one entry per object and grantee, "relation:name -> grantee" or "function:name(args) -> grantee", with the
//                privilege types held (and whether grantable), for every table, view, sequence and function in public
//                (aclexplode over relacl and proacl; a NULL ACL is read as the owner default, so a NULL and an explicit
//                default compare equal). Added by lane MIG-CI, 2026-10-08, after the oracle was found to compare definitions
//                and never grants: a wrong ACL (a missing or extra GRANT) now fails the oracle step with the object and the
//                grantee named. Grantor names are not compared (ownership is stripped from the dump).
// A difference is an object only on one side, or on both sides with a different definition ("changed").
// The report holds counts and names only. It never holds a definition's text and never row data.
//
// Usage: node scripts/proof/schema-diff.mjs --replayed <url> --oracle <url> --out <path>   (both loopback only)
//        node scripts/proof/schema-diff.mjs --catalog-only --db-url <url>   (loopback only; runs the catalog query once, exit 1 with the cause on error)
// Exit: 0 = identical; 1 = they differ, or a side could not be read; 2 = usage error or a non-loopback URL.

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { assertLoopbackDbUrl } from "./replay-migrations.mjs";
import { isMainModule } from "../lib/is-main.mjs";

export const CATEGORIES = Object.freeze(["tables", "columns", "constraints", "indexes", "functions", "triggers", "policies", "grants"]);
const MAX_NAMES = 200;
const MAX_LOGGED = 40;

// Every category is an object { name: normalised definition text }. N() collapses whitespace. (DRIFT-1, 2026-10-10: the query returned an
// md5 of each definition until the first oracle run found 562 differing objects and the hashes could not say why; the definition text is now
// read, compared after canonicalise(), and only structural facts about a difference (never the text) reach the artifact: see buildDetail.)
const N = (expr) => `regexp_replace(${expr}, '\\s+', ' ', 'g')`;
const PUBLIC_RELS = `(select c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p'))`;

export const CATALOG_QUERY = `select json_build_object(
 'tables', (select coalesce(json_object_agg(r.relname, r.relkind::text || r.relrowsecurity::text || r.relforcerowsecurity::text), '{}'::json) from ${PUBLIC_RELS} r),
 'columns', (select coalesce(json_object_agg(r.relname || '.' || a.attname, ${N("format_type(a.atttypid, a.atttypmod) || ' ' || a.attnotnull::text || ' ' || coalesce(pg_get_expr(d.adbin, d.adrelid), '') || ' ' || a.attidentity::text || a.attgenerated::text")}), '{}'::json) from ${PUBLIC_RELS} r join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum),
 'constraints', (select coalesce(json_object_agg(r.relname || '.' || k.conname, ${N("k.contype::text || ' ' || pg_get_constraintdef(k.oid)")}), '{}'::json) from ${PUBLIC_RELS} r join pg_constraint k on k.conrelid = r.oid),
 'indexes', (select coalesce(json_object_agg(i.tablename || '.' || i.indexname, ${N("i.indexdef")}), '{}'::json) from pg_indexes i where i.schemaname = 'public'),
 'functions', (select coalesce(json_object_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ${N("pg_get_functiondef(p.oid)")}), '{}'::json) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind in ('f', 'p') and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')),
 'triggers', (select coalesce(json_object_agg(r.relname || '.' || t.tgname, ${N("pg_get_triggerdef(t.oid)")}), '{}'::json) from ${PUBLIC_RELS} r join pg_trigger t on t.tgrelid = r.oid and not t.tgisinternal),
 'policies', (select coalesce(json_object_agg(pl.tablename || '.' || pl.policyname, ${N("pl.cmd || ' ' || pl.roles::text || ' ' || coalesce(pl.qual, '') || ' ' || coalesce(pl.with_check, '') || ' ' || pl.permissive")}), '{}'::json) from pg_policies pl where pl.schemaname = 'public'),
 'grants', (select coalesce(json_object_agg(g.k, g.v), '{}'::json) from (
  select 'relation:' || c.relname || ' -> ' || case a.grantee when 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as k, string_agg(a.privilege_type || case when a.is_grantable then '*' else '' end, ',' order by a.privilege_type, a.is_grantable) as v
  from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
  cross join lateral aclexplode(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 's'::"char" else 'r'::"char" end, c.relowner))) a
  group by 1
  union all
  select 'function:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') -> ' || case a.grantee when 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as k, string_agg(a.privilege_type || case when a.is_grantable then '*' else '' end, ',' order by a.privilege_type, a.is_grantable) as v
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.prokind in ('f', 'p') and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  group by 1) g)
)`;

// ---- DRIFT-1 (2026-10-10): canonical comparison and a structural difference record -----------------------------------------------------
// The first oracle run (chain proof fire 9, run 38058989236) found 562 differing objects and the report, names and counts only, could not say
// which were the same object printed two ways. Both sides are now read as definition TEXT through ONE canonical form, and a second, structural
// record says what kind of difference each remaining object is.
//
// THE CANONICAL FORM has two parts. (1) The session's search_path is pinned to pg_catalog (CANONICAL_PGOPTIONS), because pg_get_constraintdef,
// pg_get_expr (policies, defaults), pg_get_functiondef and format_type print a schema qualifier only when the schema is NOT on the reading
// session's search_path. The two sides are read by different roles (the stack's postgres, the oracle cluster's supabase_admin) and a role's own
// search_path setting decides whether `auth.users` prints as `auth.users` or `users`; with the path pinned every non-pg_catalog name prints
// qualified on both sides. [HYPOTHESIS until chain proof fire 10: the 24 foreign keys to auth.users and the 135 policies that call auth.uid()
// or auth.role() of the fire 9 diff look like this; the object lists matched that shape, no definition text was read.] (2) canonicalise():
// whitespace, and the space just inside parentheses and after commas outside string literals, and the order of a privilege list.
export const CANONICAL_PGOPTIONS = "-c search_path=pg_catalog";

/** Split on single-quoted SQL string literals ('' escapes). Odd indexes are literals. PURE. */
const splitLiterals = (s) => String(s).split(/('(?:[^']|'')*')/);

/** The canonical form of one definition. `category` decides what may be normalised: a function body is never touched beyond whitespace. PURE. */
export function canonicalise(category, text) {
  if (typeof text !== "string") return text;
  if (category === "grants") return [...new Set(text.split(",").map((x) => x.trim()).filter(Boolean))].sort().join(",");
  const flat = text.replace(/\s+/g, " ").trim();
  if (category === "functions") return flat;
  return splitLiterals(flat).map((part, i) => (i % 2 ? part : part.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").replace(/\s*,\s*/g, ", "))).join("");
}

/** Normalised comparison of two catalogs (each category a { name: definition text } map). PURE.
 *  `normalised_away` counts the objects whose raw text differs and whose canonical form is equal: they are NOT differences. */
export function diffCatalogs(replayed, oracle) {
  const categories = {};
  let total = 0;
  let away = 0;
  for (const cat of CATEGORIES) {
    const A = replayed?.[cat] ?? {};
    const B = oracle?.[cat] ?? {};
    const onlyA = Object.keys(A).filter((k) => !(k in B)).sort();
    const onlyB = Object.keys(B).filter((k) => !(k in A)).sort();
    const changed = Object.keys(A).filter((k) => k in B && canonicalise(cat, A[k]) !== canonicalise(cat, B[k])).sort();
    const normalisedAway = Object.keys(A).filter((k) => k in B && A[k] !== B[k] && canonicalise(cat, A[k]) === canonicalise(cat, B[k])).length;
    categories[cat] = {
      replayed_count: Object.keys(A).length,
      oracle_count: Object.keys(B).length,
      only_in_replayed: onlyA.length,
      only_in_oracle: onlyB.length,
      changed: changed.length,
      normalised_away: normalisedAway,
      names_only_in_replayed: onlyA.slice(0, MAX_NAMES),
      names_only_in_oracle: onlyB.slice(0, MAX_NAMES),
      names_changed: changed.slice(0, MAX_NAMES),
    };
    total += onlyA.length + onlyB.length + changed.length;
    away += normalisedAway;
  }
  return {
    schema: "chain-proof-schema-diff/2",
    replayed: "the stack, built by replaying the migration files",
    oracle: "schema-only dump of production",
    differing_total: total,
    normalised_away_total: away,
    identical: total === 0,
    categories,
  };
}

const MAX_DETAIL = 1000;
const MAX_TOKENS = 12;
const IDENT = /[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*/gi;
const identBag = (text) => {
  const bag = new Map();
  for (const [i, part] of splitLiterals(text).entries()) {
    if (i % 2) continue; // a string literal: never read into the record
    for (const m of part.matchAll(IDENT)) bag.set(m[0].toLowerCase(), (bag.get(m[0].toLowerCase()) ?? 0) + 1);
  }
  return bag;
};
const bagDifference = (a, b) => [...a].filter(([t, n]) => n > (b.get(t) ?? 0)).map(([t]) => t).sort().slice(0, MAX_TOKENS);
const stripQualifiers = (s) => s.replace(/\b[a-z_][a-z0-9_]*\./g, "");
const firstDifference = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

/** The STRUCTURAL record of every difference left after canonicalisation, one row per object, for the register that classifies the oracle's
 *  findings. PURE. It holds NO definition text and no string literal: the object name, which side has it, a class, the two lengths, the offset
 *  of the first differing character, and the identifier tokens (never a literal) each side has more of; for grants the privilege letters,
 *  which the repo already records. The artifact is world-readable (public repository), so the text of a production policy or function body is
 *  not published; whoever holds the production credential reads the text itself when a migration is written.
 *  class R = the replay has it and production lacks it; P = production has it and the replay lacks it; C = both have it, the definitions
 *  differ (shape qualification-only = equal once schema qualifiers are stripped, a candidate for the canonical form; substantive = anything else). */
export function buildDetail(replayed, oracle) {
  const rows = [];
  for (const cat of CATEGORIES) {
    const A = replayed?.[cat] ?? {};
    const B = oracle?.[cat] ?? {};
    for (const k of Object.keys({ ...A, ...B }).sort()) {
      const a = k in A ? String(A[k]) : null;
      const b = k in B ? String(B[k]) : null;
      if (a !== null && b !== null && canonicalise(cat, a) === canonicalise(cat, b)) continue;
      const row = { category: cat, name: k, state: a === null ? "only_in_oracle" : b === null ? "only_in_replayed" : "changed" };
      row.class = a === null ? "P" : b === null ? "R" : "C";
      if (a !== null && b !== null) {
        const ca = canonicalise(cat, a);
        const cb = canonicalise(cat, b);
        row.shape = stripQualifiers(ca) === stripQualifiers(cb) ? "qualification-only" : "substantive";
        row.length = { replayed: ca.length, oracle: cb.length };
        row.first_difference_at = firstDifference(ca, cb);
        if (cat === "grants") { row.privileges_replayed = ca; row.privileges_oracle = cb; }
        else {
          const [ba, bb] = [identBag(ca), identBag(cb)];
          row.tokens_only_in_replayed = bagDifference(ba, bb);
          row.tokens_only_in_oracle = bagDifference(bb, ba);
        }
      } else if (cat === "grants") {
        row.privileges = canonicalise(cat, a ?? b);
      }
      rows.push(row);
    }
  }
  const classes = { R: 0, P: 0, C: 0 };
  for (const r of rows) classes[r.class]++;
  return { schema: "chain-proof-schema-diff-detail/1", rows: rows.slice(0, MAX_DETAIL), row_count: rows.length, classes, truncated: rows.length > MAX_DETAIL };
}

const MAX_ERROR_TEXT = 500;

/** Strip anything secret from psql's error text: the connection URL, the URL's password, any postgres URL, a password= pair. PURE. */
export function redactPgText(text, url = "") {
  let out = String(text ?? "");
  try {
    const u = new URL(url);
    const names = new Set([u.username, u.hostname, u.pathname.slice(1), "postgres", "password"]);
    // The whole URL always. The bare password only when it is long enough not to chew ordinary words and is not a name the message needs (a local stack's password is "postgres").
    for (const secret of [url, u.password, decodeURIComponent(u.password)]) {
      if (!secret || (secret !== url && (secret.length < 6 || names.has(secret)))) continue;
      out = out.split(secret).join("<redacted>");
    }
  } catch { /* not a URL: the generic patterns below still apply */ }
  return out
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "<url>")
    .replace(/password=\S+/gi, "password=<redacted>");
}

/** The readable cause of a failed psql run: the SQLSTATE code (psql is run with VERBOSITY=verbose) and the error text, redacted and capped. PURE. */
export function describePsqlFailure(r, url = "", psql = "psql") {
  if (r.error) return { code: r.error.code ?? null, message: redactPgText(`could not run ${psql}: ${r.error.message}`, url).slice(0, MAX_ERROR_TEXT) };
  const stderr = redactPgText(r.stderr, url).trim();
  const lines = stderr.split(/\r?\n/).filter((l) => l.trim() !== "");
  const errLine = lines.find((l) => /(?:ERROR|FATAL|psql: error):/.test(l)) ?? lines[0] ?? "";
  const code = /(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/.exec(stderr)?.[1] ?? null;
  const head = r.status === null || r.status === undefined ? `psql was ended by ${r.signal ?? "a signal"}` : `psql exited with status ${r.status}`;
  const text = errLine ? `${head}: ${errLine.trim()}` : `${head} and printed no error text`;
  return { code, message: text.slice(0, MAX_ERROR_TEXT) };
}

/** Read one side's catalog through psql. `spawn` is injectable. Returns { catalog, error }: exactly one is null. Never a bare null:
 *  a failure carries { code, message } from psql (the SQLSTATE and the error line, redacted of the URL and password), so the next failure names itself.
 *  -v VERBOSITY=verbose puts the SQLSTATE in the error line; -v ON_ERROR_STOP=1 makes a SQL error a non-zero exit. */
export function readCatalog({ url, psql = "psql", spawn = spawnSync }) {
  const r = spawn(psql, [url, "-X", "-At", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-c", CATALOG_QUERY], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PGCONNECT_TIMEOUT: "10", PGOPTIONS: CANONICAL_PGOPTIONS } });
  if (r.error || r.status !== 0) return { catalog: null, error: describePsqlFailure(r, url, psql) };
  try { return { catalog: JSON.parse(String(r.stdout).trim()), error: null }; }
  catch { return { catalog: null, error: { code: null, message: `psql output was not JSON (${String(r.stdout).length} characters)` } }; }
}

/** The log text: counts per category, then the names of what differs (capped). PURE. */
export function summarizeDiff(d) {
  const lines = [d.identical ? "Schema oracle: the replayed schema and the production dump are IDENTICAL" : `Schema oracle: FAILED, ${d.differing_total} differing object(s) between the replayed schema and the production dump`];
  if (d.normalised_away_total) lines.push(`  ${d.normalised_away_total} object(s) differ in raw text only and are equal once canonicalised (not counted)`);
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

/** The read-only entry (rule 15): run the catalog query once on one database, so every PR that touches the stack proves the query on a real server.
 *  Returns { status, lines }: 0 with one counts line, or 1 with the printed cause (SQLSTATE and psql error text). `read` is injectable. */
export function catalogOnly(url, read = readCatalog) {
  const r = read({ url });
  if (r.error) return { status: 1, lines: [`schema-diff: the catalog query failed on the stack${r.error.code ? ` (${r.error.code})` : ""}: ${r.error.message}`] };
  const counts = CATEGORIES.map((c) => `${c} ${Object.keys(r.catalog?.[c] ?? {}).length}`).join(", ");
  return { status: 0, lines: [`schema-diff: the catalog query ran on the stack: ${counts}`] };
}

/** The path of the structural sidecar written beside the gate's report: replay-schema-diff.json -> replay-schema-diff-detail.json. PURE. */
export const detailPathOf = (out) => String(out).replace(/(\.json)?$/, "-detail.json");

/** The oracle gate. PASS means ZERO differing objects after canonicalisation; any difference lists the object (the log, the report and the
 *  detail sidecar). `read`, `write` and `log` are injectable. Returns the exit code: 0 identical, 1 they differ or a side was unreadable. */
export function runGate({ replayedUrl, oracleUrl, out, read = readCatalog, write = (path, text) => { mkdirSync(dirname(resolve(path)), { recursive: true }); writeFileSync(resolve(path), text, "utf8"); }, log = { out: console.log, err: console.error } }) {
  const replayed = read({ url: replayedUrl });
  const oracle = read({ url: oracleUrl });
  const unreadable = [["replayed", replayed], ["oracle", oracle]].filter(([, r]) => r.error);
  for (const [side, r] of unreadable) log.err(`schema-diff: could not read the ${side} schema${r.error.code ? ` (${r.error.code})` : ""}: ${r.error.message}`);
  if (unreadable.length) { log.err("schema-diff: the oracle gate cannot pass"); return 1; }
  const d = diffCatalogs(replayed.catalog, oracle.catalog);
  write(out, JSON.stringify(d, null, 2) + "\n");
  if (!d.identical) {
    const detail = buildDetail(replayed.catalog, oracle.catalog);
    write(detailPathOf(out), JSON.stringify(detail, null, 2) + "\n");
    log.err(`schema-diff: structural record of the ${detail.row_count} differing object(s): classes R (replay only) ${detail.classes.R}, P (production only) ${detail.classes.P}, C (both, definitions differ) ${detail.classes.C}; written to ${detailPathOf(out)}`);
  }
  (d.identical ? log.out : log.err)(summarizeDiff(d));
  return d.identical ? 0 : 1;
}

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

if (isMainModule(import.meta.url)) {
  if (process.argv.includes("--catalog-only")) {
    const dbUrl = arg("--db-url");
    if (!dbUrl) { console.error("schema-diff: --catalog-only needs --db-url"); process.exit(2); }
    try { assertLoopbackDbUrl(dbUrl); } catch (e) { console.error(`schema-diff: ${e.message}`); process.exit(2); }
    const c = catalogOnly(dbUrl);
    for (const l of c.lines) (c.status === 0 ? console.log : console.error)(l);
    process.exit(c.status);
  }
  const [replayedUrl, oracleUrl, out] = [arg("--replayed"), arg("--oracle"), arg("--out")];
  if (!replayedUrl || !oracleUrl || !out) { console.error("schema-diff: --replayed, --oracle and --out are required"); process.exit(2); }
  try { assertLoopbackDbUrl(replayedUrl); assertLoopbackDbUrl(oracleUrl); } catch (e) { console.error(`schema-diff: ${e.message}`); process.exit(2); }
  process.exit(runGate({ replayedUrl, oracleUrl, out }));
}
