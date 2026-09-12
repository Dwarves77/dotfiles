// src/lib/agent/timeline-parse.mjs
//
// Section-14 TIMELINE BULLET/TABLE PARSER -- moved out of extract-regulation-sections.ts (task 6.1b,
// brief-chain-build-plan-2026-09-11, fix E) so record-briefs/schema.mjs's pre-write timeline-authoring
// mirror (a plain .mjs validator -- no `@/` alias, no jiti, portable to the no-npm-ci discipline job) can
// call the SAME parser the live write site uses (canonical-pipeline.ts -> harvestItemTimeline ->
// extractRegulationSections -> parseTimeline), instead of a second hand-rolled copy that could silently
// drift from it. extractRegulationSections.ts now imports parseTimeline FROM here -- one parser, two
// callers, reuse-before-construction.
//
// WIDENED (lane GATE-A-TOKENS pilot finding E, 2026-09-12). The prior bullet-line regex required a dash
// separator ONLY (hyphen-minus, en dash, or em dash) between the date token and the label. This repo
// forbids writing literal em/en-dash glyphs in generated prose (CLAUDE.md's dash ban), so a compliant
// lane wrote "- 3 November 2023: Commission Decision ..." (a COLON separator) and the old regex read it
// as zero entries -- all ten pilot items lost their whole section-14 harvest this way (buildTimelineRows
// got zero entries in, so it could only ever emit zero rows out; the harvest logic itself was never at
// fault). The date-token grammar is also narrowed from a generic "any non-whitespace run" heuristic to
// the specific forms toIsoDate (timeline-harvest.mjs) actually parses: ISO, day-month-year / month-day-
// year, month-year, quarter/half, bare year, and a range of two of those joined by "to"/a dash -- so a
// leading token this parser recognises is, by construction, one toIsoDate can convert. Conversion itself
// is NOT duplicated here (this module never imports timeline-harvest.mjs): only the SHAPE needed to find
// where the date ends and the label begins.
//
// PURE -- no I/O, no imports. Dash/section-sign glyphs below are written as \u escapes, never literal
// characters, so this file's own diff carries none (the same convention this task's every other new file
// follows).

const MONTHS_RE =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

// One "date-shaped" alternative per form toIsoDate accepts (mirrors the SHAPE only, never the month-name
// or quarter/half ARITHMETIC toIsoDate itself owns): ISO, day-month-year, month-day-year, month-year,
// quarter, half, bare year -- tried in this order so the more specific forms win before the bare-year
// fallback.
const DATE_FORM =
  "\\d{4}-\\d{1,2}-\\d{1,2}" + // 2026-08-12
  `|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS_RE})\\.?\\s+\\d{4}` + // 3 November 2023
  `|(?:${MONTHS_RE})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}` + // November 3, 2023
  `|(?:${MONTHS_RE})\\.?\\s+\\d{4}` + // November 2023
  "|[Qq][1-4]\\s+\\d{4}" + // Q3 2026
  "|[Hh][12]\\s+\\d{4}" + // H1 2027
  "|\\d{4}"; // 2027

const DATE_TOKEN_RE = new RegExp(`^(?:${DATE_FORM})(?:\\s*(?:to|\u2013|\u2014)\\s*(?:${DATE_FORM}))?`, "i");

/**
 * Find the first standalone `:` or word-boundary dash (hyphen-minus, en dash, or em dash surrounded by
 * whitespace or at a token edge) in `text`, splitting it into a leading QUALIFIER clause and the
 * remaining label text. A mid-word hyphen ("five-year") is never treated as a separator because it is
 * not surrounded by whitespace on both sides. Returns null when no separator is found (not a
 * recognisable entry).
 * @param {string} text @returns {{qualifier:string, rest:string}|null}
 */
function splitAtSeparator(text) {
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === ":") {
      return { qualifier: text.slice(0, i).trim(), rest: text.slice(i + 1).trim() };
    }
    if (c === "-" || c === "\u2013" || c === "\u2014") {
      const before = i === 0 ? " " : text[i - 1];
      const after = i === text.length - 1 ? " " : text[i + 1];
      if (before === " " && after === " ") {
        return { qualifier: text.slice(0, i).trim(), rest: text.slice(i + 1).trim() };
      }
    }
  }
  return null;
}

/**
 * Section-14 entries come in TWO shapes and both must parse:
 *  1. Bulleted lines opening with a recognised date token (see DATE_FORM above), followed by `:` or a
 *     dash separator -- optionally with a short qualifying clause between the date and the separator
 *     ("31 December 2040 and each five-year anniversary: ..."), captured and folded into the label
 *     rather than lost -- then the event label; a trailing source citation in parentheses or after
 *     "Source:" is captured separately.
 *  2. Markdown table rows `| date | milestone | status |` (date = column 1, label = column 2; header +
 *     `|---|` separator rows skipped) -- UNCHANGED from the original parser.
 * @param {string} markdown
 * @returns {{date:string,label:string,source:(string|null)}[]}
 */
export function parseTimeline(markdown) {
  const blocks = String(markdown ?? "").split(/\n{1,}/);
  const entries = [];

  for (const raw of blocks) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // Skip horizontal-rule separators.
    if (/^[-*_]{3,}$/.test(trimmed)) continue;

    // Markdown TABLE row: | date | label | ... | -- unchanged shape.
    if (trimmed.startsWith("|")) {
      const cells = trimmed
        .split("|")
        .map((c) => c.trim())
        .filter((c, i, arr) => !(i === 0 && c === "") && !(i === arr.length - 1 && c === ""));
      if (cells.length < 2) continue;
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separator row
      const dateCell = cells[0].replace(/\*\*/g, "").trim();
      if (/^date\b/i.test(dateCell)) continue; // header row
      const labelCell = (cells[1] || "").replace(/\*\*/g, "").trim();
      if (!dateCell || !labelCell) continue;
      entries.push({ date: dateCell, label: labelCell, source: null });
      continue;
    }

    // Bulleted / plain line.
    const stripped = trimmed.replace(/^[-*+]\s+/, "");
    const dateMatch = DATE_TOKEN_RE.exec(stripped);
    if (!dateMatch) continue;
    const date = dateMatch[0].trim();
    const after = stripped.slice(dateMatch[0].length);

    const split = splitAtSeparator(after);
    if (!split) continue; // no `:` or dash separator found -> not a recognisable entry
    const { qualifier, rest: afterSeparator } = split;
    let rest = afterSeparator;

    // Trailing source citation, in parentheses or after "Source:" -- unchanged extraction.
    let source = null;
    const parenSrcMatch = /\s*\(source:\s*([^)]+)\)\s*$/i.exec(rest);
    if (parenSrcMatch) {
      source = parenSrcMatch[1].trim();
      rest = rest.slice(0, parenSrcMatch.index).trim();
    } else {
      const trailingSrcMatch = /\s+(?:source|src)\s*[:\-]\s*(.+)$/i.exec(rest);
      if (trailingSrcMatch) {
        source = trailingSrcMatch[1].trim();
        rest = rest.slice(0, trailingSrcMatch.index).trim();
      }
    }

    const label = qualifier ? `${qualifier}: ${rest}` : rest;
    if (!label) continue;
    entries.push({ date, label, source });
  }

  return entries;
}
