#!/usr/bin/env node
// task6-q3-content-fit.mjs -- Q3 content-fit reclassify (Task 6). Guarded, snapshotted.
// Operator ruling 2026-07-15 (Option 1, content-driven, uncertainty -> hold not dispose): read each brief,
// reclassify the genuine org-descriptions to source + archive, KEEP anything carrying a real freight finding.
// Content assessment (this session):
//   RECLASSIFY (org-description, low freight-decision value):
//     c1cab7e2 "Fraunhofer IML"                -> "Overview and scope. Fraunhofer IML operates one of Europe's
//                                                 leading applied-research programmes..." (what the institute does)
//     abd83595 "Stockholm Environment Institute" -> "FACT: SEI is a foundation registered under Swedish law..."
//                                                 (institutional profile / legal identity)
//   KEEP (real freight-relevant finding):
//     627da433 "World Resources Institute"      -> "Headline Finding: Freight Decarbonization: No Single Pathway,
//                                                 Mode-Specific Constraints; three decarbonisation vectors..."
//     b11cccc4 "Fraunhofer IML Research Overview" -> synthesises real research (AI logistics, automation,
//                                                 decarbonisation) with MONITORING + re-check; uncertainty -> keep.
// Both reclassify targets already have an ACTIVE source row (SEI 8b7b0db2 tier3; Fraunhofer c63911ec tier3);
// reclassifyToSource reuses it (source-present-and-active invariant satisfied) and archives the item.
// Run: --dry-run (default) | --execute
//   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/remediation/task6-q3-content-fit.mjs --dry-run

import { readClient, guardedUpdate } from '../lib/db.mjs';

const EXECUTE = process.argv.includes('--execute');
const CITE = { skill: 'caros-ledge-platform-intent', reason: 'Task6 Q3 content-fit (operator ruling 2026-07-15, content-driven): reclassify org-description research_finding items (Fraunhofer IML profile, SEI institutional profile) to their institution source + archive; WRI + Fraunhofer Research Overview KEPT as real findings.' };

// Both institutions already have an ACTIVE source row (the source-registration invariant is satisfied without
// re-registering). Archive via DIRECT guardedUpdate WITHOUT resetting provenance_status: archiveRows/archivePatch
// forces provenance_status='unverified', which the set_provenance_status trigger immediately tries to flip back
// to 'verified' (content still validates), tripping the row-43 provenance-binding guard (reconciler cred broken).
// Task 5 proved the direct-archive path leaves a verified+archived row (out of customer view; reads gate on
// verified AND not-archived). Migration 135 still enforces the source-present DB invariant on this archive_reason.
const RECLASSIFY = [
  { itemId: 'c1cab7e2-606f-45f1-a229-46c0e7002dfa', srcId: 'c63911ec-97ec-4bd4-9d32-57d5211975c0', name: 'Fraunhofer IML', note: 'Org-description (what the institute does), low freight-decision value. Its institution iml.fraunhofer.de is registered + active (c63911ec); reclassified to source per Task 6 Q3, 2026-07-15.' },
  { itemId: 'abd83595-cb54-4ccc-b80b-2f9421596465', srcId: '8b7b0db2-0274-4446-93a9-b3d0548a3a3b', name: 'Stockholm Environment Institute', note: 'Institutional profile (legal identity/mandate), low freight-decision value. Its institution sei.org is registered + active (8b7b0db2); reclassified to source per Task 6 Q3, 2026-07-15.' },
];
const KEEP = ['627da433-864b-4d60-98e6-3248726a3738', 'b11cccc4-fdb6-4008-b76c-1ff6632c2657'];

async function main() {
  const sb = readClient();
  const { data: before } = await sb.from('intelligence_items').select('id,title,provenance_status,is_archived').in('id', [...RECLASSIFY.map((r) => r.itemId), ...KEEP]);
  console.log('BEFORE:'); for (const r of before) console.log(`  ${RECLASSIFY.some((x) => x.itemId === r.id) ? 'RECLASSIFY' : 'KEEP      '} ${r.provenance_status} archived=${r.is_archived} :: ${r.title}`);

  // precondition: both institution sources must be active before archiving (source-registration invariant)
  const { data: srcs } = await sb.from('sources').select('id,status,url').in('id', RECLASSIFY.map((r) => r.srcId));
  for (const r of RECLASSIFY) { const s = (srcs || []).find((x) => x.id === r.srcId); if (!s || s.status !== 'active') throw new Error(`precondition FAIL: source ${r.srcId} for ${r.name} not active (${s?.status ?? 'missing'}) — refusing to archive.`); console.log(`precondition OK: ${r.name} source ${r.srcId} active (${s.url})`); }

  if (!EXECUTE) { console.log('\nDRY-RUN. No writes. Re-run with --execute.'); return; }

  for (const r of RECLASSIFY) {
    const res = await guardedUpdate('intelligence_items', (qb) => qb.eq('id', r.itemId),
      { is_archived: true, archive_reason: 'reclassified_to_source', archived_date: '2026-07-15', archive_note: r.note },
      { cite: CITE, select: 'id,is_archived,archive_reason' });
    console.log(`archived ${r.itemId} (${r.name}); updated=${res.updated}`);
  }

  // inline verify
  const { data: after } = await sb.from('intelligence_items').select('id,title,provenance_status,is_archived,archive_reason').in('id', [...RECLASSIFY.map((r) => r.itemId), ...KEEP]);
  console.log('\nAFTER:');
  let ok = true;
  for (const r of after) {
    const shouldArchive = RECLASSIFY.some((x) => x.itemId === r.id);
    console.log(`  ${shouldArchive ? 'RECLASSIFY' : 'KEEP      '} archived=${r.is_archived} reason=${r.archive_reason ?? '-'} :: ${r.title}`);
    if (shouldArchive && (!r.is_archived || r.archive_reason !== 'reclassified_to_source')) ok = false;
    if (!shouldArchive && r.is_archived) ok = false;
  }
  console.log(ok ? '\nVERIFY OK: 2 reclassified+archived, 2 kept live. DONE.' : '\nVERIFY FAIL'); if (!ok) process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
