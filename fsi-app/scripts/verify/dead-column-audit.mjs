// data-audit: label=dead-column hard=false
/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILL: remediation-discipline (section 4, sweep-before-claim;
 *  the column-grain sibling of F14's table-grain producer-consumer orphan check). Closes audit finding
 *  DEAD-1 (docs/audits/supabase-integrity-and-wiring-audit-2026-09-25.md): "no columns are confirmed dead
 *  or confirmed clean at full-schema scope" because the last dedicated sweep was migration 185 (2026-07)
 *  and nothing since. This audit is that sweep, made repeatable.
 *
 *  WHAT IT DOES (read-only): enumerate every column of every public base table via
 *  information_schema.columns (shared scan: lib/information-schema-scan.mjs, same module
 *  duplicate-table-audit.mjs uses), exclude PK/FK/generated/timestamp columns from scope (the audit's own
 *  scoping), grep the remaining columns' bare identifiers across src/, scripts/, supabase/functions, and
 *  migrations' non-DDL text (a column's own CREATE TABLE / ADD COLUMN clause is stripped first, so it is
 *  never counted as a "use" of itself), pure decision logic lives in lib/dead-column-scan.mjs (fixture-
 *  tested, no DB). A zero-hit column is a FINDING, not an auto-drop: dropping a column is a migration, a
 *  human/coordinator decision this read-only audit does not make.
 *
 *  hard=false (soft/informational) on this first run, deliberately: DEAD-1 is rated P2 in the source audit
 *  and this is the FIRST full-schema pass since migration 185, an unreviewed first count should not block
 *  the generation lane (Layer C block-state) before a human has looked at what it found. Promote to
 *  hard=true once a coordinator pass has triaged the first live count (open question, named in this lane's
 *  session-log entry).
 *
 *  Exit 0 = no dead columns found (net of allowlist); exit 1 = at least one (soft, reported, not gating
 *  while hard=false); exit 2 = no DB connection (cannot verify). Read-only: information_schema + fs read. */
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { connectPg } from '../lib/pg-conn.mjs';
import { loadLocalEnvFile } from '../lib/env-file.mjs';
import { walkFiles } from '../lib/walk-files.mjs';
import { fetchColumns, fetchPrimaryKeyColumns, fetchForeignKeys } from './lib/information-schema-scan.mjs';
import { scopedColumns, stripCreatingDdl, buildTokenSet, findDeadColumns, staleAllowlistEntries } from './lib/dead-column-scan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
loadLocalEnvFile();

const ALLOWLIST_PATH = resolve(ROOT, 'scripts/verify/dead-column-allowlist.json');
function loadAllowlist() {
  try {
    const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
    const { _comment, ...entries } = raw;
    return entries;
  } catch (e) {
    console.error(`dead-column-audit: failed to read allowlist ${ALLOWLIST_PATH}: ${e.message}`);
    return {};
  }
}

const CODE_EXT = new Set(['.ts', '.tsx', '.mjs', '.js', '.sql']);
const SKIP_DIR = new Set(['node_modules', '.next', '_snapshots', 'tmp', 'dist', '.git', 'harness-runs']);

/** Read the code corpus (src/, scripts/, supabase/functions) as-is, plus supabase/migrations with each
 * column's own creating DDL stripped out (so a column's CREATE TABLE / ADD COLUMN clause never counts as
 * a self-referential "use"). Returns an array of file-content strings for buildTokenSet(). */
function readCorpus() {
  const plainFiles = [];
  for (const d of ['src', 'scripts', 'supabase/functions']) walkFiles(join(ROOT, d), CODE_EXT, SKIP_DIR, plainFiles);
  const migrationFiles = walkFiles(join(ROOT, 'supabase/migrations'), CODE_EXT, SKIP_DIR, []);

  const contents = [];
  let filesRead = 0;
  for (const f of plainFiles) {
    try { contents.push(readFileSync(f, 'utf8')); filesRead++; } catch { /* unreadable, skip */ }
  }
  for (const f of migrationFiles) {
    try { contents.push(stripCreatingDdl(readFileSync(f, 'utf8'))); filesRead++; } catch { /* unreadable, skip */ }
  }
  return { contents, filesRead };
}

const client = await connectPg();
if (!client) {
  console.error('dead-column-audit: no direct-Postgres connection (SUPABASE_DB_URL/DATABASE_URL, local supabase link + SUPABASE_DB_PASSWORD, or NEXT_PUBLIC_SUPABASE_URL-derived pooler). Cannot verify against live schema, exit 2.');
  process.exit(2);
}

try {
  const [columns, primaryKeyColumns, foreignKeys] = await Promise.all([
    fetchColumns(client),
    fetchPrimaryKeyColumns(client),
    fetchForeignKeys(client),
  ]);
  const inScope = scopedColumns(columns, primaryKeyColumns, foreignKeys);
  const allowlist = loadAllowlist();
  const { contents, filesRead } = readCorpus();
  const tokenSet = buildTokenSet(contents);

  const dead = findDeadColumns({ columns: inScope, tokenSet, allowlist });
  const scopedKeys = new Set(inScope.map((c) => `${c.table}.${c.column}`));
  const stale = staleAllowlistEntries({ scopedKeys, allowlist });

  console.log(
    `dead-column-audit: ${columns.length} total columns, ${inScope.length} in scope (excl. PK/FK/generated/timestamp), ` +
    `${filesRead} corpus files scanned, ${Object.keys(allowlist).length} allowlisted.`,
  );

  if (dead.length === 0 && stale.length === 0) {
    console.log('PASS, every in-scope column has at least one code reference (or is reasonably allowlisted); no stale allowlist entries.');
    await client.end();
    process.exit(0);
  }

  if (dead.length) {
    console.error(`\nDEAD COLUMN(S), ${dead.length} in-scope column(s) with zero code references:`);
    for (const d of dead) console.error(`  ${d.table}.${d.column}, ${d.evidence}`);
    console.error('  Disposition: wire a reader/writer, drop the column via migration, or add a reasoned entry to scripts/verify/dead-column-allowlist.json (ADR/spec citation required).');
  }
  if (stale.length) {
    console.error(`\nSTALE ALLOWLIST, ${stale.length} entry(ies) no longer applicable:`);
    for (const s of stale) console.error(`  ${s.key}, ${s.reason}`);
  }
  await client.end();
  process.exit(1);
} catch (e) {
  console.error(`dead-column-audit: engine error, ${e instanceof Error ? e.message : String(e)}`);
  try { await client.end(); } catch { /* ignore */ }
  process.exit(2);
}
