/**
 * extract-regulation-sections.ts
 *
 * Tier-3 structured parser for the regulation detail page's 7 numbered
 * sections (Sprint 3 A5.1, 2026-05-27). Reads from `full_brief` markdown
 * and produces per-section discriminated-union output that the
 * RegulationDetailSurface section components (ActionList, ObligationsTable,
 * RegulationTimeline, SourcesList, ProseSection) consume directly.
 *
 * Sections in scope (operator-locked, mockup-derived, Brief-Drift override):
 *   §3  Issues Requiring Immediate Action     — action list w/ severity chips
 *   §4  How the Workspace Sits in Compliance Chain — prose + trailing source
 *   §8  Substantive Requirements              — 4-col obligations table
 *   §10 Registration and Reporting Obligations — prose (operator-locked Q1)
 *   §11 Operational System Requirements       — prose (operator-locked Q1)
 *   §14 Confirmed Regulatory Timeline         — date + label + source rows
 *   §15 Sources                               — tier-tagged source list
 *
 * Integrity rule: when a section is absent from full_brief, the output
 * omits the key entirely (no synthetic content). When a section is
 * present but malformed (e.g. §8 table without a recognizable header),
 * the parser returns an empty rows[] array — the renderer suppresses
 * the section card per the same integrity logic.
 *
 * Heading match is tolerant: accepts `## §N Title`, `## N. Title`,
 * `## N) Title`, plain `## Title`, and the H1 variant of each. The
 * existing extractSectionByHeading() from extract-sections.ts handles
 * the section-boundary walk; this module layers per-section parsers
 * on top of its raw markdown bodies.
 *
 * A5.2 backfill script reads from this module to populate
 * intelligence_item_sections rows (migration 103). A5.3 detail-surface
 * renderer reads from the table at render time. The parser is invoked
 * twice in the pipeline: once at backfill, once at agent regeneration
 * (a follow-up commit wires it into /api/agent/run after each
 * full_brief emit).
 */

import { extractSectionByHeading } from "./extract-sections";

// ── Section-key vocabulary ─────────────────────────────────────────

/** Stable string keys used in intelligence_item_sections rows. The
 * numeric portion mirrors the SKILL.md spec. */
export type RegulationSectionKey =
  | "3"
  | "4"
  | "8"
  | "10"
  | "11"
  | "14"
  | "15";

/** Heading text per section (the parser tries each variant). */
const SECTION_HEADINGS: Record<RegulationSectionKey, string[]> = {
  "3": [
    "Issues Requiring Immediate Action",
    "§3 Issues Requiring Immediate Action",
  ],
  "4": [
    "How the Workspace Sits in the Compliance Chain",
    "§4 How the Workspace Sits in the Compliance Chain",
  ],
  "8": [
    "Substantive Requirements",
    "§8 Substantive Requirements",
  ],
  "10": [
    "Registration and Reporting Obligations",
    "§10 Registration and Reporting Obligations",
  ],
  "11": [
    "Operational System Requirements",
    "§11 Operational System Requirements",
  ],
  "14": [
    "Confirmed Regulatory Timeline",
    "§14 Confirmed Regulatory Timeline",
  ],
  "15": [
    "Sources",
    "§15 Sources",
  ],
};

// ── Discriminated-union output shape ───────────────────────────────

export type Severity =
  | "action_required"
  | "cost_alert"
  | "window_closing"
  | "competitive_edge"
  | "monitoring";

/** §3 action-list row. */
export interface ActionListItem {
  /** Inline severity-chip label. Null when the row's first paragraph
   * doesn't open with one of the SKILL severity tokens. */
  severity: Severity | null;
  /** Short headline (the bold "label:" portion when present, else the
   * first line). */
  label: string;
  /** Body prose for the row. */
  body: string;
}

/** §8 obligations-table row. */
export interface ObligationRow {
  obligation: string;
  deadline: string;
  status: string;
  nextAction: string;
}

/** §14 timeline entry. */
export interface TimelineEntry {
  /** Date as it appeared in the markdown (e.g. "2026-01-01", "Q3 2026"). */
  date: string;
  /** Label / event name. */
  label: string;
  /** Trailing source citation, or null when absent. */
  source: string | null;
}

