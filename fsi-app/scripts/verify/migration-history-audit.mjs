// data-audit: label=migration-history hard=true
/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILL: remediation-discipline.
 *  MIGRATION-HISTORY AUDIT (lane MIG-HIST-1, 2026-10-07; invariant RD-94).
 *
 *  WHY THIS EXISTS. On 2026-10-07 a read-only export of production's supabase_migrations.schema_migrations
 *  (352 rows) against the repo (323 files) found 45 applied rows with no file, 16 files with no row, 61 pairs
 *  whose code differs, and 112 rows that stored no SQL at all. Nothing compared the applied-migration table to the files: the
 *  inventory generator reads files only, F24 compares live objects to files, and the duplicate-prefix scan
 *  was report-only. This audit is that comparison, run where the database password is.
 *
 *  WHAT IT CHECKS (every failure is named; the map is fsi-app/supabase/migrations/APPLIED-MAP.json):
 *    LEDGER_ROW_NOT_IN_MAP   an applied row with no map entry.
 *    MAP_ROW_NOT_IN_LEDGER   a map entry for a version the ledger does not hold (stale map).
 *    NO_FILE_NO_SUPERSEDER   a map entry whose file, or whose superseded_by file, is not in the repo.
 *    FILE_NOT_ACCOUNTED      a repo .sql file that no entry names (a ledger row, a superseder, or a keyed file
 *                            entry) AND whose own header does not say NOT APPLIED. A file the map names nowhere
 *                            whose header says so is never-applied BY DERIVATION (derivesNeverApplied in
 *                            supabase/migrations/_lib/applied-status.mjs, the one site; lane MIGTEST-1, 2026-10-08):
 *                            reported as a finding, not a failure. The only failure is an unmapped file without that header.
 *    NEVER_ENTRY_COMMITTED   a map entry of class never-applied: such files are derived from their header and are not
 *                            committed (the map was a shared-append file, one line per new migration).
 *    FILE_STATUS_HEADER      a keyed file entry whose first-line status does not match its class, or a file that
 *                            carries an outside-ledger or duplicate-prefix first-line status but is not in the map.
 *    CODE_DIFFERS            a ledger row that stores statements whose text differs from its file in code
 *                            (same normalisation as the export: comments, whitespace, semicolons and a
 *                            BEGIN/COMMIT wrapper are ignored; see scripts/migrations/migration-compare.mjs).
 *    MAP_CLASS_STALE         the map's class disagrees with what the ledger holds now.
 *    RECOVERED_BODY          a recovered file whose body hash is not its header's, or whose statements the
 *                            ledger does not hold.
 *  FINDINGS (reported, never a pass and never a failure): every outside-ledger file is "objects unverified";
 *  wiring F24's object check into this audit is owed to a follow-up.
 *
 *  EXPECTED RESULT OF THE FIRST LIVE RUN: FAIL, on CODE_DIFFERS for the code-differs rows the map lists, until
 *  lane MIG-HIST-2 reconciles them. That red is the point: it is the measured gap, not a defect of the audit.
 *
 *  Three states (the sibling convention): exit 0 = no failure; exit 1 = at least one failure; exit 2 = no
 *  database credentials or an engine error (cannot verify). Read-only. The pure core (evaluateHistory) has no
 *  pg import, so the fixture test runs in the no-npm suite; the connection lives behind the main guard. */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { isMainModule } from "../lib/is-main.mjs";
import {
  compareStored,
  isApplyRecordStub,
  recoveredBody,
  statementsContained,
  statusClassOfFile,
} from "../migrations/migration-compare.mjs";
import { derivesNeverApplied } from "../../supabase/migrations/_lib/applied-status.mjs";
import { MIG_DIR, ledgerKeys, fileEntries } from "../migrations/build-applied-map.mjs";

const FILE_CLASSES = new Set(["identical", "comments-only", "code-differs", "recovered", "statements-null", "apply-record-stub"]);
const SUPERSEDER_CLASSES = new Set(["superseded-by", "data-only", "comment-only"]);
const COMPARED = new Set(["identical", "comments-only", "code-differs"]);

