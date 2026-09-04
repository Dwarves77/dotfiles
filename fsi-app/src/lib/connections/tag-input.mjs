// tag-input.mjs — the INPUT half of the TAGDERIVE dispatch (2026-09-03). PURE, deterministic, $0.
//
// THE MEASURED DEFECT (see tag-yield.fixture.test.mjs for the full before/after over real fixtures).
// propose-tags.mjs's readCorpus() feeds derive-tags.mjs's deriveTags() exactly
// `{title, canonical_instrument_key, jurisdiction_iso, jurisdictions, full_brief}` — the flat
// intelligence_items columns. For a record-grade item (item_grade='record', minted 2026-09-02) that
// is nearly the WHOLE input: full_brief is a short catalogue stub ("*Catalogue record: extracted
// facts only, full brief pending.*" plus a handful of verbatim/GAP claim lines), typically 1.3-1.8kB.
// Measured over the 178-item record-grade population in
// scripts/_snapshots/population-33749140151/census-rows.apply-ready.json: deriveTags() on that flat
// shape alone proposes ZERO tags for all 178/178 items. But every one of those items ALSO carries a
// full captured source document in agent_run_searches.result_content — thousands to 100k+ chars,
// never capped (ADR-016) — that propose-tags.mjs's readCorpus() never selects. Re-running deriveTags()
// with full_brief REPLACED by full_brief + intelligence_item_sections.content_md + FACT-kind
// section_claim_provenance.claim_text + the item's captured source text (no vocabulary change, same
// KEYWORD_MAP) lifts the yield to 51/178 (28.7%) — proof the gap is INPUT STARVATION, not (only) a
// vocabulary gap: the grounded text to match against was sitting in the DB the whole time, unread.
//
// THIS MODULE assembles that wider input, in the EXACT shape deriveTags() already accepts (this
// module does not touch derive-tags.mjs — another lane, GTAGS, is changing its confidence surface
// concurrently). assembleTagInput() folds every grounded material an item carries into one
// `full_brief`-shaped string — title/instrument-key/jurisdiction pass through unchanged — so the
// caller's very next line can be `deriveTags(assembleTagInput(row))` with no other change to
// derive-tags.mjs or to the shape it contracts on (see that file's own "INPUT SHAPE" header comment).
//
// NEVER INVENTS TEXT. Every character folded in is copied verbatim from a field the item's own mint
// pipeline already wrote (full_brief, intelligence_item_sections.content_md, a FACT claim_text, or
// agent_run_searches.result_content) — GAP-kind claims are deliberately excluded (their claim_text is
// boilerplate "no verbatim X statement was located..." prose that carries no grounded signal and
// would only dilute/mislead a keyword scan).
//
// BOUNDED, deterministic. The captured source text can be 100kB+ per item (ADR-016: never capped at
// capture time) and a single item can carry more than one search_results row; scanning ALL of it
// unbounded, for every item, on every propose-tags.mjs run, does not scale and is not needed —
// deriveTags()'s own KEYWORD_MAP entries are short, near-the-top phrases in practice (measured: every
// real match across the 178-item population and its own captured text sits within the first ~1.3kB of
// the document — see tag-yield.fixture.test.mjs). boundedSourceWindow() takes a deterministic PREFIX
// (first `prefixChars`, default 8kB) of the captured text, unconditionally, plus — for a vocabulary
// term that occurs LATER than the prefix — a small context window around each such occurrence (merged
// where windows overlap), so a real match deep in a long document is never silently dropped, without
// ever including the whole document. Same input always produces the same output; no randomness, no
// network, no LLM.
//
// VOCABULARY TERMS used for the "does this section contain a vocabulary term" test default to
// derive-tags.mjs's own KEYWORD_MAP keywords (imported, read-only — this module never edits that
// table) so the window logic tracks the live vocabulary automatically; a caller may widen the term
// list (e.g. with tag-aliases.mjs's ALIAS_KEYWORDS) via the `vocabTerms` option.

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
