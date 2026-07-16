#!/usr/bin/env node
// task6-q1-near-dedup.mjs -- Q1 padding, NORMALIZED-identical FACT restatements (Task 6). Guarded, snapshotted.
// Operator ruling 2026-07-15: strip only VERIFIED-true restatements; anything that differs SUBSTANTIVELY is
// KEPT (text-similarity alone would destroy legitimate distinct claims — the 163-claim lesson). "Normalized-
// identical" = identical after lowercasing, collapsing whitespace/punctuation, and stripping a trailing
// "*Source:*" attribution — a true restatement, NOT fuzzy similarity. The bracket slot prefix is KEPT in the
// norm so slot-distinct claims stay separate (never merge two slots' coverage). Keep the best-grounded copy.
// Run: --dry-run (default) | --execute
//   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/remediation/task6-q1-near-dedup.mjs --dry-run

import { readAll, guardedDelete } from '../lib/db.mjs';

const EXECUTE = process.argv.includes('--execute');
const CITE = { skill: 'environmental-policy-and-innovation', reason: 'Task6 Q1 normalized-identical FACT restatement strip (operator ruling 2026-07-15): remove true restatements (identical after whitespace/punct/attribution normalization); substantively-different claims kept; best-grounded copy retained.' };

const norm = (t) => String(t).toLowerCase().replace(/\*?source:.*$/i, '').replace(/[\s\p{P}]+/gu, ' ').trim();
function keeperFirst(a, b) {
  const ga = a.source_id != null, gb = b.source_id != null; if (ga !== gb) return ga ? -1 : 1;
  const ta = a.source_tier_at_grounding ?? 99, tb = b.source_tier_at_grounding ?? 99; if (ta !== tb) return ta - tb;
  if (a.extracted_at !== b.extracted_at) return String(a.extracted_at) < String(b.extracted_at) ? -1 : 1;
  return String(a.id) < String(b.id) ? -1 : 1;
}

async function main() {
  const arch = new Set((await readAll('intelligence_items', 'id,is_archived')).filter((i) => i.is_archived).map((i) => i.id));
  const facts = (await readAll('section_claim_provenance', 'id,intelligence_item_id,claim_text,claim_kind,source_id,source_tier_at_grounding,extracted_at'))
    .filter((p) => String(p.claim_kind).toUpperCase() === 'FACT' && !arch.has(p.intelligence_item_id));

  const groups = new Map();
  for (const f of facts) { const k = `${f.intelligence_item_id}::${norm(f.claim_text)}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
  const removeIds = [];
  for (const [, rows] of groups) { if (rows.length < 2) continue; rows.sort(keeperFirst); for (const r of rows.slice(1)) removeIds.push(r.id); }

  console.log(`Normalized-identical restatements to remove: ${removeIds.length}`);
  if (removeIds.length) console.log('sample kept-vs-removed (first group):', JSON.stringify([...groups.values()].filter((r) => r.length > 1)[0]?.map((r) => r.claim_text.slice(0, 70))));
  if (!EXECUTE) { console.log('\nDRY-RUN. No writes. Re-run with --execute.'); return; }

  let removed = 0; for (let i = 0; i < removeIds.length; i += 5) { const r = await guardedDelete('section_claim_provenance', removeIds.slice(i, i + 5), { cite: CITE }); removed += r.deleted; }
  console.log(`deleted ${removed} normalized-identical restatements. DONE.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
