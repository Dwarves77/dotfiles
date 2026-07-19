// ledger-apply.mjs — grounding is NON-DESTRUCTIVE (operator doctrine 2026-07-16). A new grounding is a
// COMPARISON against the prior claim ledger, never a replacement. This module is the PURE diff: given the
// existing ledger and the incoming (newly-grounded) claim set, it computes what to
//   ADD                 (a genuinely-new claim — not in the prior ledger),
//   VERSION-CHANGE       (same claim, changed attribution: span / source / tier / section / kind — the OLD
//                         version is preserved, the current row updated),
//   LEAVE-UNCHANGED      (identical claim — untouched),
//   LEAVE-NOT-REPRODUCED (a prior claim the new grounding did not produce — KEPT, never erased just because a
//                         regeneration failed to reproduce it).
// It NEVER computes a delete. Erasure is a SEPARATE proven-inaccuracy path (erase-only-on-proven-inaccuracy):
// a claim is removed ONLY when a grounding PROVES it wrong against the primary (span contradicts / source
// superseded), with the proof recorded — never as a side effect of a re-ground. So the new-vs-old diff always
// survives a ground, and no data is lost.
//
// Identity of a claim within an item = its NORMALIZED claim_text (whitespace-collapsed, lowercased). The same
// assertion re-grounded to a better source is a CHANGE (version it), not a new claim; a claim absent from the
// new grounding is NOT-REPRODUCED (keep it), not a removal.

export function normText(t) { return String(t == null ? "" : t).trim().replace(/\s+/g, " ").toLowerCase(); }

/** Do two claim rows share the same attribution (so a match is UNCHANGED, not a change)? */
export function sameAttribution(a, b) {
  return (a.source_id ?? null) === (b.source_id ?? null)
    && (a.source_tier_at_grounding ?? null) === (b.source_tier_at_grounding ?? null)
    && normText(a.source_span) === normText(b.source_span)
    && (a.section_row_id ?? null) === (b.section_row_id ?? null)
    && String(a.claim_kind) === String(b.claim_kind);
}

/** Pure non-destructive diff. existing/incoming are arrays of claim rows
 *  ({claim_text, claim_kind, source_span, source_id, source_tier_at_grounding, section_row_id, id?}).
 *  Returns { add, change:[{existing,incoming}], unchanged:[{existing,incoming}], notReproduced }. NO delete. */
export function diffLedger(existing, incoming) {
  const exByText = new Map();
  for (const e of existing || []) if (!exByText.has(normText(e.claim_text))) exByText.set(normText(e.claim_text), e);
  const add = [], change = [], unchanged = [];
  const seen = new Set();
  for (const n of incoming || []) {
    const k = normText(n.claim_text);
    if (seen.has(k)) continue; // a duplicate within the incoming set collapses (H1 uniqueness)
    seen.add(k);
    const e = exByText.get(k);
    if (!e) { add.push(n); continue; }
    if (sameAttribution(e, n)) unchanged.push({ existing: e, incoming: n });
    else change.push({ existing: e, incoming: n });
  }
  const notReproduced = (existing || []).filter((e) => !seen.has(normText(e.claim_text)));
  return { add, change, unchanged, notReproduced };
}

/** A change is a genuine improvement worth versioning (vs a lateral/degrading re-attribution). Used only for
 *  observability in the report; the apply versions ALL changes (the old is always preserved either way). */
export function isTierImprovement(existing, incoming) {
  const eo = existing.source_tier_at_grounding, ni = incoming.source_tier_at_grounding;
  if (ni == null) return false;
  if (eo == null) return true;
  return ni < eo; // lower tier number = higher authority
}

// ---- DB apply (non-destructive) -------------------------------------------------------------------------
// The pure diff above decides WHAT to do; these apply it against Supabase. `sb` is a supabase-js client (or a
// test double exposing the same from().insert()/update()/delete()/select() chain). NEVER deletes a current
// claim except through eraseClaimWithProof (the erase-only-on-proven-inaccuracy path). Fail-closed on archive:
// a version is preserved BEFORE the current row is changed/erased, so an interrupted apply never loses data.

const CLAIM_FIELDS = ["section_row_id", "claim_text", "claim_kind", "source_span", "source_id", "search_result_id", "source_tier_at_grounding"];

function claimPayload(row, itemId) {
  const p = { intelligence_item_id: itemId };
  for (const f of CLAIM_FIELDS) p[f] = row[f] ?? null;
  return p;
}
function factTicket(id, row) {
  return { id, claim_kind: "FACT", claim_text: row.claim_text ?? null, source_span: row.source_span ?? null, source_id: row.source_id ?? null, source_tier_at_grounding: row.source_tier_at_grounding ?? null };
}
function versionPayload(existing, itemId, versionNumber, supersedeReason, proof, nowIso) {
  return {
    // soft reference (NOT an FK) so erasing/deleting the current row or item never cascade-deletes this history
    current_claim_id: supersedeReason === "proven_inaccurate" ? null : (existing.id ?? null),
    intelligence_item_id: itemId,
    section_row_id: existing.section_row_id ?? null,
    claim_text: existing.claim_text ?? null,
    claim_kind: existing.claim_kind ?? null,
    source_span: existing.source_span ?? null,
    source_id: existing.source_id ?? null,
    search_result_id: existing.search_result_id ?? null,
    source_tier_at_grounding: existing.source_tier_at_grounding ?? null,
    mint_hold_reason: existing.mint_hold_reason ?? null,
    version_number: versionNumber,
    supersede_reason: supersedeReason,
    inaccuracy_proof: proof ?? null,
    superseded_at: nowIso ?? null,
  };
}
async function nextVersionNumber(sb, claimId) {
  try {
    const { data, error } = await sb.from("claim_versions").select("version_number").eq("current_claim_id", claimId).order("version_number", { ascending: false }).limit(1);
    if (error) return 1;
    const top = Array.isArray(data) && data.length ? Number(data[0].version_number) : 0;
    return (Number.isFinite(top) ? top : 0) + 1;
  } catch { return 1; }
}

