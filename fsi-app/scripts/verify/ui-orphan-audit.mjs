// data-audit: label=ui-orphan hard=true
/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILL: remediation-discipline (sweep-before-claim; the
 *  UI-side, FIELD-grain sibling of F14's table-grain producer-consumer orphan check). Closes audit
 *  coverage gap 5 (docs/audits/supabase-integrity-and-wiring-audit-2026-09-25.md, coverage check 5,
 *  unwired UI parts): a UI-facing read of a field that nothing writes. Extends the F14 pattern per
 *  docs/plans/data-machine-tool-gaps-2026-09-25.md build order step 3.
 *
 *  WHAT IT DOES (read-only): scan UI-facing files (src/app route.ts and page.tsx, src/components tsx,
 *  src/lib/supabase-server.ts, the server-data layer CLAUDE.md's own Key Files section names as feeding
 *  pages) for `.select("...")` calls, resolve each top-level select-list entry to a (table, column) pair
 *  (lib/ui-orphan-scan.mjs's parseSelectList, PostgREST-shaped: bare columns, alias:column,
 *  embed_table(nested...)); cross-reference each pair against a writer-column set built from the WHOLE
 *  code + SQL + migration-function corpus (object-literal keys of .insert/.update/.upsert and the
 *  guarded-write helpers, SQL INSERT/UPDATE column lists, and RPC calls joined to their own function
 *  body's writes). A pair selected by UI code with ZERO writers anywhere is a FINDING, the same concrete
 *  shape as audit findings RW-2/UI-3 (`state_cost_facts`, read by `/api/ask/route.ts` and
 *  `supabase-server.ts`, written by nothing).
 *
 *  THE REGISTER (lane AUDWIRE-1, 2026-10-08, VERIFY-1 register row B-3): the audit also ENUMERATES every
 *  in-scope UI-selected field as one row: component (the UI file), prop (the select-list entry the
 *  component binds), bound column (table.column), producer present (yes or no) and the basis for that
 *  answer. The producer=no rows are the B-3 field list. The full register is written to ARTIFACT_PATH
 *  (fsi-app/.discipline/out/, gitignored regenerable machine evidence, CLAUDE.md rule 5; the data-audit lane
 *  workflow uploads it as an artifact, 7 day retention per F68) and the producer=no rows are also printed to
 *  the job log.
 *
 *  Scope exclusions mirror dead-column-audit.mjs (PK/FK/generated/timestamp columns; reused via
 *  dead-column-scan.mjs's scopedColumns, those columns are "used" by a join/default/clock, not a literal
 *  write-site identifier, so this checker is the wrong instrument for them). Live schema comes from the
 *  same shared information-schema-scan.mjs both TOOL-GAP-2 audits already use (reuse-first, F45 ratchet).
 *
 *  hard=true since AUDWIRE-1: a verifier run by no lane that can fail is not a proof (CLAUDE.md rule 15).
 *  A finding is decision-ready (build the producer, or allowlist with an ADR or spec citation), never an
 *  auto-fix.
 *
 *  Exit 0 = no orphan UI-selected fields found (net of allowlist) and no stale allowlist entry;
 *  exit 1 = at least one; exit 2 = no DB connection (cannot verify, a self-skip, never a false green) or
 *  an engine error. Read-only: information_schema + fs read, no database writes. */
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { connectPg } from '../lib/pg-conn.mjs';
import { loadLocalEnvFile } from '../lib/env-file.mjs';
import { isMainModule } from '../lib/is-main.mjs';
import { walkFiles } from '../lib/walk-files.mjs';
import { fetchColumns, fetchPrimaryKeyColumns, fetchForeignKeys } from './lib/information-schema-scan.mjs';
import { scopedColumns } from './lib/dead-column-scan.mjs';
import {
  scanUiSelects,
  extractCodeWriteColumns,
  extractOpaqueWriteTables,
  extractSqlWriteColumns,
  extractFunctionBodies,
  findUiOrphanFields,
  staleUiOrphanAllowlistEntries,
} from './lib/ui-orphan-scan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const ALLOWLIST_PATH = resolve(ROOT, 'scripts/verify/ui-orphan-allowlist.json');
/** The register the audit writes on every completed run (path relative to fsi-app; .discipline/out/ is gitignored, the same out directory the fitness firings use, and the data-audit lane workflow uploads it). */
export const ARTIFACT_PATH = '.discipline/out/ui-orphan-register.md';

const CODE_EXT = new Set(['.ts', '.tsx', '.mjs', '.js']);
const SQL_EXT = new Set(['.sql']);
const SKIP_DIR = new Set(['node_modules', '.next', '_snapshots', 'tmp', 'dist', '.git', 'harness-runs']);

function loadAllowlist(path = ALLOWLIST_PATH) {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const { _comment, ...entries } = raw;
    return entries;
  } catch (e) {
    console.error(`ui-orphan-audit: failed to read allowlist ${path}: ${e.message}`);
    return {};
  }
}

/** UI-facing scan roots: API routes + the server-data layer + components, the surfaces that render a
 * field to a customer or feed a page, not every code path that happens to `.select()` a table (that
 * broader, table-grain question is already F14's job). */
function readUiFiles(root = ROOT) {
  const files = [];
  walkFiles(join(root, 'src', 'app'), CODE_EXT, SKIP_DIR, files);
  walkFiles(join(root, 'src', 'components'), CODE_EXT, SKIP_DIR, files);
  const out = [];
  for (const f of files) {
    if (!f.endsWith('route.ts') && !f.endsWith('page.tsx') && !f.includes(`${join('src', 'components')}`)) continue;
    try { out.push({ file: f.slice(root.length + 1), content: readFileSync(f, 'utf8') }); } catch { /* skip */ }
  }
  const supabaseServer = join(root, 'src', 'lib', 'supabase-server.ts');
  try { out.push({ file: 'src/lib/supabase-server.ts', content: readFileSync(supabaseServer, 'utf8') }); } catch { /* skip */ }
  return out;
}

/** Every code file (writer scan) and every SQL file (migrations + supabase/functions), for column-grain
 * write extraction. Broader than the UI scan roots, on purpose, a writer can live anywhere in the app,
 * a script, or an Edge Function. */
function readWriterCorpus(root = ROOT) {
  const codeFiles = [];
  for (const d of ['src', 'scripts']) walkFiles(join(root, d), CODE_EXT, SKIP_DIR, codeFiles);
  const sqlFiles = [];
  for (const d of ['supabase/migrations', 'supabase/functions']) walkFiles(join(root, d), new Set([...SQL_EXT, '.ts']), SKIP_DIR, sqlFiles);

  const codeTexts = [];
  for (const f of codeFiles) { try { codeTexts.push(readFileSync(f, 'utf8')); } catch { /* skip */ } }
  const sqlTexts = [];
  for (const f of sqlFiles) { try { sqlTexts.push(readFileSync(f, 'utf8')); } catch { /* skip */ } }
  return { codeTexts, sqlTexts };
}

/** Reduce the writer corpus text to the three structures the decision needs. PURE. */
export function buildWriterIndex({ codeTexts, sqlTexts }) {
  const writerColumns = new Set();
  const opaqueWriteTables = new Set();
  for (const t of codeTexts) {
    for (const wc of extractCodeWriteColumns(t)) writerColumns.add(`${wc.table}.${wc.column}`);
    for (const table of extractOpaqueWriteTables(t)) opaqueWriteTables.add(table);
  }
  for (const t of sqlTexts) for (const wc of extractSqlWriteColumns(t)) writerColumns.add(`${wc.table}.${wc.column}`);
  const rpcFunctionBodies = new Map();
  for (const t of sqlTexts) for (const [name, body] of extractFunctionBodies(t)) rpcFunctionBodies.set(name, (rpcFunctionBodies.get(name) ?? '') + body);
  return { writerColumns, opaqueWriteTables, rpcFunctionBodies };
}

/**
 * The B-3 register. One row per (component, bound column) for every in-scope UI-selected field.
 *   producer 'yes': a column-level writer exists (basis 'column-writer'), or the table has a write call
 *     whose payload this parser cannot trace (basis 'opaque-table-write', never a finding, same posture as
 *     findUiOrphanFields).
 *   producer 'no': basis 'allowlisted' (a reasoned entry in ui-orphan-allowlist.json, not a finding) or
 *     basis 'none' (a FINDING).
 * The verdict is taken from findUiOrphanFields itself (called with no allowlist and no opaque tables to
 * learn which keys have no column-level writer), so the register and the finding list can never disagree
 * about what counts as a producer. PURE.
 * @returns {{ rows: Array<{component:string, prop:string, boundColumn:string, producer:'yes'|'no', basis:string}>, findings: Array<object>, outOfScope: number }}
 */
export function buildRegister({ uiSelected, rpcCalls, writerColumns, opaqueWriteTables = new Set(), rpcFunctionBodies, scopedKeys, allowlist = {} }) {
  const noColumnWriter = findUiOrphanFields({ uiSelected, rpcCalls, writerColumns, opaqueWriteTables: new Set(), rpcFunctionBodies, scopedKeys, allowlist: {} });
  const noColumnWriterKeys = new Set(noColumnWriter.map((o) => `${o.table}.${o.column}`));
  const rows = [];
  const seen = new Set();
  let outOfScope = 0;
  for (const { table, column, file } of uiSelected) {
    const boundColumn = `${table}.${column}`;
    if (!scopedKeys.has(boundColumn)) { outOfScope++; continue; }
    const rowKey = `${file}\u0000${boundColumn}`;
    if (seen.has(rowKey)) continue;
    seen.add(rowKey);
    let producer; let basis;
    if (!noColumnWriterKeys.has(boundColumn)) { producer = 'yes'; basis = 'column-writer'; }
    else if (Object.prototype.hasOwnProperty.call(allowlist, boundColumn)) { producer = 'no'; basis = 'allowlisted'; }
    else if (opaqueWriteTables.has(table)) { producer = 'yes'; basis = 'opaque-table-write'; }
    else { producer = 'no'; basis = 'none'; }
    rows.push({ component: file, prop: column, boundColumn, producer, basis });
  }
  rows.sort((a, b) => (a.producer === b.producer ? 0 : a.producer === 'no' ? -1 : 1)
    || a.boundColumn.localeCompare(b.boundColumn) || a.component.localeCompare(b.component));
  const findings = findUiOrphanFields({ uiSelected, rpcCalls, writerColumns, opaqueWriteTables, rpcFunctionBodies, scopedKeys, allowlist });
  return { rows, findings, outOfScope };
}

/** Write the register to relPath under root, creating the directory. The one fs write this audit makes. */
export function writeRegisterFile(root, relPath, text) {
  const abs = resolve(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  return abs;
}

/** Render the register as a markdown table. PURE. */
export function renderRegister(rows, meta = {}) {
  const no = rows.filter((r) => r.producer === 'no');
  const lines = [
    '# UI-orphan register (written by scripts/verify/ui-orphan-audit.mjs)',
    '',
    `Rows: ${rows.length} in-scope UI-selected fields; producer present no: ${no.length} (findings ${rows.filter((r) => r.basis === 'none').length}, allowlisted ${rows.filter((r) => r.basis === 'allowlisted').length}).`,
  ];
  if (meta.generatedAt) lines.push(`Generated: ${meta.generatedAt}`);
  lines.push('', '| component | prop | bound column | producer present | basis |', '|---|---|---|---|---|');
  for (const r of rows) lines.push(`| ${r.component} | ${r.prop} | ${r.boundColumn} | ${r.producer} | ${r.basis} |`);
  return `${lines.join('\n')}\n`;
}

/**
 * Run the audit. Every dependency is injectable so a test runs it with fixtures and no database.
 * @param {object} [deps]
 * @returns {Promise<number>} the exit code
 */
export async function runAudit(deps = {}) {
  const {
    log = (m) => console.log(m),
    errorLog = (m) => console.error(m),
    loadEnv = loadLocalEnvFile,
    connect = connectPg,
    readSchema = async (client) => Promise.all([fetchColumns(client), fetchPrimaryKeyColumns(client), fetchForeignKeys(client)]),
    readUi = readUiFiles,
    readCorpus = readWriterCorpus,
    readAllowlist = loadAllowlist,
    writeArtifact = (relPath, text) => writeRegisterFile(ROOT, relPath, text),
    now = () => new Date().toISOString(),
  } = deps;

  loadEnv();
  const client = await connect();
  if (!client) {
    errorLog('ui-orphan-audit: no direct-Postgres connection (SUPABASE_DB_URL/DATABASE_URL, local supabase link + SUPABASE_DB_PASSWORD, or NEXT_PUBLIC_SUPABASE_URL-derived pooler). Cannot verify against live schema, exit 2.');
    return 2;
  }

  try {
    const [columns, primaryKeyColumns, foreignKeys] = await readSchema(client);
    const inScope = scopedColumns(columns, primaryKeyColumns, foreignKeys);
    const scopedKeys = new Set(inScope.map((c) => `${c.table}.${c.column}`));
    const allowlist = readAllowlist();

    const uiFiles = readUi();
    const { selected, rpcCalls } = scanUiSelects(uiFiles);
    const corpus = readCorpus();
    const { writerColumns, opaqueWriteTables, rpcFunctionBodies } = buildWriterIndex(corpus);

    const { rows, findings, outOfScope } = buildRegister({ uiSelected: selected, rpcCalls, writerColumns, opaqueWriteTables, rpcFunctionBodies, scopedKeys, allowlist });
    const stale = staleUiOrphanAllowlistEntries({ scopedKeys, writerColumns, allowlist });

    log(
      `ui-orphan-audit: ${uiFiles.length} UI-facing files scanned, ${selected.length} select-list entries parsed, ` +
      `${corpus.codeTexts.length + corpus.sqlTexts.length} writer-corpus files scanned, ${writerColumns.size} distinct writer-column keys, ` +
      `${opaqueWriteTables.size} table(s) with at least one opaque (non-literal-payload) write call, suppressed from column-level findings, ` +
      `${Object.keys(allowlist).length} allowlisted.`,
    );
    log(`ui-orphan-audit: register ${rows.length} in-scope field row(s), ${rows.filter((r) => r.producer === 'no').length} with no producer, ${outOfScope} out-of-scope select entr${outOfScope === 1 ? 'y' : 'ies'} (PK/FK/generated/timestamp or not a column).`);

    try {
      writeArtifact(ARTIFACT_PATH, renderRegister(rows, { generatedAt: now() }));
      log(`ui-orphan-audit: register written to ${ARTIFACT_PATH}`);
    } catch (e) {
      errorLog(`ui-orphan-audit: could not write the register to ${ARTIFACT_PATH}: ${e instanceof Error ? e.message : String(e)} (verdict unaffected; the producer=no rows are printed below)`);
    }
    const noProducer = rows.filter((r) => r.producer === 'no');
    if (noProducer.length) {
      log('ui-orphan-audit: producer present = no (component | prop | bound column | basis):');
      for (const r of noProducer) log(`  ${r.component} | ${r.prop} | ${r.boundColumn} | ${r.basis}`);
    }

    if (findings.length === 0 && stale.length === 0) {
      log('PASS, every UI-selected in-scope field has at least one writer (or is reasonably allowlisted); no stale allowlist entries.');
      return 0;
    }

    if (findings.length) {
      errorLog(`\nUI-ORPHAN FIELD(S), ${findings.length} UI-selected in-scope field(s) with zero writers:`);
      for (const o of findings) errorLog(`  ${o.table}.${o.column}, ${o.evidence}`);
      errorLog('  Disposition: build the producer, or add a reasoned entry to scripts/verify/ui-orphan-allowlist.json (ADR/spec citation required).');
    }
    if (stale.length) {
      errorLog(`\nSTALE ALLOWLIST, ${stale.length} entry(ies) no longer applicable:`);
      for (const s of stale) errorLog(`  ${s.key}, ${s.reason}`);
    }
    return 1;
  } catch (e) {
    errorLog(`ui-orphan-audit: engine error, ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

if (isMainModule(import.meta.url)) {
  runAudit().then((code) => process.exit(code));
}
