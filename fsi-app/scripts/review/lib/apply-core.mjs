// apply-core.mjs — the shared apply mechanics for the three single-table queues (provisional-sources,
// portal-links, coverage-gaps). canonical-candidates has an extra "resolve an existing source" step
// (see apply-canonical-candidates.mjs) and does not use this module.
//
// Every write goes through `deps.guardedUpdateByIds` (scripts/lib/db.mjs) — cite required, snapshot
// before mutate, chunked, read back. `applyMatch: module.matchQueue` re-applies the queue's OWN filter
// (e.g. status='provisional') at write time, so a row that already left the queue between "the digest
// was built" and "this apply ran" is silently skipped rather than double-dispositioned — the same
// idempotency guardedUpdateByIds already gives every other guarded script in this repo.

import { validateRuling, isRulingStale } from "./ruling.mjs";

/**
 * @param {{module: object, ruling: object, apply: boolean, deps: {readAll:Function, guardedUpdateByIds:Function}, cite: {skill:string, reason:string}, extraForGroup?: (group:object)=>object}} args
 */
export async function applySimpleQueue({ module: m, ruling, apply, deps, cite, extraForGroup }) {
  const { readAll, guardedUpdateByIds } = deps;

  const validation = validateRuling(ruling, m.ALLOWED_DECISIONS);
  if (!validation.ok) {
    throw new Error(`invalid ruling for ${m.QUEUE_ID}:\n  ${validation.errors.join("\n  ")}`);
  }
  if (ruling.queue !== m.QUEUE_ID) {
    throw new Error(`ruling.queue "${ruling.queue}" does not match this apply script's queue "${m.QUEUE_ID}"`);
  }

  const liveRows = await readAll(m.TABLE, m.SELECT_COLUMNS, { match: m.matchQueue });
  const freshest = m.freshestTimestamp(liveRows);
  if (isRulingStale(ruling.generated_at, freshest)) {
    throw new Error(
      `ruling is STALE: generated_at ${ruling.generated_at} predates a live queue row (newest: ${freshest}) — ` +
      `rebuild the digest (build-review-digests.mjs) and re-rule before applying.`
    );
  }

  console.log(`[apply-${m.QUEUE_ID}] mode = ${apply ? "APPLY" : "DRY-RUN"}, ${ruling.groups.length} group(s)`);
  const results = [];
  for (const group of ruling.groups) {
    const extra = extraForGroup ? extraForGroup(group) : {};
    const patch = m.patchForDecision(group.decision, extra);
    if (!patch) {
      console.log(`   SKIP   ${group.key} (decision=${group.decision}) — ${group.row_ids.length} row(s), no mutation`);
      results.push({ key: group.key, decision: group.decision, applied: 0, skipped: true });
      continue;
    }
    if (!apply) {
      console.log(`   WOULD  ${group.key} (decision=${group.decision}) — ${group.row_ids.length} row(s)`);
      results.push({ key: group.key, decision: group.decision, would_apply: group.row_ids.length });
      continue;
    }
    const res = await guardedUpdateByIds(m.TABLE, group.row_ids, patch, { cite, select: "id", applyMatch: m.matchQueue });
    console.log(`   APPLIED ${group.key} (decision=${group.decision}) — ${res.updated} of ${group.row_ids.length} row(s)`);
    results.push({ key: group.key, decision: group.decision, applied: res.updated, chunks: res.chunks, halvings: res.halvings });
  }
  return { queue: m.QUEUE_ID, mode: apply ? "apply" : "dry-run", results };
}
