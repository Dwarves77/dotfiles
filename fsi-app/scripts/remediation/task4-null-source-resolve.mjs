#!/usr/bin/env node
// task4-null-source-resolve.mjs -- audit-ruled null-source FACT resolution (Task 4). Guarded, snapshotted, $0.
// Operator ruling 2026-07-15 (Option 1): resolve every null-source FACT on a non-archived item by the
// FLOOR-FIRST order below. Nothing is generic; every fact grounds in truth from a real captured source or
// is honestly demoted/held. Retrieval-before-generation: the fact's true source is very often ALREADY in
// the item's own captured pool (agent_run_searches) -- find it before demoting. Zero Browserless (reads
// stored excerpts only). RD-22 (re-point only to registered sources). The provenance trigger re-validates
// each item on write; batch=5 (Task 3 lesson: the per-row recompute times out at larger batches).
//
// Disposition order, per null-source FACT (item floor F: reg-family<=2, research<=4, tech<=5, else EXEMPT/99):
//   1. RE-POINT (reg-family only): a floor-qualifying source (tier<=F) in the item's OWN pool whose stored
//      excerpt CONTAINS the fact's verbatim source_span. Re-point source_id + tier + search_result_id to
//      THAT row so tier and span come from the SAME source (honest re-attribution, best-tier-first). Never
//      forced: fires only on a genuine verbatim span match (the gate's own criterion-3 test).
//   2. RE-STAMP: the fact's OWN captured host is authoritative for the floor (tier<=F) AND its excerpt
//      contains the span -> stamp source_id + true tier (keep search_result_id). For EXEMPT types this
//      stamps at the source's true tier at any level (floor not armed).
//   3. RELABEL (reg-family only): own host is classified but non-authoritative (tier>F) -> claim_kind
//      ANALYSIS (stop asserting an unsourceable FACT; item stays quarantined, enqueued for re-ground).
//   4. HOLD: ambiguous / uncaptured host, no pool match -> leave null, one aggregated integrity_flag names
//      the hosts to classify (no resting state; the flag IS the next-action).
//
// Run: --dry-run (default) | --execute
//   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/remediation/task4-null-source-resolve.mjs --dry-run

import { readAll, guardedUpdate, guardedInsert } from '../lib/db.mjs';

const EXECUTE = process.argv.includes('--execute');
const CITE = {
  skill: 'source-credibility-model',
  reason: 'Task4 null-source FACT resolution (operator ruling 2026-07-15, Option 1): floor-first re-point from the item captured pool -> re-stamp own-host at true tier -> relabel reg-family non-authoritative FACT to ANALYSIS -> hold ambiguous. Nothing-is-generic; RD-22; $0 (stored excerpts only); the provenance gate renders the honest status verdict on write.',
};

const REGFAM = new Set(['regulation', 'directive', 'standard', 'guidance', 'framework']);
const floorFor = (t) => (REGFAM.has(t) ? 2 : t === 'research_finding' ? 4 : ['technology', 'innovation', 'tool'].includes(t) ? 5 : 99);

// Pattern classifier -- returns {tier, cls}. Tier never guessed: only clear patterns classify; the rest hold.
function classify(host) {
  if (!host) return { tier: null, cls: 'no-capture' };
  const h = host.toLowerCase();
  if (/(^|\.)law\.cornell\.edu$|(^|\.)korea\.net$|(^|\.)justia\.com$|(^|\.)legiscan\.com$|japaneselawtranslation\.go\.jp$/.test(h)) return { tier: 6, cls: 'republisher' };
  if (/(^|\.)iso\.org$|(^|\.)cen\.eu$|cenelec|(^|\.)ieee\.org$|(^|\.)astm\.org$|(^|\.)iec\.ch$/.test(h)) return { tier: 4, cls: 'standards' };
  if (/\.gov$|\.gov\.[a-z]{2,3}$|\.go\.jp$|\.go\.kr$|\.gc\.ca$|\.canada\.ca$|(^|\.)europa\.eu$|\.govt\.nz$|\.gouv\.fr$|(^|\.)gob\.[a-z]{2}$/.test(h)) return { tier: 2, cls: 'government' };
  if (/(^|\.)unep\.org$|(^|\.)unido\.org$|(^|\.)unesco\.org$/.test(h)) return { tier: 3, cls: 'intergovernmental' };
  if (/(^|\.)(aoshearman|cms\.law|trenchrossi|slaughterandmay|bakermckenzie|cliffordchance|freshfields|linklaters|whitecase|nortonrosefulbright)\b/.test(h) || /\.law$/.test(h)) return { tier: 6, cls: 'law-firm' };
  if (/(^|\.)arxiv\.org$|\.edu$|\.ac\.[a-z]{2}$/.test(h)) return { tier: 6, cls: 'academic-preprint' };
  if (/(^|\.)(ieta|hydrogencouncil|iata|biofin|smartfreightcentre|fiata|iru)\b/.test(h)) return { tier: 4, cls: 'trade-body' };
  if (/news|times\.com|prnewswire|argusmedia|drewry|stattimes|thetrucker|offshore-energy|reuters|bloomberg|freightwaves|loadstar|splash247|joc\.com|lloydslist/.test(h)) return { tier: 5, cls: 'trade-press' };
  if (/wiki|legalclarity|up\.codes|quetica|onewaybit|promiseenergy|innovationnewsnetwork/.test(h)) return { tier: 6, cls: 'analysis' };
  return { tier: null, cls: 'ambiguous' };
}

