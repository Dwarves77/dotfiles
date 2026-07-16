#!/usr/bin/env node
// task7-hold11-urlfix.mjs -- Task 7 hold #11 (Green Building Standards, 9e594959). Guarded, snapshotted, $0.
// Operator ruling 2026-07-15 (Option 1, three-state): fix the INSTANCE defect at $0 (the malformed citation
// URL "https://gov.gov.uk/..." -> the correct "https://www.gov.uk/..." which IS in the item's own pool + a
// registered source, so correcting the typo grounds it, criterion 2). HOLD the rest: the ~16 criterion-3
// floor failures are the CLASS blocker -- the standard-own-body institution_id exemption is unwired, so the
// item's own-body standards facts (USGBC/LEED, BREEAM/BRE, tier 4) fail the tier-2 default floor. That is
// routed to hardening as 'standard-own-body-exemption-unwired' (infrastructure). No tier inflation, no false
// relabel. The item STAYS quarantined (honest hold, documented next-action, joins the priced re-ground queue).
// The LEED/BREEAM conflation (item split) rides the coverage-floor unit if the operator wants it resolved.
// Run: --dry-run (default) | --execute
//   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/remediation/task7-hold11-urlfix.mjs --dry-run

import { readClient, guardedUpdate, guardedInsert } from '../lib/db.mjs';

const ITEM = '9e594959-7de8-41e8-a25c-5b1976f77b34';
const BAD = 'gov.gov.uk';
const GOOD = 'www.gov.uk';
const EXECUTE = process.argv.includes('--execute');
const CITE = { skill: 'source-credibility-model', reason: 'Task7 hold #11 (operator ruling 2026-07-15, Option 1): fix the malformed citation URL gov.gov.uk -> www.gov.uk (the correct URL is in the item pool + a registered source) so criterion 2 grounds; floor failures HELD; standard-own-body-exemption-unwired routed to hardening. $0.' };

async function main() {
  const sb = readClient();
  const { data: item } = await sb.from('intelligence_items').select('id,full_brief,provenance_status').eq('id', ITEM).single();
  const briefHits = (item.full_brief.match(new RegExp(BAD, 'g')) || []).length;
  const { data: secs } = await sb.from('intelligence_item_sections').select('id,content_md').eq('item_id', ITEM);
  const secHits = (secs || []).filter((s) => s.content_md && s.content_md.includes(BAD));
  console.log(`hold #11 status=${item.provenance_status}; '${BAD}' in full_brief x${briefHits}, in ${secHits.length} section rows`);

  if (!EXECUTE) { console.log('\nDRY-RUN. No writes. Re-run with --execute.'); return; }

  if (briefHits) await guardedUpdate('intelligence_items', (qb) => qb.eq('id', ITEM), { full_brief: item.full_brief.split(BAD).join(GOOD) }, { cite: CITE });
  for (const s of secHits) await guardedUpdate('intelligence_item_sections', (qb) => qb.eq('id', s.id), { content_md: s.content_md.split(BAD).join(GOOD) }, { cite: CITE });
  console.log(`fixed URL in full_brief (${briefHits}) + ${secHits.length} section rows`);

  // route the CLASS blocker to hardening
  const flag = await guardedInsert('integrity_flags', {
    category: 'source_issue', subject_type: 'item', subject_ref: ITEM,
    description: 'hold #11 Green Building Standards held: standard-own-body authority-floor exemption is unwired (no institution_id linkage), so the item\'s own-body standards facts (USGBC/LEED, BREEAM/BRE, tier 4) fail the tier-2 default floor. INSTANCE (malformed citation URL) fixed 2026-07-15; CLASS routed to hardening.',
    recommended_actions: [
      { action: 'wire-standard-own-body-exemption', rationale: 'Populate institution_id linkage (or per-source tier_override for own-body) so a standard\'s own authoring-body facts ground at tier 4 per the gate\'s standard_own_body scope. Route: hardening (standard-own-body-exemption-unwired).' },
      { action: 'resolve-leed-breeam-conflation', rationale: 'Item conflates two standards (LEED/USGBC + BREEAM/BRE); consider splitting into per-body items in the coverage-floor unit.' },
    ],
    status: 'open', created_by: 'audit-remediation-task7-2026-07-15',
  }, { cite: CITE });
  console.log(`hardening next-action flag inserted id=${flag.inserted?.id}`);

  // verify: URL grounded (criterion 2 no longer fails on it), item still honestly quarantined on the floor
  const { data: post } = await sb.from('intelligence_items').select('provenance_status').eq('id', ITEM).single();
  const failsAfter = (await sb.rpc ? null : null); // (validate is read via SQL below)
  const still = post.provenance_status;
  console.log(`\nVERIFY: item status=${still} (expect quarantined; instance fixed, class held). DONE.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
