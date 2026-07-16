#!/usr/bin/env node
// task6-q4-tier-strip.mjs -- Q4 tier-methodology cleanup (Task 6). Guarded, snapshotted.
// Operator ruling 2026-07-15 (Option 1, ledger + prose, corpus-wide):
//   PART A (ledger): delete the 33 tier-methodology-as-FACT claims (self-referential source-tier assertions).
//     Only 1 is sole-coverage of a required slot (af277afd, methodology_limits, LOW research) -> it honestly
//     quarantines and joins the re-ground queue; no slot fact fabricated at $0. The other 32 empty no slot.
//   PART B (prose): strip the customer-facing "(Tier N)" annotation from the Sources-table rows of all 63
//     verified non-archived briefs that carry it (40 non-reg render it live; 23 reg-family are accordion-
//     stripped -> data-hygiene + defense-in-depth). TARGETED: only table rows ("|"-leading) that also carry a
//     URL or a source-type label, so no legitimate regulatory "(Tier N)" prose is touched; the Type
//     DESCRIPTION is preserved.
//   The skill/template recurrence fix (the §15 Sources template emits "Type (inline Tier)", parsed by
//   extract-regulation-sections.parseSourcesList -> a PIPELINE change, not a render string) routes to the
//   hardening unit by name: tier-machinery-in-customer-prose. Not fixed here.
// Run: --dry-run (default) | --execute
//   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/remediation/task6-q4-tier-strip.mjs --dry-run

import { readClient, readAll, guardedUpdate, guardedDelete } from '../lib/db.mjs';

const EXECUTE = process.argv.includes('--execute');
const CITE_LEDGER = { skill: 'source-credibility-model', reason: 'Task6 Q4 ledger strip (operator ruling 2026-07-15): remove tier-methodology-as-FACT claims (self-referential source-tier assertions never customer facts).' };
const CITE_PROSE = { skill: 'source-credibility-model', reason: 'Task6 Q4 prose strip (operator ruling 2026-07-15, corpus-wide): remove customer-facing (Tier N) source-tier annotation from Sources-table rows; Type description preserved; template recurrence fix routed to hardening (tier-machinery-in-customer-prose).' };

// Matches the SQL Q4 scan exactly (must yield 33).
const Q4_RE = /classified as tier|is a tier[\s-]?[0-9]|listed as a tier|tier[\s-]?[0-9]\s*(source|classification|:|—)/i;
const TYPE_LABEL_RE = /body position|binding law|regulator|intergovernmental|industry body|classification society|news reporting|analysis|standards? body|primary|coalition/i;

