#!/usr/bin/env node
// defect-signature-scan.mjs -- READ-ONLY heuristic triage for two accuracy-defect signatures.
// Authored 2026-07-15 for the ground-truth verification unit (see
// docs/audits/ground-truth-verification-2026-07-15.md and ADR-014).
//
// WHAT IT IS: a HEURISTIC triage detector for two named signatures, run over FACT claims in
// section_claim_provenance (claim_text plus its stored source_span, same row). It exists to HOLD
// suspect claims for human/live verification, nothing more.
//   S-CONFLATE (instrument-identity conflation): one span reused across >= 3 FACT claims whose
//     claim_text names >= 2 DISTINCT instrument identifiers, at least one of which is absent from the
//     span. This is the ISO 14083 pattern (a 2023/1805 title-span reused across claims naming
//     2023/1805, ISO 14083, and CountEmissions).
//   S-NUMERIC (span-unsupported numeric): a FACT claim carries a significant numeric figure (currency,
//     percentage, thresholded unit, or an obligation year) whose digits do not appear in its span.
//
// WHAT IT IS NOT: this is NOT a certification tool. False positives are expected and acceptable; misses
// are possible. A hit means "hold and verify live", never "this is fabricated". It MUST NEVER be used to
// promote anything to VERIFIED, only to hold for review. The euro 6,800 case (item EU CO2 Trucks) is the
// worked S-NUMERIC example of a real-but-mis-cited hit: the figure is correct in the primary law
// (Reg (EU) 2019/1242 Art 8(1)(b)) but absent from its stored span. Only live verification classifies a
// hit as real-but-mis-cited (fix citation) versus genuinely invented (fix content).
//
// READ-ONLY. No writes. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Usage:
//   node scripts/verify/defect-signature-scan.mjs --ids id1,id2,...
//   node scripts/verify/defect-signature-scan.mjs --since 2026-07-13T00:00:00Z
//   node scripts/verify/defect-signature-scan.mjs --all           (excludes Wave 2, see WAVE2_CUTOFF)

import { createClient } from '@supabase/supabase-js';

export const WAVE2_CUTOFF = '2026-07-13T00:00:00Z'; // exclude items grounded by the concurrent Wave 2
const REUSE_MIN = 3;         // span reused by at least this many FACT claims to consider S-CONFLATE
const NAMED_ACTS = ['CountEmissions', 'FuelEU', 'ReFuelEU', 'CBAM', 'EUDR', 'AFIR', 'CSRD', 'ESRS', 'EPBD', 'MEES', 'PPWR'];

// ---------- pure detection (exported for the golden; no DB) ----------

// Extract instrument identifiers named in a claim. Returns a Set of canonical id strings.
export function extractIdentifiers(claim) {
  const ids = new Set();
  const c = String(claim || '');
  for (const m of c.matchAll(/\b(\d{4}\/\d{1,4})\b/g)) ids.add('EU:' + m[1]);          // 2023/1805
  for (const m of c.matchAll(/\bISO\s?(\d{3,5})\b/gi)) ids.add('ISO:' + m[1]);          // ISO 14083
  for (const name of NAMED_ACTS) if (new RegExp('\\b' + name, 'i').test(c)) ids.add('NAME:' + name.toLowerCase());
  return ids;
}

// Does the span corroborate a given identifier (beyond title-only, best-effort)?
export function spanHasIdentifier(span, id) {
  const s = String(span || '').toLowerCase();
  if (id.startsWith('EU:')) return s.includes(id.slice(3).toLowerCase());
  if (id.startsWith('ISO:')) { const n = id.slice(4); return s.includes('iso ' + n) || s.includes('iso' + n) || s.includes(n); }
  if (id.startsWith('NAME:')) return s.includes(id.slice(5));
  return false;
}

// S-CONFLATE over one item's FACT rows [{idx, id, claim_text, source_span}]. Returns hit rows.
export function detectConflate(facts) {
  const groups = new Map(); // span -> facts[]
  for (const f of facts) {
    const key = String(f.source_span || '').trim();
    if (!key) continue;
    (groups.get(key) || groups.set(key, []).get(key)).push(f);
  }
  const hits = [];
  for (const [span, group] of groups) {
    if (group.length < REUSE_MIN) continue;
    const ids = new Set();
    for (const f of group) for (const id of extractIdentifiers(f.claim_text)) ids.add(id);
    if (ids.size < 2) continue; // needs >= 2 distinct named instruments
    const absent = [...ids].filter((id) => !spanHasIdentifier(span, id));
    if (!absent.length) continue;
    const rationale = `span reused by ${group.length} FACT claims naming {${[...ids].join(', ')}}; absent from span: {${absent.join(', ')}}`;
    for (const f of group) hits.push({ idx: f.idx, id: f.id, signature: 'S-CONFLATE', rationale });
  }
  return hits;
}

