// @ts-check
// PURE core for the FLAG-AGE audit (operator ruling 2026-07-13, flag-system item 5) — the dwell-gap closer.
// quarantine-disposition-audit enforces dwell on quarantined ITEMS (RD-4/RD-6); it CANNOT see open-flag age
// for (a) non-item subject_types (surface/source/system) or (b) item-flags whose item is not quarantined
// (e.g. skill-conformance on verified items). So 450 open flags >30d tripped nothing. This audit enforces
// open-FLAG age across ALL subject_types, reconciled against RD-28.
//
// EXEMPT (valid long-dwell, NOT a violation):
//   - RD-28-HELD (recommended_actions[].hold_class === 'rd28-resting-state') — held-with-named-reopener; a
//     verified resting-state item legitimately rests until change-evidence or a contract migration. (item 5
//     wires this explicitly so the 65 held-mints don't red immediately.)
//   - disposition_deferred — owned by deferral-hygiene-audit (avoid double-counting; that audit checks expiry).
//   - standing-debt / lane markers (created_by in STANDING_DEBT) — a class-fix record, not a dwelling defect.
//   - QUARANTINED-ITEM flags (operator ruling 2026-07-13, backlog disposition) — an open item-flag whose
//     subject item is LIVE-QUARANTINED is owned by quarantine-disposition-audit (RD-4/RD-6: it enforces
//     dwell on the ITEM, whose disposition CLOSES the flag — "flag follows item"). Counting it here too
//     double-counts the same backlog under two audits. This restores flag-age's intended scope: it covers
//     the GAP quarantine-disposition can't see — non-item flags (surface/source/system) and flags on
//     NON-quarantined items (e.g. skill-conformance on verified items). Requires the caller to pass the
//     live-quarantined item id set; when not passed, no quarantined-item exemption applies (safe default).
// Everything else past the bound is PAST-BOUND (the dwell tripwire this audit adds).

export const DWELL_BOUND_DAYS = 30;
export const STANDING_DEBT = new Set(["register-step-gap", "data-audit-lane"]);

/** Is a flag RD-28-held (a hold_class marker anywhere in its recommended_actions)? @param {any} f */
export function isRd28Held(f) {
  const arr = Array.isArray(f?.recommended_actions) ? f.recommended_actions : [];
  return arr.some((a) => a && typeof a === "object" && a.hold_class === "rd28-resting-state");
}

/**
 * Classify ONE open flag by age. Pure. @param {any} f @param {number} nowMs @param {number} [boundDays]
 * @param {Set<string>|null} [quarantinedItemIds] live-quarantined item ids (item-flags on them are exempt).
 * @returns {{ ageDays: number, exempt: boolean, exemptReason: string|null, pastBound: boolean }}
 */
export function classifyOpenFlag(f, nowMs, boundDays = DWELL_BOUND_DAYS, quarantinedItemIds = null) {
  const created = f?.created_at ? Date.parse(String(f.created_at)) : NaN;
  const ageDays = Number.isNaN(created) ? Infinity : (nowMs - created) / 86_400_000;
  let exemptReason = null;
  if (isRd28Held(f)) exemptReason = "rd28-held";
  else if (f?.created_by === "disposition_deferred") exemptReason = "deferral (owned by deferral-hygiene-audit)";
  else if (STANDING_DEBT.has(f?.created_by)) exemptReason = "standing-debt marker";
  else if (f?.subject_type === "item" && quarantinedItemIds && quarantinedItemIds.has(f?.subject_ref))
    exemptReason = "quarantined-item (owned by quarantine-disposition-audit)";
  const exempt = exemptReason != null;
  return { ageDays, exempt, exemptReason, pastBound: !exempt && ageDays > boundDays };
}

/**
 * Summarize a set of open flags. Pure. @param {any[]} flags @param {number} nowMs @param {number} [boundDays]
 * @param {Set<string>|null} [quarantinedItemIds] live-quarantined item ids (item-flags on them are exempt).
 */
export function summarizeFlagAges(flags, nowMs, boundDays = DWELL_BOUND_DAYS, quarantinedItemIds = null) {
  const list = Array.isArray(flags) ? flags : [];
  const pastBound = [], exemptHeld = [];
  let exemptQuarantinedCount = 0;
  const byMechanism = {};
  for (const f of list) {
    const c = classifyOpenFlag(f, nowMs, boundDays, quarantinedItemIds);
    if (c.exempt) {
      if (c.exemptReason === "rd28-held") exemptHeld.push(f);
      else if (c.exemptReason && c.exemptReason.startsWith("quarantined-item")) exemptQuarantinedCount++;
      continue;
    }
    if (c.pastBound) {
      pastBound.push({ id: f.id, created_by: f.created_by, subject_type: f.subject_type, subject_ref: f.subject_ref, ageDays: Math.round(c.ageDays) });
      byMechanism[f.created_by] = (byMechanism[f.created_by] || 0) + 1;
    }
  }
  return { total: list.length, pastBound, pastBoundCount: pastBound.length, exemptHeldCount: exemptHeld.length, exemptQuarantinedCount, byMechanism };
}