/** §15 source entry. */
export interface SourceEntry {
  /** Tier badge value when parseable from the row (e.g. "[T2]" prefix
   * or "Tier 2" inline). Null when no tier marker present. */
  tier: number | null;
  /** Source name (typically bold in markdown). */
  name: string;
  /** Trailing meta line (publication date, organization, etc.). */
  meta: string;
  /** First URL extracted from the row, or null when absent. */
  url: string | null;
}

/** Discriminated section payload. */
export type RegulationSection =
  | { kind: "action_list"; heading: string; items: ActionListItem[] }
  | { kind: "prose_with_source"; heading: string; markdown: string; source: string | null }
  | { kind: "obligations_table"; heading: string; rows: ObligationRow[] }
  | { kind: "prose"; heading: string; markdown: string }
  | { kind: "timeline"; heading: string; entries: TimelineEntry[] }
  | { kind: "sources_list"; heading: string; entries: SourceEntry[] };

export type ExtractedRegulationSections = Partial<Record<RegulationSectionKey, RegulationSection>>;

// ── Public entry point ─────────────────────────────────────────────

/**
 * Parse a `full_brief` markdown payload into the 7 structured sections.
 * Sections missing from the source are omitted from the result map.
 * Sections present but with no parseable rows return an empty rows[]
 * array — the renderer suppresses the section card downstream.
 */
export function extractRegulationSections(
  fullBrief: string
): ExtractedRegulationSections {
  if (!fullBrief) return {};
  const result: ExtractedRegulationSections = {};

  for (const key of Object.keys(SECTION_HEADINGS) as RegulationSectionKey[]) {
    const variants = SECTION_HEADINGS[key];
    let body: { heading: string; markdown: string } | null = null;

    for (const variant of variants) {
      const extracted = extractSectionByHeading(fullBrief, variant);
      if (extracted) {
        body = { heading: extracted.heading, markdown: extracted.contentMarkdown };
        break;
      }
    }

    if (!body) continue;

    const parsed = parseSection(key, body.heading, body.markdown);
    if (parsed) result[key] = parsed;
  }

  return result;
}

// ── Per-section dispatch ───────────────────────────────────────────

function parseSection(
  key: RegulationSectionKey,
  heading: string,
  markdown: string
): RegulationSection | null {
  switch (key) {
    case "3":
      return { kind: "action_list", heading, items: parseActionList(markdown) };
    case "4":
      return parseProseWithSource(heading, markdown);
    case "8":
      return { kind: "obligations_table", heading, rows: parseObligationsTable(markdown) };
    case "10":
    case "11":
      return { kind: "prose", heading, markdown: markdown.trim() };
    case "14":
      return { kind: "timeline", heading, entries: parseTimeline(markdown) };
    case "15":
      return { kind: "sources_list", heading, entries: parseSourcesList(markdown) };
  }
}

// ── §3 action-list parser ──────────────────────────────────────────

const SEVERITY_TOKEN_TO_KEY: Record<string, Severity> = {
  "action required": "action_required",
  "cost alert": "cost_alert",
  "window closing": "window_closing",
  "competitive edge": "competitive_edge",
  monitoring: "monitoring",
};

/**
 * §3 entries are emitted as bulleted paragraphs. Each bullet typically
 * opens with `**SEVERITY** Label:` or `- **Label** body`, where
 * `SEVERITY` is one of the 5 SKILL severity tokens (case-insensitive,
 * with optional bold markers). The body is the remaining prose.
 */
