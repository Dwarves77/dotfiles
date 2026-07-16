#!/usr/bin/env node
// task5-refueleu-dedup.mjs -- audit-ruled D1 dedup of the ReFuelEU Aviation twins (Task 5). Guarded, snapshotted.
// Both items ARE Regulation (EU) 2023/2405 (ReFuelEU Aviation) by entity identity (dedup = entity, not title):
//   KEEP    6f1e6615-2394-440b-bd4c-88b7bf711c72  enacted-text sourced (eli/reg/2023/2405/oj/eng, T1),
//           canonical_instrument_key 32023R2405, verified + complete (all required slots by construction).
//   ARCHIVE f2269121-4e10-4bdc-99bf-1e9c6a1b35e4  summary-page sourced, null canonical key -> the duplicate.
// Two verified non-archived copies of one instrument = the PPWR twin defect (EP-11). Resolution follows the
// established `duplicate_instrument` precedent: archive the weaker-provenance twin, keep the primary-grounded
// canonical. Content of the archived twin is preserved in the snapshot; its summary-grade facts are NOT ported
// into the enacted-text canonical (no provenance mixing).
// Run: --dry-run (default) | --execute
//   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/remediation/task5-refueleu-dedup.mjs --dry-run

import { readClient, guardedUpdate } from '../lib/db.mjs';

const KEEP = '6f1e6615-2394-440b-bd4c-88b7bf711c72';
const ARCHIVE = 'f2269121-4e10-4bdc-99bf-1e9c6a1b35e4';
const EXECUTE = process.argv.includes('--execute');
const CITE = {
  skill: 'environmental-policy-and-innovation',
  reason: 'Task5 ReFuelEU Aviation dedup (operator ruling 2026-07-15): archive the summary-sourced null-key twin f2269121 as duplicate_instrument; keep the enacted-text canonical 6f1e6615 (key 32023R2405). Dedup by entity identity per EP-11; content preserved in snapshot, no fact porting (no provenance mixing).',
};

async function main() {
  const sb = readClient();
  const { data: rows, error } = await sb.from('intelligence_items')
    .select('id,title,provenance_status,is_archived,canonical_instrument_key,source_url')
    .in('id', [KEEP, ARCHIVE]);
  if (error) throw error;
  console.log('BEFORE:'); for (const r of rows) console.log(`  ${r.id===KEEP?'KEEP   ':'ARCHIVE'} ${r.provenance_status} archived=${r.is_archived} key=${r.canonical_instrument_key} :: ${r.title}`);

  if (!EXECUTE) { console.log('\nDRY-RUN. No writes. Re-run with --execute.'); return; }

  const upd = await guardedUpdate('intelligence_items', (qb) => qb.eq('id', ARCHIVE),
    { is_archived: true, archive_reason: 'duplicate_instrument', archived_date: '2026-07-15',
      archive_note: `Duplicate of ${KEEP} (ReFuelEU Aviation, Regulation (EU) 2023/2405, canonical key 32023R2405). This copy was sourced to the EUR-Lex summary page with a null canonical key; the kept copy is grounded to the enacted text. Archived under Task 5 dedup (EP-11), 2026-07-15.` },
    { cite: CITE, select: 'id,is_archived,archive_reason' });
  console.log(`\narchived ${upd.updated}; snapshot=${upd.snapshot}`);

  // ---- inline verification: exactly one verified non-archived ReFuelEU Aviation remains; no residual twin ----
  const { data: after } = await sb.from('intelligence_items')
    .select('id,provenance_status,is_archived,canonical_instrument_key,title')
    .or(`canonical_instrument_key.eq.32023R2405,title.ilike.%ReFuelEU Aviation%`);
  const liveCanon = (after || []).filter((r) => r.provenance_status === 'verified' && r.is_archived === false && (r.canonical_instrument_key === '32023R2405' || /refueleu aviation/i.test(r.title)));
  console.log(`\nAFTER: verified non-archived ReFuelEU Aviation items = ${liveCanon.length} (must be 1)`);
  for (const r of after || []) console.log(`  ${r.provenance_status} archived=${r.is_archived} key=${r.canonical_instrument_key} :: ${r.id} :: ${r.title}`);
  if (liveCanon.length !== 1) { console.error('VERIFY FAIL: expected exactly one live canonical; halting.'); process.exit(2); }
  console.log('\nVERIFY OK: single canonical ReFuelEU Aviation (6f1e6615). DONE.');
}

main().catch((e) => { console.error(e); process.exit(1); });
