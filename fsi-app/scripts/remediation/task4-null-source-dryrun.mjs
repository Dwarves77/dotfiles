#!/usr/bin/env node
// task4-null-source-dryrun.mjs -- READ-ONLY analysis for Task 4 (host registration + null-source re-stamp).
// Operator rulings 2026-07-15: reg-family null FACTs on non-authoritative sources RELABEL to ANALYSIS
// (or re-point to primary if in pool, or hold-to-find); floor-exempt types re-stamp at the source's true
// tier; hosts pattern-classified for clear cases, ambiguous HELD (tier never guessed), census republishers
// (law.cornell, korea.net, justia, legiscan, japaneselawtranslation) are republisher-not-authority; $0
// (no re-ground). Produces per-bucket counts + the CRITICAL/HIGH reg-family status-change roster.
// READ-ONLY, no writes. Run: DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/remediation/task4-null-source-dryrun.mjs

import { readClient, readAll } from '../lib/db.mjs';

const REGFAM = new Set(['regulation', 'directive', 'standard', 'guidance', 'framework']);
function floorFor(t) { return REGFAM.has(t) ? 2 : t === 'research_finding' ? 4 : ['technology', 'innovation', 'tool'].includes(t) ? 5 : 99; }

// Pattern classifier. Returns {tier, cls} or {tier:null, cls:'ambiguous'|'no-capture'}. Tier never guessed:
// only clear patterns classify; everything else holds.
function classify(host) {
  if (!host) return { tier: null, cls: 'no-capture' };
  const h = host.toLowerCase();
  if (/(^|\.)law\.cornell\.edu$|(^|\.)korea\.net$|(^|\.)justia\.com$|(^|\.)legiscan\.com$|japaneselawtranslation\.go\.jp$/.test(h)) return { tier: 6, cls: 'republisher' };
  if (/(^|\.)iso\.org$|(^|\.)cen\.eu$|cenelec|(^|\.)ieee\.org$|(^|\.)astm\.org$|(^|\.)iec\.ch$/.test(h)) return { tier: 4, cls: 'standards' };
  if (/\.gov$|\.gov\.[a-z]{2,3}$|\.go\.jp$|(^|\.)europa\.eu$|\.govt\.nz$|\.gouv\.fr$|(^|\.)gob\.[a-z]{2}$/.test(h)) return { tier: 2, cls: 'government' };
  if (/(^|\.)(aoshearman|cms\.law|trenchrossi|slaughterandmay|bakermckenzie|cliffordchance|freshfields|linklaters|whitecase|nortonrosefulbright)\b/.test(h) || /\.law$/.test(h)) return { tier: 6, cls: 'law-firm' };
  if (/(^|\.)arxiv\.org$|\.edu$|\.ac\.[a-z]{2}$/.test(h)) return { tier: 6, cls: 'academic-preprint' };
  if (/(^|\.)(ieta|hydrogencouncil|iata|biofin|smartfreightcentre|fiata|iru)\b/.test(h)) return { tier: 4, cls: 'trade-body' };
  if (/news|times\.com|prnewswire|argusmedia|drewry|stattimes|thetrucker|offshore-energy|reuters|bloomberg|freightwaves|loadstar|splash247|joc\.com|lloydslist/.test(h)) return { tier: 5, cls: 'trade-press' };
  if (/wiki|legalclarity|up\.codes|quetica|onewaybit|promiseenergy|innovationnewsnetwork/.test(h)) return { tier: 6, cls: 'analysis' };
  return { tier: null, cls: 'ambiguous' };
}

