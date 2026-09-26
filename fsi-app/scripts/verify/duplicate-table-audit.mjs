// data-audit: label=duplicate-table hard=false
/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILL: remediation-discipline (section 4, the "F45-shaped
 *  structural comparison" audit finding DUP-1 itself calls for). Closes DUP-1
 *  (docs/audits/supabase-integrity-and-wiring-audit-2026-09-25.md): a manual read of ~100 table comments
 *  found six candidate pairs and closed all six as intentionally-parallel, but named its own scaling limit
 *, "comment-reading does not scale past ~100 tables" and would miss an accidental duplication introduced
 *  without an honest comment. This audit replaces that manual read with a structural comparison.
 *
 *  WHAT IT DOES (read-only): fetch every column and FK edge of every public base table via
 *  information_schema (shared scan: lib/information-schema-scan.mjs, same module dead-column-audit.mjs
 *  uses), then flag any table pair whose column-name sets or FK-target-table sets are similar enough to
 *  look like the same role played twice (pure decision logic: lib/duplicate-table-scan.mjs, fixture-tested,
 *  no DB). A flagged pair is a CANDIDATE, not a verdict, DUP-1's own six reviewed pairs are seeded into
 *  scripts/verify/duplicate-table-allowlist.json with their citations (the ADR/migration-comment/ruling
 *  that already disambiguated each one), so this run reports only pairs NOT already reviewed.
 *
 *  hard=false (soft/informational) on this first run, same reasoning as dead-column-audit.mjs: DUP-1 is
 *  rated P2 and this is the first automated structural pass, an unreviewed first count should not block
 *  the generation lane before a human has looked at what it found.
 *
 *  Exit 0 = no unreviewed candidate pairs; exit 1 = at least one (soft, reported, not gating while
 *  hard=false); exit 2 = no DB connection. Read-only: information_schema only. */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { connectPg } from '../lib/pg-conn.mjs';
import { loadLocalEnvFile } from '../lib/env-file.mjs';
import { fetchColumns, fetchForeignKeys } from './lib/information-schema-scan.mjs';
import { buildTableShapes, findCandidatePairs, staleAllowlistEntries } from './lib/duplicate-table-scan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
loadLocalEnvFile();

const COLUMN_NAME_THRESHOLD = 0.5;
const FK_TARGET_THRESHOLD = 0.6;

const ALLOWLIST_PATH = resolve(ROOT, 'scripts/verify/duplicate-table-allowlist.json');
function loadAllowlist() {
  try {
    const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
    const { _comment, ...entries } = raw;
    return entries;
  } catch (e) {
    console.error(`duplicate-table-audit: failed to read allowlist ${ALLOWLIST_PATH}: ${e.message}`);
    return {};
  }
}

const client = await connectPg();
if (!client) {
  console.error('duplicate-table-audit: no direct-Postgres connection (SUPABASE_DB_URL/DATABASE_URL, local supabase link + SUPABASE_DB_PASSWORD, or NEXT_PUBLIC_SUPABASE_URL-derived pooler). Cannot verify against live schema, exit 2.');
  process.exit(2);
}

try {
  const [columns, foreignKeys] = await Promise.all([fetchColumns(client), fetchForeignKeys(client)]);
  const shapes = buildTableShapes(columns, foreignKeys);
  const allowlist = loadAllowlist();

  const pairs = findCandidatePairs({
    shapes,
    columnNameThreshold: COLUMN_NAME_THRESHOLD,
    fkTargetThreshold: FK_TARGET_THRESHOLD,
    allowlist,
  });
  const stale = staleAllowlistEntries({
    shapes,
    allowlist,
    columnNameThreshold: COLUMN_NAME_THRESHOLD,
    fkTargetThreshold: FK_TARGET_THRESHOLD,
  });

  console.log(
    `duplicate-table-audit: ${shapes.size} public base tables, thresholds columnName>=${COLUMN_NAME_THRESHOLD} ` +
    `or fkTarget>=${FK_TARGET_THRESHOLD}, ${Object.keys(allowlist).length} allowlisted pair(s).`,
  );

  if (pairs.length === 0 && stale.length === 0) {
    console.log('PASS, no unreviewed candidate duplicate/parallel-table pairs; no stale allowlist entries.');
    await client.end();
    process.exit(0);
  }

  if (pairs.length) {
    console.error(`\nCANDIDATE DUPLICATE/PARALLEL TABLE PAIR(S), ${pairs.length} not yet reviewed:`);
    for (const p of pairs) {
      console.error(`  ${p.a} <-> ${p.b}, columnName=${p.columnNameSimilarity.toFixed(2)} fkTarget=${p.fkTargetSimilarity.toFixed(2)} sharedColumns=[${p.sharedColumns.join(', ')}]`);
    }
    console.error('  Disposition: review the pair; either add a reasoned entry to scripts/verify/duplicate-table-allowlist.json (citing the ADR/comment/ruling that disambiguates it), or treat it as a real accidental duplication (merge, or document + keep with a table comment).');
  }
  if (stale.length) {
    console.error(`\nSTALE ALLOWLIST, ${stale.length} entry(ies) no longer applicable:`);
    for (const s of stale) console.error(`  ${s.key}, ${s.reason}`);
  }
  await client.end();
  process.exit(1);
} catch (e) {
  console.error(`duplicate-table-audit: engine error, ${e instanceof Error ? e.message : String(e)}`);
  try { await client.end(); } catch { /* ignore */ }
  process.exit(2);
}
