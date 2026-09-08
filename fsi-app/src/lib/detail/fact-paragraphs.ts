// src/lib/detail/fact-paragraphs.ts
//
// Parses a stored `intelligence_item_sections.content_md` string (or any
// full_brief section body) into an ordered list of blocks, classifying each
// paragraph per the pipeline's own claim-labeling contract
// (src/lib/agent/system-prompt.ts §"Claim-level provenance — the source
// invariant"):
//
//   FACT     — plain prose ending in an inline citation:
//              "*Source: [Title], [Issuing Body], [Date]. [URL].*"
//   ANALYSIS — opens with one of the three closed-set label tokens:
//              "*Analytical inference:*" / "*Industry interpretation:*" /
//              "*Operational implication:*"
//   LEGAL    — opens with "*Legal Confirmation Required:*"
//
// Any paragraph matching none of these renders as plain connective prose —
// not every sentence in a section is a claim, and this parser never forces
// one to be. This is a PURE, render-time reparse of already-written text
// (CLAUDE.md rule: docs/dispatches — "parse at render time from the stored
// text, do not change the pipeline output"); it never writes back to the
// database and never changes what the pipeline emits.

export type FactParagraphKind = "fact" | "inference" | "counsel" | "prose";

export interface ParsedSource {
  title: string | null;
  issuer: string | null;
  date: string | null;
  url: string | null;
}

export interface FactParagraph {
  kind: FactParagraphKind;
  /** The claim/prose text with its label token and (for FACT) its inline
   *  citation stripped. */
  text: string;
  /** FACT only. */
  source?: ParsedSource | null;
  /** ANALYSIS only — the humanized label ("Analytical inference", etc.). */
  label?: string | null;
}

const ANALYSIS_LABELS: Array<{ token: string; humanized: string }> = [
  { token: "Analytical inference:", humanized: "Analytical inference" },
  { token: "Industry interpretation:", humanized: "Industry interpretation" },
  { token: "Operational implication:", humanized: "Operational implication" },
];

const LEGAL_TOKEN = "Legal Confirmation Required:";

// COUNTS-61 (production defect, click-through audit 2026-09-08). Every FACT card on the regulation,
// research and operations detail pages rendered as `"FACT: "…""` — the literal word FACT inside a
// card already titled FACT, with a doubled closing quote.
//
// ROOT CAUSE [CONFIRMED against the live database]: the pipeline writes the FACT label into the
// stored paragraph, in three observed shapes —
//   FACT: "ACT requires that 40-75% of new ... vehicles ... be zero-emission by 2035."
//   **FACT:** "The ninth STI Forum was convened by ..."
//   **Effective date and jurisdictional scope — FACT:** "This final rule is effective on July 6, 2026." ...
// — and wraps the claim in straight double quotes. This parser stripped the ANALYSIS and LEGAL
// label tokens but had no FACT stripper and no quote unwrap, while FactCard's sourced variant adds
// its own typographic quotes around whatever text it is handed. So the label and one pair of quotes
// were printed twice over.
//
// The fix is here, in the ONE parser, not in the three surfaces: the label token comes off (with an
// optional lead-in phrase before an em dash, the third shape above), and ONE layer of surrounding
// straight or curly double quotes comes off with it. FactCard keeps supplying the typographic
// quotes, which is the single home for them.
//
// This is a render-time reparse of already-written text (this file's own header rule): it changes
// nothing the pipeline emits and writes nothing back.
const FACT_TOKEN_RE = /^\*{0,2}\s*(?:[^*\n]{0,120}?\s+[—–-]\s+)?FACT:\s*\*{0,2}\s*/i;

/** Remove one layer of surrounding double quotes (straight or curly) when the WHOLE text is one
 *  quotation — never when the quotes are interior punctuation inside a longer paragraph, which
 *  would silently alter a real sentence. */
function unwrapOuterQuotes(text: string): string {
  const t = text.trim();
  const pairs: Array<[string, string]> = [['"', '"'], ["\u201c", "\u201d"]];
  for (const [open, close] of pairs) {
    if (t.length >= 2 && t.startsWith(open) && t.endsWith(close)) {
      const inner = t.slice(1, -1);
      if (!inner.includes(open) && !inner.includes(close)) return inner.trim();
    }
  }
  return t;
}

