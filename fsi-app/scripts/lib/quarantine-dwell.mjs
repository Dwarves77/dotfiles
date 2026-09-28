/**
 * QUARANTINE DWELL/ENQUEUE computation (shared, pure). Extracted from scripts/verify/
 * quarantine-disposition-audit.mjs (lane QUARANTINE-DISPOSITION, 2026-09-28) so the audit's read-only
 * invariant check and the new disposition planner (scripts/plan-quarantine-disposition.mjs) compute the
 * SAME classification from the SAME inputs, never two copies that can drift (F45 duplicate-code; prior-art
 * rule in docs/dispatches/lane-common-contract.md section "Prior art").
 *
 * GOVERNING SKILL: remediation-discipline (Section 2.1 -- Quarantine Is an Open Investigation;
 * Section 2.2 -- Deferred vs Undispositioned).
 *
 * Pure function, no I/O, no Date.now() unless `now` is omitted -- the caller supplies `items` (live-
 * quarantined intelligence_items rows: id, legacy_id, title, item_type, provenance_status, updated_at)
 * and `flags` (open integrity_flags rows: subject_ref, created_at, status, created_by, category,
 * recommended_actions), exactly as quarantine-disposition-audit.mjs already reads them.
 */
import { isValidDeferral } from "./deferral.mjs";

export const DWELL_BOUND_DAYS = 14;
const BOUND_MS = DWELL_BOUND_DAYS * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {{ items: object[], flags: object[], now?: Date }} args
 * @returns {{
 *   enqueueMissing: object[],
 *   undispositioned: object[],   // past-bound, NO valid deferral -- the HARD tripwire. Each item carries
 *                                 // .ageDays and .resurrected (true if it once carried a now-expired deferral)
 *   deferred: object[],          // past-bound WITH a valid deferral. Each item carries .ageDays and .deferral
 *   withinBound: object[],       // not yet past the dwell bound. Each item carries .ageDays
 * }}
 */
export function computeQuarantineDwell({ items, flags, now = new Date() }) {
  const nowMs = now.getTime();

  // earliest open flag per item = dwell clock (ENQUEUE)
  const enqueuedAt = new Map();
  for (const f of flags || []) {
    const t = new Date(f.created_at).getTime();
    const ex = enqueuedAt.get(f.subject_ref);
    if (ex === undefined || t < ex) enqueuedAt.set(f.subject_ref, t);
  }

  // VALID-deferral map: item id -> payload, for an OPEN disposition_deferred flag whose payload passes
  // isValidDeferral AND whose deferred_until is in the FUTURE. Expired deferrals do NOT count.
  const validDeferral = new Map();
  for (const f of flags || []) {
    if (f.created_by !== "disposition_deferred") continue;
    let payload = null;
    const ra = f.recommended_actions;
    if (Array.isArray(ra)) {
      for (const entry of ra) {
        if (entry && typeof entry === "object" && entry.deferral) { payload = entry.deferral; break; }
      }
      if (!payload && ra.length && ra[0] && typeof ra[0] === "object" && ("reason" in ra[0])) payload = ra[0];
    } else if (ra && typeof ra === "object") {
      payload = ra.deferral || (("reason" in ra) ? ra : null);
    }
    const verdict = isValidDeferral(payload, now);
    if (verdict.ok) {
      const existing = validDeferral.get(f.subject_ref);
      if (!existing || new Date(payload.deferred_until).getTime() > new Date(existing.deferred_until).getTime()) {
        validDeferral.set(f.subject_ref, payload);
      }
    }
  }

  // items that EVER carried a disposition_deferred flag -- for resurrection detection.
  const everDeferred = new Set((flags || []).filter((f) => f.created_by === "disposition_deferred").map((f) => f.subject_ref));

  const enqueueMissing = [];
  const undispositioned = [];
  const deferred = [];
  const withinBound = [];
  for (const it of items || []) {
    const at = enqueuedAt.get(it.id);
    if (at === undefined) { enqueueMissing.push(it); continue; }
    const ageDays = Math.floor((nowMs - at) / DAY_MS);
    if (nowMs - at > BOUND_MS) {
      const d = validDeferral.get(it.id);
      if (d) deferred.push({ ...it, ageDays, deferral: d });
      else undispositioned.push({ ...it, ageDays, resurrected: everDeferred.has(it.id) });
    } else withinBound.push({ ...it, ageDays });
  }

  return { enqueueMissing, undispositioned, deferred, withinBound };
}
