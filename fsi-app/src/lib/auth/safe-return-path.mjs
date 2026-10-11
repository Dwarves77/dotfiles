/**
 * @param {string | null | undefined} raw
 * @returns {string} a safe same-origin path, or "/" when `raw` is unsafe.
 */

export function sanitizeReturnPath(raw) {
  if (!raw) return "/";
  if (typeof raw !== "string") return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}
