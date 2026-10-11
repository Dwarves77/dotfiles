// @ts-check

export const DWELL_BOUND_DAYS = 30;
const STANDING_DEBT = new Set(["register-step-gap", "data-audit-lane"]);

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
