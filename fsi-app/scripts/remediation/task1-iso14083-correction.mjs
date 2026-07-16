#!/usr/bin/env node
// task1-iso14083-correction.mjs -- audit-ruled ISO 14083 conflation correction (Task 1).
// Operator VERIFIED-mutation authorization 2026-07-15 (covers this item). Guarded, snapshotted, attributed.
// Live-verified this session against EUR-Lex CELEX:32023R1805: Reg (EU) 2023/1805 is FuelEU Maritime,
// names no ISO 14083, applies 1 January 2025 (not 1 July 2025), and is NOT CountEmissions EU.
//
// Action: remove the 16 false/unsupported/tier-methodology claims (guardedDelete), replace the false
// brief body with a withdrawal+hold notice (guardedUpdate, original preserved in snapshot), demote
// provenance_status to quarantined (demotion, never promotion), attach a named next-action (guardedInsert).
// Run: DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/remediation/task1-iso14083-correction.mjs

import { readClient, guardedDelete, guardedUpdate, guardedInsert } from '../lib/db.mjs';

const ITEM = '7d2f8d88-46b6-4998-a10e-75093500f46c';
const CITE = {
  skill: 'environmental-policy-and-innovation',
  reason: 'Task1 ISO14083 conflation correction (operator VERIFIED-mutation auth 2026-07-15): remove false 2023/1805=CountEmissions+ISO14083-mandate+1July2025 claims, strip tier-methodology-as-fact, withdraw false brief, hold for re-ground. Live-verified vs EUR-Lex CELEX:32023R1805.',
};

// The 16 claim ids to remove (adjudicated against the live-verified truth; see dispatch report).
const REMOVE_IDS = [
  '35998cc6-f176-4381-9f1d-73c8e5ab4414', // idx2  false: 2023/1805 = CountEmissions territorial scope
  '4b23dca7-2c3c-4358-a73f-03092c74ee1d', // idx3  false: EIF 22 Oct + 1 Jul 2025 + ISO14083 mandate
  '7232b6e2-6668-4f7c-a4c7-c92cd2c1390c', // idx4  false: "Under CountEmissions EU ... certificate"
  '9c7e32a0-6cb7-441b-9725-4f261c8fff55', // idx6  false: "From 1 July 2025 ... ISO14083 certificates"
  'a4604290-6867-4d6b-97dd-6b347377f026', // idx7  false: deadline 1 July 2025 (CountEmissions)
  'ad3b91bd-bc74-4b72-adcf-5a930c5bdbec', // idx8  false: 2023/1805 mandates ISO14083 delegated acts
  'b1c76ac6-7ee0-42f1-9026-c80f6915e710', // idx9  false: CountEmissions(2023/1805) embeds ISO14083
  'c8650d8e-e555-4a77-b499-8f49dd41396c', // idx10 false: 2023/1805 obligation = issue certificates
  'c9128557-22af-4cd5-9651-fa11fe5c452e', // idx11 false: legal requirement CountEmissions 1 Jul 2025
  'd33d6c0e-d9f9-4cc8-9edb-d00069c57500', // idx14 false: 2023/1805 (CountEmissions) EIF 22 Sep 2023
  'd0f37e28-e312-49df-9e88-6282cda9386b', // idx13 unsupported: EIF 22 Oct 2023 (span says 22.9 OJ)
  'fcc61376-dc01-4368-9580-2127f31de7c5', // idx31 tier-methodology-as-fact (dispatch strip)
  '3ead1516-b7bd-4287-8163-282532ec2f32', // idx19 GAP with false 1 July 2025 application date
  '9966b6f3-45a4-4740-a31a-175e5df8095c', // idx24 GAP asserting CountEmissions mandatory-embeds ISO
  '0b34f92e-a47e-474e-8db8-a4f0fef2343e', // idx15 ANALYSIS "window narrowing" (baseless w/o false deadline)
  '86139e53-06e3-4736-94fd-84b9d43e5750', // idx23 ANALYSIS "the obligation ... pass contractually" (baseless)
];

const HOLD_NOTICE = `# ISO 14083: HELD PENDING RE-GROUND (corrected 2026-07-15)

This brief was withdrawn on 2026-07-15 under operator ruling. Its prior content conflated three distinct instruments: it incorrectly asserted that Regulation (EU) 2023/1805 is "CountEmissions EU" and that it mandates ISO 14083 aligned emission certificates from 1 July 2025.

Verified against the primary law on EUR-Lex (live read 2026-07-15, CELEX 32023R1805): Regulation (EU) 2023/1805 is FuelEU Maritime, on the use of renewable and low carbon fuels in maritime transport. It names no ISO 14083 and applies from 1 January 2025. ISO 14083:2023 is a voluntary methodology standard published by ISO Technical Committee ISO/TC 207/SC 7, with no compliance mandate of its own. CountEmissions EU is a separate proposed regulation (COM/2023/441), not Regulation (EU) 2023/1805.

The false claims and the tier methodology as fact claim were removed from the claim ledger. This item is held (quarantined) and is not a verified customer brief. It must not be re-published until it is re-grounded from correct, separated sources.

Next action: re-ground ISO 14083 as a voluntary standard (iso.org) and, if in scope, CountEmissions EU as a separate proposal, without conflating either with FuelEU Maritime (Regulation (EU) 2023/1805).`;

async function factCount() {
  const sb = readClient();
  const { data, error } = await sb.from('section_claim_provenance').select('id,claim_kind').eq('intelligence_item_id', ITEM);
  if (error) throw error;
  return { total: data.length, fact: data.filter((r) => String(r.claim_kind).toUpperCase() === 'FACT').length };
}

async function main() {
  const before = await factCount();
  const sb = readClient();
  const { data: pre } = await sb.from('intelligence_items').select('provenance_status,length:full_brief').eq('id', ITEM).single();
  console.log('BEFORE:', JSON.stringify(before), 'provenance=', pre?.provenance_status);

  const del = await guardedDelete('section_claim_provenance', REMOVE_IDS, { cite: CITE });
  console.log(`deleted ${del.deleted} claims; snapshot=${del.snapshot}`);

  const upd = await guardedUpdate('intelligence_items', (qb) => qb.eq('id', ITEM),
    { full_brief: HOLD_NOTICE, provenance_status: 'quarantined' }, { cite: CITE });
  console.log(`updated item (brief+status); snapshot=${upd.snapshot}`);

  const flag = await guardedInsert('integrity_flags', {
    category: 'data_integrity', subject_type: 'item', subject_ref: ITEM,
    description: 'ISO 14083 held after conflation correction (Task 1, 2026-07-15). Prior brief falsely equated Reg (EU) 2023/1805 with CountEmissions EU and asserted an ISO 14083 certificate mandate from 1 July 2025; both false vs the live primary. Held for re-ground.',
    recommended_actions: [{ action: 're-ground', rationale: 'Re-ground ISO 14083 as a voluntary standard and CountEmissions EU as a separate proposal; do not conflate with FuelEU Maritime (2023/1805).' }],
    status: 'open', created_by: 'audit-remediation-task1-2026-07-15',
  }, { cite: CITE });
  console.log(`next-action integrity_flag inserted id=${flag.inserted?.id}`);

  const after = await factCount();
  const { data: post } = await sb.from('intelligence_items').select('provenance_status,is_archived').eq('id', ITEM).single();
  console.log('AFTER:', JSON.stringify(after), 'provenance=', post?.provenance_status, 'is_archived=', post?.is_archived);
}

main().catch((e) => { console.error(e); process.exit(1); });
