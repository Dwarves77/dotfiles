#!/usr/bin/env node
// hold-queue.golden.mjs — behavioral golden for the Phase E hold-resolution queue (E3 increment 1, RD-42).
// Live DB, dedicated TEST entity_refs (random uuids), cleaned up. Locks: enqueue is idempotent (one active row
// per entity+class); a resolved entity EXITs; the same mechanism failing twice AUTO-ESCALATES (cycle safety);
// an exited hold re-enqueues as a NEW row (a fresh hold occurrence). Run: node scripts/verify/hold-queue.golden.mjs
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { enqueue, recordAttempt, exit, escalate, listActive } from '../lib/hold-queue.mjs';
import { guardedDelete } from '../lib/db.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
process.loadEnvFile(resolve(ROOT, '.env.local'));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// deterministic-but-unique test refs (no Math.random in-file dependency; fixed test uuids)
const REF_A = '00000000-0000-4000-8000-00000000e3a1';
const REF_B = '00000000-0000-4000-8000-00000000e3a2';
const REF_C = '00000000-0000-4000-8000-00000000e3a3';
const cite = { skill: 'remediation-discipline', reason: 'hold-queue golden test fixture teardown (dedicated test entity_refs)' };
let failed = 0;
const check = (name, cond, detail = '') => { const ok = !!cond; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`); };
// fixture teardown routed through the guarded path (snapshot + cite), per rule 015 — even for test rows.
const cleanup = async () => {
  const { data } = await sb.from('hold_resolution_queue').select('id').in('entity_ref', [REF_A, REF_B, REF_C]);
  const ids = (data || []).map((r) => r.id);
  if (ids.length) await guardedDelete('hold_resolution_queue', ids, { cite });
};
const stateOf = async (id) => (await sb.from('hold_resolution_queue').select('state').eq('id', id).single()).data?.state;

async function main() {
  console.log('\n=== GOLDEN: hold-resolution queue ===');
  await cleanup();

  // 1) enqueue idempotency: two enqueues of the same (entity, class) -> one row
  const a1 = await enqueue(sb, { entityType: 'item', entityRef: REF_A, holdClass: 'floor', nextAction: 'seek primary' });
  const a2 = await enqueue(sb, { entityType: 'item', entityRef: REF_A, holdClass: 'floor', nextAction: 'seek primary' });
  check('enqueue is idempotent (same id on re-enqueue)', a1 === a2, `a1=${a1} a2=${a2}`);
  const { count: aRows } = await sb.from('hold_resolution_queue').select('id', { count: 'exact', head: true }).eq('entity_ref', REF_A);
  check('one active row for the entity+class', aRows === 1, `rows=${aRows}`);

  // 2) cycle safety: same mechanism failing twice -> auto-escalate
  check('first seek failure records', (await recordAttempt(sb, a1, 'seek', 'failed')) === 'recorded');
  const second = await recordAttempt(sb, a1, 'seek', 'failed');
  check('second same-mechanism failure auto-escalates', second === 'escalated', `outcome=${second}`);
  check('state is escalated after cycle-safety', (await stateOf(a1)) === 'escalated');

  // 3) exit path + re-enqueue after exit = new row
  const b1 = await enqueue(sb, { entityType: 'item', entityRef: REF_B, holdClass: 'hold_to_find' });
  await exit(sb, b1, 'resolved via re-stamp');
  check('exit marks the hold exited', (await stateOf(b1)) === 'exited');
  const b2 = await enqueue(sb, { entityType: 'item', entityRef: REF_B, holdClass: 'hold_to_find' });
  check('a new hold occurrence re-enqueues as a NEW row', b2 !== b1, `b1=${b1} b2=${b2}`);

  // 4) escalate path
  const c1 = await enqueue(sb, { entityType: 'claim', entityRef: REF_C, holdClass: 's_numeric_soft' });
  await escalate(sb, c1, 'no primary fetchable after 3 variants');
  check('escalate marks the hold escalated', (await stateOf(c1)) === 'escalated');

  // 5) listActive returns only active (queued/seeking/grounding) test rows -> only b2 (a1 escalated, b1 exited, c1 escalated)
  const active = (await listActive(sb, { limit: 500 })).filter((r) => [REF_A, REF_B, REF_C].includes(r.entity_ref));
  check('listActive excludes exited + escalated', active.length === 1 && active[0].id === b2, `active=${active.length}`);

  await cleanup();
  console.log(failed ? `\nGOLDEN FAILED (${failed})` : '\nGOLDEN PASSED');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
