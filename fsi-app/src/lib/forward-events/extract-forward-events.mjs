// src/lib/forward-events/extract-forward-events.mjs
//
// FORWARD-EVENT EXTRACTOR (FE-1)
// ==============================
// Pure, deterministic, $0, no-LLM module. Lifts dated forward events that are
// ALREADY WRITTEN DOWN in grounded brief content (source-cited FACT/GAP claims
// and rendered section markdown) into structured records a query can reach.
//
// MOVED HERE (lane FIX, 2026-09-01) from scripts/forward-events/extract-forward-events.mjs, where FE-1
// originally built it as a standalone CLI-adjacent module. Contract rule 16 (system-prompt.ts, "the
// forward-participation clause") requires the intake mint chokepoint — a RUNTIME module in src/lib/intake
// — to call this extractor on every mint. No runtime src/ file imports from scripts/ anywhere in this
// repo (scripts/ is CLI/batch tooling; the established direction is the reverse — scripts/*.mjs already
// import from src/lib/, e.g. analyze-corpus.mjs importing src/lib/connections/cluster.mjs), so the pure
// library half of this module lives here as the one source of truth; scripts/forward-events/
// run-extraction.mjs (the CLI runner) imports it from this path. Content and behavior are unchanged by
// the move — EXTRACTOR_VERSION does not bump for a relocation with no semantic edit.
//
// This module NEVER invents a date. It only locates dates that are already
// present in the input text and binds them to an event only when the
// surrounding language ties the date to an obligation, effect, deadline,
// review, phase-in, or consultation window.
//
// INCLUSION RULE (read this before changing any pattern below):
//   A date becomes an event ONLY when it is captured by an explicit
//   "obligation-binding trigger" — a fixed phrase (e.g. "entered into force
//   on", "no later than", "by <date>, ... shall", "a partir de", "consultation
//   ending on") that ties the date to a legal/operational consequence. A bare
//   date with no such trigger is never promoted to an event:
//     - "Directive 2005/35/EC" / "Regulation (EU) 2023/1805" — a document
//       number, not a date. The year-only rules below explicitly refuse to
//       match a 4-digit year immediately followed by "/".
//     - "as amended in 2019" — historical revision-history narration, not an
//       obligation. Not matched by any trigger; historical dates ARE kept
//       (see entry_into_force below) but only when the trigger says the
//       *instrument itself* took effect/was adopted, not "the text was
//       amended in passing".
//     - "In 2024, the Port saw ..." / "dropped 20% in 2024" — narrative
//       scene-setting. No trigger matches a bare "in <year>" with no
//       deontic verb, so nothing is extracted.
//     - "as of <date>", "since <date>" used as a data-snapshot or
//       status-narration marker (e.g. "not available from primary sources as
//       of 2025-06-05", "as of April 2025, 384 stations...") are recognised
//       as CANDIDATES (the trigger word is obligation-adjacent) but are
//       routed to `skipped` unless a deontic clause ("shall", "must", "is
//       required to") follows within the same clause.
//   Historical dates ARE legitimately extractable when the trigger says so:
//   "MARPOL Annex VI entered into force on 1 November 2022" is a real
//   entry_into_force event even though 2022 is in the past relative to most
//   generation dates in this corpus. Forward-vs-past is NOT the filter;
//   obligation-binding language is the filter.
//
// CONFIDENCE:
//   'high'   — date came from a FACT/GAP claim's `span` (already source-
//              grounded with a verbatim quote).
//   'medium' — date came from a section's rendered markdown.
//   Nothing else is ever emitted.
//
// VERBATIM SPAN:
//   `source_span` is always a substring taken by index from the exact input
//   string (claim.span or section.md) — never reconstructed or normalised —
//   so it is a verbatim substring by construction. `assertVerbatim` below
//   re-checks this before every event is emitted; a violation throws, it is
//   never silently dropped.
//
// EXTRACTOR_VERSION bump this whenever a rule changes semantics (not for
// comment-only edits), so downstream consumers can tell events apart.
export const EXTRACTOR_VERSION = 'fe1-2026-09-01.1';

// ---------------------------------------------------------------------------
// Date grammar
// ---------------------------------------------------------------------------

