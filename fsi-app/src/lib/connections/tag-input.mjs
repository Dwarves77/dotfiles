import { KEYWORD_MAP } from "./derive-tags.mjs";

/** Deterministic default prefix window, in characters, always included from the start of the captured text. */
export const DEFAULT_PREFIX_CHARS = 8000;
/** Characters of context kept on each side of a vocabulary-term match found beyond the prefix window. NOT
 *  exported (lane DEAD-EXEC, 2026-09-04): used only within this file, per the wiring audit's Appendix B
 *  (dead exports, 2026-09-04) — DEFAULT_PREFIX_CHARS above remains exported since other callers import
 *  it individually. */
const DEFAULT_CONTEXT_CHARS = 300;

/**
 * The flat keyword-phrase list every KEYWORD_MAP entry carries, lower-cased, deduped. PURE.
 * @param {string[]} [extra] - additional lower-cased-on-the-way-in terms to widen the window with.
 * @returns {string[]}
 */
export function defaultVocabTerms(extra = []) {
  const terms = new Set();
  for (const entry of KEYWORD_MAP) {
    for (const kw of entry.keywords) {
      const t = String(kw || "").trim();
      if (t) terms.add(t.toLowerCase());
    }
  }
  for (const kw of Array.isArray(extra) ? extra : []) {
    const t = String(kw || "").trim();
    if (t) terms.add(t.toLowerCase());
  }
  return [...terms];
}

/**
 * Build a deterministic, bounded window over `text`: the first `prefixChars` characters, plus a
 * `contextChars`-wide slice around every later occurrence of a term in `vocabTerms` (overlapping
 * slices merged, in document order). PURE — no truncation marker text is invented beyond the literal
 * "..." join, which is never mistaken for matchable content by any KEYWORD_MAP/ALIAS_MAP phrase.
 * @param {string|null|undefined} text
 * @param {{prefixChars?:number, contextChars?:number, vocabTerms?:string[]}} [opts]
 * @returns {string}
 */
export function boundedSourceWindow(text, opts = {}) {
  const str = String(text || "");
  if (!str) return "";
  const prefixChars = Number.isFinite(opts.prefixChars) ? opts.prefixChars : DEFAULT_PREFIX_CHARS;
  const contextChars = Number.isFinite(opts.contextChars) ? opts.contextChars : DEFAULT_CONTEXT_CHARS;
  const terms = defaultVocabTerms(opts.vocabTerms);

  const prefix = str.slice(0, prefixChars);
  if (str.length <= prefixChars) return prefix;

  const lower = str.toLowerCase();
  /** @type {[number, number][]} */
  const ranges = [];
  for (const term of terms) {
    if (!term) continue;
    let from = 0;
    for (;;) {
      const idx = lower.indexOf(term, from);
      if (idx === -1) break;
      from = idx + term.length;
      if (idx < prefixChars) continue; // already inside the unconditional prefix
      ranges.push([Math.max(0, idx - contextChars), Math.min(str.length, idx + term.length + contextChars)]);
    }
  }
  if (!ranges.length) return prefix;

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  for (const [s, e] of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }

  const extra = merged.map(([s, e]) => str.slice(s, e)).join("\n...\n");
  return `${prefix}\n...\n${extra}`;
}

/**
 * Assemble derive-tags.mjs's derivation input for one item from ALL of its grounded material. PURE,
 * deterministic — same `row` always produces the same output. Returns the exact shape deriveTags()
 * contracts on (see derive-tags.mjs "INPUT SHAPE"); title/instrument-key/jurisdiction pass through
 * untouched, `full_brief` is the concatenation of every grounded text field, brief-first.
 * @param {{
 *   id: string, title?: string|null, canonical_instrument_key?: string|null,
 *   jurisdiction_iso?: string[]|string|null, jurisdictions?: string[]|null, full_brief?: string|null,
 *   sections?: Array<{content_md?: string|null}>|null,
 *   claims?: Array<{claim_kind?: string, claim_text?: string|null}>|null,
 *   searchResults?: Array<{result_content?: string|null}>|null,
 *   search_results?: Array<{result_content?: string|null}>|null,
 * }} row
 * @param {{prefixChars?:number, contextChars?:number, vocabTerms?:string[]}} [windowOpts]
 * @returns {{id:string, title:string|null, canonical_instrument_key:string|null,
 *   jurisdiction_iso:unknown, jurisdictions:unknown, full_brief:string|null}}
 */
export function assembleTagInput(row, windowOpts = {}) {
  const r = row || {};

  const sectionsText = Array.isArray(r.sections)
    ? r.sections.map((s) => s && s.content_md).filter(Boolean).join("\n\n")
    : "";

  const factClaimsText = Array.isArray(r.claims)
    ? r.claims
      .filter((c) => c && c.claim_kind === "FACT" && c.claim_text)
      .map((c) => c.claim_text)
      .join("\n\n")
    : "";

  const searchResults = Array.isArray(r.searchResults)
    ? r.searchResults
    : Array.isArray(r.search_results)
      ? r.search_results
      : [];
  const capturedRaw = searchResults.map((sr) => sr && sr.result_content).filter(Boolean).join("\n\n");
  const capturedWindow = boundedSourceWindow(capturedRaw, windowOpts);

  const groundedText = [r.full_brief, sectionsText, factClaimsText, capturedWindow]
    .filter((s) => typeof s === "string" && s.length)
    .join("\n\n");

  return {
    id: r.id,
    title: r.title ?? null,
    canonical_instrument_key: r.canonical_instrument_key ?? null,
    jurisdiction_iso: r.jurisdiction_iso ?? null,
    jurisdictions: r.jurisdictions ?? null,
    full_brief: groundedText.length ? groundedText : null,
  };
}
