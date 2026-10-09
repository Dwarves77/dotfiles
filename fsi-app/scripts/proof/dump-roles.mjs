#!/usr/bin/env node
// dump-roles.mjs -- export production's roles and make them applicable to the oracle cluster (lane PROOF-7, 2026-10-09).
//
// WHY. chain-proof fire 6 (run 37894782168): cluster ready, replay 345/345, dump apply failed with exactly one error,
// `line 14063: role "reconciler" does not exist`. pg_dump's schema dump omits roles, so every production role a GRANT or
// OWNER statement names must exist on the oracle before the dump is applied. The image creates only its own roles
// (postgres, anon, authenticated, service_role, supabase_admin and the other Supabase-managed ones); the rest are created
// from a roles file this script produces.
//
// TWO MODES (two steps, because the export step holds production credentials and no local env, and the oracle step holds
// the local env and no production credentials):
//   export --out <raw.sql>
//       The credentialed export step. First production connection candidate that connects (the same candidate list
//       dump-production-schema.mjs uses), then `supabase db dump --db-url <candidate> --role-only -f <out>` on it, to
//       runner disk only. The Supabase CLI is version-matched to the server; a locally installed Postgres client is not and refuses a
//       newer server, so the export runs through the same CLI the schema dump does.
//   filter --in <raw.sql> --out <roles.sql> --db-url <oracle url>
//       The oracle step. Reads the oracle's own role list from pg_roles AT RUN TIME (never a typed list) and keeps only
//       the CREATE ROLE, ALTER ROLE and GRANT statements that name a role the oracle does not have. Every PASSWORD '...'
//       clause is STRIPPED and the output is asserted to carry none, so a secret never reaches the artifact; the output
//       is role names and attributes only. A statement the filter does not recognise is refused (exit 1), never passed
//       through. apply-schema-dump.mjs --roles applies this file first.
// Exit: 0 = done; 1 = failed (the message names the cause, redacted); 2 = usage error.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { candidateConnStrings } from "../lib/pg-conn.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import { firstWorkingCandidate, redact } from "./dump-production-schema.mjs";
import { assertOracleUrl } from "./apply-schema-dump.mjs";

const MAX_TEXT = 300;
const PASSWORD_CLAUSE = /\bPASSWORD\s+(?:E|U&)?'/i;
const PASSWORD_STRIP = /(?:\b(?:UN)?ENCRYPTED\s+)?\bPASSWORD\s+(?:E|U&)?'(?:[^']|'')*'/gi;

/** An identifier as the role dump writes it: bare or double-quoted with "" for a quote. PURE. */
export function parseIdent(raw) {
  const s = String(raw);
  return s.startsWith('"') && s.endsWith('"') && s.length >= 2 ? s.slice(1, -1).replace(/""/g, '"') : s;
}

const IDENT = '("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)';
const RE_CREATE = new RegExp(`^CREATE ROLE ${IDENT};$`);
const RE_ALTER = new RegExp(`^ALTER ROLE ${IDENT} `);
const RE_GRANT = new RegExp(`^GRANT ${IDENT}(?:\\s*,\\s*${IDENT})* TO ${IDENT}(?: |;)`);
const RE_GRANTED_BY = new RegExp(`GRANTED BY ${IDENT}`);

/** The supabase CLI arguments for a roles-only dump (the same --db-url and -f as the schema dump, plus --role-only). PURE. */
export function roleDumpArgs(url, out) {
  return ["db", "dump", "--db-url", url, "--role-only", "-f", out];
}

/** Remove every PASSWORD '...' clause from one statement. PURE. A statement left as `ALTER ROLE x WITH;` is dropped (returns ""). */
export function stripPasswords(line) {
  const out = String(line).replace(PASSWORD_STRIP, "").replace(/ {2,}/g, " ").replace(/ ;$/, ";");
  return /^ALTER ROLE \S+ WITH;$/.test(out) ? "" : out;
}

/** Lines that carry a password clause. PURE. A role merely named "password" is not one. */
export function passwordProblems(text) {
  return String(text ?? "").split(/\r?\n/).map((l, i) => ({ l, line: i + 1 })).filter(({ l }) => !l.startsWith("--") && PASSWORD_CLAUSE.test(l)).map(({ line }) => `line ${line} carries a PASSWORD clause`);
}

/** The role names a CREATE ROLE statement in `text` names, minus `existing`. PURE. */
export function newRoleNames(text, existing) {
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const m = RE_CREATE.exec(line);
    if (m && !existing.has(parseIdent(m[1])) && !out.includes(parseIdent(m[1]))) out.push(parseIdent(m[1]));
  }
  return out;
}

/** Keep the statements that name a role the oracle lacks, every PASSWORD clause stripped. PURE. Throws on an unknown statement or a surviving password clause. */
export function filterRoles(text, existing) {
  text = String(text ?? "").split(/\r?\n/).map((l) => (l.startsWith("--") ? l : stripPasswords(l))).join("\n");
  const fresh = new Set(newRoleNames(text, existing));
  const keep = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (line === "" || line.startsWith("--") || line.startsWith("\\") || /^SET [^;]*;$/.test(line)) { continue; }
    let m;
    if ((m = RE_CREATE.exec(line))) { if (fresh.has(parseIdent(m[1]))) keep.push(line); continue; }
    if ((m = RE_ALTER.exec(line))) { if (fresh.has(parseIdent(m[1]))) keep.push(line); continue; }
    if (RE_GRANT.test(line)) {
      const body = line.replace(RE_GRANTED_BY, "");
      const idents = [...body.matchAll(new RegExp(IDENT, "g"))].map((x) => parseIdent(x[1])).filter((n) => !["GRANT", "TO", "WITH", "INHERIT", "SET", "ADMIN", "TRUE", "FALSE", "OPTION"].includes(n.toUpperCase()) || fresh.has(n));
      if (idents.some((n) => fresh.has(n))) keep.push(line);
      continue;
    }
    throw new Error(`unrecognised statement in the roles dump (starts "${line.slice(0, 24).replace(/[^\x20-\x7e]/g, "?")}"): refused, not passed through`);
  }
  const outText = keep.length ? keep.join("\n") + "\n" : "";
  const left = passwordProblems(outText);
  if (left.length) throw new Error(`a PASSWORD clause survived the strip (${left[0]}); refused, a secret must never reach the artifact`);
  return { text: outText, created: [...fresh], kept: keep.length };
}