function parseActionList(markdown: string): ActionListItem[] {
  const blocks = markdown.split(/\n{2,}/);
  const items: ActionListItem[] = [];

  for (const blk of blocks) {
    const trimmed = blk.trim();
    if (!trimmed) continue;
    // Skip pure horizontal-rule separators.
    if (/^[-*_]{3,}$/.test(trimmed)) continue;
    // Strip a leading bullet marker if present.
    const stripped = trimmed.replace(/^[-*+]\s+/, "");
    // Strip surrounding bold markers from any leading inline token.
    const inlineStripped = stripped.replace(/^\*+\s*/, "");

    // Try to extract a leading severity token (with optional trailing
    // bold marker and a punctuation delimiter).
    const sevMatch = /^([A-Z][A-Z\s]+?)\*{0,2}\s*[-—:]\s*/.exec(inlineStripped);
    let severity: Severity | null = null;
    let rest = inlineStripped;
    if (sevMatch) {
      const candidate = sevMatch[1].trim().toLowerCase().replace(/\s+/g, " ");
      const key = SEVERITY_TOKEN_TO_KEY[candidate];
      if (key) {
        severity = key;
        rest = inlineStripped.slice(sevMatch[0].length).trim();
      }
    }

    // Split label : body on the first colon that comes after a bold-wrap.
    // Pattern: `**Label** body` or `Label: body`.
    let label = "";
    let body = rest;
    const boldMatch = /^\*\*([^*]+)\*\*\s*[:\-–—]?\s*/.exec(rest);
    if (boldMatch) {
      label = boldMatch[1].trim();
      body = rest.slice(boldMatch[0].length).trim();
    } else {
      const colonIdx = rest.indexOf(":");
      if (colonIdx > 0 && colonIdx < 80) {
        label = rest.slice(0, colonIdx).trim();
        body = rest.slice(colonIdx + 1).trim();
      } else {
        // No clear label boundary; use the first sentence as the label.
        const sentenceEnd = rest.search(/[.!?](?:\s|$)/);
        if (sentenceEnd > 0 && sentenceEnd < 120) {
          label = rest.slice(0, sentenceEnd + 1).trim();
          body = rest.slice(sentenceEnd + 1).trim();
        } else {
          label = rest;
          body = "";
        }
      }
    }

    if (!label && !body && !severity) continue;
    items.push({ severity, label, body });
  }

  return items;
}

// ── §4 prose + trailing source ─────────────────────────────────────

/**
 * §4 is plain prose followed (often) by a trailing "Source: ..." line
 * or italicized source citation. Strip that line into the source field
 * if present; keep the rest as the prose body.
 */
function parseProseWithSource(heading: string, markdown: string): RegulationSection {
  const lines = markdown.split(/\r?\n/);
  let sourceLine: string | null = null;
  // Walk from the end to find a trailing line starting with "Source:" or
  // wrapped in italics.
  for (let i = lines.length - 1; i >= 0; i--) {
    const ln = lines[i].trim();
    if (!ln) continue;
    if (/^source\s*[:\-—]/i.test(ln)) {
      sourceLine = ln.replace(/^source\s*[:\-—]\s*/i, "").trim();
      lines.splice(i, 1);
      break;
    }
    // Italicized source pattern: `*Source ...*` or `_Source ..._`.
    if (/^[*_].+[*_]$/.test(ln) && /source/i.test(ln)) {
      sourceLine = ln.replace(/^[*_]+|[*_]+$/g, "").trim();
      lines.splice(i, 1);
      break;
    }
    // First non-empty non-source line from the end: no trailing source.
    break;
  }
  return {
    kind: "prose_with_source",
    heading,
    markdown: lines.join("\n").trim(),
    source: sourceLine,
  };
}

// ── §8 obligations table parser ────────────────────────────────────

/**
 * §8 is a markdown table with 4 columns: obligation, deadline, status,
 * next action. Tolerant of header label variations as long as the table
 * shape (pipe-delimited rows + separator) is recognizable.
 */
function parseObligationsTable(markdown: string): ObligationRow[] {
  const lines = markdown.split(/\r?\n/);
  // Find first table line — header — then the separator, then data rows.
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (!ln.startsWith("|")) continue;
    const next = (lines[i + 1] || "").trim();
    // Separator row matches |---|---|...
    if (/^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|$/.test(next)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const rows: ObligationRow[] = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (!ln.startsWith("|")) break;
    // Split on `|`, drop leading/trailing empty cells.
    const cells = ln
      .split("|")
      .map((c) => c.trim())
      .filter((_, idx, arr) => idx !== 0 && idx !== arr.length - 1);
    if (cells.length < 2) continue;
    // Pad to 4 columns so missing cells render as empty rather than skip.
    while (cells.length < 4) cells.push("");
    rows.push({
      obligation: cells[0],
      deadline: cells[1],
      status: cells[2],
      nextAction: cells[3],
    });
  }
  return rows;
}

// ── §14 timeline parser ────────────────────────────────────────────

