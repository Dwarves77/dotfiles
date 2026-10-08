#!/usr/bin/env node
// dump-production-schema.mjs -- a SCHEMA-ONLY dump of production, to runner disk only (lane PROOF-1, coordinator
// ruling 2026-10-07; docs/decisions/ADR-045-chain-proof-on-a-local-stack.md).
//
// The migration files do not reproduce production (352 applied rows, names diverging from file names, 46 rows with
// no file, 17 files with no applied row), so the chain proof's schema is production's own, dumped here and applied
// to the local stack by apply-schema-dump.mjs. This script runs in the export step, the only step that holds
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_PASSWORD.
//
// HOW. It takes the first production connection candidate that connects (the same candidate list scripts/lib/
// pg-conn.mjs derives: the direct host, then the regional poolers), then runs
//   supabase db dump --db-url <candidate> -f <out>
// The CLI dumps SCHEMA ONLY by default (data needs --data-only, roles need --role-only; neither is passed) and
// excludes the Supabase-managed schemas by design. Flags read from the CLI's documented set: --db-url, -f/--file.
// [HYPOTHESIS until the first run] the installed CLI's default is schema only and it needs Docker (the runner has
// it); the sanity check below refuses a dump that carries table data.
//
// SAFETY. The dump goes only to --out (the workflow points it under RUNNER_TEMP, never the workspace, never an
// artifact, deleted at teardown). Nothing prints a connection string or a password: CLI output is redacted before
// it is shown. The result record (dump-production-schema step record, counts only) holds no schema text.
//
// Exit: 0 = dump written and sane; 1 = no candidate connected, the CLI failed, or the dump failed the sanity check;
//       2 = usage error.

import { spawnSync } from "node:child_process";
import { readFileSync, statSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { candidateConnStrings, connectOptionsFor } from "../lib/pg-conn.mjs";
import { isMainModule } from "../lib/is-main.mjs";

/** Redact connection strings and the password (raw and URL-encoded) from text. PURE. */
export function redact(text, env = process.env) {
  let out = String(text ?? "").replace(/postgres(?:ql)?:\/\/\S+/gi, "<url>");
  const pw = env.SUPABASE_DB_PASSWORD;
  if (pw) for (const v of new Set([pw, encodeURIComponent(pw)])) out = out.split(v).join("<password>");
  return out;
}

/** Sanity-check a schema-only dump. PURE. Returns { ok, reasons, tables }. */
export function checkDump(text) {
  const reasons = [];
  const lines = String(text ?? "").split(/\r?\n/);
  const tables = lines.filter((l) => /^CREATE TABLE /.test(l)).length;
  if (tables === 0) reasons.push("the dump has no CREATE TABLE statement");
  if (lines.some((l) => /^COPY .* FROM stdin;/.test(l))) reasons.push("the dump carries table data (a COPY block): it is not schema only");
  if (lines.some((l) => /^CREATE ROLE /.test(l))) reasons.push("the dump creates roles: roles must be excluded");
  return { ok: reasons.length === 0, reasons, tables };
}

/** Find the first candidate that connects. `connect` is injectable: (opts) => Promise<{ end }>. */
export async function firstWorkingCandidate(candidates, connect) {
  for (let i = 0; i < candidates.length; i++) {
    try {
      const c = await connect(connectOptionsFor(candidates[i]));
      try { await c.end(); } catch { /* ignore */ }
      return { index: i, url: candidates[i] };
    } catch { /* try the next */ }
  }
  return null;
}

/** Dump through the CLI. `spawn` is injectable. */
export function runDump({ url, out, spawn = spawnSync }) {
  const r = spawn("supabase", ["db", "dump", "--db-url", url, "-f", out], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: r.error ? 127 : r.status, stderr: `${r.stderr ?? ""}${r.error ? `\ncould not run supabase: ${r.error.message}` : ""}` };
}

/** The whole job with everything external injected. Returns { ok, code, message, tables }. */
export async function dumpProductionSchema({ env = process.env, out, connect, spawn = spawnSync, read = readFileSync, size = (p) => statSync(p).size }) {
  const candidates = candidateConnStrings(env);
  if (candidates.length === 0) return { ok: false, code: 1, message: "no production connection candidate (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD are needed)" };
  const found = await firstWorkingCandidate(candidates, connect);
  if (!found) return { ok: false, code: 1, message: `none of ${candidates.length} production candidates connected` };
  const r = runDump({ url: found.url, out, spawn });
  if (r.status !== 0) return { ok: false, code: 1, message: `supabase db dump failed (exit ${r.status}): ${redact(r.stderr, env).trim().split(/\r?\n/).slice(-3).join(" | ").slice(0, 400)}` };
  let text;
  try { text = read(out, "utf8"); } catch (e) { return { ok: false, code: 1, message: `the dump file could not be read: ${e.message}` }; }
  const check = checkDump(text);
  if (!check.ok) return { ok: false, code: 1, message: `the dump failed its sanity check: ${check.reasons.join("; ")}` };
  return { ok: true, code: 0, message: `schema-only dump written (${check.tables} tables, ${size(out)} bytes, candidate ${found.index + 1} of ${candidates.length})`, tables: check.tables };
}

if (isMainModule(import.meta.url)) {
  const i = process.argv.indexOf("--out");
  const out = i >= 0 ? resolve(process.argv[i + 1]) : null;
  if (!out) { console.error("dump-production-schema: --out <path> is required"); process.exit(2); }
  if (process.env.CHAIN_PROOF_LOCAL === "1") { console.error("dump-production-schema: CHAIN_PROOF_LOCAL is 1; this step must run with production read credentials, not the local env"); process.exit(2); }
  mkdirSync(dirname(out), { recursive: true });
  const { default: pg } = await import("pg");
  const result = await dumpProductionSchema({
    out,
    connect: async (opts) => { const c = new pg.Client(opts); await c.connect(); return c; },
  });
  (result.ok ? console.log : console.error)(`dump-production-schema: ${result.message}`);
  process.exit(result.code);
}
