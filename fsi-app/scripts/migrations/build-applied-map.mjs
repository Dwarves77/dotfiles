// build-applied-map.mjs -- generates fsi-app/supabase/migrations/APPLIED-MAP.json (lane MIG-HIST-1,
// 2026-10-07). The map says, for every row production's supabase_migrations.schema_migrations holds, which
// repo file stands for it and how faithfully; and, for every repo file that has no ledger row, why not.
//
// Shape (fixed by PROOF-1's reader, scripts/proof/applied-map.mjs): an object keyed by ledger version, each value
//   { name, file: <migration file name or null>, class, superseded_by?: <migration file name>, note? }
// File names are bare (no directory), as the reader compares them with the directory listing. A repo file that
// has no ledger row is its own entry, keyed by class and file (the reader's convention): `outside:<file>`,
// `never:<file>`, `dup:<file>`, value { name, file, class, note: <evidence> }.
//   class (ledger rows): identical | comments-only | code-differs | recovered | superseded-by | data-only |
//     comment-only, plus two classes for matched rows with nothing to compare: statements-null (the ledger
//     stored no SQL) and apply-record-stub (the ledger stored a provenance note, not SQL); the reader replays
//     the file for both, the file being the only text there is.
//   class (files without a row): outside-ledger | never-applied | duplicate-prefix.
//
// Inputs: a reconciliation JSON (the export's sets a, b, c, d), the export directory (one .sql
// per ledger row: first line a header, the rest the stored statements), and the migrations directory.
// The classification of the 45 rows that had no repo file, and of the 16 files that had no ledger row, is a
// set of coordinator rulings (2026-10-07) recorded below as data, each with its reason; everything else is
// computed with the shared comparison in migration-compare.mjs, the same one the hard audit uses.
//
// Usage: node fsi-app/scripts/migrations/build-applied-map.mjs <reconciliation.json> --export-dir <dir> [--write]
//   --write   writes fsi-app/supabase/migrations/APPLIED-MAP.json (default: prints it to stdout, dry).

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../lib/is-main.mjs';
import { compareStored, isApplyRecordStub } from './migration-compare.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MIG_DIR = resolve(HERE, '..', '..', 'supabase', 'migrations');
export const MAP_PATH = join(MIG_DIR, 'APPLIED-MAP.json');

/** Key prefix of an entry for a repo file that has no ledger row (the reader ignores the key; PROOF-1's tests use these). */
export const FILE_KEY_PREFIX = Object.freeze({ 'outside-ledger': 'outside', 'never-applied': 'never', 'duplicate-prefix': 'dup' });
export const fileKey = (cls, file) => `${FILE_KEY_PREFIX[cls]}:${file}`;
/** A map key is a ledger version unless it carries a class prefix. */
export const isFileKey = (key) => key.includes(':');
export const ledgerKeys = (map) => Object.keys(map).filter((k) => !isFileKey(k));
export const fileEntries = (map) => Object.entries(map).filter(([k]) => isFileKey(k)).map(([, e]) => e);

const SESSION_C = 'Session C coverage-gap lane (branch origin/corpus-integrity/cc-grounding-executor-c, never merged, tip 2026-07-20); a one-time data load from a closed lane, recorded here and not reproduced (standing rule 1: facts live in the database)';

