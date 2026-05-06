/**
 * extract-sections.ts
 *
 * Parser utility for the regulation detail Summary tab's "operational
 * briefing" tier (Tier 2 in the intelligence-depth layering).
 *
 * Pulls the first 2-3 paragraphs of three always-present sections out of
 * a `regulatory_fact_document` `full_brief` markdown payload at render
 * time, without touching the agent contract or the database. Mapping per
 * docs/BRIEF-STRUCTURE-AUDIT.md section 6:
 *
 *   1. Issues Requiring Immediate Action
 *   2. What This Regulation Is and Why It Applies to the Workspace
 *   3. How the Workspace Sits in the Compliance Chain
 *
 * Heading matching is tolerant: H1 and H2, case-insensitive, and a
 * leading numeric prefix ("1. ", "12. ") is stripped before comparison
 * so the ACF-style `## N. Section Name` outlier (per audit section 2)
 * still resolves cleanly. The parser also stops the section body at the
 * next H1 OR H2 — ACF emits the body sections as H2, so an H2-bounded
 * section ends at the next H2 not the next H1.
 *
 * Implemented as a line-state machine rather than a multi-line regex —
 * markdown headings inside fenced code blocks are skipped, and a single
 * pass over the lines is enough.
 */

export type ExtractedSection = {
  /** Heading text as it appeared in the source, with the numeric prefix
   * stripped and surrounding whitespace trimmed. */
  heading: string;
  /** Raw markdown body of the section (after the heading line, up to but
   * not including the next H1/H2 line). */
  contentMarkdown: string;
  /** First 2-3 non-empty paragraphs from contentMarkdown, split on
   * `\n\n+`. Each entry is the paragraph text with leading/trailing
   * whitespace trimmed. */
  firstParagraphs: string[];
  /** True when the section was located AND its first paragraphs have
   * substantive content (>50 chars total). Used to gate Tier 2 rendering
   * so a "no content" placeholder section doesn't surface a callout. */
  hasContent: boolean;
};

export type OperationalBriefing = {
  immediateAction: ExtractedSection | null;
  whatItIsWhyItApplies: ExtractedSection | null;
  complianceChain: ExtractedSection | null;
};

const TIER2_HEADINGS = {
  immediateAction: "Issues Requiring Immediate Action",
  whatItIsWhyItApplies:
    "What This Regulation Is and Why It Applies to the Workspace",
  complianceChain: "How the Workspace Sits in the Compliance Chain",
} as const;

/** Strip a leading "N." or "N) " numeric prefix used by ACF-style numbered
 * H2 headings. Also strips bold/italic markers around the heading text
 * (some briefs emit `## **Heading**` even though the spec says plain). */
function normaliseHeading(raw: string): string {
  let h = raw.trim();
  // Strip surrounding bold/italic markers
  h = h.replace(/^\*+\s*/, "").replace(/\s*\*+$/, "");
  // Strip leading "N. " or "N) " numeric prefix
  h = h.replace(/^\d+\s*[.)]\s*/, "");
  return h.trim();
}

/** Compare two heading strings case-insensitively after normalising
 * whitespace. The heading-text we feed in is already prefix-stripped. */
function headingsMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return norm(a) === norm(b);
}

/** Detect a markdown heading line at H1 or H2 level. Returns the
 * heading-text payload (already prefix/marker-stripped) and the level
 * (1 or 2), or null when the line is not a heading. */
function parseHeadingLine(
  line: string
): { level: 1 | 2; text: string } | null {
  const m = /^(#{1,2})\s+(.+?)\s*#*\s*$/.exec(line);
  if (!m) return null;
  const level = m[1].length as 1 | 2;
  const text = normaliseHeading(m[2]);
  if (!text) return null;
  return { level, text };
}

/** Lower-level lookup. Walks the lines, tracks code-fence state so that
 * `# Heading` inside a fenced block is ignored, and on a heading-text
 * match begins capturing body lines until a heading of equal-or-higher
 * level is encountered.
 *
 * IMPORTANT: stopping rules differ for H1- vs H2-anchored sections.
 *
 * - When the matched heading is an H1, the section ends at the next H1.
 *   Intermediate H2s belong to the section (per audit: SB 253 et al.
 *   emit "Plain-Language Summary" and "Why It Applies to the Workspace"
 *   as H2 sub-headings inside the H1 "What This Regulation Is..." body).
 * - When the matched heading is an H2 (ACF outlier), the section ends
 *   at the next H1 OR H2 — H2s are sibling sections in that variant.
 *
 * This was the bug surfaced by the first test run: 5/7 briefs were
 * marked PARTIAL because their H1 sections start with an H2 sub-heading,
 * which the previous "stop at any heading" rule treated as a section
 * boundary and emitted an empty body.
 */
export function extractSectionByHeading(
  fullBrief: string,
  headingText: string
): ExtractedSection | null {
  if (!fullBrief || !headingText) return null;
  const targetText = normaliseHeading(headingText);

  const lines = fullBrief.split(/\r?\n/);
  let inFence = false;
  let capturing = false;
  let captured: string[] = [];
  let foundHeading = "";
  let matchedLevel: 1 | 2 = 1;

  for (const line of lines) {
    // Toggle code-fence state. Headings inside a fence are not real
    // headings.
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      if (capturing) captured.push(line);
      continue;
    }

    if (inFence) {
      if (capturing) captured.push(line);
      continue;
    }

    const heading = parseHeadingLine(line);

    if (!capturing) {
      if (heading && headingsMatch(heading.text, targetText)) {
        capturing = true;
        foundHeading = heading.text;
        matchedLevel = heading.level;
      }
      continue;
    }

    // Currently capturing. Stop at the next heading of equal-or-higher
    // level than the one we matched. Sub-headings (lower level — i.e.
    // higher #-count) stay inside the captured body.
    if (heading && heading.level <= matchedLevel) {
      break;
    }

    captured.push(line);
  }

  if (!capturing) return null;

  const contentMarkdown = captured.join("\n").replace(/^\n+|\n+$/g, "");
  const firstParagraphs = splitFirstParagraphs(contentMarkdown, 3);
  const totalLen = firstParagraphs.reduce((sum, p) => sum + p.length, 0);
  const hasContent = firstParagraphs.length > 0 && totalLen > 50;

  return {
    heading: foundHeading,
    contentMarkdown,
    firstParagraphs,
    hasContent,
  };
}