/**
 * Pure core.
 * @param {{ ledger: {version:string,name:string,statements:string|null}[], files: Map<string,string>, map: object }} p
 *   files: file name (no directory) to its text.
 * @returns {{ ok: boolean, failures: {code:string,key:string,detail:string}[], findings: string[], counts: object }}
 */
export function evaluateHistory({ ledger, files, map }) {
  const failures = [];
  const findings = [];
  const fail = (code, key, detail) => failures.push({ code, key, detail });
  const rows = new Map(ledger.map((r) => [r.version, r]));
  const mapVersions = ledgerKeys(map);
  const fwr = fileEntries(map);
  const named = new Set();

  for (const r of ledger) if (!(r.version in map)) fail("LEDGER_ROW_NOT_IN_MAP", r.version, `${r.name} has no entry in APPLIED-MAP.json`);

  for (const v of mapVersions) {
    const e = map[v];
    const row = rows.get(v);
    if (!row) { fail("MAP_ROW_NOT_IN_LEDGER", v, `${e.name} is in the map but not in the ledger`); continue; }
    if (e.file) named.add(e.file);
    if (e.superseded_by) named.add(e.superseded_by);

    if (FILE_CLASSES.has(e.class)) {
      if (!e.file || !files.has(e.file)) { fail("NO_FILE_NO_SUPERSEDER", v, `class ${e.class} needs file ${e.file ?? "null"}, which is not in the repo`); continue; }
    } else if (SUPERSEDER_CLASSES.has(e.class)) {
      if (!e.superseded_by || !files.has(e.superseded_by)) { fail("NO_FILE_NO_SUPERSEDER", v, `class ${e.class} needs superseded_by ${e.superseded_by ?? "null"}, which is not in the repo`); continue; }
    } else {
      fail("MAP_CLASS_STALE", v, `unknown class ${JSON.stringify(e.class)}`);
      continue;
    }

    const stored = row.statements;
    if (e.class === "statements-null") {
      if (stored != null) fail("MAP_CLASS_STALE", v, "map says the ledger stored no SQL, but it now holds statements");
    } else if (e.class === "apply-record-stub") {
      if (stored == null || !isApplyRecordStub(stored)) fail("MAP_CLASS_STALE", v, "map says the ledger stored an apply-record note, but it does not");
    } else if (COMPARED.has(e.class)) {
      if (stored == null || isApplyRecordStub(stored)) { fail("MAP_CLASS_STALE", v, `map says ${e.class}, but the ledger stores no comparable SQL`); continue; }
      const live = compareStored(stored, files.get(e.file)).kind;
      if (live === "code-differs") fail("CODE_DIFFERS", v, `${e.name}: the stored statements differ from ${e.file} in code`);
      else if (e.class === "code-differs") fail("MAP_CLASS_STALE", v, `map says code-differs but the text now matches (${live}); regenerate the map`);
    } else if (e.class === "recovered") {
      const text = files.get(e.file);
      const body = recoveredBody(text);
      const shaLine = text.split("\n").find((l) => l.startsWith("-- body-sha256: "));
      if (body == null || !shaLine) { fail("RECOVERED_BODY", v, `${e.file} has no recovered-body marker or no body-sha256 header`); continue; }
      const sha = createHash("sha256").update(body).digest("hex");
      if (shaLine.slice("-- body-sha256: ".length).trim() !== sha) fail("RECOVERED_BODY", v, `${e.file} body does not match its header hash`);
      if (stored == null || !statementsContained(body, stored)) fail("RECOVERED_BODY", v, `${e.file} holds a statement the ledger row does not`);
    }
  }

  const fwrNames = new Set(fwr.map((f) => f.file));
  for (const f of fwr) {
    const name = f.file;
    if (!files.has(name)) { fail("FILE_STATUS_HEADER", name, "keyed as a file without a ledger row but not in the repo"); continue; }
    named.add(name);
    const text = files.get(name);
    if (f.class === "never-applied") { fail("NEVER_ENTRY_COMMITTED", name, "a never-applied entry is committed in the map; such files are derived from their own NOT APPLIED header, so remove the entry"); continue; }
    const cls = statusClassOfFile(text);
    if (cls !== f.class) fail("FILE_STATUS_HEADER", name, `first-line status is ${cls ?? "absent"}, the map says ${f.class}`);
    if (f.class === "outside-ledger") findings.push(`OBJECTS_UNVERIFIED ${name}: applied outside the ledger per ${(f.note ?? "").split(";")[0]}; whether its objects exist is not checked here`);
    if (f.class === "duplicate-prefix") findings.push(`OBJECTS_UNVERIFIED ${name}: duplicate prefix with no ledger row; whether its objects exist is not checked here`);
  }

  for (const [name, text] of files) {
    if (!named.has(name)) {
      if (derivesNeverApplied(text)) findings.push(`NEVER_APPLIED ${name}: no ledger row and no map entry; its own header says it is not applied`);
      else fail("FILE_NOT_ACCOUNTED", name, "no ledger row, no superseded_by, no keyed file entry, and its header does not say NOT APPLIED");
    }
    const cls = statusClassOfFile(text);
    if (cls && cls !== "applied-under-ledger" && cls !== "never-applied" && !fwrNames.has(name)) fail("FILE_STATUS_HEADER", name, `carries a ${cls} first-line status but has no keyed file entry`);
  }

  const counts = {};
  for (const v of mapVersions) counts[map[v].class] = (counts[map[v].class] ?? 0) + 1;
  counts.ledger_rows = ledger.length;
  counts.files = files.size;
  return { ok: failures.length === 0, failures, findings, counts };
}