// Coordinator rulings for the ledger rows that had no repo file (reconciliation set a), keyed by version.
// kind 'paired' = the row is the same migration as an existing master file under another name: compared like
// any matched pair. Every other entry carries its class and the schema file that covers it.
export const ROW_RULINGS = {
  '20260717223651': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `column data_class and its CHECK are held by 273; COMMENT and data rows not recreated. ${SESSION_C}` },
  '20260717232219': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `column discovery_class and the final data_class CHECK are held by 273; COMMENT and data rows not recreated. ${SESSION_C}` },
  '20260717234619': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `INSERT of coverage_gap_candidates rows. ${SESSION_C}` },
  '20260718001047': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `INSERT and UPDATE of coverage_gap_candidates rows. ${SESSION_C}` },
  '20260718003159': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `INSERT of coverage_gap_candidates rows. ${SESSION_C}` },
  '20260718015746': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `INSERT of coverage_gap_candidates rows. ${SESSION_C}` },
  '20260718020307': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `INSERT of coverage_gap_candidates rows. ${SESSION_C}` },
  '20260718020707': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `INSERT of coverage_gap_candidates rows. ${SESSION_C}` },
  '20260718020828': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `UPDATE of coverage_gap_candidates rows. ${SESSION_C}` },
  '20260718021214': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `INSERT of coverage_gap_candidates rows. ${SESSION_C}` },
  '20260718022118': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `INSERT of coverage_gap_candidates rows. ${SESSION_C}` },
  '20260718022732': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `INSERT of coverage_gap_candidates rows. ${SESSION_C}` },
  '20260718185835': { class: 'comment-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: 'columns disposition and surface_test and both CHECK constraints are held by 273; the two stored COMMENT ON COLUMN statements are comments and are not recreated' },
  '20260718185947': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `UPDATE of coverage_gap_candidates dispositions. ${SESSION_C}` },
  '20260718190445': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `column access_model and its CHECK are held by 273 and the view by 223_acquisition_backlog_v.sql; the UPDATE and the comments are not recreated. ${SESSION_C}` },
  '20260718190922': { class: 'data-only', superseded_by: '223_acquisition_backlog_v.sql', note: `the view is held by 223; the UPDATE of access_model rows is data. ${SESSION_C}` },
  '20260718192452': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `the discovery_class CHECK in its final form is held by 273; the INSERT is data. ${SESSION_C}` },
  '20260718193242': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `UPDATE of access_model. ${SESSION_C}` },
  '20260718200026': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `UPDATE of dispositions. ${SESSION_C}` },
  '20260718200111': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `UPDATE of dispositions. ${SESSION_C}` },
  '20260718200309': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `UPDATE and INSERT of coverage_gap_candidates rows. ${SESSION_C}` },
  '20260718200509': { class: 'comment-only', superseded_by: '223_acquisition_backlog_v.sql', note: 'the view acquisition_backlog_v is held by 223; the stored COMMENT ON VIEW is a comment and is not recreated' },
  '20260718202706': { class: 'data-only', superseded_by: '273_coverage_gap_candidates_live_ddl_catchup.sql', note: `UPDATE of one disposition. ${SESSION_C}` },
  '20260719205437': { class: 'superseded-by', superseded_by: '222_census_rollup_stitch.sql', note: 'coverage_gap_census_findings and its table comment are created by 222 (retroactive capture, same DDL-before-migration gap)' },
  '20260719210535': { class: 'data-only', superseded_by: '222_census_rollup_stitch.sql', note: `INSERT of census findings. ${SESSION_C}` },
  '20260719212507': { class: 'data-only', superseded_by: '048_integrity_flags_platform.sql', note: `INSERT of integrity_flags rows. ${SESSION_C}` },
  '20260719212632': { class: 'data-only', superseded_by: '222_census_rollup_stitch.sql', note: `column pending_dependency and its comment are held by 222; the two UPDATEs are data. ${SESSION_C}` },
  '20260719212830': { class: 'data-only', superseded_by: '222_census_rollup_stitch.sql', note: `INSERT of census findings. ${SESSION_C}` },
  '20260719213059': { class: 'data-only', superseded_by: '222_census_rollup_stitch.sql', note: `INSERT of census findings. ${SESSION_C}` },
  '20260720150850': { class: 'recovered', note: 'schema change to coverage_gap_census_findings held by no master file; recovered whole' },
  '20260720151231': { class: 'data-only', superseded_by: '222_census_rollup_stitch.sql', note: `INSERT of census findings. ${SESSION_C}` },
  '20260721222204': { class: 'recovered', note: 'the function is held by 256 item 5 (md5-equal); only the EXECUTE grant, which no master file holds, is recovered (residue); the COMMENT is not recreated' },
  '20260726195325': { paired: '225_gate_a_criterion7.sql' },
  '20260731021933': { class: 'superseded-by', superseded_by: '254_drop_shadow_gate_a_and_broken_hrq.sql', note: 'created the shadow gate_a_* SQL functions that 254 drops (census 2026-08-11, Finding 3); no master file ever created them' },
  '20260731024004': { class: 'superseded-by', superseded_by: '254_drop_shadow_gate_a_and_broken_hrq.sql', note: 'gate_a_scan_and_store, dropped by 254 (DROP FUNCTION gate_a_scan_and_store)' },
  '20260801004400': { paired: '207_own_body_types_extension.sql' },
  '20260801131707': { class: 'recovered', note: 'CREATE EXTENSION pg_net; no master file creates it; recovered whole' },
  '20260801181308': { class: 'comment-only', superseded_by: '256_migration_homes_and_vault_capture_key.sql', note: 'capture_worker_fetch is held by 256 item 4 (the hardcoded publishable key replaced by a Vault reference); only the stored COMMENT ON FUNCTION is not recreated. The stored body carries that key literal, which is why it is not reproduced' },
  '20260801201905': { class: 'recovered', note: 'cache table and gate_a_health functions are held by 256 items 1 to 3; only CREATE EXTENSION pg_cron is recovered (residue). The stored cron.schedule call is NOT recreated: cron.job is empty and the last run of the removed job was 2026-08-10 [CONFIRMED by live read 2026-10-07]' },
  '20260802153524': { class: 'recovered', note: 'profiles.id to auth.users.id foreign key; no master file holds it; recovered whole' },
  '20260809014650': { class: 'superseded-by', superseded_by: '264_rename_result_content_excerpt.sql', note: 'a column comment on agent_run_searches.result_content_excerpt; 264 renamed that column to result_content, so the comment is moot' },
  '20260809030555': { class: 'superseded-by', superseded_by: '248_security_grants_hardening_2026_08_09.sql', note: 'REVOKE from anon and authenticated is held by 248; ALTER FUNCTION set_provenance_status SET search_path is held by 160_search_path_pin_app_functions.sql' },
  '20260809030625': { class: 'superseded-by', superseded_by: '248_security_grants_hardening_2026_08_09.sql', note: 'REVOKE from PUBLIC; 248 states both revokes in one statement' },
  '20260830173247': { paired: '270_widen_org_watchlist_market_series.sql' },
  '20260912213045': { paired: '317_provisional_sources_status_promoted.sql' },
};