/** The roles the oracle already has, read from pg_roles. `spawn` is injectable. Throws when it cannot. */
export function oracleRoleNames({ oracleUrl, psql = "psql", spawn = spawnSync }) {
  const r = spawn(psql, [oracleUrl, "-X", "-At", "-c", "select rolname from pg_roles"], { encoding: "utf8", env: { ...process.env, PGCONNECT_TIMEOUT: "10" } });
  if (r.error || r.status !== 0) throw new Error(`could not read the oracle's roles: ${String(r.error ? r.error.message : r.stderr ?? "").trim().split(/\r?\n/).slice(-1)[0]?.replace(/postgres(?:ql)?:\/\/\S+/gi, "<url>").slice(0, 160) ?? ""}`);
  const names = String(r.stdout ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) throw new Error("the oracle reported no roles: it is not ready");
  return new Set(names);
}

/** The credentialed export. Everything external is injected. Returns { ok, code, message }. */
export async function exportRoles({ env = process.env, out, connect, spawn = spawnSync, read = readFileSync }) {
  const candidates = candidateConnStrings(env);
  if (candidates.length === 0) return { ok: false, code: 1, message: "no production connection candidate (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD are needed)" };
  const found = await firstWorkingCandidate(candidates, connect);
  if (!found) return { ok: false, code: 1, message: `none of ${candidates.length} production candidates connected` };
  const r = spawn("supabase", roleDumpArgs(found.url, out), { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const status = r.error ? 127 : r.status;
  if (status !== 0) return { ok: false, code: 1, message: `supabase db dump --role-only failed (exit ${status}): ${redact(`${r.stderr ?? ""}${r.error ? ` could not run supabase: ${r.error.message}` : ""}`, env).trim().split(/\r?\n/).slice(-2).join(" | ").slice(0, MAX_TEXT)}` };
  let text;
  try { text = read(out, "utf8"); } catch (e) { return { ok: false, code: 1, message: `the roles dump could not be read: ${e.message}` }; }
  const n = String(text).split(/\r?\n/).filter((l) => RE_CREATE.test(l)).length;
  if (n === 0) return { ok: false, code: 1, message: "the roles dump has no CREATE ROLE statement" };
  return { ok: true, code: 0, message: `roles dump written (${n} roles, candidate ${found.index + 1} of ${candidates.length}; passwords are stripped at the filter step)` };
}

/** The oracle-side filter. Everything external is injected. Returns { created, kept }. Throws on any refusal. */
export function filterRolesFile({ inPath, outPath, oracleUrl, stackUrl = null, psql = "psql", spawn = spawnSync, read = readFileSync, write = writeFileSync }) {
  assertOracleUrl(oracleUrl, stackUrl);
  const existing = oracleRoleNames({ oracleUrl, psql, spawn });
  const r = filterRoles(read(inPath, "utf8"), existing);
  write(outPath, r.text, "utf8");
  return { created: r.created, kept: r.kept };
}

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

if (isMainModule(import.meta.url)) {
  const mode = process.argv[2];
  if (mode === "export") {
    const out = arg("--out") ? resolve(arg("--out")) : null;
    if (!out) { console.error("dump-roles export: --out <path> is required"); process.exit(2); }
    if (process.env.CHAIN_PROOF_LOCAL === "1") { console.error("dump-roles export: CHAIN_PROOF_LOCAL is 1; this step must run with production read credentials, not the local env"); process.exit(2); }
    mkdirSync(dirname(out), { recursive: true });
    const { default: pg } = await import("pg");
    const result = await exportRoles({ out, connect: async (opts) => { const c = new pg.Client(opts); await c.connect(); return c; } });
    (result.ok ? console.log : console.error)(`dump-roles export: ${result.message}`);
    process.exit(result.code);
  } else if (mode === "filter") {
    const inPath = arg("--in");
    const outPath = arg("--out");
    const oracleUrl = arg("--db-url") || process.env.PROOF_ORACLE_DB_URL;
    if (!inPath || !outPath || !oracleUrl) { console.error("dump-roles filter: --in, --out and --db-url (or PROOF_ORACLE_DB_URL) are required"); process.exit(2); }
    try {
      mkdirSync(dirname(resolve(outPath)), { recursive: true });
      const r = filterRolesFile({ inPath: resolve(inPath), outPath: resolve(outPath), oracleUrl, stackUrl: process.env.PROOF_DB_URL || null });
      console.log(`dump-roles filter: ${r.created.length} roles to create on the oracle (${r.created.join(", ") || "none"}); ${r.kept} statements kept`);
    } catch (e) { console.error(`dump-roles filter: ${String(e.message).replace(/postgres(?:ql)?:\/\/\S+/gi, "<url>")}`); process.exit(1); }
  } else { console.error("dump-roles: usage: dump-roles.mjs export --out <raw.sql> | filter --in <raw.sql> --out <roles.sql> --db-url <oracle url>"); process.exit(2); }
}
