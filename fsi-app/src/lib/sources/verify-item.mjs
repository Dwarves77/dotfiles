// @ts-check
// VERIFY-ITEM — the ONE snapshot-first entry point (Phase 1, operator ruling 2026-07-13). Every grounding
// verification routes through here. Flow per item:
//   1. SNAPSHOT LOOKUP  (snapshot-store.getSnapshot by source_id)
//   2. FRESHNESS PROBE  (freshness-probe.probeFreshness — HEAD only, no body, no spend)
//   3. CHEAP VERIFY     (cheap-verify.cheapVerifyClaims — span-match vs STORED text, ~$0, DEFAULT path)
//   4. PAID ACQUIRE     (LOCKED behind GROUNDING_ACQUIRE_ENABLED; pre-logged justification I2 before any spend)
//
// decideVerify is a PURE decision core (node-testable, no I/O, no spend). verifyItem wraps it with reads and,
// only when act:true (Phase 3 restitution, never the PR-2 build), the guarded side effects. The build + tests
// move $0 (CP1). Freshness 'changed' NEVER silently passes and NEVER fetches — it records
// stale_snapshot_content_changed and queues for the locked paid path (CP2), taking no further action.

import { assertAcquireAllowed } from "./acquire-lock.mjs";
import { assertPricedLine, PricedLineError } from "../llm/priced-line.mjs";

/** Stable identifiers the queue + gauge key on. */
export const STALE_FLAG = "stale_snapshot_content_changed";
export const ACQUIRE_JUSTIFICATIONS = /** @type {const} */ (["missing_snapshot", "content_changed", "cheap_verify_failed"]);

/**
 * PURE decision. Given the snapshot lookup, freshness verdict, and cheap-verify result, decide the outcome.
 * No I/O, no spend.
 * @param {{ found: boolean }} snapshot
 * @param {{ status: 'fresh'|'changed'|'unknown' } | null} freshness
 * @param {{ pass: boolean, reason: string } | null} cheapResult
 * @returns {{ outcome: 'verified_cheap'|'stale_flag'|'needs_acquire', justification: string|null, flip: boolean, flag: string|null, reason: string }}
 */
export function decideVerify(snapshot, freshness, cheapResult) {
  if (!snapshot || !snapshot.found) {
    // No stored snapshot to verify against — only the LOCKED paid path can acquire it.
    return { outcome: "needs_acquire", justification: "missing_snapshot", flip: false, flag: null, reason: "no stored snapshot for this source" };
  }
  // Snapshot exists. If the source demonstrably CHANGED, never silently pass and never fetch: flag + queue (CP2).
  if (freshness && freshness.status === "changed") {
    return { outcome: "stale_flag", justification: "content_changed", flip: false, flag: STALE_FLAG, reason: "freshness probe: source changed since snapshot capture" };
  }
  // Fresh or unknown → cheap-verify against the stored text is authoritative.
  if (cheapResult && cheapResult.pass) {
    return { outcome: "verified_cheap", justification: null, flip: true, flag: null, reason: cheapResult.reason };
  }
  // Stored snapshot does not confirm the required FACT spans → needs fresh content / re-ground (locked).
  return { outcome: "needs_acquire", justification: "cheap_verify_failed", flip: false, flag: null, reason: cheapResult ? cheapResult.reason : "no cheap-verify result" };
}

/**
 * WRITE the stale-snapshot queue row (CP2). An open integrity_flags row is the queue; it receives NO further
 * action until an operator per-item ruling. Idempotent-ish: callers should avoid duplicate open rows.
 * @param {import("@supabase/supabase-js").SupabaseClient} svc
 * @param {{ itemId: string, sourceId: string|null, reason: string }} q
 */
export async function writeStaleFlag(svc, q) {
  const { error } = await svc.from("integrity_flags").insert({
    category: "data_quality",
    subject_type: "item",
    subject_ref: q.itemId,
    description: `Stored snapshot is stale: ${q.reason}. Item verified against STORED text only; queued for operator-ruled paid re-acquire. No fetch performed.`,
    recommended_actions: [{ action: "operator_ruling_required", rationale: "content changed since snapshot; paid re-acquire is locked pending per-item go" }],
    status: "open",
    created_by: STALE_FLAG,
  });
  if (error) throw new Error(`stale-flag write failed: ${error.message}`);
}

/**
 * I2 — PRE-LOGGED JUSTIFICATION. Before ANY paid acquire, write the justification row to the ledger FIRST, so a
 * paid run without a logged justification is impossible (and the spend gauge can count coverage). cost 0; the
 * real paid call (if it runs) is metered separately by the spend client.
 * @param {import("@supabase/supabase-js").SupabaseClient} svc
 * @param {{ itemId: string, sourceId: string|null, reason: string, evidence?: string }} j
 */