// Coordinator rulings for the repo files that had no ledger row (set b), by file. Files that are the same
// migration as a row listed in ROW_RULINGS (paired, or superseded_by) are accounted for there, not here.
export const FILE_RULINGS = {
  '006_rls_multi_tenant.sql': { class: 'duplicate-prefix', evidence: 'forensics E3: second file on version 006; the ledger holds 006 multi_tenant only; F51 allowlist 2026-09-19 (renumbering refused); [HYPOTHESIS] applied by hand in April' },
  '007_full_brief.sql': { class: 'duplicate-prefix', evidence: 'forensics E3: second file on version 007; the ledger holds 007 community_layer only; F51 allowlist 2026-09-19' },
  '007_rls_community.sql': { class: 'duplicate-prefix', evidence: 'forensics E3: third file on version 007; the ledger holds 007 community_layer only; F51 allowlist 2026-09-19' },
  '202_standard_own_body_floor.sql': { class: 'outside-ledger', evidence: 'docs/ops/session-log.md line 2415: applied live via the direct postgres pooler; no ledger row [HYPOTHESIS until objects verified]' },
  '205_funded_pass_runlock.sql': { class: 'outside-ledger', evidence: 'docs/PROGRAM-BOARD.md line 507: proven live; no ledger row [HYPOTHESIS until objects verified]' },
  '206_mint_gate_hold_marker.sql': { class: 'outside-ledger', evidence: 'hardening-resume-2026-07-16.md line 19: flip live; no ledger row [HYPOTHESIS until objects verified]' },
  '260_fk_indexes_and_scanner_hygiene.sql': { class: 'outside-ledger', evidence: 'header lines 14 to 21: CREATE INDEX CONCURRENTLY cannot run through apply_migration, applied via direct psql; full-read-audit-2026-08-31.md line 225 says it may never have applied; no ledger row [HYPOTHESIS until objects verified]' },
  '262_rls_initplan_sweep.sql': { class: 'outside-ledger', evidence: 'no applied record found in docs; classed with 260 and 263 of the same PR 452; no ledger row [HYPOTHESIS until objects verified]' },
  '263_mode_vocabulary_ocean_canonical.sql': { class: 'outside-ledger', evidence: 'master-execution-plan-2026-08-17.md line 40 cites its applied record; no ledger row [HYPOTHESIS until objects verified]' },
  '315_workspace_due_next.sql': { class: 'outside-ledger', evidence: 'header says APPLIED LIVE 2026-09-08 by the lane; no ledger row, [HYPOTHESIS] applied through execute_sql, which writes no ledger row' },
  '299_item_type_required_slots_wave3.sql': { class: 'never-applied', evidence: 'docs/ops/session-log.md lines 10300 to 10307: written and not applied; still held per HANDOFF-2026-09-18.md line 275 and session-log.d/2026-09-25-operator-ruling-r14.md line 16 [CONFIRMED text]' },
};

