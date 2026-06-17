/**
 * DEFERRAL GUARD (write-time validator + read-side validity helper) for the research-or-erase /
 * quarantine-disposition invariant.
 *
 * GOVERNING SKILL: remediation-discipline (Section 2.1 — Quarantine Is an Open Investigation;
 * "Deferral is dispositioning-as-blocked, never silencing").
 *
 * A DEFERRAL is the disposition for a past-bound quarantined item that genuinely cannot be worked
 * yet: the item is dispositioned-as-BLOCKED, with the blocker named and a future resolution event
 * recorded. It is NOT a silence valve — a vague "needs review, until later" deferral is exactly the
 * silent-backlog shape this invariant exists to kill. So the guard is MECHANICAL and STRICT:
 *
 * A valid deferral payload is `{ reason, deferred_until, owner, resolution_event }` where:
 *   - reason            — names the SPECIFIC blocking condition AND references the disposition path the
 *                         item awaits. Enforced: length >= 30 AND matches >= 1 disposition-path keyword.
 *   - deferred_until    — a parseable FUTURE date. Expired deferrals do NOT count (read side re-opens
 *                         the item as undispositioned — the anti-silence self-resurrection property).
 *   - owner             — a non-empty named owner (reject TBD/unknown/empty).
 *   - resolution_event  — a non-empty string naming the checkable event that resolves the block
 *                         (an arbitrary date with no named event is REJECTED).
 *
 * isValidDeferral(payload) -> { ok, error? }  — pure, no date-future check is the only thing it does NOT
 *   re-encode beyond requiring deferred_until parse to a valid FUTURE date (it DOES check future here so
 *   the write path rejects an already-past date at write time; the read side ALSO re-checks future at
 *   audit time because a once-valid deferral expires with the clock).
 * assertValidDeferral(payload) -> throws Error(error) if not ok (the future write path calls this before INSERT).
 */

// Disposition-path keywords. A valid reason must reference at least one — this is what makes the reason
// say WHICH disposition the item is blocked awaiting (reground/relabel/register/archive/counsel/...),
// not just "blocked". Case-insensitive substring match.
export const DISPOSITION_PATH_KEYWORDS = [
  "reground",
  "re-ground",
  "relabel",
  "register",
  "archive",
  "counsel",
  "network",
  "primary source",
  "generate",
  "re-synthes",
];

const MIN_REASON_LEN = 30;
const BAD_OWNERS = new Set(["tbd", "unknown", "n/a", "none", "owner tbd"]);

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function matchesDispositionKeyword(text) {
  const lc = String(text).toLowerCase();
  return DISPOSITION_PATH_KEYWORDS.some((k) => lc.includes(k));
}

/**
 * Read/write validity check for a deferral payload. Returns { ok, error? }.
 * `now` is injectable for deterministic tests; defaults to current time.
 */
export function isValidDeferral(payload, now = new Date()) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "deferral payload missing or not an object" };
  }
  const { reason, deferred_until, owner, resolution_event } = payload;

  // reason: specific blocker + disposition path.
  if (!isNonEmptyString(reason)) {
    return { ok: false, error: "deferral.reason is required (non-empty string naming the blocker + disposition path)" };
  }
  if (reason.trim().length < MIN_REASON_LEN) {
    return { ok: false, error: `deferral.reason too short (${reason.trim().length} < ${MIN_REASON_LEN}): a real blocker names the specific condition and the awaited disposition path` };
  }
  if (!matchesDispositionKeyword(reason)) {
    return { ok: false, error: `deferral.reason names no disposition path (must reference one of: ${DISPOSITION_PATH_KEYWORDS.join(", ")}) — "blocked, until later" is the vague shape this rejects` };
  }

  // resolution_event: a named, checkable resolution event (an arbitrary date with no event is rejected).
  if (!isNonEmptyString(resolution_event)) {
    return { ok: false, error: "deferral.resolution_event is required (a named, checkable event that resolves the block) — a bare deferred_until with no named event is rejected" };
  }

  // deferred_until: a parseable FUTURE date.
  if (!isNonEmptyString(deferred_until)) {
    return { ok: false, error: "deferral.deferred_until is required (an ISO date string)" };
  }
  const until = new Date(deferred_until);
  if (Number.isNaN(until.getTime())) {
    return { ok: false, error: `deferral.deferred_until does not parse to a valid date: ${JSON.stringify(deferred_until)}` };
  }
  if (until.getTime() <= now.getTime()) {
    return { ok: false, error: `deferral.deferred_until is not in the future (${deferred_until}) — an expired deferral re-opens the item as undispositioned` };
  }

  // owner: a real named owner.
  if (!isNonEmptyString(owner)) {
    return { ok: false, error: "deferral.owner is required (a named owner; not empty)" };
  }
  if (BAD_OWNERS.has(owner.trim().toLowerCase())) {
    return { ok: false, error: `deferral.owner is a placeholder (${JSON.stringify(owner)}) — name a real owner` };
  }

  return { ok: true };
}

/** Write-side assertion: throws Error(error) when the payload is not a valid deferral. */
export function assertValidDeferral(payload, now = new Date()) {
  const r = isValidDeferral(payload, now);
  if (!r.ok) throw new Error(`invalid deferral: ${r.error}`);
  return true;
}
