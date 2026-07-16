#!/usr/bin/env node
// task6-q4b-tier-strip-broad.mjs -- Q4 prose strip, BROAD residual pass (Task 6). Guarded, snapshotted.
// The first pass (task6-q4-tier-strip) stripped the exact "(Tier N)" form. The absence sweep found 21 briefs
// still leaking the tier in richer forms the narrow regex missed: ranges "(Tier 2-3)"/"(Tier 1/2)", annotated
// "(Tier 2 — regulator guidance)"/"(Tier 1 — Binding EU law)", and prose "MARPOL Annex VI (Tier 1) is...".
// In EVERY observed case the real Type description precedes the parenthetical, so removing the ENTIRE
// "(Tier <numeral>...)" parenthetical preserves the description and fully removes the tier IP. The
// numeral-required guard (Tier must be followed by a digit/roman) protects legitimate "tier structure" prose.
// Idempotent: already-clean briefs are a no-op. Covers full_brief AND section content_md.
// Run: --dry-run (default) | --execute
//   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/remediation/task6-q4b-tier-strip-broad.mjs --dry-run

import { readClient, readAll, guardedUpdate } from '../lib/db.mjs';

const EXECUTE = process.argv.includes('--execute');
const CITE = { skill: 'source-credibility-model', reason: 'Task6 Q4 prose strip BROAD residual (operator ruling 2026-07-15): remove all customer-facing (Tier <numeral>...) source-tier annotations (ranges/slashes/annotated/prose forms the exact-form pass missed); Type description (which precedes the parenthetical) preserved; recurrence routes to hardening (tier-machinery-in-customer-prose).' };

// "(Tier <digit-or-roman> ...anything...)" plus any preceding whitespace. Numeral-required guard keeps
// legitimate "(Tier structure ...)" prose (no numeral after Tier) untouched.
const TIER_RE = /\s*\(\s*Tier\s+[0-9IVXLivxl]+[^)]*\)/g;
function stripTier(text) { let n = 0; const out = String(text).replace(TIER_RE, () => { n++; return ''; }); return { out, n }; }

async function main() {
  const verifiedNonArch = new Set((await readAll('intelligence_items', 'id,provenance_status,is_archived')).filter((i) => !i.is_archived && i.provenance_status === 'verified').map((i) => i.id));

  const briefs = (await readAll('intelligence_items', 'id,title,provenance_status,is_archived,full_brief'))
    .filter((i) => verifiedNonArch.has(i.id) && i.full_brief && TIER_RE.test(i.full_brief));
  const bp = [];
  for (const b of briefs) { const { out, n } = stripTier(b.full_brief); if (n > 0 && out !== b.full_brief) bp.push({ id: b.id, title: b.title, n, out }); }

  const sections = (await readAll('intelligence_item_sections', 'id,item_id,content_md'))
    .filter((s) => verifiedNonArch.has(s.item_id) && s.content_md && TIER_RE.test(s.content_md));
  const sp = [];
  for (const s of sections) { const { out, n } = stripTier(s.content_md); if (n > 0 && out !== s.content_md) sp.push({ id: s.id, n, out }); }

  console.log(`BROAD full_brief: briefs=${bp.length} annotations=${bp.reduce((a, p) => a + p.n, 0)}`);
  console.log(`BROAD sections:   rows=${sp.length} annotations=${sp.reduce((a, p) => a + p.n, 0)}`);
  console.log('\nSample (first 4 full_brief):');
  for (const p of bp.slice(0, 4)) {
    const before = (briefs.find((b) => b.id === p.id).full_brief.match(/.{0,40}\(\s*Tier\s+[0-9IVXLivxl][^)]*\).{0,20}/) || [''])[0].replace(/\n/g, ' ');
    console.log(`  ${p.title.slice(0, 34)} (x${p.n}): ${before}  ->  ${before.replace(TIER_RE, '')}`);
  }

  if (!EXECUTE) { console.log('\nDRY-RUN. No writes. Re-run with --execute.'); return; }

  let b = 0; for (const p of bp) { await guardedUpdate('intelligence_items', (qb) => qb.eq('id', p.id), { full_brief: p.out }, { cite: CITE }); b++; }
  let s = 0; for (const p of sp) { await guardedUpdate('intelligence_item_sections', (qb) => qb.eq('id', p.id), { content_md: p.out }, { cite: CITE }); s++; }
  console.log(`\nstripped ${b} full_brief bodies, ${s} section rows`);

  const sb = readClient();
  const { count: remain } = await sb.from('intelligence_items').select('id', { count: 'exact', head: true }).eq('is_archived', false).eq('provenance_status', 'verified').like('full_brief', '%(Tier %');
  // residual that still literally contains "(Tier " but does NOT match the numeral-guarded pattern (legit)
  const still = (await readAll('intelligence_items', 'id,title,full_brief')).filter((i) => verifiedNonArch.has(i.id) && i.full_brief && /\(Tier /.test(i.full_brief));
  const trueLeak = still.filter((i) => TIER_RE.test(i.full_brief));
  console.log(`VERIFY: full_brief still matching '(Tier ' = ${remain}; of those still matching the numeral-guarded leak pattern = ${trueLeak.length} (must be 0)`);
  if (trueLeak.length) { console.log('  residual leak items:', trueLeak.map((i) => i.title.slice(0, 30))); process.exit(2); }
  console.log('VERIFY OK. Any remaining "(Tier " is non-numeral legit prose. DONE.');
}

main().catch((e) => { console.error(e); process.exit(1); });