/** Files that are the same migration as a ledger row, found by ROW_RULINGS (paired or superseded_by). */
function accountedByRows(rulings) {
  const out = new Set();
  for (const r of Object.values(rulings)) {
    if (r.paired) out.add(r.paired);
    if (r.superseded_by) out.add(r.superseded_by);
  }
  return out;
}

/** Status of a repo file that has no ledger row and no ruling: its own NOT APPLIED header (set b carries it). */
function derivedFileRuling(b) {
  if (!b.header_says_not_applied) return null;
  return { class: 'never-applied', evidence: `the file's own header says NOT APPLIED and the ledger holds no row for it: ${b.header_line}` };
}

/**
 * Pure builder.
 * @param {object} p
 * @param {object} p.reconciliation parsed reconciliation.json (a, b, c, d)
 * @param {(version:string, name:string) => string|null} p.readStored stored statements of a row, or null
 * @param {(file:string) => string} p.readFile text of a migration file in the migrations directory
 * @param {string[]} p.listFiles every .sql file name in the migrations directory
 * @returns {{ map: object, problems: string[], counts: object }}
 */
export function buildAppliedMap({ reconciliation, readStored, readFile, listFiles }) {
  const problems = [];
  const entries = new Map(); // key -> entry
  const fileSet = new Set(listFiles);

  const compareClass = (version, name, file) => {
    const stored = readStored(version, name);
    if (stored == null) return 'statements-null';
    if (isApplyRecordStub(stored)) return 'apply-record-stub';
    return compareStored(stored, readFile(file)).kind;
  };

  // recovered files, found by their own header. They are this lane's own files: a reconciliation run on a tree
  // that holds them matches some by name (the row leaves set a) and lists others in set b, so they are
  // normalised first: a recovered file is never a matched pair and never a file without a row.
  const recoveredByVersion = new Map();
  const recoveredFiles = new Set();
  for (const f of listFiles) {
    const head = readFile(f).split('\n', 30);
    const v = head.find((l) => l.startsWith('-- ledger version: '));
    const n = head.find((l) => l.startsWith('-- ledger name: '));
    if (v && n && head.some((l) => l.startsWith('-- recovered: '))) {
      recoveredByVersion.set(v.slice('-- ledger version: '.length).trim(), { file: f, name: n.slice('-- ledger name: '.length).trim() });
      recoveredFiles.add(f);
    }
  }
  const setA = [...reconciliation.a];
  const pairs = [];
  for (const r of [...reconciliation.c, ...reconciliation.d]) {
    if (recoveredFiles.has(r.file)) {
      const rec = recoveredByVersion.get(r.version);
      if (!rec || rec.file !== r.file) problems.push(`recovered file ${r.file} matched version ${r.version}, but its header names another ledger version`);
      else setA.push({ version: r.version, name: r.applied_name });
    } else pairs.push(r);
  }
  const setB = reconciliation.b.filter((b) => !recoveredFiles.has(b.file));

  // matched pairs (sets c and d)
  for (const r of pairs) {
    if (!fileSet.has(r.file)) { problems.push(`matched file missing from the directory: ${r.file} (version ${r.version})`); continue; }
    entries.set(r.version, { name: r.applied_name, file: r.file, class: compareClass(r.version, r.applied_name, r.file) });
  }

  // the rows with no repo file (set a, plus the rows whose recovered file now matches)
  for (const r of setA) {
    const ruling = ROW_RULINGS[r.version];
    if (!ruling) { problems.push(`no ruling for applied row ${r.version} ${r.name}`); continue; }
    if (ruling.paired) {
      if (!fileSet.has(ruling.paired)) { problems.push(`paired file missing: ${ruling.paired}`); continue; }
      entries.set(r.version, { name: r.name, file: ruling.paired, class: compareClass(r.version, r.name, ruling.paired), note: 'same migration as this file, applied under a different name' });
    } else if (ruling.class === 'recovered') {
      const rec = recoveredByVersion.get(r.version);
      if (!rec) { problems.push(`no recovered file carries ledger version ${r.version}`); continue; }
      entries.set(r.version, { name: r.name, file: rec.file, class: 'recovered', note: ruling.note });
    } else {
      if (!fileSet.has(ruling.superseded_by)) problems.push(`superseded_by file missing: ${ruling.superseded_by} (version ${r.version})`);
      entries.set(r.version, { name: r.name, file: null, class: ruling.class, superseded_by: ruling.superseded_by, note: ruling.note });
    }
  }
  for (const v of Object.keys(ROW_RULINGS)) if (!setA.some((r) => r.version === v)) problems.push(`ruling for a version not in set a: ${v}`);

  // files with no ledger row (set b): one keyed entry per file, in the reader's own form
  const accounted = accountedByRows(ROW_RULINGS);
  const byFile = [];
  for (const b of setB) {
    if (accounted.has(b.file)) continue;
    const ruling = FILE_RULINGS[b.file] ?? derivedFileRuling(b);
    if (!ruling) { problems.push(`no ruling for file without a ledger row: ${b.file}`); continue; }
    byFile.push([fileKey(ruling.class, b.file), { name: b.file.replace(/\.sql$/, '').replace(/^\d+_/, ''), file: b.file, class: ruling.class, note: ruling.evidence }]);
  }
  for (const f of Object.keys(FILE_RULINGS)) if (!setB.some((b) => b.file === f)) problems.push(`ruling for a file not in set b: ${f}`);

  const map = {};
  for (const k of [...entries.keys()].sort()) map[k] = entries.get(k);
  for (const [k, e] of byFile.sort((x, y) => (x[0] < y[0] ? -1 : 1))) map[k] = e;

  const counts = {};
  for (const e of entries.values()) counts[e.class] = (counts[e.class] || 0) + 1;
  for (const [, e] of byFile) counts[`file:${e.class}`] = (counts[`file:${e.class}`] || 0) + 1;
  counts.ledger_rows = entries.size;
  return { map, problems, counts };
}