/**
 * §14 entries are typically bulleted lines opening with a date or date
 * range followed by an em-dash and the event label. A trailing source
 * citation in parentheses or after `Source:` is captured separately.
 */
function parseTimeline(markdown: string): TimelineEntry[] {
  const blocks = markdown.split(/\n{1,}/);
  const entries: TimelineEntry[] = [];

  for (const raw of blocks) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // Skip horizontal-rule separators.
    if (/^[-*_]{3,}$/.test(trimmed)) continue;
    // Drop leading bullet marker.
    const stripped = trimmed.replace(/^[-*+]\s+/, "");
    // Match a leading date-ish token (ISO date, "Q3 2026", "Jan 2026",
    // year only, or a date range "2026-01-01 to 2026-03-01").
    const dateMatch = /^([\dA-Z][^\s—–-]+(?:\s+\d{4})?(?:\s+(?:to|–|—)\s+[\dA-Z][^\s—–-]+(?:\s+\d{4})?)?)\s*[—–-]\s*/i.exec(
      stripped
    );
    if (!dateMatch) continue;
    const date = dateMatch[1].trim();
    let rest = stripped.slice(dateMatch[0].length).trim();

    // Pull out a trailing source citation in parentheses or after
    // "Source:".
    let source: string | null = null;
    const parenSrcMatch = /\s*\(source:\s*([^)]+)\)\s*$/i.exec(rest);
    if (parenSrcMatch) {
      source = parenSrcMatch[1].trim();
      rest = rest.slice(0, parenSrcMatch.index).trim();
    } else {
      const trailingSrcMatch = /\s+(?:source|src)\s*[:\-—]\s*(.+)$/i.exec(rest);
      if (trailingSrcMatch) {
        source = trailingSrcMatch[1].trim();
        rest = rest.slice(0, trailingSrcMatch.index).trim();
      }
    }

    entries.push({ date, label: rest, source });
  }

  return entries;
}

// ── §15 sources list parser ────────────────────────────────────────

const URL_RE = /(https?:\/\/[^\s)]+)/i;

/**
 * §15 source entries are bulleted lines, each with an optional tier
 * marker (e.g. "[T2]" or "Tier 2"), a bolded source name, and a
 * trailing meta line. The first URL on the row is captured.
 *
 * Tier extraction is best-effort. When the markdown doesn't surface a
 * tier explicitly, the entry's `tier` is null. A future enhancement
 * could join `intelligence_item_sections.source_ids[]` to `sources.base_tier`
 * at render time (operator Q2 confirmation), but the parser-side path
 * stays defensive.
 */
function parseSourcesList(markdown: string): SourceEntry[] {
  const blocks = markdown.split(/\n{1,}/);
  const entries: SourceEntry[] = [];

  for (const raw of blocks) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/^[-*_]{3,}$/.test(trimmed)) continue;

    const stripped = trimmed.replace(/^[-*+]\s+/, "");

    // Tier marker: [T1] / [T2] / [Tier 3] / "(Tier 1)".
    let tier: number | null = null;
    let body = stripped;
    const tierMatch = /^[\[(]?(?:tier\s*)?T?(\d)[\])]?\s*[-:—]?\s*/i.exec(stripped);
    if (tierMatch) {
      tier = parseInt(tierMatch[1], 10);
      body = stripped.slice(tierMatch[0].length).trim();
    }

    // Bolded source name first.
    let name = "";
    let meta = body;
    const boldMatch = /^\*\*([^*]+)\*\*\s*[-—:.]?\s*/.exec(body);
    if (boldMatch) {
      name = boldMatch[1].trim();
      meta = body.slice(boldMatch[0].length).trim();
    } else {
      // Fall back: first comma- or em-dash-separated segment as name.
      const splitIdx = body.search(/\s*[—–-]\s+/);
      if (splitIdx > 0 && splitIdx < 120) {
        name = body.slice(0, splitIdx).trim();
        meta = body.slice(splitIdx).replace(/^\s*[—–-]\s*/, "").trim();
      } else {
        name = body;
        meta = "";
      }
    }

    // Extract first URL.
    const urlMatch = URL_RE.exec(body);
    const url = urlMatch ? urlMatch[1] : null;

    if (!name) continue;
    entries.push({ tier, name, meta, url });
  }

  return entries;
}
