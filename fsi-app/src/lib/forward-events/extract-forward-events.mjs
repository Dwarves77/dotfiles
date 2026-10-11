export const EXTRACTOR_VERSION = 'fe1-2026-09-13.1';

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

// A char that legitimately OPENS a new sentence/clause right after a genuine terminator or a paragraph/
// list boundary: an uppercase letter, a digit, or an opening quote/paren mark.
const SENTENCE_OPEN_RE = /[A-Z0-9"'“‘«(]/;

/** True when `text[i]` is a genuine sentence terminator: '.'/'!'/'?' (never a decimal point), followed by
 *  whitespace and then a char `SENTENCE_OPEN_RE` recognises as opening a new sentence. A bare '.'/';' with
 *  a lowercase continuation right after ("Corp. is...", a mid-list enumeration) is NOT one — this is the
 *  fix for the pre-fix bug that snapped the window's leading edge to any '.'/';' regardless of what
 *  followed it. */
function isGenuineTerminatorAt(text, i) {
  const ch = text[i];
  if (ch !== '.' && ch !== '!' && ch !== '?') return false;
  if (ch === '.' && /\d/.test(text[i - 1] || '') && /\d/.test(text[i + 1] || '')) return false; // decimal point
  let j = i + 1;
  if (!/\s/.test(text[j] || '')) return false;
  while (/\s/.test(text[j] || '')) j++;
  return SENTENCE_OPEN_RE.test(text[j] || '');
}

/** True when `text[i]` is the second '\n' of a "\n\n" paragraph break. */
function isParagraphBreakAt(text, i) {
  return text[i] === '\n' && text[i - 1] === '\n';
}

/** True when `text[i]` is a '\n' immediately followed by a list-item or heading marker
 *  ("-"/"*"/"#"/"1."). */
function isListOrHeadingBreakAt(text, i) {
  if (text[i] !== '\n') return false;
  return /^(?:[-*#]|\d+\.)\s/.test(text.slice(i + 1, i + 8));
}

// A record-facts.mjs "[slot_key] " marker (see this file's "RECORD-FACTS TEMPLATE UNWRAP" header note).
// Mirrors, never imports, scripts/mint/heal-provenance.mjs's `SLOT_MARKER_RE` (`/^\[([a-z0-9_]+)\]\s/i`) --
// src/lib/ must never import scripts/ (see this file's header above) -- narrowed to require the bracket
// content START with a letter, so a legal citation bracket like "[2019]" (digits only) or a footnote
// "[1]" is never mistaken for a slot marker; record-facts.mjs's own slot keys (item-type-required-slots.json)
// are always a lowercase word, optionally underscore-joined, never digit-led.
const SLOT_MARKER_AT_RE = /^\[[a-z][a-z0-9_]*\]\s+/i;
// The same pattern, unanchored, for finding the NEXT marker's start anywhere within a forward-searched
// substring (`.search()`/`.match()` need `^` absent to look past position 0).
const SLOT_MARKER_ANYWHERE_RE = /\[[a-z][a-z0-9_]*\]\s+/i;

/** True when a slot marker starts exactly at `text[i]`. Bounded slice for cheap repeated calls -- no real
 *  slot key or its trailing whitespace run is anywhere near 64 chars. */
function isSlotMarkerStartAt(text, i) {
  return SLOT_MARKER_AT_RE.test(text.slice(i, i + 64));
}

// Raised from the pre-fix 60 (lane FWD-TEXT-2, 2026-09-04) — see this file's own header for the
// measurement: a 30-row live-SQL sample of this corpus's own claim/section text found the real paragraph/
// label boundary sitting 40-110 bytes back from the trigger match in the common case; 300 gives that
// comfortable headroom while staying well short of an entire section, so a genuine run-on paragraph still
// cannot pull in unrelated prior obligation language.
const DEFAULT_MAX_BEFORE = 300;
const DEFAULT_MAX_AFTER = 160;

// Lane FWD-TEXT-4, 2026-09-04 — see this file's header, "RECORD-FACTS TEMPLATE UNWRAP, RESIDUE" for the
// measurement. A "[slot_key] " marker at or beyond `DEFAULT_MAX_BEFORE` (300) chars back from the date is
// invisible to `clauseStart`'s normal bounded scan below, so a record-facts quote long enough to push its
// own date past that bound (measured live: `[operative_provision]` -> "as from 2021" is 320 chars) fell
// through to the whitespace fallback and landed AFTER the marker, defeating `unwrapRecordFactsTemplate`
// (which requires the marker at the window's own position 0). A marker is a hand-written, narrowly-shaped
// token (`SLOT_MARKER_AT_RE`) — unlike a genuine sentence terminator, looking further back for one specifically
// carries no risk of sweeping in unrelated prior prose, so it gets its OWN, wider look-back: 3000 chars,
// comfortably above the largest live `record_facts` section measured (2478 chars, `intelligence_item_sections`
// where `section_key = 'record_facts'`, project kwrsbpiseruzbfwjpvsp, 2026-09-04) — i.e. wide enough to reach
// a record_facts section's very first marker from its very last character, so no record-facts date can ever
// again be farther from its own marker than this bound reaches.
const MAX_BEFORE_FOR_MARKER = 3000;

/**
 * Finds the leading edge of `clauseAround`'s display window: the nearest GENUINE sentence start at or
 * before `idx` (see `isGenuineTerminatorAt`), OR a markdown paragraph break, OR a list-item/heading line
 * start, OR a "[slot_key] " marker — bounded by `maxBefore` as the OUTER limit. ';' is never treated as a
 * sentence terminator here (that was the pre-fix bug: a clause separator is not a sentence end). When none
 * of those is found within `maxBefore`, a SEPARATE, wider look-back (`MAX_BEFORE_FOR_MARKER`, see its own
 * comment above) is tried for a marker alone — never for a sentence/paragraph/list boundary, which stay
 * bounded by `maxBefore` exactly as before, so a genuine run-on paragraph still cannot pull in unrelated
 * prior obligation language; only the marker's own narrow, unmistakable shape gets the wider reach. Only
 * after BOTH look-backs find nothing does this fall back to the nearest CLAUSE boundary (';', a strictly
 * weaker signal) still within `maxBefore`; when even that is absent, falls back to the nearest word boundary
 * — NEVER a raw byte offset that can land mid-word. Returns `{ pos, fragment }`: `fragment: true` whenever
 * the chosen start is NOT a genuine sentence/paragraph/list/marker boundary (either fallback), so the caller
 * can mark the result as an honest fragment instead of silently presenting a clause snippet as if it were a
 * complete sentence.
 */
function clauseStart(text, idx, maxBefore) {
  const hardFloor = idx - maxBefore; // may be negative -- NOT yet clamped
  const floor = Math.max(0, hardFloor);

  for (let i = idx - 1; i >= floor; i--) {
    if (isGenuineTerminatorAt(text, i)) {
      let j = i + 1;
      while (/\s/.test(text[j] || '')) j++;
      return { pos: j, fragment: false };
    }
    if (isParagraphBreakAt(text, i)) return { pos: i + 1, fragment: false };
    if (isListOrHeadingBreakAt(text, i)) return { pos: i + 1, fragment: false };
    // A record-facts "[slot_key] " marker (see this file's "RECORD-FACTS TEMPLATE UNWRAP" header note) is a
    // deliberate wrapper boundary -- INCLUDE it (pos: i, not i+1) so the window starts with the marker
    // itself, which `unwrapRecordFactsTemplate` needs to recognise the wrapper shape. Never a fallback:
    // `fragment: false`, same as a paragraph/list break.
    if (isSlotMarkerStartAt(text, i)) return { pos: i, fragment: false };
  }

  // hardFloor <= 0 means `floor` IS the true start of `text` — idx is within maxBefore chars of index 0,
  // so nothing was ever truncated and this is not a fragment (there is nothing before it to have cut off).
  if (hardFloor <= 0) return { pos: floor, fragment: false };

  // No sentence/paragraph/list/marker boundary within `maxBefore` — before falling back to a strictly
  // weaker clause/whitespace boundary, look further back (bounded by `MAX_BEFORE_FOR_MARKER`, never
  // unbounded) for a marker specifically (lane FWD-TEXT-4, see that constant's own comment). The normal
  // bounded loop above already proved no marker sits within `maxBefore`, so any marker found here is
  // strictly farther back than `floor` — scan from `floor - 1` down to the wider bound.
  const markerFloor = Math.max(0, idx - MAX_BEFORE_FOR_MARKER);
  for (let i = floor - 1; i >= markerFloor; i--) {
    if (isSlotMarkerStartAt(text, i)) return { pos: i, fragment: false };
  }

  // No sentence/paragraph/list/marker boundary in bounds — fall back to the nearest CLAUSE boundary (';').
  for (let i = idx - 1; i >= floor; i--) {
    if (text[i] === ';') return { pos: i + 1, fragment: true };
  }

  // Nothing at all — never start mid-word: advance to the nearest whitespace AT OR AFTER `floor`.
  for (let i = floor; i < idx; i++) {
    if (/\s/.test(text[i])) return { pos: i + 1, fragment: true };
  }
  // One unbroken token spans the whole bound (never observed in this corpus, but not impossible).
  return { pos: floor, fragment: true };
}

// ---------------------------------------------------------------------------
// Display-text cleanup (lane FWD-TEXT-2, 2026-09-04) — see this file's own header for the measurement
// that shaped every rule below.
// ---------------------------------------------------------------------------

const YEAR_TOKEN_RE = /\b(?:1[5-9]|2[0-4])\d{2}\b/;
const MONTH_TOKEN_RE = new RegExp(`\\b(?:${MONTH_EN_ALT}|${MONTH_PT_ALT})\\b`, 'i');
const ISO_TOKEN_RE = /\b\d{4}-\d{2}-\d{2}\b/;

function cellLooksDated(cell) {
  return YEAR_TOKEN_RE.test(cell) || MONTH_TOKEN_RE.test(cell) || ISO_TOKEN_RE.test(cell);
}

// A date-only cell this short is a genuine "Date" COLUMN in a multi-column table (Date | Description |
// Type | Source, the shape measured live in this corpus); at or above this length the date-bearing cell
// already IS the sentence (the "heading | MONITORING **FACT — deadline:** "quoted sentence"" shape, where
// the pipe separates a short heading fragment from the real claim text, not data columns).
const SHORT_DATE_CELL_MAX = 35;
// Below this length (or a bare URL), the chosen cell is not usable as display text on its own.
const MIN_USABLE_CELL_LEN = 12;

/**
 * Reduces a markdown-table-row-shaped text (any text carrying '|') to exactly ONE cell: the one that
 * actually carries the event's obligation prose. Prefers the cell containing `dateSpan` verbatim (the
 * real production path always has it — `clauseAround` threads the event's own matched date text through);
 * absent that (this function's own idempotence/property tests run it directly against opaque
 * already-windowed text with no source position to hand a `dateSpan` through), falls back to the first
 * cell this module's own date grammar recognises as date-shaped. See `SHORT_DATE_CELL_MAX`'s comment for
 * the short-column-vs-long-cell rule, and falls back to the single longest cell when no cell looks
 * date-shaped at all, or the chosen cell is a bare URL or under `MIN_USABLE_CELL_LEN` chars (one measured
 * corpus row — a citation-metadata table row — has no cell with real obligation prose in it either way;
 * the longest cell is the least-bad answer). Pure. Exported for testing.
 */
export function selectDateCell(text, dateSpan) {
  if (typeof text !== 'string' || !text.includes('|')) return text ?? '';
  const cells = text.split('|').map((c) => c.trim()).filter(Boolean);
  if (cells.length === 0) return '';
  if (cells.length === 1) return cells[0];

  let dateCellIdx = -1;
  if (typeof dateSpan === 'string' && dateSpan) {
    dateCellIdx = cells.findIndex((c) => c.includes(dateSpan));
  }
  if (dateCellIdx === -1) dateCellIdx = cells.findIndex(cellLooksDated);

  // Never picks a bare URL as "longest" -- a long URL is still not obligation prose. Falls back to
  // considering every cell only if literally every cell is a bare URL (degenerate, not observed live).
  const longest = () => {
    const nonUrl = cells.filter((c) => !/^https?:\/\//i.test(c));
    const pool = nonUrl.length ? nonUrl : cells;
    return pool.reduce((a, b) => (b.length > a.length ? b : a));
  };

  let chosen;
  if (dateCellIdx === -1) {
    chosen = longest();
  } else if (cells[dateCellIdx].length >= SHORT_DATE_CELL_MAX) {
    chosen = cells[dateCellIdx];
  } else if (dateCellIdx + 1 < cells.length) {
    chosen = cells[dateCellIdx + 1];
  } else {
    chosen = cells[dateCellIdx];
  }

  if (chosen.length < MIN_USABLE_CELL_LEN || /^https?:\/\//i.test(chosen)) {
    chosen = longest();
  }
  return chosen;
}

// Any bold "**label:**" span, wherever it appears (not only at the window's edge) — measured live across
// 18 distinct label texts (FACT, Deadline, Domestic harbour craft, Effective date, Detail, "FACT —
// deadline", "Primary headline compliance deadline — FACT", etc.): none of them is obligation content,
// all of them are record-facts.mjs/section-heading rendering artifacts.
const BOLD_LABEL_RE = /\*\*[^*\n]{1,90}:\*\*\s*/g;

// A bare (unbolded) FACT:/GAP:/MONITORING:/ANALYSIS: label unit, optionally preceded by a short
// dash-qualified descriptive prefix ("Primary headline compliance deadline — FACT:") and/or followed by a
// short dash-qualified suffix ("FACT — deadline:") — measured live (42 bare "FACT:", 2 "FACT — deadline:").
// Deliberately case-SENSITIVE on the label word itself (record-facts.mjs's template is always upper-case)
// so this never fires on ordinary lowercase English ("as a matter of fact: ...").
const LABEL_UNIT_RE = new RegExp(
  "(?:[A-Za-z][A-Za-z0-9 ,'()/]{0,60}[\\u2014\\u2013-]\\s*)?" +
    '\\b(?:FACT|GAP|MONITORING|ANALYSIS)\\b(?:\\s*[\\u2014\\u2013-]\\s*[a-z][a-z ]{0,24})?\\s*:\\s*',
  'g'
);

// A leading citation-key token ("32026D1440*"-shaped): starts with a digit, no whitespace, ends in a
// literal '*'. Only ever stripped at the true start of the text.
const LEADING_CITATION_KEY_RE = /^[0-9][A-Za-z0-9]{2,14}\*\s*/;
// A leading leaked source-URL tail token (a run of non-whitespace containing '/', e.g. "7/oj/eng ") —
// only ever stripped at the true start of the text.
const LEADING_URL_TAIL_RE = /^\S*\/\S*\s+/;
// Any bare http(s) URL, wherever it appears.
const BARE_URL_RE = /https?:\/\/\S*/gi;

/** One cleanup pass: table-cell selection, then every marker/label/citation/URL strip, then whitespace
 *  collapse. Called in a bounded fixed-point loop by `normalizeObligationText` (never a single fixed
 *  order applied once — see this file's header for the measured non-idempotence that was). The two
 *  LEADING_*_RE strips are skipped once the text already starts with the honest-fragment ellipsis "…" —
 *  otherwise a second, idempotent call would see e.g. "…Zero/Near-Zero Fuel..." (an ellipsis-prefixed
 *  heading that happens to contain a '/') and misread it as a leaked URL tail, eating real content a first
 *  call never touched (a real non-idempotence measured against retext32.json's own corpus while building
 *  this fix — id `1a193e59-…`). Pure. */
function stripOnePass(t, dateSpan) {
  let out = selectDateCell(t, dateSpan);
  out = out.replace(BOLD_LABEL_RE, '');
  out = out.replace(/\*\*/g, '');
  out = out.replace(/\*/g, '');
  out = out.replace(LABEL_UNIT_RE, '');
  if (!out.startsWith('…')) {
    out = out.replace(LEADING_CITATION_KEY_RE, '');
    out = out.replace(LEADING_URL_TAIL_RE, '');
  }
  out = out.replace(BARE_URL_RE, '');
  return out.replace(/\s+/g, ' ').trim();
}

// A trailing char this function accepts as a genuine sentence end: '.'/'!'/'?', a closing quote (the
// common "...shall comply."" shape), or the honest-fragment ellipsis itself (so a second, idempotent call
// recognises its own prior output as already-terminated).
const TRAILING_OK_RE = /[.!?"”»…]$/;

// A leading char a genuine sentence, or a deliberately quoted/parenthesised/numbered one, can start with.
// Letters cover both cases the two branches below split apart (uppercase = a real sentence start; lowercase
// = the honest-fragment case) — kept as one class here so "does this need ANY leading-edge fix at all" is
// one test.
const LEADING_OK_RE = /^[A-Za-z0-9"'“‘«(…]/;

/**
 * DISPLAY-ONLY normalization of a `clauseAround` window (or, via the corpus-wide property test, of any
 * already-windowed `obligation_text` with no known source position — see this file's header). `source_span`
 * — the actual matched date fragment — is never touched, stays byte-exact, and is checked by
 * `assertVerbatim` against the ORIGINAL, unmodified source string, never against this normalized text.
 * Runs `stripOnePass` to a bounded fixed point (idempotent by construction: a stable fixed point of a
 * cleanup pass that is a no-op on already-clean text is stable under re-application), then fixes both
 * edges, honestly rather than by invention:
 *   - Leading: text starting with markdown/punctuation debris that carries no sentence content of its own
 *     (a heading marker, an orphan closing bracket, a stray leading comma/period/colon/dash — measured
 *     live on retext32.json's own `before` corpus, 44/654 cases) has that debris run stripped, then gets an
 *     ellipsis PREFIX; text starting with a lowercase letter — the one honest signal available with no
 *     source position, since a genuine sentence never opens lowercase — gets the same ellipsis PREFIX with
 *     nothing stripped. Neither branch capitalises or invents anything.
 *   - Trailing: text not ending in `TRAILING_OK_RE` gets any trailing ';'/','/':' stripped and an ellipsis
 *     SUFFIX.
 * Both markers are idempotent: text already starting with "…" already satisfies `LEADING_OK_RE` (so neither
 * leading branch fires again), and text already ending in "…" already satisfies `TRAILING_OK_RE`.
 * `opts.dateSpan` — the event's own matched date text — lets `selectDateCell` pick the exact right table
 * cell when known (the real `clauseAround` path always supplies it); absent it, cell selection falls back
 * to this module's own date grammar. Pure. Exported for testing.
 */
export function normalizeObligationText(raw, opts = {}) {
  let t = typeof raw === 'string' ? raw : '';
  if (!t) return '';
  const dateSpan = typeof opts?.dateSpan === 'string' ? opts.dateSpan : undefined;

  for (let i = 0; i < 6; i++) {
    const before = t;
    t = stripOnePass(t, dateSpan);
    if (t === before) break;
  }
  if (!t) return '…'; // fully-emptied by stripping (e.g. the window was nothing but a URL) -- an honest
  // placeholder beats an empty obligation_text (every caller requires length > 0).

  if (!LEADING_OK_RE.test(t)) {
    t = t.replace(/^[^A-Za-z0-9"'“‘«(…]+/, '');
    t = t ? '…' + t : '…';
  } else if (/^[a-z]/.test(t)) {
    t = '…' + t;
  }

  if (!TRAILING_OK_RE.test(t)) {
    t = t.replace(/[;,:]+$/, '').trim();
    t = t + '…';
  }

  return t;
}

// ---------------------------------------------------------------------------
// RECORD-FACTS TEMPLATE UNWRAP (lane FWD-TEXT-3, 2026-09-04) — see this file's header for the measurement.
// ---------------------------------------------------------------------------

// The three FACT-shaped record-facts.mjs wrappers (generic slot / due_date / binding_position — see
// record-facts.mjs lines ~457/622/540) and the GAP wrapper shared by every slot (lines ~466-469/634-637/
// 550-553; binding_position's own GAP text differs only in its middle clause, matched by the shared tail
// sentence below). Matched only against the START of an already marker-bounded window (`clauseStart` above
// lands exactly on a "[slot_key] " marker when one exists) — never against arbitrary text.
const RECORD_FACTS_GENERIC_RE = /^\[[a-z][a-z0-9_]*\]\s+The captured source states, verbatim: /i;
const RECORD_FACTS_DUE_DATE_RE =
  /^\[due_date\]\s+The captured source states a due date(?:\s*\(date_precision:\s*(?:day|month|quarter|year)\))?,\s*verbatim: /i;
const RECORD_FACTS_BINDING_POSITION_RE =
  /^\[binding_position\]\s+The captured source's own applicability language places this item at /i;
// A GAP claim's text NEVER carries a «…» quote or a date (see this file's header) — matched here purely so
// a window that somehow opens on one is skipped (rule 3) rather than emitted or misread as a FACT wrapper.
const RECORD_FACTS_GAP_RE =
  /^\[[a-z][a-z0-9_]*\]\s+(?:No verbatim [\s\S]*?\.|[\s\S]*?applicability language[\s\S]*?\.)\s*A full-brief regrounding will re-examine this gap when this item upgrades from record to brief\.?/i;

/**
 * Finds every «…» pair in `text` via a stack, so a NESTED pair (the source's own text already used
 * guillemets) is found alongside the wrapper's own outer pair — rule: "if the passage itself carries a
 * nested «…» keep the innermost that contains the event's date". `start`/`end` are the indices of the
 * opening/closing guillemet characters themselves (content is `text.slice(start+1, end)`). An unmatched
 * '«' with no closing '»' is dropped — never a fabricated close. Pure.
 */
function findGuillemetPairs(text) {
  const stack = [];
  const pairs = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '«') stack.push(i);
    else if (text[i] === '»' && stack.length) pairs.push({ start: stack.pop(), end: i });
  }
  return pairs;
}

// A LEGACY delimiter: record-facts.mjs used straight double quotes for its span delimiter before switching
// to guillemets (this file's copy of that module's own header: the switch was made because a span that
// itself opens with a curly quote defeats a straight-quote delimiter under the validator's unicode-
// integrity scan) — [CONFIRMED, live SQL this lane, 2026-09-04] 26 of 1333 live `record_facts` sections
// still carry that pre-migration straight-quote rendering (content is immutable once captured; the switch
// was forward-only, never a backfill). Same shape as `findGuillemetPairs` (never nested — straight quotes
// give no way to tell an outer pair from an inner one, and this corpus's legacy rows never needed one).
const STRAIGHT_QUOTE_PAIR_RE = /"([^"]*)"/g;
function findStraightQuotePairs(text) {
  const pairs = [];
  let m;
  STRAIGHT_QUOTE_PAIR_RE.lastIndex = 0;
  while ((m = STRAIGHT_QUOTE_PAIR_RE.exec(text)) !== null) {
    pairs.push({ start: m.index, end: m.index + m[0].length - 1 });
  }
  return pairs;
}

/**
 * When `windowed` (an already marker/clause-bounded window from `clauseStart`/`clauseAround`) opens with a
 * record-facts.mjs FACT wrapper, returns `{ passage }`: the text inside the «…» that actually CONTAINS
 * `[relDateStart, relDateEnd)` (window-relative offsets of the event's own matched date) — the INNERMOST
 * such pair when nested, ordinarily the wrapper's only date-bearing quote (for binding_position, always the
 * "from the passage" quote — the leading «code» quote never contains a date, so it is never chosen by this
 * containment check). Returns `{ skip: reason }` when `windowed` opens with a GAP wrapper instead (rule 3 —
 * a GAP sentence is never an obligation_text or a source window on its own) or when a FACT wrapper's own
 * date is not inside any «…» pair (defensive; should not occur — the date this module matched came from
 * somewhere inside `windowed`, and every FACT template's date-bearing content is inside its own quote).
 * Returns `null` when `windowed` does not open with a recognised record-facts marker/wrapper at all — the
 * caller falls back to ordinary (non-template) window handling, unchanged. Pure. Exported for testing.
 */
export function unwrapRecordFactsTemplate(windowed, relDateStart, relDateEnd) {
  const t = typeof windowed === 'string' ? windowed : '';
  if (!SLOT_MARKER_AT_RE.test(t)) return null;
  if (RECORD_FACTS_GAP_RE.test(t)) {
    return { skip: 'record_facts_gap_boilerplate_no_quoted_date' };
  }
  const isFactShape =
    RECORD_FACTS_GENERIC_RE.test(t) || RECORD_FACTS_DUE_DATE_RE.test(t) || RECORD_FACTS_BINDING_POSITION_RE.test(t);
  if (!isFactShape) return null;

  // Guillemets are the current delimiter (record-facts.mjs's own header); the legacy straight-quote
  // delimiter (see findStraightQuotePairs' own doc) is tried only when no guillemet pair exists at all.
  const guillemetPairs = findGuillemetPairs(t);
  const pairs = guillemetPairs.length ? guillemetPairs : findStraightQuotePairs(t);
  let best = null;
  for (const p of pairs) {
    if (p.start < relDateStart && relDateEnd <= p.end) {
      if (!best || p.end - p.start < best.end - best.start) best = p;
    }
  }
  if (!best) return { skip: 'record_facts_template_date_not_in_quote' };
  return { passage: t.slice(best.start + 1, best.end) };
}

/**
 * @returns {{text: string} | {skip: string}} `text` is the ready-to-store obligation_text (already run
 *   through `normalizeObligationText`); `skip` is a reason this date should never become an event (rule 3 —
 *   a record-facts GAP wrapper carries no genuine obligation). Every call site in `scanText` below routes a
 *   `skip` result to `skipped`, never `hits`.
 */
function clauseAround(text, start, end, maxBefore = DEFAULT_MAX_BEFORE, maxAfter = DEFAULT_MAX_AFTER, dateSpan) {
  const { pos: from, fragment } = clauseStart(text, start, maxBefore);
  // Stop the trailing window at the next SENTENCE terminator ('.'/'!'/'?' — ';' is a clause separator, not
  // a sentence end, and is never accepted here) OR a closing record-facts guillemet '»' (TRAILING_OK_RE
  // already treats one as a valid sentence end; the search now stops there too, INCLUDING it, so a
  // template's own closing quote is reliably captured) — OR right before the START of the NEXT "[slot_key]"
  // marker, EXCLUDING it, so a window can never run past it (lane FWD-TEXT-3, rule 1) — whichever comes
  // first, or maxAfter, so obligation_text reads as one sentence.
  let to = Math.min(text.length, end + maxAfter);
  const tail = text.slice(end, to);
  const termMatch = tail.match(/[.!?»](?!\d)/);
  const termIdx = termMatch ? termMatch.index + 1 : Infinity;
  const markerMatch = tail.match(SLOT_MARKER_ANYWHERE_RE);
  const markerIdx = markerMatch ? markerMatch.index : Infinity;
  const cut = Math.min(termIdx, markerIdx);
  if (cut !== Infinity) to = end + cut;

  // Offsets below are relative to this RAW (not yet whitespace-collapsed) slice, so they stay valid against
  // `dateSpan`'s own length — collapsing whitespace first would shift them out from under the date position.
  const raw = text.slice(from, to);
  const relDateEnd = end - from;
  const relDateStart = relDateEnd - (typeof dateSpan === 'string' ? dateSpan.length : 0);
  const unwrap = unwrapRecordFactsTemplate(raw, relDateStart, relDateEnd);
  if (unwrap?.skip) return { skip: unwrap.skip };
  if (unwrap?.passage) {
    const passage = unwrap.passage.replace(/\s+/g, ' ').trim();
    return { text: normalizeObligationText(passage, { dateSpan }) };
  }

  let windowed = raw.replace(/\s+/g, ' ').trim();
  // The leading edge was NOT a genuine sentence/paragraph/list/marker start (`clauseStart`'s fallback) —
  // mark the window as an honest fragment rather than silently presenting a clause snippet as a full
  // sentence. Capitalises nothing, invents nothing.
  if (fragment && windowed) windowed = '…' + windowed;
  return { text: normalizeObligationText(windowed, { dateSpan }) };
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
    // "The Regulation enters into force on <date>." / "This Directive enter[s] into force on <date>." --
    // present-tense commencement (D10, lane L6, 2026-09-13); the negative lookbehind excludes "shall enter
    // into force on" so this never overlaps 'shall-enter-into-force-on' below (both would otherwise match
    // the same "enter into force on" substring; the modal form keeps its own named rule).
    name: 'enters-into-force-on',
    kind: 'entry_into_force',
    scanRe: /\b(?<!shall\s)enters?\s+into\s+force\s+on\s+/gi,
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
// Reference-date and status-only refusals (lane L6, D10, 2026-09-13 -- see this file's header note
// "REFERENCE-DATE AND STATUS-ONLY REFUSALS" for the full defect and fix rationale)
// ---------------------------------------------------------------------------

// The instrument's OWN commencement language -- the fixed, small verb list this lane's own dispatch names
// (docs/plans/defect-fix-plan-2026-09-12.md D10 / brief-l6.md): "enters into force", "enter into force",
// "entry into force", "comes into force", "come into force", "in force from", "applies from", "apply
// from", "commences", "takes effect", "effective from". A hit on a reference date is refused UNLESS its
// clause contains one of these -- never a pattern added beyond this list without its own test.
const COMMENCEMENT_CLAUSE_RE =
  /\b(?:enters?\s+into\s+force|entry\s+into\s+force|comes?\s+into\s+force|in\s+force\s+from|applies\s+from|apply\s+from|commences|takes\s+effect|effective\s+from)\b/i;

// A status/snapshot phrase with nothing else in the clause once the date span itself is removed -- "In
// force as of <date>.", "Last updated as of <date>", "Valid since <date>" -- never a bound obligation
// regardless of any deontic clause sitting elsewhere in the look-ahead window.
const STATUS_ONLY_RE = /^\s*(in force|current|updated|last updated|valid|accessed|retrieved)\s+(as of|since)\s*[.!?]?\s*$/i;

const REFERENCE_DATE_SKIP_REASON =
  "date equals a reference date (the run date or the brief's own document date) with no instrument-commencement language in its clause -- refused as a fabricated event, never a real obligation";

const STATUS_ONLY_SKIP_REASON =
  "'as of'/'since' clause is only a status/snapshot phrase once its own date span is removed (e.g. \"in force as of\", \"updated as of\") -- never a bound obligation, regardless of any deontic clause nearby";

/** True when `iso` is one of the supplied `referenceDates` AND `clauseText` names no commencement verb --
 *  the reference-date refusal (D10 fix part 1). `referenceDates` defaults to empty (opt-in; existing
 *  callers that never pass it see no behavior change). */
function refuseForReferenceDate(iso, clauseText, referenceDates) {
  if (!Array.isArray(referenceDates) || referenceDates.length === 0) return false;
  if (!referenceDates.includes(iso)) return false;
  return !COMMENCEMENT_CLAUSE_RE.test(typeof clauseText === 'string' ? clauseText : '');
}

/** True when `clauseText`, with its own `dateSpan` removed, is nothing but a status phrase -- the
 *  status-only refusal (D10 fix part 2), CANDIDATE_ONLY_RULES hits only. */
function isStatusOnlyClause(clauseText, dateSpan) {
  const text = typeof clauseText === 'string' ? clauseText : '';
  const stripped = typeof dateSpan === 'string' && dateSpan ? text.replace(dateSpan, '') : text;
  return STATUS_ONLY_RE.test(stripped);
}

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
 * `options.referenceDates` (array of ISO dates, optional, default none) feeds the reference-date refusal
 * (D10, lane L6, 2026-09-13 -- see this file's header note): a hit whose date equals one of these is
 * refused unless its clause names the instrument's own commencement. Omitting it (every pre-existing
 * caller) is a no-op -- no behavior change.
 * Returns { hits: [{ruleName, kind, dateIso, precision, spanStart, spanEnd,
 *   obligationText, extraEvents}], skips: [{reason, spanStart, spanEnd, text}] }
 */
function scanText(text, options = {}) {
  const referenceDates = Array.isArray(options.referenceDates) ? options.referenceDates : [];
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
      const around = clauseAround(text, m.index, spanEnd, undefined, undefined, dateSpan);
      claimedRanges.push([m.index, spanEnd]);

      if (around.skip) {
        skips.push({ reason: around.skip, span: dateSpan });
      } else if (refuseForReferenceDate(parsed.iso, around.text, referenceDates)) {
        skips.push({ reason: REFERENCE_DATE_SKIP_REASON, span: dateSpan });
      } else {
        hits.push({
          ruleName: rule.name,
          kind,
          iso: parsed.iso,
          precision: parsed.precision,
          spanStart,
          spanEnd,
          dateSpan,
          obligationText: around.text,
        });
      }

      // "shall apply from X to Y" — also emit the window-end date as 'other'.
      if (rule.windowEnd) {
        const w = findTrailingToDate(text, spanEnd);
        if (w && !overlaps(spanEnd, w.matchStart + w.parsed.length)) {
          const wSpanStart = w.matchStart;
          const wSpanEnd = w.matchStart + w.parsed.length;
          const wDateSpan = text.slice(wSpanStart, wSpanEnd);
          const wAround = clauseAround(text, m.index, wSpanEnd, undefined, undefined, wDateSpan);
          claimedRanges.push([spanEnd, wSpanEnd]);
          if (wAround.skip) {
            skips.push({ reason: wAround.skip, span: wDateSpan });
          } else if (refuseForReferenceDate(w.parsed.iso, wAround.text, referenceDates)) {
            skips.push({ reason: REFERENCE_DATE_SKIP_REASON, span: wDateSpan });
          } else {
            hits.push({
              ruleName: rule.name + '-window-end',
              kind: 'other',
              iso: w.parsed.iso,
              precision: w.parsed.precision,
              spanStart: wSpanStart,
              spanEnd: wSpanEnd,
              dateSpan: wDateSpan,
              obligationText: wAround.text,
            });
          }
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

      const candidateDateSpan = text.slice(spanStart, spanEnd);
      const around = clauseAround(text, m.index, spanEnd, undefined, undefined, candidateDateSpan);
      claimedRanges.push([m.index, spanEnd]);
      if (around.skip) {
        skips.push({ reason: around.skip, span: candidateDateSpan });
      } else if (refuseForReferenceDate(parsed.iso, around.text, referenceDates)) {
        // D10 fix part 1: e.g. "In force as of <today>." where <today> is the run date -- refused
        // regardless of the deontic clause the check above already found nearby, because this clause
        // itself names no commencement.
        skips.push({ reason: REFERENCE_DATE_SKIP_REASON, span: candidateDateSpan });
      } else if (isStatusOnlyClause(around.text, candidateDateSpan)) {
        // D10 fix part 2: a bare status/snapshot phrase once its own date is removed -- refused regardless
        // of the date and regardless of the nearby deontic clause.
        skips.push({ reason: STATUS_ONLY_SKIP_REASON, span: candidateDateSpan });
      } else {
        hits.push({
          ruleName: rule.name,
          kind: 'other',
          iso: parsed.iso,
          precision: parsed.precision,
          spanStart,
          spanEnd,
          dateSpan: candidateDateSpan,
          obligationText: around.text,
        });
      }
    }
  }

  return { hits, skips };
}

// ---------------------------------------------------------------------------
// Record-grade due_date slot claims (see this file's header note)
// ---------------------------------------------------------------------------

// The exact template prefix extractDueDateFact()'s FACT branch writes
// (src/lib/intake/record-facts.mjs) — verbatim in claim_text once a claim
// round-trips through section_claim_provenance (no slot_key column exists
// there to check instead; see the header note above).
const DUE_DATE_SLOT_PREFIX = '[due_date] ';

// The same function's optional "(date_precision: X)" marker, present only
// when record-facts.mjs's own inferDatePrecision() resolved one.
const SLOT_PRECISION_RE = /\(date_precision:\s*(day|month|quarter|year)\)/;

// 'quarter' is deliberately absent: this module's own date grammar
// (DATE_TRY_ORDER) never resolves a quarter-precision ISO date (no month/day
// digit it can honestly attach to one), so a slot-supplied 'quarter' is
// informative for the unclassified-skip path but is never chosen by
// finerDuePrecision below — doing so would misrepresent the emitted
// event_date's real precision, the same "never invent" discipline this
// module already applies to event_kind.
const PRECISION_RANK = Object.freeze({ year: 1, month: 2, day: 3 });

/**
 * True when `claim` is a record-grade due_date slot FACT claim (identified by
 * its claim_text's own template prefix — see DUE_DATE_SLOT_PREFIX above).
 * Pure. Exported for testing.
 */
export function isDueDateSlotClaim(claim) {
  return claim?.kind === 'FACT' && typeof claim.text === 'string' && claim.text.startsWith(DUE_DATE_SLOT_PREFIX);
}

/**
 * The precision record-facts.mjs's own classifier resolved for a due_date
 * slot claim's span, read back from claim_text's "(date_precision: X)"
 * marker — or null when that claim carries no marker (record-facts.mjs found
 * a due-date-shaped span but could not classify its precision, e.g. "within
 * 15 days of ..."). Pure. Exported for testing.
 */
export function slotDatePrecision(claim) {
  if (!isDueDateSlotClaim(claim)) return null;
  const m = SLOT_PRECISION_RE.exec(claim.text);
  return m ? m[1] : null;
}

/**
 * The finer of two precisions this module's own {day,month,year} vocabulary
 * can represent (day finest). `slotPrecision` outside that vocabulary (null,
 * or 'quarter' — see PRECISION_RANK's comment) leaves `extractorPrecision`
 * unchanged. Pure. Exported for testing.
 */
export function finerDuePrecision(extractorPrecision, slotPrecision) {
  if (!Object.hasOwn(PRECISION_RANK, slotPrecision)) return extractorPrecision;
  if (!Object.hasOwn(PRECISION_RANK, extractorPrecision)) return extractorPrecision;
  return PRECISION_RANK[slotPrecision] > PRECISION_RANK[extractorPrecision] ? slotPrecision : extractorPrecision;
}

// ---------------------------------------------------------------------------
// Due-date slot context rescue (lane FE-SLOT-2, 2026-09-04 — see this file's own header,
// "DUE-DATE SLOT CONTEXT RESCUE", for the full measurement and rationale).
// ---------------------------------------------------------------------------

/**
 * Re-run this module's OWN `scanText` — never a second deontic-window implementation — over a due_date
 * slot claim's captured-source CONTEXT (`context.before + claimSpan + context.after`) instead of the bare
 * slot span alone, so a deontic/aim verb the record-facts.mjs capture window cut off can still be found.
 * `context` is whatever the reader (`src/lib/forward-events/read-and-extract.mjs`) attached to
 * `claim.context` — `{before, after}` (both strings) sliced from the SAME `agent_run_searches` capture the
 * claim's own span was verbatim-located in. A returned hit's own matched date substring is ALWAYS inside
 * the original slot span's own character range within the wider text — a hit produced by a date found only
 * in `before`/`after` (never inside the span itself) is rejected: this function can only ever confirm
 * deontic/aim language around the date record-facts.mjs already verbatim-located, never substitute a
 * different date the slot extractor never chose. Returns the matching `hits[]` entry (same shape `scanText`
 * already produces — `kind`/`iso`/`precision`/`dateSpan`/`obligationText`, computed BY the wider scan, so
 * `event_kind` is never assumed from the slot) or `null` when `context` is absent/malformed, or when the
 * wider text still shows no deontic/aim near the date (a genuine, informed refusal). Pure — no I/O, this
 * module still never fetches anything itself. Exported for testing.
 */
export function rescueSlotDateWithContext(claimSpan, context, referenceDates) {
  if (typeof claimSpan !== 'string' || !claimSpan) return null;
  if (!context || typeof context.before !== 'string' || typeof context.after !== 'string') return null;
  const contextText = context.before + claimSpan + context.after;
  const spanRangeStart = context.before.length;
  const spanRangeEnd = spanRangeStart + claimSpan.length;
  const { hits } = scanText(contextText, { referenceDates });
  return hits.find((h) => h.spanStart >= spanRangeStart && h.spanEnd <= spanRangeEnd) ?? null;
}

// ---------------------------------------------------------------------------
// Within-extraction dedupe (see this file's header, "WITHIN-EXTRACTION DEDUPE")
// ---------------------------------------------------------------------------

const UNICODE_SUBSCRIPT_DIGITS = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };

// Comparison-only normalization (never used for the stored/displayed obligation_text): lowercases, folds
// unicode subscript digits to ASCII (a claim's plain-text span renders "M 1"; the same sentence quoted
// back into rendered section markdown renders "M₁" — real difference observed in this corpus, 2026-09-04),
// collapses a lone letter immediately followed by whitespace-then-digit into one token ("m 1" -> "m1", the
// claim-side rendering of the same subscript) so the two renderings of one legal sentence compare equal,
// strips a leading/trailing quote mark (a section's rendered `**FACT:** "..."` block wraps the SAME
// sentence a claim's own span carries unquoted — the quote is a rendering artifact of the markdown, not
// part of the sentence, and left in place it would defeat the prefix comparison below on every real pair),
// and finally collapses whitespace. Built on top of the SAME `normalizeObligationText` the display path
// already uses, so a markdown label/pipe/URL-tail difference between a claim's and a section's rendering
// of the same sentence is never itself a reason the two fail to match.
function compareNormalize(text) {
  let t = normalizeObligationText(text).toLowerCase();
  t = t.replace(/[₀-₉]/g, (d) => UNICODE_SUBSCRIPT_DIGITS[d] ?? d);
  t = t.replace(/(?<![a-z0-9])([a-z])\s+(\d)/g, '$1$2');
  t = t.replace(/^["'“”‘’]+/, '').replace(/["'“”‘’]+$/, '');
  return t.replace(/\s+/g, ' ').trim();
}

// Below this many characters, a shared prefix/substring is too short to be confident it names the same
// underlying sentence rather than a coincidental shared opening phrase — never collapse on a short match.
const DEDUPE_MIN_COMPARE_LEN = 40;

/**
 * True when `aText` and `bText` are, after comparison-only normalization, evidently the SAME underlying
 * sentence — either a long shared leading prefix (the common case: a claim's span and a section's rendered
 * quote of that same span diverge only in trailing content — an ellipsis-abbreviated tail, a length cutoff)
 * or one fully contained in the other. Deliberately NOT "share (event_date, event_kind)" alone — see this
 * file's header for the measured NZIA counter-example a blind date+kind collapse would have wrongly
 * destroyed. Pure. Exported for testing.
 */
export function sameObligationContent(aText, bText) {
  const a = compareNormalize(aText);
  const b = compareNormalize(bText);
  if (!a || !b) return false;
  // Exact match, any length -- see this file's "SHORT-TEXT EXACT-DUPLICATE FIX" header note. The length
  // floor below exists to stop a coincidental SHORT SHARED PREFIX between two different sentences from
  // being mistaken for a duplicate; a full-string exact match carries no such coincidence risk, at any
  // length, so it short-circuits before that floor is ever applied.
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length < DEDUPE_MIN_COMPARE_LEN) return false;
  let i = 0;
  while (i < shorter.length && i < longer.length && shorter[i] === longer[i]) i++;
  if (i >= DEDUPE_MIN_COMPARE_LEN) return true;
  return longer.includes(shorter);
}

/**
 * Within-extraction dedupe over one item's full combined event list (claims + sections together — this
 * runs ONCE at the end of `extractForwardEvents`, never per-blob, because the two hits of one duplicate
 * pair come from DIFFERENT source blobs). Groups by (event_date, event_kind); within a group, any two
 * hits `sameObligationContent` treats as the same sentence are collapsed to one — a claim-backed
 * (`confidence:'high'`) hit is kept over a section-backed one; between two hits of the same confidence,
 * the one encountered earlier (claims are scanned before sections, and within each, in scan order) is
 * kept. Every drop is recorded in `dropped`, never silent. Pure. Exported for testing.
 * @returns {{events: Array<object>, dropped: Array<object>}}
 */
export function dedupeEvents(events) {
  const keep = new Array(events.length).fill(true);
  const dropped = [];

  const groups = new Map();
  events.forEach((ev, idx) => {
    const key = `${ev.event_date}|${ev.event_kind}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(idx);
  });

  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    for (let a = 0; a < idxs.length; a++) {
      const i = idxs[a];
      if (!keep[i]) continue;
      for (let b = a + 1; b < idxs.length; b++) {
        const j = idxs[b];
        if (!keep[j]) continue;
        if (!sameObligationContent(events[i].obligation_text, events[j].obligation_text)) continue;

        const iHigh = events[i].confidence === 'high';
        const jHigh = events[j].confidence === 'high';
        const dropIdx = iHigh && !jHigh ? j : jHigh && !iHigh ? i : j; // same tier -> keep the earlier (i)
        const keptIdx = dropIdx === j ? i : j;
        keep[dropIdx] = false;
        dropped.push({
          event_date: events[dropIdx].event_date,
          event_kind: events[dropIdx].event_kind,
          source_kind: events[dropIdx].source_kind,
          source_claim_id: events[dropIdx].source_claim_id,
          source_section_id: events[dropIdx].source_section_id,
          confidence: events[dropIdx].confidence,
          obligation_text: events[dropIdx].obligation_text,
          kept_source_kind: events[keptIdx].source_kind,
          kept_source_claim_id: events[keptIdx].source_claim_id,
          kept_source_section_id: events[keptIdx].source_section_id,
          kept_confidence: events[keptIdx].confidence,
          reason: iHigh !== jHigh ? 'claim_backed_preferred_over_section_backed' : 'duplicate_same_confidence_kept_first',
        });
        if (dropIdx === i) break; // i is gone -- stop comparing it against the rest of this group
      }
    }
  }

  return { events: events.filter((_, idx) => keep[idx]), dropped };
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
 * @returns {{events: Array<object>, skipped: Array<object>, counts: {dedupe_dropped: number,
 *           dedupe_dropped_detail: Array<object>}}}
 */
export function extractForwardEvents(input) {
  const claims = Array.isArray(input?.claims) ? input.claims : [];
  const sections = Array.isArray(input?.sections) ? input.sections : [];
  // D10, lane L6, 2026-09-13: the run date and the brief's own document date, supplied by
  // read-and-extract.mjs -- see this file's header note "REFERENCE-DATE AND STATUS-ONLY REFUSALS". Omitted
  // (or not an array) is a no-op: the reference-date refusal never fires with an empty list.
  const referenceDates = Array.isArray(input?.referenceDates) ? input.referenceDates : [];

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
    const { hits, skips } = scanText(text, { referenceDates });
    const isDueDateSlot = isDueDateSlotClaim(claim);

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
      const datePrecision = isDueDateSlot ? finerDuePrecision(h.precision, slotDatePrecision(claim)) : h.precision;
      events.push({
        event_date: h.iso,
        date_precision: datePrecision,
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

    // The record-grade mint already grounded a confirmed due-date-shaped span here
    // (src/lib/intake/record-facts.mjs, MINT-RUNBOOK.md §13) but this module's own kind
    // classifier could not turn it into a typed event from the span alone -- never invent a kind (this
    // file's header). Lane FE-SLOT-2 (2026-09-04, see this file's own "DUE-DATE SLOT CONTEXT RESCUE"
    // header note): before giving up, try the claim's own captured-source CONTEXT (before/after the span
    // in the same capture) for the deontic/aim language the slot's ~90-char window cut off; three
    // distinguishable, named outcomes, IN ADDITION to any generic skip reason `scanText` already logged
    // above for this same span (never a replacement for it).
    if (isDueDateSlot && hits.length === 0) {
      if (skips.length === 0) {
        // scanText found no parseable calendar-date trigger in the span at all -- a relative/recurring
        // deadline (or a bare year with no rule primed to consume it) this module's grammar honestly
        // cannot anchor to a calendar date. Context is never even consulted: there is no located date to
        // rescue, only a duration or an unanchored year.
        skipped.push({
          source_kind: 'claim',
          source_claim_id: claim.claim_id,
          source_section_id: null,
          reason: 'relative_deadline_no_calendar_date',
          text,
        });
      } else if (!claim.context) {
        // A calendar date WAS located and parsed, but the reader could not find any capture containing
        // this claim's span verbatim (a stale span after a re-capture, or no usable pool row at all) -- no
        // context exists to check for deontic/aim language, so this is an honest "cannot tell", never a
        // fabricated refusal.
        skipped.push({
          source_kind: 'claim',
          source_claim_id: claim.claim_id,
          source_section_id: null,
          reason: 'calendar_date_deontic_context_unavailable',
          text,
        });
      } else {
        const rescued = rescueSlotDateWithContext(claim.span, claim.context, referenceDates);
        if (rescued) {
          const contextText = claim.context.before + claim.span + claim.context.after;
          assertVerbatim(contextText, rescued.dateSpan);
          const datePrecision = finerDuePrecision(rescued.precision, slotDatePrecision(claim));
          events.push({
            event_date: rescued.iso,
            date_precision: datePrecision,
            event_kind: rescued.kind,
            obligation_text: rescued.obligationText,
            source_kind: 'claim',
            source_claim_id: claim.claim_id,
            source_section_id: null,
            source_span: rescued.dateSpan,
            confidence: 'high',
            extractor_version: EXTRACTOR_VERSION,
          });
        } else {
          // Real document prose either side of the date, checked, genuinely carries no deontic/aim
          // language nearby either -- an informed refusal, not a guess.
          skipped.push({
            source_kind: 'claim',
            source_claim_id: claim.claim_id,
            source_section_id: null,
            reason: 'calendar_date_no_deontic_in_context',
            text,
          });
        }
      }
    }
  }

  for (const section of sections) {
    const text = typeof section.md === 'string' ? section.md : '';
    if (!text) continue;
    const { hits, skips } = scanText(text, { referenceDates });

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

  // Within-extraction dedupe over the FULL combined list (claim-origin + section-origin together) — see
  // this file's header, "WITHIN-EXTRACTION DEDUPE", for why this must run here (once, on the combined
  // set) rather than in each caller: both apply-staged-update.ts and run-extraction.mjs call this function
  // once per item with the item's full claims+sections, so wiring the rule in here is the one place it
  // reaches every caller without any of them changing.
  const { events: dedupedEvents, dropped } = dedupeEvents(events);

  return {
    events: dedupedEvents,
    skipped,
    counts: { dedupe_dropped: dropped.length, dedupe_dropped_detail: dropped },
  };
}

export default extractForwardEvents;
