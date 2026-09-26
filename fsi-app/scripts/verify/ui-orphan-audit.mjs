// data-audit: label=ui-orphan hard=false
/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILL: remediation-discipline (sweep-before-claim; the
 *  UI-side, FIELD-grain sibling of F14's table-grain producer-consumer orphan check). Closes audit
 *  coverage gap 5 (docs/audits/supabase-integrity-and-wiring-audit-2026-09-25.md, "Coverage check 5, *  unwired UI parts"): "a true UI-side checker ... does not exist yet and was not built in this discovery
 *  pass." Extends the F14 pattern per docs/plans/data-machine-tool-gaps-2026-09-25.md build order step 3.
 *
 *  WHAT IT DOES (read-only): scan UI-facing files (src/app/**\/route.ts, src/app/**\/page.tsx,
 *  src/components/**\/*.tsx, src/lib/supabase-server.ts, the server-data layer CLAUDE.md's own Key Files
 *  section names as feeding pages) for `.select("...")` calls, resolve each top-level select-list entry to
 *  a (table, column) pair (lib/ui-orphan-scan.mjs's parseSelectList, PostgREST-shaped: bare columns,
 *  alias:column, embed_table(nested...)); cross-reference each pair against a writer-column set built from
 *  the WHOLE code + SQL + migration-function corpus (object-literal keys of .insert/.update/.upsert and the
 *  guarded-write helpers, SQL INSERT/UPDATE column lists, and RPC calls joined to their own function body's
 *  writes). A pair selected by UI code with ZERO writers anywhere is a FINDING, the same concrete shape as
 *  audit findings RW-2/UI-3 (`state_cost_facts`, read by `/api/ask/route.ts` and `supabase-server.ts`,
 *  written by nothing).
 *
 *  Scope exclusions mirror dead-column-audit.mjs (PK/FK/generated/timestamp columns; reused via
 *  dead-column-scan.mjs's scopedColumns, those columns are "used" by a join/default/clock, not a literal
 *  write-site identifier, so this checker is the wrong instrument for them). Live schema comes from the
 *  same shared information-schema-scan.mjs both TOOL-GAP-2 audits already use (reuse-first, F45 ratchet).
 *
 *  hard=false (soft/informational) on this first run, same posture as dead-column-audit.mjs: an unreviewed
 *  first count should not block generation before a human/coordinator has triaged it. A finding here is
 *  decision-ready (wire a producer, or allowlist with an ADR/spec citation), never an auto-fix.
 *
 *  Exit 0 = no orphan UI-selected fields found (net of allowlist); exit 1 = at least one (soft, reported);
 *  exit 2 = no DB connection (cannot verify). Read-only: information_schema + fs read, no writes. */
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { connectPg } from '../lib/pg-conn.mjs';
import { loadLocalEnvFile } from '../lib/env-file.mjs';
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
loadLocalEnvFile();

const ALLOWLIST_PATH = resolve(ROOT, 'scripts/verify/ui-orphan-allowlist.json');
function loadAllowlist() {
  try {
    const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
    const { _comment, ...entries } = raw;
    return entries;
  } catch (e) {
    console.error(`ui-orphan-audit: failed to read allowlist ${ALLOWLIST_PATH}: ${e.message}`);
    return {};
  }
}

const CODE_EXT = new Set(['.ts', '.tsx', '.mjs', '.js']);
const SQL_EXT = new Set(['.sql']);
const SKIP_DIR = new Set(['node_modules', '.next', '_snapshots', 'tmp', 'dist', '.git', 'harness-runs']);

/** UI-facing scan roots: API routes + the server-data layer + components, the surfaces that render a
 * field to a customer or feed a page, not every code path that happens to `.select()` a table (that
 * broader, table-grain question is already F14's job). */
function readUiFiles() {
  const files = [];
  walkFiles(join(ROOT, 'src', 'app'), CODE_EXT, SKIP_DIR, files);
  walkFiles(join(ROOT, 'src', 'components'), CODE_EXT, SKIP_DIR, files);
  const out = [];
  for (const f of files) {
    if (!f.endsWith('route.ts') && !f.endsWith('page.tsx') && !f.includes(`${join('src', 'components')}`)) continue;
    try { out.push({ file: f.slice(ROOT.length + 1), content: readFileSync(f, 'utf8') }); } catch { /* skip */ }
  }
  const supabaseServer = join(ROOT, 'src', 'lib', 'supabase-server.ts');
  try { out.push({ file: 'src/lib/supabase-server.ts', content: readFileSync(supabaseServer, 'utf8') }); } catch { /* skip */ }
  return out;
}

/** Every code file (writer scan) and every SQL file (migrations + supabase/functions), for column-grain
 * write extraction. Broader than the UI scan roots, on purpose, a writer can live anywhere in the app,
 * a script, or an Edge Function. */
function readWriterCorpus() {
  const codeFiles = [];
  for (const d of ['src', 'scripts']) walkFiles(join(ROOT, d), CODE_EXT, SKIP_DIR, codeFiles);
  const sqlFiles = [];
  for (const d of ['supabase/migrations', 'supabase/functions']) walkFiles(join(ROOT, d), new Set([...SQL_EXT, '.ts']), SKIP_DIR, sqlFiles);

  const codeTexts = [];
  for (const f of codeFiles) { try { codeTexts.push(readFileSync(f, 'utf8')); } catch { /* skip */ } }
  const sqlTexts = [];
  for (const f of sqlFiles) { try { sqlTexts.push(readFileSync(f, 'utf8')); } catch { /* skip */ } }
  return { codeTexts, sqlTexts };
}

const client = await connectPg();
if (!client) {
  console.error('ui-orphan-audit: no direct-Postgres connection (SUPABASE_DB_URL/DATABASE_URL, local supabase link + SUPABASE_DB_PASSWORD, or NEXT_PUBLIC_SUPABASE_URL-derived pooler). Cannot verify against live schema, exit 2.');
  process.exit(2);
}

try {
  const [columns, primaryKeyColumns, foreignKeys] = await Promise.all([
    fetchColumns(client),
    fetchPrimaryKeyColumns(client),
    fetchForeignKeys(client),
  ]);
  const inScope = scopedColumns(columns, primaryKeyColumns, foreignKeys);
  const scopedKeys = new Set(inScope.map((c) => `${c.table}.${c.column}`));
  const allowlist = loadAllowlist();

  const uiFiles = readUiFiles();
  const { selected, rpcCalls } = scanUiSelects(uiFiles);

  const { codeTexts, sqlTexts } = readWriterCorpus();
  const writerColumns = new Set();
  const opaqueWriteTables = new Set();
  for (const t of codeTexts) {
    for (const wc of extractCodeWriteColumns(t)) writerColumns.add(`${wc.table}.${wc.column}`);
    for (const table of extractOpaqueWriteTables(t)) opaqueWriteTables.add(table);
  }
  for (const t of sqlTexts) for (const wc of extractSqlWriteColumns(t)) writerColumns.add(`${wc.table}.${wc.column}`);

  const rpcFunctionBodies = new Map();
  for (const t of sqlTexts) for (const [name, body] of extractFunctionBodies(t)) rpcFunctionBodies.set(name, (rpcFunctionBodies.get(name) ?? '') + body);

  const orphans = findUiOrphanFields({ uiSelected: selected, rpcCalls, writerColumns, opaqueWriteTables, rpcFunctionBodies, scopedKeys, allowlist });
  const stale = staleUiOrphanAllowlistEntries({ scopedKeys, writerColumns, allowlist });

  console.log(
    `ui-orphan-audit: ${uiFiles.length} UI-facing files scanned, ${selected.length} select-list entries parsed, ` +
    `${codeTexts.length + sqlTexts.length} writer-corpus files scanned, ${writerColumns.size} distinct writer-column keys, ` +
    `${opaqueWriteTables.size} table(s) with at least one opaque (non-literal-payload) write call, suppressed from column-level findings, ` +
    `${Object.keys(allowlist).length} allowlisted.`,
  );

  if (orphans.length === 0 && stale.length === 0) {
    console.log('PASS, every UI-selected in-scope field has at least one writer (or is reasonably allowlisted); no stale allowlist entries.');
    await client.end();
    process.exit(0);
  }

  if (orphans.length) {
    console.error(`\nUI-ORPHAN FIELD(S), ${orphans.length} UI-selected in-scope field(s) with zero writers:`);
    for (const o of orphans) console.error(`  ${o.table}.${o.column}, ${o.evidence}`);
    console.error('  Disposition: build the producer, or add a reasoned entry to scripts/verify/ui-orphan-allowlist.json (ADR/spec citation required).');
  }
  if (stale.length) {
    console.error(`\nSTALE ALLOWLIST, ${stale.length} entry(ies) no longer applicable:`);
    for (const s of stale) console.error(`  ${s.key}, ${s.reason}`);
  }
  await client.end();
  process.exit(1);
} catch (e) {
  console.error(`ui-orphan-audit: engine error, ${e instanceof Error ? e.message : String(e)}`);
  try { await client.end(); } catch { /* ignore */ }
  process.exit(2);
}
