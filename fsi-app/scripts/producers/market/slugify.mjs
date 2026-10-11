/** @param {unknown} raw @returns {string} lower-case, alphanumeric segments joined by single hyphens */

export function slugify(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