/** Deterministic text: one entry per line, ledger versions ascending, then the keyed file entries. */
export function serializeMap(map) {
  const keys = Object.keys(map).sort();
  return `{\n${keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(map[k])}`).join(',\n')}\n}\n`;
}

function main() {
  const argv = process.argv.slice(2);
  const reconPath = argv[0];
  const exportDir = argv[argv.indexOf('--export-dir') + 1];
  if (!reconPath || reconPath.startsWith('--') || argv.indexOf('--export-dir') < 0 || !exportDir) {
    console.error('usage: build-applied-map.mjs <reconciliation.json> --export-dir <dir> [--write]');
    process.exit(2);
  }
  const reconciliation = JSON.parse(readFileSync(reconPath, 'utf8'));
  const index = JSON.parse(readFileSync(join(exportDir, 'index.json'), 'utf8'));
  const readStored = (version, name) => {
    const row = index.find((r) => r.version === version && r.name === name);
    if (!row || row.statements_null) return null;
    const text = readFileSync(join(exportDir, `${version}_${name}.sql`), 'utf8').replace(/\r\n/g, '\n');
    return text.split('\n').slice(1).join('\n');
  };
  const listFiles = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql'));
  const { map, problems, counts } = buildAppliedMap({
    reconciliation, readStored, readFile: (f) => readFileSync(join(MIG_DIR, f), 'utf8').replace(/\r\n/g, '\n'), listFiles,
  });
  if (problems.length) { for (const p of problems) console.error(`build-applied-map: ${p}`); process.exit(1); }
  const text = serializeMap(map);
  console.error(`build-applied-map: ${JSON.stringify(counts)}`);
  if (argv.includes('--write')) { writeFileSync(MAP_PATH, text); console.error(`build-applied-map: wrote ${MAP_PATH}`); }
  else process.stdout.write(text);
}

if (isMainModule(import.meta.url)) main();