// Extract significant numeric tokens from a claim. Returns [{token, digits}].
export function extractNumbers(claim) {
  const c = String(claim || '');
  const out = [];
  const push = (token) => {
    const digits = token.replace(/[^\d]/g, '');
    if (digits.length >= 2) out.push({ token: token.trim(), digits });
  };
  for (const m of c.matchAll(/(?:€|£|\$|EUR|USD|GBP)\s?[\d][\d.,\s]*\d/gi)) push(m[0]);                 // currency
  for (const m of c.matchAll(/\b\d[\d.,\s]*\d?\s?%/g)) push(m[0]);                                       // percent
  for (const m of c.matchAll(/\b\d[\d.,\s]*\d?\s?(?:GW|GWh|MW|MWh|tonnes?|tCO2|GT|km|billion|million|bn)\b/gi)) push(m[0]); // unit
  for (const m of c.matchAll(/\b(?:from|by|before|until|effective|deadline|starting)\s+(?:\d{1,2}\s+\w+\s+)?(20\d{2})\b/gi)) push(m[1]); // obligation year
  return out;
}

// S-NUMERIC over one FACT row. Returns a hit or null.
export function detectNumeric(fact) {
  const spanDigits = String(fact.source_span || '').toLowerCase().replace(/[\s,]/g, '');
  for (const { token, digits } of extractNumbers(fact.claim_text)) {
    if (!spanDigits.includes(digits)) {
      return { idx: fact.idx, id: fact.id, signature: 'S-NUMERIC', rationale: `figure "${token}" (digits ${digits}) not found in span` };
    }
  }
  return null;
}

// Scan one item's FACT rows for both signatures.
export function scanItem(facts) {
  const hits = [...detectConflate(facts)];
  for (const f of facts) { const h = detectNumeric(f); if (h) hits.push(h); }
  return hits;
}

// ---------- CLI / DB (not exercised by the golden) ----------

function arg(flag) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; }

async function resolveFrame(db) {
  const ids = arg('--ids');
  const since = arg('--since');
  const all = process.argv.includes('--all');
  let q = db.from('intelligence_items').select('id,title').eq('is_archived', false);
  if (ids) return (await q.in('id', ids.split(',').map((s) => s.trim()))).data || [];
  if (since) {
    const r = await db.from('agent_runs').select('intelligence_item_id').gte('created_at', since);
    const wave = [...new Set((r.data || []).map((x) => x.intelligence_item_id).filter(Boolean))];
    return (await q.in('id', wave)).data || [];
  }
  if (all) {
    const items = (await q).data || [];
    const r = await db.from('agent_runs').select('intelligence_item_id').gte('created_at', WAVE2_CUTOFF);
    const wave2 = new Set((r.data || []).map((x) => x.intelligence_item_id).filter(Boolean));
    const kept = items.filter((it) => !wave2.has(it.id));
    console.log(`--all frame: ${items.length} non-archived; excluding ${wave2.size} Wave 2 items (agent_runs after ${WAVE2_CUTOFF}); scanning ${kept.length}.`);
    return kept;
  }
  console.error('Provide --ids <csv> or --since <iso> or --all'); process.exit(2);
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(2); }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const items = await resolveFrame(db);

  let totalC = 0, totalN = 0, itemsHit = 0;
  for (const it of items) {
    const { data: rows } = await db.from('section_claim_provenance')
      .select('id,claim_kind,claim_text,source_span').eq('intelligence_item_id', it.id).order('id');
    const facts = (rows || []).filter((r) => String(r.claim_kind).toUpperCase() === 'FACT')
      .map((r, i) => ({ idx: i + 1, id: r.id, claim_text: r.claim_text, source_span: r.source_span }));
    const hits = scanItem(facts);
    if (!hits.length) continue;
    itemsHit++;
    console.log(`\n[${it.id}] ${String(it.title).slice(0, 64)}  (facts=${facts.length}, hits=${hits.length})`);
    for (const h of hits) {
      if (h.signature === 'S-CONFLATE') totalC++; else totalN++;
      console.log(`  idx ${h.idx}  ${h.signature}  ${h.rationale}`);
    }
  }
  console.log(`\n=== TOTALS ===  items scanned=${items.length}  items with hits=${itemsHit}  S-CONFLATE=${totalC}  S-NUMERIC=${totalN}`);
  console.log('HEURISTIC TRIAGE ONLY. Hits HOLD for live verification; never promote to VERIFIED.');
}

// Run main only when invoked directly, not when imported by the golden.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('defect-signature-scan.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
