#!/usr/bin/env node
// task3-dead-cite-repoint.mjs -- audit-ruled dead-cite re-point sweep (Task 3). Guarded, snapshotted.
// Ground rule (operator 2026-07-15): NOTHING IS GENERIC. Every fact re-points to its SPECIFIC instrument
// or document source at that document's TRUE tier (enacted law = 1, Commission proposal/communication = 2).
// No generic homepage, no catch-all. The dead row (13f9585a, url OJ:L_202500040, confirmed 404) is emptied
// of non-archived FACTs and then SUSPENDED (sources are delete-protected). search_result_id (the exact
// captured page) is preserved. Each captured URL was resolved to its specific document (live-read where
// ambiguous: COM(2023)445 = Weights&Dimensions proposal; summaries mapped to their enacted instrument).
// Run: --dry-run (default) | --execute
//   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/remediation/task3-dead-cite-repoint.mjs --dry-run

import { readClient, readAll, guardedUpdate, guardedInsert } from '../lib/db.mjs';

const DEAD = '13f9585a-1f19-4b07-a0f7-df65ae0f5712';
const CITE = { skill: 'source-credibility-model', reason: 'Task3 dead-cite re-point (operator ruling 2026-07-15, nothing-is-generic): move FACT claims off dead row OJ:L_202500040 to their SPECIFIC EUR-Lex instrument/document source at true tier; RD-22 compliant; suspend the dead 404 row.' };
const EXECUTE = process.argv.includes('--execute');

