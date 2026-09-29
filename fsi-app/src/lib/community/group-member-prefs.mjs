// group-member-prefs.mjs: pure body validation for the two self-only community_group_members
// preference toggles (migration 029: starred, muted), shared by PATCH /api/community/groups/[id]/star
// and PATCH /api/community/groups/[id]/mute so both routes validate their one boolean field the same
// way. PURE. No database, no I/O.

/**
 * @param {unknown} body - raw parsed JSON from the request.
 * @param {"starred"|"muted"} field - which boolean field this route expects.
 * @returns {{ ok: true, value: boolean } | { ok: false, error: string }}
 */
export function validateMemberPrefToggle(body, field) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "request body must be a JSON object" };
  }
  const raw = /** @type {Record<string, unknown>} */ (body);
  const value = raw[field];
  if (typeof value !== "boolean") {
    return { ok: false, error: `${field} (boolean) is required` };
  }
  return { ok: true, value };
}
