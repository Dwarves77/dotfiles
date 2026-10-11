import { classifyRelevance } from "../screen-rules.mjs";

// not exported (lane DEAD-EXEC, 2026-09-04): used only within this file (isMintable below), per the
// wiring audit's Appendix B (dead exports, 2026-09-04) — no external importer names it directly.
const MINTABLE_VERDICT = "on_vertical";

/**
 * @param {{ id?: string, title?: string|null, document_url: string, surface_tags?: string[] }} row
 * @param {Record<string, {verdict: string, reason?: string, reviewer?: string}>} [reviewed]
 * @returns {{ verdict: "on_vertical"|"off_vertical"|"ambiguous", rule: string|null, basis: string, provenance: "rule"|"reviewed" }}
 */
export function screenVerdictFor(row, reviewed = {}) {
  const r = classifyRelevance({ title: row?.title ?? "", document_url: row?.document_url ?? "", surface_tags: row?.surface_tags ?? [] });
  const entry = row?.id ? reviewed?.[row.id] : null;
  if (r.verdict === "ambiguous" && entry && typeof entry === "object" && ["on_vertical", "off_vertical", "ambiguous"].includes(entry.verdict) && typeof entry.reason === "string" && entry.reason.length) {
    return { verdict: entry.verdict, rule: null, basis: entry.reason, provenance: "reviewed" };
  }
  return { verdict: r.verdict, rule: r.rule ?? null, basis: r.basis ?? "", provenance: "rule" };
}

/** True when the screen allows this row to mint. Only `on_vertical` mints; `ambiguous` waits for a ruling. */
export function isMintable(verdict) {
  return verdict === MINTABLE_VERDICT;
}