// key -> {url, tier, name}. The canonical specific source per instrument/document.
const REG = {
  'reg/2013/952':  { url: 'https://eur-lex.europa.eu/eli/reg/2013/952/oj/eng',  tier: 1, name: 'EUR-Lex / Regulation (EU) 952/2013 (Union Customs Code)' },
  'reg/2023/1115': { url: 'https://eur-lex.europa.eu/eli/reg/2023/1115/oj/eng', tier: 1, name: 'EUR-Lex / Regulation (EU) 2023/1115 (EUDR)' },
  'reg/2024/1610': { url: 'https://eur-lex.europa.eu/eli/reg/2024/1610/oj/eng', tier: 1, name: 'EUR-Lex / Regulation (EU) 2024/1610 (HDV CO2 amendment)' },
  'reg/2023/2772': { url: 'https://eur-lex.europa.eu/eli/reg_del/2023/2772/oj/eng', tier: 1, name: 'EUR-Lex / Delegated Regulation (EU) 2023/2772 (ESRS)' },
  'reg/2023/1542': { url: 'https://eur-lex.europa.eu/eli/reg/2023/1542/oj', tier: 1, name: 'EUR-Lex / Regulation (EU) 2023/1542 (Batteries)' },
  'reg/2025/40':   { url: 'https://eur-lex.europa.eu/eli/reg/2025/40/oj/eng', tier: 1, name: 'EUR-Lex / Regulation (EU) 2025/40 (PPWR)' },
  'reg/2024/1257': { url: 'https://eur-lex.europa.eu/eli/reg/2024/1257/oj/eng', tier: 1, name: 'EUR-Lex / Regulation (EU) 2024/1257' },
  'reg/2024/1157': { url: 'https://eur-lex.europa.eu/eli/reg/2024/1157/oj/eng', tier: 1, name: 'EUR-Lex / Regulation (EU) 2024/1157 (Waste Shipments)' },
  'reg/2023/1805': { url: 'https://eur-lex.europa.eu/eli/reg/2023/1805/oj/eng', tier: 1, name: 'EUR-Lex / Regulation (EU) 2023/1805 (FuelEU Maritime)' },
  'reg/2023/956':  { url: 'https://eur-lex.europa.eu/eli/reg/2023/956/oj/eng',  tier: 1, name: 'EUR-Lex / Regulation (EU) 2023/956 (CBAM)' },
  'reg/2020/1056': { url: 'https://eur-lex.europa.eu/eli/reg/2020/1056/oj/eng', tier: 1, name: 'EUR-Lex / Regulation (EU) 2020/1056 (eFTI)' },
  'dir/2023/959':  { url: 'https://eur-lex.europa.eu/eli/dir/2023/959/oj/eng',  tier: 1, name: 'EUR-Lex / Directive (EU) 2023/959 (EU ETS amendment)' },
  'reg/2023/2405': { url: 'https://eur-lex.europa.eu/eli/reg/2023/2405/oj/eng', tier: 1, name: 'EUR-Lex / Regulation (EU) 2023/2405 (ReFuelEU Aviation)' },
  'reg/2024/1735': { url: 'https://eur-lex.europa.eu/eli/reg/2024/1735/oj/eng', tier: 1, name: 'EUR-Lex / Regulation (EU) 2024/1735 (Net-Zero Industry Act)' },
  'reg/2019/1242': { url: 'https://eur-lex.europa.eu/eli/reg/2019/1242/oj/eng', tier: 1, name: 'EUR-Lex / Regulation (EU) 2019/1242 (HDV CO2 standards)' },
  'reg/2023/1804': { url: 'https://eur-lex.europa.eu/eli/reg/2023/1804/oj/eng', tier: 1, name: 'EUR-Lex / Regulation (EU) 2023/1804 (AFIR)' },
  'dir/2022/2464': { url: 'https://eur-lex.europa.eu/eli/dir/2022/2464/oj/eng', tier: 1, name: 'EUR-Lex / Directive (EU) 2022/2464 (CSRD)' },
  'dir/2003/87':   { url: 'https://eur-lex.europa.eu/eli/dir/2003/87/oj/eng',   tier: 1, name: 'EUR-Lex / Directive 2003/87/EC (EU ETS)' },
  'com/2023/441':  { url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52023PC0441', tier: 2, name: 'EUR-Lex / COM(2023) 441 final (CountEmissions EU, proposal)' },
  'com/2021/550':  { url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52021DC0550', tier: 2, name: 'EUR-Lex / COM(2021) 550 final (Fit for 55, communication)' },
  'com/2023/445':  { url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52023PC0445', tier: 2, name: 'EUR-Lex / COM(2023) 445 final (Weights & Dimensions Directive, proposal)' },
};

function resolveKey(url) {
  if (!url) return null;
  const u = decodeURIComponent(String(url));
  if (/summary\/union-customs-code/i.test(u)) return 'reg/2013/952';
  if (/summary\/carbon-border-adjustment/i.test(u)) return 'reg/2023/956';
  if (/summary\/eu-emissions-trading/i.test(u)) return 'dir/2003/87';
  if (/summary\/renewable-and-low-carbon-fuels-in-maritime/i.test(u)) return 'reg/2023/1805';
  if (/52023PC0441|comnat:COM_2023_0441/i.test(u)) return 'com/2023/441';
  if (/52021DC0550/i.test(u)) return 'com/2021/550';
  if (/52023PC0445/i.test(u)) return 'com/2023/445';
  let m = u.match(/CELEX:?3(\d{4})([RLD])(\d{1,4})/i);
  if (m) return `${ { R: 'reg', L: 'dir', D: 'dec' }[m[2].toUpperCase()] }/${m[1]}/${parseInt(m[3], 10)}`;
  m = u.match(/eli\/(reg|dir|dec)(?:_del|_impl)?\/(\d{4})\/(\d{1,4})/i);
  if (m) return `${m[1].toLowerCase()}/${m[2]}/${parseInt(m[3], 10)}`;
  m = u.match(/OJ:L_(\d{4})(\d{5})/i); // OJ ref encodes year + instrument number
  if (m) return `reg/${m[1]}/${parseInt(m[2], 10)}`;
  return null;
}

function canon(u) { return String(u || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''); }

async function main() {
  const sb = readClient();
  const allSrc = await readAll('sources', 'id,url,base_tier,status');
  const canonToSrc = {}; for (const s of allSrc) if (s.status === 'active') canonToSrc[canon(s.url)] = s;

  const arch = new Set((await readAll('intelligence_items', 'id,is_archived')).filter((i) => i.is_archived).map((i) => i.id));
  const claims = (await readAll('section_claim_provenance', 'id,intelligence_item_id,search_result_id,claim_kind', { match: (q) => q.eq('source_id', DEAD) }))
    .filter((c) => String(c.claim_kind).toUpperCase() === 'FACT' && !arch.has(c.intelligence_item_id));
  const srIds = [...new Set(claims.map((c) => c.search_result_id).filter(Boolean))];
  const sr = {};
  for (let i = 0; i < srIds.length; i += 300) for (const r of await readAll('agent_run_searches', 'id,result_url', { match: (q) => q.in('id', srIds.slice(i, i + 300)) })) sr[r.id] = r.result_url;

  const byKey = {}; const held = [];
  for (const c of claims) { const k = resolveKey(sr[c.search_result_id]); if (k && REG[k]) (byKey[k] ??= []).push(c.id); else held.push({ id: c.id, url: sr[c.search_result_id] }); }

  console.log(`Dead-cite non-archived FACTs: ${claims.length}. Resolved to ${Object.keys(byKey).length} specific sources. Unresolved(hold): ${held.length}\n`);
  console.log('key                tier  facts  existing?  name');
  for (const k of Object.keys(byKey).sort()) {
    const r = REG[k]; const exists = !!canonToSrc[canon(r.url)];
    console.log(`${k.padEnd(16)}  T${r.tier}   ${String(byKey[k].length).padStart(4)}   ${exists ? 'yes' : 'REGISTER'}   ${r.name}`);
  }
  if (held.length) console.log('\nHELD (no specific resolution):', JSON.stringify(held.slice(0, 10)));

  if (!EXECUTE) { console.log('\nDRY-RUN. No writes. Re-run with --execute.'); return; }

  let repointed = 0, registered = 0;
  for (const k of Object.keys(byKey)) {
    const r = REG[k];
    let src = canonToSrc[canon(r.url)];
    if (!src) { const ins = await guardedInsert('sources', { url: r.url, name: r.name, base_tier: r.tier, tier_at_creation: r.tier, status: 'active', admin_only: false }, { cite: CITE }); src = { id: ins.inserted.id }; registered++; console.log(`registered ${r.name} -> ${src.id}`); }
    const ids = byKey[k];
    for (let i = 0; i < ids.length; i += 5) { const b = ids.slice(i, i + 5); const res = await guardedUpdate('section_claim_provenance', (qb) => qb.in('id', b), { source_id: src.id, source_tier_at_grounding: r.tier }, { cite: CITE, select: 'id,source_id,source_tier_at_grounding' }); repointed += res.updated; if ((repointed % 100) < 5) console.log(`  ...re-pointed ~${repointed}`); }
  }
  console.log(`\nregistered ${registered} specific sources; re-pointed ${repointed} facts.`);
  if (held.length) await guardedInsert('integrity_flags', { category: 'source_issue', subject_type: 'source', subject_ref: DEAD, description: `Task3 residual: ${held.length} dead-cite FACTs did not resolve to a specific instrument; held for per-item resolution (nothing-is-generic: no generic re-point).`, recommended_actions: [{ action: 'resolve-specific-instrument', rationale: 'Read each fact and bind to its specific enacted instrument.' }], status: 'open', created_by: 'audit-remediation-task3-2026-07-15' }, { cite: CITE });
  const remain = (await readAll('section_claim_provenance', 'id', { match: (q) => q.eq('source_id', DEAD) })).length;
  await guardedUpdate('sources', (qb) => qb.eq('id', DEAD), { status: 'suspended' }, { cite: CITE });
  console.log(`dead row remaining (all statuses, incl. archived-item claims): ${remain}. Dead row SUSPENDED.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