const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, '').toLowerCase(); } catch { return null; } };
const canon = (u) => String(u || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
const spanIn = (span, ex) => { if (!span || !ex) return false; return String(ex).toLowerCase().includes(String(span).trim().toLowerCase()); };

async function main() {
  const items = new Map((await readAll('intelligence_items', 'id,item_type,priority,provenance_status,is_archived,title')).map((i) => [i.id, i]));
  const nullFacts = (await readAll('section_claim_provenance', 'id,intelligence_item_id,claim_kind,source_id,source_span,search_result_id'))
    .filter((p) => String(p.claim_kind).toUpperCase() === 'FACT' && p.source_id == null && items.get(p.intelligence_item_id) && !items.get(p.intelligence_item_id).is_archived);
  const itemIds = [...new Set(nullFacts.map((f) => f.intelligence_item_id))];

  // Per-item captured pools (id -> rows) and a flat lookup by search_result_id.
  const pool = new Map();
  const poolById = new Map();
  for (let i = 0; i < itemIds.length; i += 150) {
    const rows = await readAll('agent_run_searches', 'id,intelligence_item_id,result_url,result_content_excerpt,result_title', { match: (q) => q.in('intelligence_item_id', itemIds.slice(i, i + 150)) });
    for (const r of rows) { if (!pool.has(r.intelligence_item_id)) pool.set(r.intelligence_item_id, []); pool.get(r.intelligence_item_id).push(r); poolById.set(r.id, r); }
  }

  const allSrc = await readAll('sources', 'id,url,base_tier,status');
  const canonToSrc = {}; for (const s of allSrc) if (s.status === 'active') canonToSrc[canon(s.url)] = s;
  // Registry base_tier is authoritative over the pattern-guess: prefer the registered canonical tier.
  const tierOfUrl = (url) => { const ex = canonToSrc[canon(url)]; if (ex && ex.base_tier != null) return ex.base_tier; return classify(hostOf(url)).tier; };

  const plan = [];
  const counts = { repoint: 0, restamp: 0, relabel: 0, hold: 0 };
  const holdHosts = {};
  for (const f of nullFacts) {
    const it = items.get(f.intelligence_item_id);
    const F = floorFor(it.item_type);
    const p = pool.get(f.intelligence_item_id) || [];
    const own = f.search_result_id ? poolById.get(f.search_result_id) : null;
    let disp = null, srcUrl = null, tier = null, srId = f.search_result_id, name = null;

    // 1. RE-POINT (reg-family): best-tier floor source in pool whose excerpt contains the span.
    if (REGFAM.has(it.item_type)) {
      let best = null;
      for (const r of p) {
        if (!spanIn(f.source_span, r.result_content_excerpt)) continue;
        const t = tierOfUrl(r.result_url);
        if (t != null && t <= F && (!best || t < best.t)) best = { r, t };
      }
      if (best) { disp = 'repoint'; srcUrl = best.r.result_url; tier = best.t; srId = best.r.id; name = `${hostOf(best.r.result_url)} / ${(best.r.result_title || 'captured page').slice(0, 80)}`; }
    }
    // 2. RE-STAMP own-host (authoritative for the floor; any tier for EXEMPT), span in own excerpt.
    if (!disp && own) {
      const t = tierOfUrl(own.result_url);
      if (t != null && t <= F && spanIn(f.source_span, own.result_content_excerpt)) { disp = 'restamp'; srcUrl = own.result_url; tier = t; srId = own.id; name = `${hostOf(own.result_url)} / ${(own.result_title || 'captured page').slice(0, 80)}`; }
    }
    // 3. RELABEL (reg-family): own host classified but non-authoritative -> ANALYSIS.
    if (!disp && REGFAM.has(it.item_type) && own && tierOfUrl(own.result_url) != null) disp = 'relabel';
    // 4. HOLD.
    if (!disp) { disp = 'hold'; const h = own ? hostOf(own.result_url) : 'no-capture'; holdHosts[h || 'no-capture'] = (holdHosts[h || 'no-capture'] || 0) + 1; }

    counts[disp]++;
    plan.push({ factId: f.id, itemId: f.intelligence_item_id, itemType: it.item_type, priority: it.priority, status: it.provenance_status, disp, srcUrl, tier, srId, name });
  }

  // ---- report ----
  console.log(`Null-source FACTs: ${nullFacts.length} on ${itemIds.length} non-archived items`);
  console.log(`Dispositions: re-point ${counts.repoint} | re-stamp ${counts.restamp} | relabel->ANALYSIS ${counts.relabel} | hold ${counts.hold}`);
  console.log(`Hold hosts:`, JSON.stringify(holdHosts));
  // Per reg-family item, the disposition mix (these are the candidates for quarantined->verified recovery).
  const regItems = [...new Set(plan.filter((p) => REGFAM.has(p.itemType)).map((p) => p.itemId))];
  console.log(`\nReg-family items (${regItems.length}) disposition mix [priority status | repoint/restamp/relabel/hold]:`);
  for (const id of regItems) {
    const ps = plan.filter((p) => p.itemId === id);
    const m = { repoint: 0, restamp: 0, relabel: 0, hold: 0 }; for (const p of ps) m[p.disp]++;
    const it = items.get(id);
    const recoverable = m.relabel === 0 && m.hold === 0; // all facts grounded -> gate may re-verify
    console.log(`  [${it.priority} ${it.provenance_status}]${recoverable ? ' RECOVER?' : ''} ${it.item_type} rp=${m.repoint} rs=${m.restamp} rl=${m.relabel} h=${m.hold} :: ${id} :: ${(it.title || '').slice(0, 44)}`);
  }

  if (!EXECUTE) { console.log('\nDRY-RUN. No writes. Re-run with --execute.'); return; }

  // ---- execute ----
  const cache = {};
  async function srcId(url, tier, name) {
    const c = canon(url);
    if (canonToSrc[c]) return canonToSrc[c].id;
    if (cache[c]) return cache[c];
    const ins = await guardedInsert('sources', { url, name, base_tier: tier, tier_at_creation: tier, status: 'active', admin_only: false }, { cite: CITE });
    cache[c] = ins.inserted.id; console.log(`registered ${name} (T${tier}) -> ${ins.inserted.id}`);
    return ins.inserted.id;
  }

  let done = 0;
  // RELABEL: identical payload, batch of 5.
  const relabelIds = plan.filter((p) => p.disp === 'relabel').map((p) => p.factId);
  for (let i = 0; i < relabelIds.length; i += 5) { const b = relabelIds.slice(i, i + 5); await guardedUpdate('section_claim_provenance', (qb) => qb.in('id', b), { claim_kind: 'ANALYSIS' }, { cite: CITE, select: 'id,claim_kind' }); done += b.length; }
  console.log(`relabeled ${relabelIds.length} FACT->ANALYSIS`);

  // RE-POINT + RE-STAMP: resolve source, group by identical payload (source_id|tier|search_result_id), batch of 5.
  const grp = new Map();
  for (const p of plan) {
    if (p.disp !== 'repoint' && p.disp !== 'restamp') continue;
    const id = await srcId(p.srcUrl, p.tier, p.name);
    const key = `${id}|${p.tier}|${p.srId}`;
    if (!grp.has(key)) grp.set(key, { id, tier: p.tier, srId: p.srId, ids: [] });
    grp.get(key).ids.push(p.factId);
  }
  let rp = 0, rs = 0;
  for (const g of grp.values()) for (let i = 0; i < g.ids.length; i += 5) {
    const b = g.ids.slice(i, i + 5);
    await guardedUpdate('section_claim_provenance', (qb) => qb.in('id', b), { source_id: g.id, source_tier_at_grounding: g.tier, search_result_id: g.srId }, { cite: CITE, select: 'id,source_id' });
    done += b.length;
  }
  rp = plan.filter((p) => p.disp === 'repoint').length; rs = plan.filter((p) => p.disp === 'restamp').length;
  console.log(`re-pointed ${rp}, re-stamped ${rs}`);

  // HOLD: one aggregated next-action flag naming the hosts to classify.
  if (counts.hold) {
    await guardedInsert('integrity_flags', {
      category: 'source_issue', subject_type: 'system', subject_ref: 'task4-null-source-hold',
      description: `Task4 residual: ${counts.hold} null-source FACTs held (ambiguous/uncaptured host; tier never guessed). Classify the hosts, then re-point or re-ground.`,
      recommended_actions: [{ action: 'classify-hold-hosts', rationale: 'Per-host classification then re-point/re-ground.', hosts: holdHosts }],
      status: 'open', created_by: 'audit-remediation-task4-2026-07-15',
    }, { cite: CITE });
    console.log(`held ${counts.hold} (aggregated integrity_flag written)`);
  }

  // ---- status delta (the gate's honest verdict) ----
  const after = new Map((await readAll('intelligence_items', 'id,provenance_status,priority,item_type,title', { match: (q) => q.in('id', itemIds) })).map((i) => [i.id, i]));
  const changed = [];
  for (const id of itemIds) { const b = items.get(id).provenance_status, a = after.get(id).provenance_status; if (b !== a) changed.push({ id, from: b, to: a, it: after.get(id) }); }
  console.log(`\nStatus changes: ${changed.length}`);
  for (const c of changed.sort((x, y) => (x.to > y.to ? 1 : -1))) console.log(`  [${c.it.priority}] ${c.from} -> ${c.to} :: ${c.it.item_type} :: ${c.id} :: ${(c.it.title || '').slice(0, 44)}`);
  const nowNull = (await readAll('section_claim_provenance', 'id', { match: (q) => q.eq('claim_kind', 'FACT') })).length;
  console.log(`\ntotal claim updates: ${done}. DONE.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
