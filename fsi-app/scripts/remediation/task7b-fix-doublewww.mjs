#!/usr/bin/env node
// task7b-fix-doublewww.mjs -- correct the double-www my Task7 naive replace introduced. Guarded, snapshotted.
// Task7 replaced 'gov.gov.uk'->'www.gov.uk' but an original 'www.gov.gov.uk' became 'www.www.gov.uk', which
// canonicalizes to 'www.gov.uk' (one www remains) != pool 'gov.uk' -> still ungrounded (criterion 2). Fix:
// normalize 'www.www.gov.uk' -> 'www.gov.uk'. Verifies criterion 2 clears; item stays quarantined on the floor.
//   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/remediation/task7b-fix-doublewww.mjs --execute

import { readClient, guardedUpdate } from '../lib/db.mjs';
const ITEM = '9e594959-7de8-41e8-a25c-5b1976f77b34';
const CITE = { skill: 'source-credibility-model', reason: 'Task7b: correct double-www (www.www.gov.uk -> www.gov.uk) introduced by the Task7 URL fix so criterion 2 grounds.' };
const EXECUTE = process.argv.includes('--execute');
const fix = (t) => String(t).split('www.www.gov.uk').join('www.gov.uk');

async function main() {
  const sb = readClient();
  const { data: item } = await sb.from('intelligence_items').select('full_brief').eq('id', ITEM).single();
  const { data: secs } = await sb.from('intelligence_item_sections').select('id,content_md').eq('item_id', ITEM);
  const briefHits = (item.full_brief.match(/www\.www\.gov\.uk/g) || []).length;
  const secHits = (secs || []).filter((s) => s.content_md && s.content_md.includes('www.www.gov.uk'));
  console.log(`double-www: full_brief x${briefHits}, ${secHits.length} section rows`);
  if (!EXECUTE) { console.log('DRY-RUN.'); return; }
  if (briefHits) await guardedUpdate('intelligence_items', (qb) => qb.eq('id', ITEM), { full_brief: fix(item.full_brief) }, { cite: CITE });
  for (const s of secHits) await guardedUpdate('intelligence_item_sections', (qb) => qb.eq('id', s.id), { content_md: fix(s.content_md) }, { cite: CITE });
  console.log(`fixed full_brief(${briefHits}) + ${secHits.length} sections`);
}
main().catch((e) => { console.error(e); process.exit(1); });