/** Read every .sql file in the migrations directory (CRLF folded to LF). */
export function readMigrationFiles(dir = MIG_DIR) {
  const out = new Map();
  for (const f of readdirSync(dir)) if (f.endsWith(".sql")) out.set(f, readFileSync(resolve(dir, f), "utf8").replace(/\r\n/g, "\n"));
  return out;
}

/** Ledger rows as the pure core wants them: statements joined into one text, or null. */
export function ledgerFromRows(rows) {
  return rows.map((r) => ({
    version: r.version,
    name: r.name ?? "",
    statements: Array.isArray(r.statements) && r.statements.length ? r.statements.join(";\n") : null,
  }));
}

/**
 * The CLI body with its dependencies injected (the repo convention), so the credential-absent path and the
 * report are exercised by a test without a database or the pg package.
 * @param {{ connect: () => Promise<{query: Function, end: Function}|null>, migDir?: string, log?: Function, err?: Function }} deps
 * @returns {Promise<number>} the exit code (0 pass, 1 fail, 2 cannot verify)
 */
export async function run({ connect, migDir = MIG_DIR, log = console.log, err = console.error }) {
  const client = await connect();
  if (!client) {
    err("migration-history-audit: no direct-Postgres connection (SUPABASE_DB_URL/DATABASE_URL, local supabase link + SUPABASE_DB_PASSWORD, or NEXT_PUBLIC_SUPABASE_URL-derived pooler). Cannot verify; exit 2.");
    return 2;
  }
  try {
    const { rows } = await client.query("SELECT version, name, statements FROM supabase_migrations.schema_migrations ORDER BY version");
    const map = JSON.parse(readFileSync(resolve(migDir, "APPLIED-MAP.json"), "utf8"));
    const result = evaluateHistory({ ledger: ledgerFromRows(rows), files: readMigrationFiles(migDir), map });
    log("-------- migration history: ledger vs files vs APPLIED-MAP.json --------");
    log(JSON.stringify(result.counts));
    for (const f of result.findings) log(`FINDING  ${f}`);
    for (const f of result.failures) log(`FAIL  ${f.code}  ${f.key}: ${f.detail}`);
    log(result.ok ? "PASS  the ledger, the files and the map agree." : `FAIL  ${result.failures.length} disagreement(s).`);
    return result.ok ? 0 : 1;
  } catch (e) {
    err(`migration-history-audit: engine error: ${e.message}`);
    return 2;
  } finally {
    await client.end();
  }
}

if (isMainModule(import.meta.url)) {
  const { loadLocalEnvFile } = await import("../lib/env-file.mjs");
  loadLocalEnvFile();
  const { connectPg } = await import("../lib/pg-conn.mjs");
  process.exit(await run({ connect: connectPg }));
}