/** Split the first up-to-N paragraphs from a markdown body.
 *
 * Skips paragraphs that are purely whitespace, markdown horizontal
 * rules, or single-line H2/H3 sub-headings — when a section's body
 * opens with `## Plain-Language Summary` (SB 253 / EU Battery / NZIA
 * pattern), the heading line is metadata, not preview content. We want
 * the prose paragraph beneath it.
 *
 * A standalone heading paragraph is always followed by a real paragraph
 * in the briefs we audited, so dropping the heading from the preview
 * gives the reader the substance directly.
 */
function splitFirstParagraphs(body: string, maxCount: number): string[] {
  if (!body) return [];
  const blocks = body.split(/\n{2,}/);
  const out: string[] = [];
  for (const blk of blocks) {
    const trimmed = blk.trim();
    if (!trimmed) continue;
    // Skip horizontal rules
    if (/^[-*_]{3,}$/.test(trimmed)) continue;
    // Skip standalone H2/H3 sub-headings (single line, no body) — these
    // are structural anchors, not preview content. The next paragraph
    // is the actual prose.
    if (/^#{2,3}\s+/.test(trimmed) && !trimmed.includes("\n")) continue;
    out.push(trimmed);
    if (out.length >= maxCount) break;
  }
  return out;
}

/**
 * Extract the three operational-briefing sections from a regulatory
 * fact document brief. Returns null entries for sections that aren't
 * found — callers gate the Tier 2 expander on at least one non-null
 * `hasContent` entry being present, which collapses the affordance for
 * non-regulatory_fact_document briefs (technology_profile etc.).
 */
export function extractOperationalBriefing(
  fullBrief: string
): OperationalBriefing {
  return {
    immediateAction: extractSectionByHeading(
      fullBrief,
      TIER2_HEADINGS.immediateAction
    ),
    whatItIsWhyItApplies: extractSectionByHeading(
      fullBrief,
      TIER2_HEADINGS.whatItIsWhyItApplies
    ),
    complianceChain: extractSectionByHeading(
      fullBrief,
      TIER2_HEADINGS.complianceChain
    ),
  };
}

/** Severity-label keywords the agent emits at the top of an Immediate
 * Action paragraph, per the markdown storage convention (lines 223-230 of
 * system-prompt.ts). Matched as the first word(s) of the first paragraph
 * with optional surrounding bold markers stripped. */
export const SEVERITY_LABELS = [
  "ACTION REQUIRED",
  "COST ALERT",
  "WINDOW CLOSING",
  "COMPETITIVE EDGE",
  "MONITORING",
] as const;

export type SeverityLabel = (typeof SEVERITY_LABELS)[number];

/** Pull a leading severity label out of a paragraph. Returns the label
 * and the remaining text (with the label and its trailing
 * delimiter trimmed). */
export function extractSeverityLabel(paragraph: string): {
  label: SeverityLabel | null;
  rest: string;
} {
  if (!paragraph) return { label: null, rest: paragraph };
  // Strip a leading bold marker so "**ACTION REQUIRED**: ..." is
  // recognised the same as "ACTION REQUIRED: ...".
  let stripped = paragraph.replace(/^\*+\s*/, "");
  for (const label of SEVERITY_LABELS) {
    const re = new RegExp(`^${label}\\b\\*?\\*?\\s*[-—:]?\\s*`, "i");
    if (re.test(stripped)) {
      const rest = stripped.replace(re, "").replace(/^\*+\s*/, "").trim();
      return { label, rest };
    }
  }
  return { label: null, rest: paragraph };
}

/** Convenience: heading-id used by IntelligenceBrief for in-page anchors.
 * Lowercased, alnum-only, hyphen-joined — mirrors the helper inside
 * IntelligenceBrief.tsx so Tier 2 deep-links can target Tier 3 sections.
 *
 * Tier 3 prepends a per-render briefId (from useId()) to avoid collisions
 * across briefs on a multi-brief page. The Tier 2 deep-link only needs
 * the heading-slug portion — the consumer combines the two. */
export function headingSlug(heading: string): string {
  return normaliseHeading(heading)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