const MONTHS_EN = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const MONTHS_PT = {
  janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

// Non-breaking-space family that shows up literally (both the raw
// codepoint and the un-decoded HTML entity strings) inside this corpus's
// source blocks. All date fragments below tolerate any of these as the
// separator between date components, since a regex over the *original*
// string is how we keep source_span verbatim.
const SEP = '(?:[ \\t]|&nbsp;|&#160;|\\u00a0)+';
const SEP_OPT = '(?:[ \\t]|&nbsp;|&#160;|\\u00a0)*';

const MONTH_EN_ALT = Object.keys(MONTHS_EN)
  .map((m) => m[0].toUpperCase() + m.slice(1))
  .join('|');
const MONTH_PT_ALT = 'janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';

// Full day-month-year, English: "1 January 2026", "31 December 2027",
// "6 April 2026" (weekday prefixes like "Monday, " are simply not part of
// the match and are left alone).
const FULL_EN = `(\\d{1,2})(?:st|nd|rd|th)?${SEP_OPT}(${MONTH_EN_ALT})${SEP}(\\d{4})`;

// Month + year only, English: "May 2026", "December 2025".
const MONTH_YEAR_EN = `(${MONTH_EN_ALT})${SEP}(\\d{4})`;

// Full day-month-year, Portuguese legal style: "1º de janeiro de 2027",
// "31 de dezembro de 2031".
const FULL_PT = `(\\d{1,2})[ºo°]?${SEP_OPT}de${SEP}(${MONTH_PT_ALT})${SEP}de${SEP}(\\d{4})`;

// ISO: "2026-01-01".
const ISO = `(\\d{4})-(\\d{2})-(\\d{2})`;

function isValidCalendarDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Parse one already-matched date fragment into {iso, precision} or null. */
function parseDateFragment(kind, groups) {
  if (kind === 'full-en') {
    const [dayStr, monthName, yearStr] = groups;
    const day = parseInt(dayStr, 10);
    const year = parseInt(yearStr, 10);
    const month = MONTHS_EN[monthName.toLowerCase()];
    if (!month || !isValidCalendarDate(year, month, day)) return null;
    return { iso: `${year}-${pad2(month)}-${pad2(day)}`, precision: 'day' };
  }
  if (kind === 'full-pt') {
    const [dayStr, monthName, yearStr] = groups;
    const day = parseInt(dayStr, 10);
    const year = parseInt(yearStr, 10);
    const month = MONTHS_PT[monthName.toLowerCase().replace('ç', 'ç')];
    if (!month || !isValidCalendarDate(year, month, day)) return null;
    return { iso: `${year}-${pad2(month)}-${pad2(day)}`, precision: 'day' };
  }
  if (kind === 'month-year') {
    const [monthName, yearStr] = groups;
    const year = parseInt(yearStr, 10);
    const month = MONTHS_EN[monthName.toLowerCase()];
    if (!month || year < 1000 || year > 9999) return null;
    return { iso: `${year}-${pad2(month)}-01`, precision: 'month' };
  }
  if (kind === 'iso') {
    const [yearStr, monthStr, dayStr] = groups;
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    if (!isValidCalendarDate(year, month, day)) return null;
    return { iso: `${year}-${pad2(month)}-${pad2(day)}`, precision: 'day' };
  }
  if (kind === 'year') {
    const year = parseInt(groups[0], 10);
    if (year < 1000 || year > 9999) return null;
    return { iso: `${year}-01-01`, precision: 'year' };
  }
  return null;
}

// One combined date-fragment matcher tried in priority order (most specific
// first) at a given text position. Returns {precision, iso, length} or null.
// `text` is the full source string; `pos` is where to start trying.
const DATE_TRY_ORDER = [
  { kind: 'iso', re: new RegExp(`^${ISO}`) },
  { kind: 'full-en', re: new RegExp(`^${FULL_EN}`) },
  { kind: 'full-pt', re: new RegExp(`^${FULL_PT}`, 'i') },
  { kind: 'month-year', re: new RegExp(`^${MONTH_YEAR_EN}`) },
];

// A weekday name (optionally comma-and-space terminated) is allowed to sit
// between a trigger phrase and the date itself — e.g. "deadline ... is
// Monday, 6 April 2026" — and is skipped rather than absorbed into
// source_span, so the emitted span stays exactly the date text.
const WEEKDAY_PREFIX = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+/i;

function tryParseDateAt(text, pos) {
  let skip = 0;
  const weekdayMatch = text.slice(pos).match(WEEKDAY_PREFIX);
  if (weekdayMatch) skip = weekdayMatch[0].length;

  const slice = text.slice(pos + skip);
  for (const { kind, re } of DATE_TRY_ORDER) {
    const m = slice.match(re);
    if (m) {
      const parsed = parseDateFragment(kind, m.slice(1));
      if (parsed) return { ...parsed, length: m[0].length, matchText: m[0], skip };
    }
  }
  return null;
}

// Some triggers ("by ", "from ", "as of ", "since ") also accept a bare year
// directly ("by 2030"), which tryParseDateAt alone does not find (it only
// matches full/month-year/ISO/PT fragments). Try the richer forms FIRST (so
// "by 1 July 2026" and "by September 2030" are captured with their real
// precision), then fall back to a bare year — but only when it is not
// immediately followed by "/", which is how a document-number citation like
// "2023/1805" would otherwise be mistaken for a year.
function tryParseDateOrBareYearAt(text, pos) {
  const rich = tryParseDateAt(text, pos);
  if (rich) return rich;
  const ym = text.slice(pos).match(/^((?:1[5-9]|2[0-4])\d{2})\b/);
  if (!ym) return null;
  if (text[pos + ym[0].length] === '/') return null;
  const parsedYear = parseDateFragment('year', [ym[1]]);
  if (!parsedYear) return null;
  return { ...parsedYear, length: ym[0].length, matchText: ym[0], skip: 0 };
}

// ---------------------------------------------------------------------------
// Verbatim-span guard
// ---------------------------------------------------------------------------

function assertVerbatim(sourceText, span) {
  if (typeof span !== 'string' || span.length === 0) {
    throw new Error('forward-events: empty source_span');
  }
  if (!sourceText.includes(span)) {
    throw new Error(
      `forward-events: source_span is not a verbatim substring of its source text: ${JSON.stringify(span)}`
    );
  }
}

function clauseAround(text, start, end, maxBefore = 60, maxAfter = 160) {
  const from = Math.max(0, start - maxBefore);
  // stop the trailing window at the next sentence terminator, or maxAfter,
  // whichever comes first, so obligation_text reads as one clause/sentence.
  let to = Math.min(text.length, end + maxAfter);
  const tail = text.slice(end, to);
  const stop = tail.search(/[.;](?!\d)/);
  if (stop !== -1) to = end + stop + 1;
  return text.slice(from, to).replace(/\s+/g, ' ').trim();
}

// Finds the start of the sentence/clause containing `idx` (the char right
// after the nearest preceding '.'/';' that is not a decimal point, or the
// start of the text), capped at `maxBack` so one giant run-on paragraph
// can't pull in unrelated obligation language from far away. Used to keep
// "is there a deontic/aim verb near this date" checks scoped to the
// sentence actually containing the date, not the whole blob.
function sentenceStart(text, idx, maxBack = 200) {
  const floor = Math.max(0, idx - maxBack);
  for (let i = idx - 1; i >= floor; i--) {
    const ch = text[i];
    if ((ch === '.' || ch === ';') && !(/\d/.test(text[i - 1] || '') && /\d/.test(text[i + 1] || ''))) {
      return i + 1;
    }
  }
  return floor;
}

// ---------------------------------------------------------------------------
// Trigger rules
// ---------------------------------------------------------------------------
// Each rule is a regex whose match ends exactly where a date fragment should
// begin (the regex itself does NOT consume the date — tryParseDateAt is run
// right after the match). This keeps the date grammar in one place instead
// of duplicated inside every trigger pattern.
//
// `kind` is the default event_kind; `phaseOverride: true` means: after
// parsing the date, look at the text immediately following it — if it reads
// "for <segment>" (a tiered/phased qualifier such as "for C1 class tyres" or
// "for new types of vehicles"), reclassify the event as phase_step.

const DEONTIC =
  /\b(shall|must|is required to|are required to|is obligated to|are obligated to|is due|are due|should be (?:submitted|completed|updated|filed|reported|adopted))\b/i;
const AIM_WORDS = /\b(aim|aims|aiming|target|targets|targeting|committed|commit|commits|striving|strive|goal|plan to|planning to|ambition)\b/i;

const RULES = [
  // --- entry_into_force -----------------------------------------------
  {
    name: 'entered-into-force-on',
    kind: 'entry_into_force',
    re: /\b(?:has\s+)?entered\s+into\s+force\s+on\s*$/i,
    scanRe: /\bentered\s+into\s+force\s+on\s+/gi,
  },
  {
    name: 'shall-enter-into-force-on',
    kind: 'entry_into_force',
    scanRe: /\bshall\s+enter\s+into\s+force\s+on\s+/gi,
  },
  {
    name: 'applicable-since',
    kind: 'entry_into_force',
    scanRe: /\bapplicable\s+since\s+/gi,
  },
  {
    name: 'shall-apply-from',
    kind: 'entry_into_force',
    phaseOverride: true,
    windowEnd: true, // "shall apply from X to Y" -> second date is a window end -> other
    scanRe: /\b(?:it\s+)?shall\s+apply\s+from\s+/gi,
  },

  // --- review_or_report ---------------------------------------------------
  // Tried BEFORE the generic "By <date>, ..." deadline rule below, so that a
  // "By <date>, the Commission shall submit ... a report" clause is
  // classified as review_or_report rather than the generic compliance
  // fallback (first-registered rule wins ties in scanText's overlap dedupe).
  {
    name: 'review-shall-be-completed-by',
    kind: 'review_or_report',
    scanRe: /\breview\s+shall\s+be\s+completed\s+by\s+/gi,
  },
  {
    name: 'by-report-clause',
    // "By 31 December 2027, the Commission shall submit ... a report on ..."
    kind: 'review_or_report',
    scanRe: /\bBy\s+/g,
    requireTrailing: /^\s*,/,
    requireWordWithin: { re: /\b(report|review|assess)\b/i, chars: 160 },
  },

  // --- compliance_deadline ----------------------------------------------
  {
    name: 'no-later-than',
    kind: 'compliance_deadline',
    phaseOverride: true,
    scanRe: /\bno\s+later\s+than\s+/gi,
  },
  {
    name: 'by-comma-deadline',
    // "By 1 September 2030, Member States shall ..." — a generic fallback,
    // tried AFTER by-report-clause above so a report/review clause is not
    // miscategorised as a plain deadline.
    kind: 'compliance_deadline',
    phaseOverride: true,
    scanRe: /\bBy\s+/g,
    requireTrailing: /^\s*,/, // must be followed by ", " to count as a deadline clause
  },
  {
    name: 'deadline-is',
    kind: 'compliance_deadline',
    scanRe: /\bdeadline\s+for\s+[a-z ]{0,40}\bis\s+/gi,
  },
  {
    name: 'the-deadline-is',
    kind: 'compliance_deadline',
    scanRe: /\bthe\s+new\s+deadline\s+(?:for\s+[a-z ]{0,40}\s+)?is\s+/gi,
  },
  {
    name: 'with-effect-from-shall',
    // "With effect from 1 April 2032, national ... shall ..." — obligation
    // commencing on a date. Repeals ("repealed with effect from") are a
    // separate, lower-priority rule below and only fire when this one's
    // deontic-clause check fails.
    kind: 'compliance_deadline',
    phaseOverride: true,
    scanRe: /\bwith\s+effect\s+from\s+/gi,
    requireDeonticWithin: 200,
  },

  // --- consultation_close --------------------------------------------------
  {
    name: 'consultation-ending-on',
    kind: 'consultation_close',
    scanRe: /\b(?:public\s+)?consultation[^.;]{0,40}?\bending\s+on\s+/gi,
  },
  {
    name: 'consultation-closes',
    kind: 'consultation_close',
    scanRe: /\b(?:public\s+)?consultation[^.;]{0,40}?\bclos(?:ing|es|ed)\s+(?:on\s+)?/gi,
  },
  {
    name: 'comments-due-by',
    kind: 'consultation_close',
    scanRe: /\bcomments?\s+(?:are\s+)?due\s+(?:by\s+)?/gi,
  },

  // --- other: repeal / window end -----------------------------------------
  {
    name: 'repealed-with-effect-from',
    kind: 'other',
    scanRe: /\brepealed\s+with\s+effect\s+from\s+/gi,
  },

  // --- Portuguese phased schedule ------------------------------------------
  {
    name: 'a-partir-de',
    kind: 'phase_step',
    scanRe: /\ba\s+partir\s+de\s+/gi,
  },
  {
    name: 'ate-date',
    kind: 'phase_step',
    scanRe: /\bat[ée]\s+/gi,
  },

  // --- bare-year triggers (require deontic or aim language nearby) --------
  {
    name: 'by-year-target',
    kind: 'compliance_deadline', // reclassified below by the deontic/aim check
    bareYear: true,
    phaseOverride: true,
    scanRe: /\bby\s+/gi,
  },
  {
    name: 'from-year',
    // Default kind is entry_into_force ("from <date>, the Regulation
    // applies") but is reclassified to compliance_deadline below whenever a
    // deontic clause addresses a specific party ("from <date>, suppliers are
    // required to ..."), for consistency with 'with-effect-from-shall' and
    // 'by-year-target'.
    kind: 'entry_into_force',
    bareYear: true,
    phaseOverride: true,
    windowEnd: true, // "running from <date> to <date>" -> also emit the window-end date as 'other'
    scanRe: /\bfrom\s+/gi,
    requireDeonticOrAimWithin: 220,
  },
];

// "as of <date>" / "since <date>" are candidates ONLY — never auto-promoted
// — because in this corpus they overwhelmingly mark a data snapshot
// ("not available ... as of 2025-06-05") or narrative status ("as of April
// 2025, 384 stations ...") rather than a bound obligation. They are promoted
// to an event only when a deontic clause follows closely; otherwise they are
// recorded in `skipped`.
const CANDIDATE_ONLY_RULES = [
  { name: 'as-of', scanRe: /\bas\s+of\s+/gi, kind: 'other' },
  { name: 'since', scanRe: /\bsince\s+/gi, kind: 'other' },
];

// ---------------------------------------------------------------------------
// Core scan over one text blob
// ---------------------------------------------------------------------------

function findTrailingForClause(text, pos) {
  const tail = text.slice(pos, pos + 60);
  return /^\s*,?\s*for\s+[a-z]/i.test(tail);
}

// "During the transitional period from <date> until <date>, obligations
// shall be limited to ..." — a tiered/staged rollout in substance even
// though it does not use the "for <segment>" phrasing findTrailingForClause
// looks for. Scoped to a tight window around the match so it does not bleed
// into an unrelated "period" mentioned elsewhere in a long section.
const PERIOD_RE = /\b(transitional|transition|phase-?in|grace)\s+period\b/i;
function nearPeriodLanguage(text, start, end) {
  return PERIOD_RE.test(text.slice(Math.max(0, start - 60), end + 20));
}

function findTrailingToDate(text, pos) {
  const m = text.slice(pos, pos + 8).match(/^\s*(?:to|until)\s+/i);
  if (!m) return null;
  const parsed = tryParseDateAt(text, pos + m[0].length);
  if (!parsed) return null;
  return { parsed, matchStart: pos + m[0].length };
}

/**
 * Scan one text blob for candidate (rule, date) hits.
 * Returns { hits: [{ruleName, kind, dateIso, precision, spanStart, spanEnd,
 *   obligationText, extraEvents}], skips: [{reason, spanStart, spanEnd, text}] }
 */
function scanText(text) {
  const hits = [];
  const skips = [];
  const claimedRanges = []; // [start, end) already turned into a hit, to dedupe overlapping rules

  const overlaps = (start, end) =>
    claimedRanges.some((r) => start < r[1] && end > r[0]);

  for (const rule of RULES) {
    let m;
    rule.scanRe.lastIndex = 0;
    while ((m = rule.scanRe.exec(text)) !== null) {
      const afterTrigger = m.index + m[0].length;

      let parsed;
      let dateStart = afterTrigger;

      if (rule.bareYear) {
        parsed = tryParseDateOrBareYearAt(text, afterTrigger);
        if (!parsed) continue;
      } else {
        parsed = tryParseDateAt(text, afterTrigger);
        if (!parsed) continue;
      }

      const spanStart = dateStart + (parsed.skip || 0);
      const spanEnd = spanStart + parsed.length;

      if (rule.requireTrailing && !rule.requireTrailing.test(text.slice(spanEnd))) {
        continue;
      }
      if (rule.requireWordWithin) {
        const window = text.slice(m.index, spanEnd + rule.requireWordWithin.chars);
        if (!rule.requireWordWithin.re.test(window)) continue;
      }
      // Deontic ("shall"/"must") or aim ("committed"/"target") language can
      // sit either side of the trigger phrase in real sentences — "X shall
      // ... by 2030" as much as "by 2030, X shall ..." — so these checks
      // look both backward from the trigger and forward from the date.
      if (rule.requireDeonticWithin) {
        const window = text.slice(sentenceStart(text, m.index), spanEnd + rule.requireDeonticWithin);
        if (!DEONTIC.test(window)) continue;
      }
      if (rule.requireDeonticOrAimWithin) {
        const window = text.slice(sentenceStart(text, m.index), spanEnd + rule.requireDeonticOrAimWithin);
        if (!DEONTIC.test(window) && !AIM_WORDS.test(window)) continue;
      }

      if (overlaps(m.index, spanEnd)) continue;

      let kind = rule.kind;

      if (rule.name === 'by-year-target' || rule.name === 'from-year') {
        const window = text.slice(sentenceStart(text, m.index), spanEnd + 220);
        if (DEONTIC.test(window)) {
          // A deontic clause addressing a specific party ("suppliers are
          // required to ...") is a compliance obligation regardless of
          // whether the trigger word was "by" or "from".
          kind = 'compliance_deadline';
        } else if (rule.name === 'by-year-target' && AIM_WORDS.test(window)) {
          kind = 'other';
        } else if (rule.name === 'from-year' && AIM_WORDS.test(window)) {
          kind = 'other';
        } else {
          skips.push({
            reason:
              `date after '${rule.name === 'from-year' ? 'from' : 'by'}' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation`,
            span: text.slice(Math.max(0, m.index - 20), spanEnd + 40).trim(),
          });
          continue;
        }
      }

      if (rule.phaseOverride && (findTrailingForClause(text, spanEnd) || nearPeriodLanguage(text, m.index, spanEnd))) {
        kind = 'phase_step';
      }

      const dateSpan = text.slice(spanStart, spanEnd);
      const obligationText = clauseAround(text, m.index, spanEnd);

      hits.push({
        ruleName: rule.name,
        kind,
        iso: parsed.iso,
        precision: parsed.precision,
        spanStart,
        spanEnd,
        dateSpan,
        obligationText,
      });
      claimedRanges.push([m.index, spanEnd]);

      // "shall apply from X to Y" — also emit the window-end date as 'other'.
      if (rule.windowEnd) {
        const w = findTrailingToDate(text, spanEnd);
        if (w && !overlaps(spanEnd, w.matchStart + w.parsed.length)) {
          const wSpanStart = w.matchStart;
          const wSpanEnd = w.matchStart + w.parsed.length;
          hits.push({
            ruleName: rule.name + '-window-end',
            kind: 'other',
            iso: w.parsed.iso,
            precision: w.parsed.precision,
            spanStart: wSpanStart,
            spanEnd: wSpanEnd,
            dateSpan: text.slice(wSpanStart, wSpanEnd),
            obligationText: clauseAround(text, m.index, wSpanEnd),
          });
          claimedRanges.push([spanEnd, wSpanEnd]);
        }
      }
    }
  }

  // Candidate-only rules ("as of" / "since") — record as skip unless a
  // deontic clause follows closely (in which case, promote conservatively
  // as 'other', since these do not map cleanly to the fixed kind vocabulary
  // without a more specific trigger).
  for (const rule of CANDIDATE_ONLY_RULES) {
    let m;
    rule.scanRe.lastIndex = 0;
    while ((m = rule.scanRe.exec(text)) !== null) {
      const afterTrigger = m.index + m[0].length;
      const parsed = tryParseDateOrBareYearAt(text, afterTrigger);
      if (!parsed) continue;
      const spanStart = afterTrigger + (parsed.skip || 0);
      const spanEnd = spanStart + parsed.length;
      if (overlaps(m.index, spanEnd)) continue;

      const beforeWindow = text.slice(Math.max(0, m.index - 60), m.index);
      const isDataUnavailability = /not\s+available/i.test(beforeWindow);
      const afterWindow = text.slice(spanEnd, spanEnd + 200);
      const hasDeontic = DEONTIC.test(afterWindow);

      if (isDataUnavailability) {
        skips.push({
          reason: "'as of'/'since' marks a data-unavailability note on a GAP claim, not an event",
          span: text.slice(Math.max(0, m.index - 20), spanEnd + 20).trim(),
        });
        claimedRanges.push([m.index, spanEnd]);
        continue;
      }
      if (!hasDeontic) {
        skips.push({
          reason: `'${rule.name}' marks a status/snapshot date, not a bound obligation (no deontic clause follows)`,
          span: text.slice(Math.max(0, m.index - 20), spanEnd + 20).trim(),
        });
        claimedRanges.push([m.index, spanEnd]);
        continue;
      }

      const obligationText = clauseAround(text, m.index, spanEnd);
      hits.push({
        ruleName: rule.name,
        kind: 'other',
        iso: parsed.iso,
        precision: parsed.precision,
        spanStart,
        spanEnd,
        dateSpan: text.slice(spanStart, spanEnd),
        obligationText,
      });
      claimedRanges.push([m.index, spanEnd]);
    }
  }

  return { hits, skips };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract forward events from one item's already-grounded claims and
 * sections. Pure function: no I/O, no DB, no network, no fs.
 *
 * @param {{claims: Array<{claim_id:string, kind:'FACT'|'GAP', text:string, span:string|null}>,
 *           sections: Array<{section_id:string, key:string, md:string}>}} input
 * @returns {{events: Array<object>, skipped: Array<object>}}
 */
export function extractForwardEvents(input) {
  const claims = Array.isArray(input?.claims) ? input.claims : [];
  const sections = Array.isArray(input?.sections) ? input.sections : [];

  const events = [];
  const skipped = [];

  for (const claim of claims) {
    if (claim.kind !== 'FACT' && claim.kind !== 'GAP') continue;
    // Only claim.span is source-grounded (a verbatim quote); a claim with no
    // span has nothing to anchor a verbatim source_span to, so it is skipped
    // wholesale rather than falling back to the (ungrounded) summary text.
    if (typeof claim.span !== 'string' || claim.span.length === 0) {
      continue;
    }
    const text = claim.span;
    const { hits, skips } = scanText(text);

    for (const s of skips) {
      skipped.push({
        source_kind: 'claim',
        source_claim_id: claim.claim_id,
        source_section_id: null,
        reason: s.reason,
        text: s.span,
      });
    }

    for (const h of hits) {
      assertVerbatim(text, h.dateSpan);
      events.push({
        event_date: h.iso,
        date_precision: h.precision,
        event_kind: h.kind,
        obligation_text: h.obligationText,
        source_kind: 'claim',
        source_claim_id: claim.claim_id,
        source_section_id: null,
        source_span: h.dateSpan,
        confidence: 'high',
        extractor_version: EXTRACTOR_VERSION,
      });
    }
  }

  for (const section of sections) {
    const text = typeof section.md === 'string' ? section.md : '';
    if (!text) continue;
    const { hits, skips } = scanText(text);

    for (const s of skips) {
      skipped.push({
        source_kind: 'section',
        source_claim_id: null,
        source_section_id: section.section_id,
        reason: s.reason,
        text: s.span,
      });
    }

    for (const h of hits) {
      assertVerbatim(text, h.dateSpan);
      events.push({
        event_date: h.iso,
        date_precision: h.precision,
        event_kind: h.kind,
        obligation_text: h.obligationText,
        source_kind: 'section',
        source_claim_id: null,
        source_section_id: section.section_id,
        source_span: h.dateSpan,
        confidence: 'medium',
        extractor_version: EXTRACTOR_VERSION,
      });
    }
  }

  return { events, skipped };
}

export default extractForwardEvents;
