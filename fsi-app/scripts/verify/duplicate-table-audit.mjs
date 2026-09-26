// data-audit: label=duplicate-table hard=false
/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILL: remediation-discipline (section 4, the "F45-shaped
 *  structural comparison" audit finding DUP-1 itself calls for). Closes DUP-1
 *  (docs/audits/supabase-integrity-and-wiring-audit-2026-09-25.md): a manual read of ~100 table comments
 *  found six candidate pairs and closed all six as intentionally-parallel, but named its own scaling limit
 *, "comment-reading does not scale past ~100 tables" and would miss an accidental duplication introduced
 *  without an honest comment. This audit replaces that manual read with a structural comparison.
 *
 *  WHAT IT DOES (read-only): fetch every column (with type) and table comment of every public base table
 *  via information_schema (shared scan: lib/information-schema-scan.mjs, same module dead-column-audit.mjs
 *  uses), then score every table pair on four blended signals, rarity-weighted type-gated column overlap,
 *  table-name token overlap, comment-token overlap, and a table's own comment naming the other table,
 *  calibrated against DUP-1's own 8 confirmed pairs plus 15 hand-labelled negatives (pure decision logic +
 *  the calibration fixture: lib/duplicate-table-scan.mjs / duplicate-table-scan.test.mjs, no DB in the
 *  test). A flagged pair is a CANDIDATE, not a verdict. Recalibrated 2026-09-25 (coordinator ruling) after
 *  the first cut's raw column-name Jaccard flagged org_memberships<->user_watchlist as its TOP candidate
 *  (sharing nothing but universal id/org_id/user_id/created_at) while missing 6 of the 8 DUP-1-confirmed
 *  pairs; see duplicate-table-scan.mjs's own header for the full signal design and the measured
 *  recall/precision. DUP-1's 8 confirmed pairs are POSITIVES, not allowlisted (coordinator ruling: an
 *  allowlist is for accepted non-issues, not known positives), they are expected to appear in this run's
 *  own candidate output every time, same as any other flagged pair.
 *
 *  hard=false (soft/informational): DUP-1 is rated P2 and every candidate here still needs a human
 *  disposition (allowlist with a citation, or treat as a real duplicate); an unreviewed count should not
 *  block the generation lane before that review happens.
 *
 *  Exit 0 = no unreviewed candidate pairs; exit 1 = at least one (soft, reported, not gating while
 *  hard=false); exit 2 = no DB connection. Read-only: information_schema only. */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { connectPg } from '../lib/pg-conn.mjs';
import { loadLocalEnvFile } from '../lib/env-file.mjs';
import { fetchColumns, fetchTables } from './lib/information-schema-scan.mjs';
import { findCandidatePairs, staleAllowlistEntries, CANDIDATE_THRESHOLD } from './lib/duplicate-table-scan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
loadLocalEnvFile();

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
  const [columns, tables] = await Promise.all([fetchColumns(client), fetchTables(client)]);
  const allowlist = loadAllowlist();

  const pairs = findCandidatePairs({ columns, tables, allowlist });
  const stale = staleAllowlistEntries({ columns, tables, allowlist });

  console.log(
    `duplicate-table-audit: ${tables.length} public base tables, candidate threshold >=${CANDIDATE_THRESHOLD}, ` +
    `${Object.keys(allowlist).length} allowlisted pair(s).`,
  );

  if (pairs.length === 0 && stale.length === 0) {
    console.log('PASS, no unreviewed candidate duplicate/parallel-table pairs; no stale allowlist entries.');
    await client.end();
    process.exit(0);
  }

  if (pairs.length) {
    console.error(`\nCANDIDATE DUPLICATE/PARALLEL TABLE PAIR(S), ${pairs.length} not yet reviewed:`);
    for (const p of pairs) {
      console.error(
        `  ${p.a} <-> ${p.b}, score=${p.score.toFixed(3)} (columnName=${p.columnNameSimilarity.toFixed(3)} ` +
        `comment=${p.commentSimilarity.toFixed(3)} tableName=${p.tableNameSimilarity.toFixed(3)} ` +
        `mentionsOther=${p.commentMentionsOther}) sharedColumns=[${p.sharedColumns.join(', ')}]`,
      );
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
