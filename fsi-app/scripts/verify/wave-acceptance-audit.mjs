#!/usr/bin/env node
// wave-acceptance-audit.mjs — SCAFFOLD (authored 2026-07-15, NOT WIRED into wave-close).
// Registers the standing ground-truth QA lane from ADR-014 (wave-acceptance sampling).
// READ-ONLY. Computes the risk-weighted acceptance sample for a wave + the mechanical pre-scan
// (provenance structure), then emits a manifest for the LIVE three-layer pass (L1/L2/L3), which
// requires a Chrome live-read of each cited primary and cannot be fully scripted.
//
// Status: proposed. Ratification (ADR-014) sets WAVE_ACCEPTANCE_N and wires the accuracy-rate
// escalation gate into wave-close. Until then this is an on-demand read-only reporter.
//
// Usage:
//   node scripts/verify/wave-acceptance-audit.mjs --since "2026-07-13T00:00:00Z"
//   node scripts/verify/wave-acceptance-audit.mjs --ids id1,id2,...
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (read-only use here).

import { createClient } from '@supabase/supabase-js';

const N_PCT = Number(process.env.WAVE_ACCEPTANCE_N ?? 10); // ADR-014 proposed default
const FLOOR = 3;
const DEAD_URL = 'https://eur-lex.europa.eu/legal-content/EN/TXT?uri=OJ:L_202500040'; // S1 (confirmed 404)
const NON_EN = new Set(['CN','JP','KR','BR','MX','VN','DE','ES','PT','DK','NO','CL','AR','FI','AT','CH','BE','SE','NL','EG']);

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

// Risk score — identical formula to the 2026-07-15 unit's sampling frame.
function riskScore(it, facts) {
  const preGuard = !it.last_regenerated_at || new Date(it.last_regenerated_at) < new Date('2026-06-23');
  const nonEn = (it.jurisdiction_iso || []).some((j) => NON_EN.has(j));
  const tnull = facts.filter((f) => f.claim_kind?.toUpperCase() === 'FACT' && f.source_tier_at_grounding == null).length;
  const factN = facts.filter((f) => f.claim_kind?.toUpperCase() === 'FACT').length;
  return (preGuard ? 2 : 0) + (nonEn ? 2 : 0)
    + (['CRITICAL', 'HIGH'].includes(it.priority) ? 1 : 0)
    + (tnull > 0 ? 1 : 0) + (factN >= 20 ? 1 : 0)
    + (it.provenance_status === 'quarantined' ? 2 : 0);
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(2); }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // 1) Resolve the wave's item set.
  const ids = arg('--ids');
  const since = arg('--since');
  let itemsQ = db.from('intelligence_items')
    .select('id,title,item_type,priority,provenance_status,last_regenerated_at,jurisdiction_iso,canonical_instrument_key,is_archived')
    .eq('is_archived', false);
  if (ids) itemsQ = itemsQ.in('id', ids.split(','));
  else if (since) {
    const runs = await db.from('agent_runs').select('intelligence_item_id').gte('created_at', since);
    if (runs.error) throw runs.error;
    const waveIds = [...new Set((runs.data || []).map((r) => r.intelligence_item_id).filter(Boolean))];
    itemsQ = itemsQ.in('id', waveIds);
  } else { console.error('Provide --ids or --since'); process.exit(2); }
  const { data: items, error: iErr } = await itemsQ;
  if (iErr) throw iErr;
  if (!items.length) { console.log('No items in wave frame.'); return; }

  // 2) Per-item claim + provenance pre-scan.
  const scored = [];
  for (const it of items) {
    const { data: claims, error: cErr } = await db.from('section_claim_provenance')
      .select('claim_kind,source_id,source_tier_at_grounding')
      .eq('intelligence_item_id', it.id);
    if (cErr) throw cErr;
    const facts = (claims || []).filter((c) => c.claim_kind?.toUpperCase() === 'FACT');
    const nullSrc = facts.filter((f) => f.source_id == null).length;              // S2
    // S1 (dead/generic EUR-Lex row) — resolve which source_ids point at the dead URL.
    const srcIds = [...new Set(facts.map((f) => f.source_id).filter(Boolean))];
    let deadRow = 0;
    if (srcIds.length) {
      const { data: srcs } = await db.from('sources').select('id,url').in('id', srcIds);
      const deadSet = new Set((srcs || []).filter((s) => s.url === DEAD_URL).map((s) => s.id));
      deadRow = facts.filter((f) => deadSet.has(f.source_id)).length;
    }
    scored.push({ it, factN: facts.length, nullSrc, deadRow, risk: riskScore(it, claims || []) });
  }

  // 3) Dedup escape check (EP-11): verified items sharing a canonical key, or null-key reg-family.
  const byKey = {};
  for (const it of items) if (it.canonical_instrument_key) (byKey[it.canonical_instrument_key] ??= []).push(it.id);
  const dupEscapes = Object.entries(byKey).filter(([, v]) => v.length > 1);

  // 4) Draw the risk-weighted sample (N%, floor 3).
  scored.sort((a, b) => b.risk - a.risk || b.factN - a.factN);
  const sampleSize = Math.max(FLOOR, Math.ceil((N_PCT / 100) * items.length));
  const sample = scored.slice(0, Math.min(sampleSize, scored.length));

  // 5) Report — mechanical rates + the manifest for the LIVE pass.
  console.log(`\n=== Wave-acceptance pre-scan (ADR-014, N=${N_PCT}%, floor ${FLOOR}) ===`);
  console.log(`Wave frame: ${items.length} items. Sample: ${sample.length}.`);
  console.log(`Provenance (frame): dead-cite facts=${scored.reduce((s, x) => s + x.deadRow, 0)}, ` +
    `null-source facts=${scored.reduce((s, x) => s + x.nullSrc, 0)}, total facts=${scored.reduce((s, x) => s + x.factN, 0)}.`);
  console.log(`Dedup escapes (shared canonical key among verified): ${dupEscapes.length ? JSON.stringify(dupEscapes) : 'none'}.`);
  console.log(`\nSAMPLE MANIFEST — live L2/L3 required per item (span-vs-correct-source + analysis honesty):`);
  for (const s of sample) {
    console.log(`  [risk ${s.risk}] ${s.it.item_type} ${s.it.priority} ${(s.it.jurisdiction_iso || []).join(',')} ` +
      `facts=${s.factN} deadCite=${s.deadRow} nullSrc=${s.nullSrc} :: ${s.it.id} :: ${String(s.it.title).slice(0, 60)}`);
  }
  console.log(`\nTODO(live pass): for each sampled item, live-read the cited primary (seek-correct-source on ` +
    `dead/wrong URL), score every FACT span, and record accuracy-defect rate + any ISO-class falsehood. ` +
    `Wave HOLDS if accuracy-defect > 10% OR any substantive-falsehood item (ADR-014 §4).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
