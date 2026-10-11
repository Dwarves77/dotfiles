export const HEADER_LITERALS = new Set([
  // §15 sources table headers
  "source name", "source", "name", "title", "#", "no", "url", "link",
  "tier", "tier estimate", "type", "issuing body", "body", "date",
  "why this source matters", "why", "notes", "note", "description",
  // §8 obligations table headers
  "obligation", "deadline", "status", "next action", "requirement",
  // §14 timeline table headers · §3 action headers
  "event", "milestone", "phase", "trigger", "action", "severity", "when", "what",
]);

const NO_DATA_TOKENS = new Set(["", "—", "–", "-", "n/a", "na", "tbd", "tba", "...", "…", "null", "none"]);

/** True when `name` is not a real source name (null/empty, no-data token, or a table-header literal). */
export function isPlaceholderSourceName(name) {
  if (name == null) return true;
  const t = String(name).trim().toLowerCase();
  if (NO_DATA_TOKENS.has(t)) return true;
  if (HEADER_LITERALS.has(t)) return true;
  // a name that is only pipes / dashes / colons (a stray separator fragment)
  if (/^[|:\-–—\s]+$/.test(t)) return true;
  return false;
}

/** Keep only entries with a real (non-placeholder) source name. Never fabricates. */
export function renderableSourceEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter((e) => e && !isPlaceholderSourceName(e.name));
}

// ── Generalized render-trust gate (F-1 class kill, 2026-07-09) ──────────────────
// The parse→render boundary is a trust boundary. Every renderer consuming PARSED
// brief content validates its entries' required field before emitting. This is the
// ONE shared primitive; each structured renderer/parser applies it to its key field
// (source name · timeline label · obligation first cell · action text).

/** Generalized alias — true when a parsed field is empty/no-data/header-echo. */
export const isPlaceholderText = isPlaceholderSourceName;
