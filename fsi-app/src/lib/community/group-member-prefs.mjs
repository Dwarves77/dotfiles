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