/** Apply a diffLedger() result to the DB non-destructively. Returns { currentIds, touchedFacts, applied }.
 *  touchedFacts = the FACT rows this ground ADDED or CHANGED (the mint-gate input; unchanged/not-reproduced
 *  FACTs were already gated on their prior ground). currentIds = the full current ledger after apply. */
export async function applyLedgerDiff(sb, itemId, diff, opts = {}) {
  const nowIso = opts.nowIso ?? null;
  const currentIds = [];
  const touchedFacts = [];
  const applied = { added: 0, changed: 0, unchanged: 0, notReproduced: 0, versioned: 0 };
  // ADD — genuinely-new claims.
  for (const n of diff.add) {
    const { data: ins, error } = await sb.from("section_claim_provenance").insert(claimPayload(n, itemId)).select("id").single();
    if (error) { console.warn(`[ledger-apply] add insert failed (${itemId}, ${n.claim_kind}): ${error.message}`); continue; }
    if (ins?.id) {
      currentIds.push(ins.id); applied.added += 1;
      if (n.claim_kind === "FACT") touchedFacts.push(factTicket(ins.id, n));
    }
  }
  // CHANGE — archive the OLD state to claim_versions (preserved & retrievable) THEN update the current row in
  // place. Never delete. mint_hold_reason is cleared on the current row so the mint-gate re-evaluates the fresh
  // attribution below.
  for (const { existing, incoming } of diff.change) {
    const vnum = await nextVersionNumber(sb, existing.id);
    const { error: verr } = await sb.from("claim_versions").insert(versionPayload(existing, itemId, vnum, "changed", null, nowIso));
    // F5 (fail-closed, matching eraseClaimWithProof + this file's own header): the prior state is preserved
    // BEFORE the current row is changed. If the version archive FAILS, THROW before the update — never
    // overwrite a current claim when its prior attribution was not durably archived (the warn-then-overwrite
    // was a data-history-loss window: a re-ground could replace the current row while claim_versions held no
    // record of the state it replaced). The current row is left untouched, so prior attribution survives.
    if (verr) throw new Error(`[ledger-apply] change aborted — version archive failed (${existing.id}): ${verr.message}`);
    applied.versioned += 1;
    const { error: uerr } = await sb.from("section_claim_provenance").update({ ...claimPayload(incoming, itemId), mint_hold_reason: null }).eq("id", existing.id);
    if (uerr) console.warn(`[ledger-apply] change update failed (${existing.id}): ${uerr.message}`);
    currentIds.push(existing.id); applied.changed += 1;
    if (incoming.claim_kind === "FACT") touchedFacts.push(factTicket(existing.id, incoming));
  }
  // UNCHANGED + NOT-REPRODUCED — preserved untouched, still part of the current ledger. A claim absent from the
  // new grounding is KEPT (never erased just because a regeneration failed to reproduce it).
  for (const { existing } of diff.unchanged) { currentIds.push(existing.id); applied.unchanged += 1; }
  for (const e of diff.notReproduced) { currentIds.push(e.id); applied.notReproduced += 1; }
  return { currentIds, touchedFacts, applied };
}

/** The ONLY path that erases a current claim. Erasure requires PROOF (contradicting span / superseded source);
 *  the proof is preserved on the archived version. Fail-closed: the current row is deleted ONLY after its final
 *  state (with proof) is safely archived, so an interrupted erase never loses the claim or its proof. */
export async function eraseClaimWithProof(sb, existing, itemId, proof, opts = {}) {
  if (!existing?.id) throw new Error("eraseClaimWithProof requires an existing claim with an id");
  if (!proof || typeof proof !== "object" || !proof.reason) {
    throw new Error("eraseClaimWithProof requires a proof object with a `reason` (erase-only-on-proven-inaccuracy)");
  }
  const nowIso = opts.nowIso ?? null;
  const vnum = await nextVersionNumber(sb, existing.id);
  const { error: verr } = await sb.from("claim_versions").insert(versionPayload(existing, itemId, vnum, "proven_inaccurate", proof, nowIso));
  if (verr) throw new Error(`erase aborted — proof archive failed (${existing.id}): ${verr.message}`); // never delete if history not preserved
  const { error: derr } = await sb.from("section_claim_provenance").delete().eq("id", existing.id);
  if (derr) throw new Error(`erase delete failed after archive (${existing.id}): ${derr.message}`);
  return { archivedVersion: vnum, supersedeReason: "proven_inaccurate" };
}
