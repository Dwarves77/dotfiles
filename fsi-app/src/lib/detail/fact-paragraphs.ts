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
      return { kind: "fact", text: before, source: parseSourceCitation(m[1]) };
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