export async function logAcquireJustification(svc, j) {
  if (!ACQUIRE_JUSTIFICATIONS.includes(/** @type {any} */ (j.reason))) {
    throw new Error(`invalid acquire justification "${j.reason}" (expected one of ${ACQUIRE_JUSTIFICATIONS.join("|")})`);
  }
  const nowIso = new Date().toISOString();
  const { error } = await svc.from("agent_runs").insert({
    intelligence_item_id: j.itemId, source_id: j.sourceId ?? null, source_url: null,
    fetch_method: "acquire-justification", started_at: nowIso, ended_at: nowIso, status: "success",
    cost_usd_estimated: 0,
    errors: [{ justification: j.reason, evidence: j.evidence ?? null }],
  });
  if (error) throw new Error(`justification log failed: ${error.message}`);
}

/**
 * Orchestrate one item's snapshot-first verification. READS by default; performs guarded side effects ONLY when
 * opts.act === true (Phase 3). The paid-acquire branch is gated by assertAcquireAllowed (OFF by default → throws
 * before any spend). Returns the decision + context.
 * @param {import("@supabase/supabase-js").SupabaseClient} svc
 * @param {string} itemId
 * @param {{
 *   getSnapshot: (svc: any, q: { sourceId: string }) => Promise<any>,
 *   probeFreshness: (url: string, stored: any, deps?: any) => Promise<{ status: 'fresh'|'changed'|'unknown' }>,
 *   cheapVerifyClaims: (claims: any[], snapshotHtml: string) => { pass: boolean, reason: string },
 *   loadItem: (svc: any, id: string) => Promise<{ source_id: string|null, source_url: string|null } | null>,
 *   loadClaims: (svc: any, id: string) => Promise<any[]>,
 *   pricedLine?: { operatorCostUsd: number, inventoryMiss: string, toleranceUsd?: number },
 *   env?: Record<string, string|undefined>,
 *   act?: boolean,
 * }} deps
 * pricedLine — the OPERATOR-PRICED LINE authorizing a paid acquire (operator cost + inventory-miss citation).
 *   REQUIRED for the needs_acquire paid branch when act:true; absent → the paid path refuses (no spend).
 */
export async function verifyItem(svc, itemId, deps) {
  const item = await deps.loadItem(svc, itemId);
  if (!item) return { itemId, outcome: "needs_acquire", reason: "item not found", acted: false };
  const sourceId = item.source_id;
  const snapshot = sourceId ? await deps.getSnapshot(svc, { sourceId }) : { found: false };

  let freshness = null;
  if (snapshot.found && item.source_url) {
    freshness = await deps.probeFreshness(item.source_url, { fetchedAt: snapshot.fetchedAt }, { env: deps.env });
  }

  let cheapResult = null;
  if (snapshot.found) {
    const claims = await deps.loadClaims(svc, itemId);
    cheapResult = deps.cheapVerifyClaims(claims, snapshot.content);
  }

  const decision = decideVerify(snapshot, freshness, cheapResult);
  const result = { itemId, sourceId, outcome: decision.outcome, reason: decision.reason, flip: decision.flip, flag: decision.flag, acted: false };

  if (!deps.act) return result; // build/tests + read-only Phase-3 dry-runs move $0

  // ── side effects (Phase 3, act:true) ──
  if (decision.outcome === "stale_flag") {
    await writeStaleFlag(svc, { itemId, sourceId, reason: decision.reason });
    result.acted = true;
    return result;
  }
  if (decision.outcome === "needs_acquire") {
    // PAID PATH — refuse-by-default. Per the operator's final spend rulings, the paid path requires BOTH a
    // DATA-EXISTENCE (inventory-miss) citation AND an OPERATOR-PRICED LINE before anything is authorized. The
    // priced-line gate enforces both (a non-empty inventoryMiss + an operator-set positive cost) and is
    // asserted BEFORE assertAcquireAllowed. No priced line → REFUSE (no spend, item stays quarantined).
    const pricedLine = deps.pricedLine;
    try {
      assertPricedLine(pricedLine); // throws PricedLineError without operator cost + inventory-miss citation
    } catch (e) {
      if (e instanceof PricedLineError) {
        result.acted = false;
        result.reason = `paid acquire REFUSED (no operator-priced line): ${e.message}`;
        return result;
      }
      throw e;
    }
    // Pre-log the justification (I2) FIRST so a paid run without a logged need is impossible, then assert the
    // master arming gate. With GROUNDING_ACQUIRE_ENABLED OFF this THROWS before any spend; the item stays
    // quarantined with a recorded, priced, justified need.
    await logAcquireJustification(svc, { itemId, sourceId, reason: decision.justification ?? "missing_snapshot", evidence: pricedLine?.inventoryMiss });
    assertAcquireAllowed(`${decision.justification}: ${itemId}`, deps.env);
    // (Reached only when the operator has turned the flag ON — the actual acquire+ground is invoked by the
    // caller's paid pipeline, not here. verifyItem's contract ends at the priced, justified, unlocked hand-off.)
    result.acted = true;
    result.reason = "acquire unlocked (operator-priced) — handed to paid pipeline";
    return result;
  }
  // verified_cheap — the caller performs the guarded provenance flip; verifyItem reports the decision.
  result.acted = true;
  return result;
}