/** Strip the pipeline's own "FACT:" label from a claim paragraph, and the quotes it wraps the claim
 *  in. Returns the text unchanged when there is no label, so a plain claim paragraph is untouched. */
export function stripFactLabel(text: string): string {
  const withoutLabel = text.replace(FACT_TOKEN_RE, "").trim();
  return unwrapOuterQuotes(withoutLabel);
}

// Matches a trailing inline citation in either of the two forms the pipeline
// writes: the emphasis-wrapped canonical form *Source: ...* (system-prompt.ts
// §"Markdown storage convention"), and a bare "Source: ..." line (the same
// convention used by record-facts.mjs / GfmSection's own trailing-source
// prop) for content that already had its emphasis markers stripped upstream
// (canonical-pipeline.ts stripUrlMarkers, §sectionBrief).
const SOURCE_RE = /\*?\s*Source:\s*([\s\S]+?)\*?\s*$/i;

const URL_RE = /https?:\/\/[^\s)\]}"'<>]+/;

function stripLeadingEmphasisToken(text: string, token: string): string | null {
  // Token may appear as *Token* or **Token** at the very start of the
  // paragraph, per system-prompt.ts's own worked examples.
  const re = new RegExp(`^\\*{1,2}\\s*${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\*{0,2}\\s*`, "i");
  if (re.test(text)) return text.replace(re, "").trim();
  return null;
}

/** Parse the "[Title], [Issuing Body], [Date]. [URL]." citation body (the
 *  part after "Source:") into its component fields. Tolerant of a citation
 *  that only carries some of the four parts — never throws, never invents a
 *  field that isn't there. */
export function parseSourceCitation(raw: string): ParsedSource {
  let rest = raw.trim().replace(/\.$/, "");
  const urlMatch = URL_RE.exec(rest);
  const url = urlMatch ? urlMatch[0].replace(/[.,;:]+$/, "") : null;
  if (urlMatch) rest = (rest.slice(0, urlMatch.index) + rest.slice(urlMatch.index + urlMatch[0].length)).trim();
  rest = rest.replace(/[.,]\s*$/, "").trim();
  const parts = rest
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  // Convention: [Title], [Issuing Body], [Date] — date is typically the
  // last segment and often itself contains no comma; title/issuer may be
  // absent (a bare "Source: <url>" line, e.g. record-facts.mjs's
  // sources_and_citations format).
  const title = parts.length > 0 ? parts[0] : null;
  const issuer = parts.length > 2 ? parts.slice(1, -1).join(", ") : parts.length === 2 ? parts[1] : null;
  const date = parts.length > 1 ? parts[parts.length - 1] : null;
  return { title, issuer, date, url };
}

/** Classify one paragraph (already trimmed, blank-line-delimited text). */
export function classifyParagraph(paragraph: string): FactParagraph {
  const text = paragraph.trim();

  for (const { token, humanized } of ANALYSIS_LABELS) {
    const rest = stripLeadingEmphasisToken(text, token);
    if (rest !== null) return { kind: "inference", text: rest, label: humanized };
  }

  const legalRest = stripLeadingEmphasisToken(text, LEGAL_TOKEN);
  if (legalRest !== null) return { kind: "counsel", text: legalRest };

  const m = SOURCE_RE.exec(text);
  if (m) {
    const before = text.slice(0, m.index).trim();
    // A bare "Source: <url>" trailer with no preceding claim prose isn't a
    // FACT paragraph on its own (e.g. a standalone sources-list line) —
    // fall through to prose so the caller's Sources section can render it
    // its own way rather than as an empty-quote FactCard.
    if (before) {
      return { kind: "fact", text: stripFactLabel(before), source: parseSourceCitation(m[1]) };
    }
  }

  return { kind: "prose", text };
}

/** Split a section's content_md into blank-line-delimited paragraphs and
 *  classify each. Headings (#…) and table/list blocks are left as their
 *  raw markdown in a `prose` block — this parser only pulls FACT/ANALYSIS/
 *  LEGAL narrative paragraphs out of running text; a caller that wants
 *  tables handled specially (e.g. the operations concession table) should
 *  detect those blocks before calling this. */
export function parseFactParagraphs(markdown: string | null | undefined): FactParagraph[] {
  if (!markdown || !markdown.trim()) return [];
  const paragraphs = markdown
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs.map(classifyParagraph);
}