async function main() {
  const items = new Map((await readAll('intelligence_items', 'id,item_type,priority,provenance_status,is_archived,title')).map((i) => [i.id, i]));
  // all FACTs on non-archived items (need the full picture per item for floor projection).
  const allFacts = (await readAll('section_claim_provenance', 'id,intelligence_item_id,claim_kind,source_id,source_tier_at_grounding,search_result_id'))
    .filter((p) => String(p.claim_kind).toUpperCase() === 'FACT' && items.get(p.intelligence_item_id) && !items.get(p.intelligence_item_id).is_archived);
  const nullFacts = allFacts.filter((p) => p.source_id == null);
  const srIds = [...new Set(nullFacts.map((c) => c.search_result_id).filter(Boolean))];
  const sr = {};
  for (let i = 0; i < srIds.length; i += 300) for (const r of await readAll('agent_run_searches', 'id,result_url', { match: (q) => q.in('id', srIds.slice(i, i + 300)) })) sr[r.id] = r.result_url;
  const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, '').toLowerCase(); } catch { return null; } };

  const bucket = { restamp: 0, relabel: 0, hold: 0 };
  const byCls = {};
  const perItem = new Map(); // itemId -> {relabelOrHold: n, restamp: n}
  for (const f of nullFacts) {
    const it = items.get(f.intelligence_item_id);
    const { tier, cls } = classify(hostOf(sr[f.search_result_id]));
    byCls[cls] = (byCls[cls] || 0) + 1;
    let b;
    if (cls === 'no-capture' || cls === 'ambiguous') b = 'hold';
    else if (!REGFAM.has(it.item_type)) b = 'restamp';       // floor-exempt: stamp at true tier
    else if (tier <= floorFor(it.item_type)) b = 'restamp';   // authoritative reg source: floor OK
    else b = 'relabel';                                        // reg-family, non-authoritative: FACT->ANALYSIS
    bucket[b]++;
    const pi = perItem.get(f.intelligence_item_id) || { relabelOrHold: 0, restamp: 0 };
    if (b === 'restamp') pi.restamp++; else pi.relabelOrHold++;
    perItem.set(f.intelligence_item_id, pi);
  }

  // Floor projection: a reg-family item's floor-qualifying FACTs after disposition = existing non-null FACTs
  // at tier<=floor + null FACTs re-stamped to authoritative. If that reaches 0, the item risks quarantine.
  const roster = [];
  for (const [itemId, pi] of perItem) {
    const it = items.get(itemId);
    if (!REGFAM.has(it.item_type)) continue;
    const floor = floorFor(it.item_type);
    const facts = allFacts.filter((f) => f.intelligence_item_id === itemId);
    const existingFloorQual = facts.filter((f) => f.source_id != null && f.source_tier_at_grounding != null && f.source_tier_at_grounding <= floor).length;
    const projFloorQual = existingFloorQual + pi.restamp; // relabel/hold remove FACT-hood
    if (projFloorQual === 0) roster.push({ itemId, title: (it.title || '').slice(0, 44), type: it.item_type, priority: it.priority, status: it.provenance_status, movingFacts: pi.relabelOrHold, existingFloorQual });
  }

  console.log(`Null-source FACTs (non-archived): ${nullFacts.length}`);
  console.log(`Buckets: re-stamp ${bucket.restamp} | relabel->ANALYSIS ${bucket.relabel} | hold ${bucket.hold}`);
  console.log(`Host classes:`, JSON.stringify(byCls));
  const critHigh = roster.filter((r) => ['CRITICAL', 'HIGH'].includes(r.priority));
  console.log(`\nCRITICAL/HIGH reg-family items projecting to QUARANTINE (0 floor-qualifying FACTs after disposition): ${critHigh.length}`);
  for (const r of critHigh.sort((a, b) => b.movingFacts - a.movingFacts)) console.log(`  [${r.priority} ${r.status}->quarantine] ${r.type} facts_moving=${r.movingFacts} existingFloorQual=${r.existingFloorQual} :: ${r.itemId} :: ${r.title}`);
  const otherRoster = roster.filter((r) => !['CRITICAL', 'HIGH'].includes(r.priority));
  console.log(`\nLOW/MODERATE reg-family items also projecting to quarantine (proceed without return per ruling): ${otherRoster.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