/** Strip "(Tier N)" only from Sources-table rows (pipe-led line carrying a URL or a source-type label). */
function stripTierParens(brief) {
  let n = 0;
  const out = String(brief).split(/\n/).map((line) => {
    const isRow = line.startsWith('|');
    const hasTier = /\(Tier\s*[1-7]\)/.test(line);
    if (isRow && hasTier && (/https?:\/\//.test(line) || TYPE_LABEL_RE.test(line))) {
      return line.replace(/\s*\(Tier\s*[1-7]\)/g, () => { n++; return ''; });
    }
    return line;
  }).join('\n');
  return { out, n };
}

async function main() {
  const arch = new Set((await readAll('intelligence_items', 'id,is_archived')).filter((i) => i.is_archived).map((i) => i.id));

  // PART A: Q4 ledger claims
  const facts = (await readAll('section_claim_provenance', 'id,intelligence_item_id,claim_text,claim_kind'))
    .filter((p) => String(p.claim_kind).toUpperCase() === 'FACT' && !arch.has(p.intelligence_item_id) && Q4_RE.test(p.claim_text));
  const q4Ids = facts.map((f) => f.id);

  const verifiedNonArch = new Set((await readAll('intelligence_items', 'id,provenance_status,is_archived')).filter((i) => !i.is_archived && i.provenance_status === 'verified').map((i) => i.id));

  // PART B: prose briefs (full_brief)
  const briefs = (await readAll('intelligence_items', 'id,title,provenance_status,is_archived,full_brief'))
    .filter((i) => !i.is_archived && i.provenance_status === 'verified' && i.full_brief && /\(Tier\s*[1-7]\)/.test(i.full_brief));
  const prosePlan = [];
  for (const b of briefs) { const { out, n } = stripTierParens(b.full_brief); if (n > 0 && out !== b.full_brief) prosePlan.push({ id: b.id, title: b.title, n, out }); }

  // PART C: section content_md (the second render path)
  const sections = (await readAll('intelligence_item_sections', 'id,item_id,section_key,content_md'))
    .filter((s) => verifiedNonArch.has(s.item_id) && s.content_md && /\(Tier\s*[1-7]\)/.test(s.content_md));
  const sectionPlan = [];
  for (const s of sections) { const { out, n } = stripTierParens(s.content_md); if (n > 0 && out !== s.content_md) sectionPlan.push({ id: s.id, n, out }); }

  console.log(`PART A ledger: Q4 tier-methodology FACT claims to delete = ${q4Ids.length}`);
  console.log(`PART B full_brief: briefs to strip = ${prosePlan.length}; annotations removed = ${prosePlan.reduce((s, p) => s + p.n, 0)}`);
  console.log(`PART C sections:   rows to strip = ${sectionPlan.length}; annotations removed = ${sectionPlan.reduce((s, p) => s + p.n, 0)}`);
  // sample: show 3 before/after Sources-row diffs
  console.log('\nSample prose diffs (first 3 briefs):');
  for (const p of prosePlan.slice(0, 3)) {
    const beforeRow = (briefs.find((b) => b.id === p.id).full_brief.split(/\n/).find((l) => l.startsWith('|') && /\(Tier\s*[1-7]\)/.test(l)) || '').slice(0, 140);
    const afterRow = beforeRow.replace(/\s*\(Tier\s*[1-7]\)/g, '');
    console.log(`  ${p.title.slice(0, 40)} (x${p.n})\n     BEFORE: ${beforeRow}\n     AFTER : ${afterRow}`);
  }

  if (!EXECUTE) { console.log('\nDRY-RUN. No writes. Re-run with --execute.'); return; }

  // A: delete ledger claims (batch 5 for the provenance trigger)
  let del = 0; for (let i = 0; i < q4Ids.length; i += 5) { const r = await guardedDelete('section_claim_provenance', q4Ids.slice(i, i + 5), { cite: CITE_LEDGER }); del += r.deleted; }
  console.log(`\ndeleted ${del} ledger claims`);

  // B: strip full_brief per item
  let stripped = 0; for (const p of prosePlan) { await guardedUpdate('intelligence_items', (qb) => qb.eq('id', p.id), { full_brief: p.out }, { cite: CITE_PROSE }); stripped++; }
  console.log(`stripped (Tier N) from ${stripped} full_brief bodies`);

  // C: strip section content_md per row
  let secStripped = 0; for (const p of sectionPlan) { await guardedUpdate('intelligence_item_sections', (qb) => qb.eq('id', p.id), { content_md: p.out }, { cite: CITE_PROSE }); secStripped++; }
  console.log(`stripped (Tier N) from ${secStripped} section rows`);

  // verify
  const sb = readClient();
  const { count: proseRemain } = await sb.from('intelligence_items').select('id', { count: 'exact', head: true }).eq('is_archived', false).eq('provenance_status', 'verified').like('full_brief', '%(Tier %');
  const afterFacts = (await readAll('section_claim_provenance', 'id,intelligence_item_id,claim_text,claim_kind')).filter((p) => String(p.claim_kind).toUpperCase() === 'FACT' && !arch.has(p.intelligence_item_id) && Q4_RE.test(p.claim_text));
  const { data: af } = await sb.from('intelligence_items').select('provenance_status').eq('id', 'af277afd-b925-4583-852a-eaa6db310888').single();
  console.log(`\nVERIFY: Q4 ledger claims remaining = ${afterFacts.length} (must be 0); af277afd status = ${af?.provenance_status} (expect quarantined)`);
  console.log(`NOTE: verified non-archived briefs still matching '(Tier ' (may include legit regulatory prose) = ${proseRemain}`);
  if (afterFacts.length !== 0) { console.error('VERIFY FAIL: ledger claims remain'); process.exit(2); }
  console.log('DONE.');
}

main().catch((e) => { console.error(e); process.exit(1); });
