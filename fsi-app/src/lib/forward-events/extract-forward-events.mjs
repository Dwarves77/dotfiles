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
// RECORD-GRADE due_date SLOT CLAIMS (lane FE-SLOT, 2026-09-03):
//   The record-grade mint (src/lib/intake/record-facts.mjs, MINT-RUNBOOK.md
//   §13) locates one verbatim due-date-shaped span per item and grounds it as
//   a FACT claim whose `claim_text` carries a fixed `[due_date] ` prefix and,
//   when a precision was inferred, a `(date_precision: day|month|quarter|
//   year)` marker — see extractDueDateFact()'s templates. That claim reaches
//   this extractor through the SAME per-claim loop as every other FACT/GAP
//   claim (section_claim_provenance has no `slot_key` column — confirmed
//   2026-09-03 against migration 112 and every later migration; the `[due_date]`
//   prefix embedded in claim_text, verbatim in the DB, is the only surviving
//   marker, the same convention migrations 114/119/121 already rely on via
//   `claim_text ILIKE '%slot_key%'`). This module deliberately does NOT treat
//   a due_date slot claim as automatically a `compliance_deadline` — spec 01
//   §3.3's "four dates, never one" is exactly why record-facts.mjs's own
//   header says the mint "locates A date, not which of the four it is." A
//   due_date claim earns an event ONLY when this module's OWN RULES/kind
//   classifier, run over that same span exactly like any other claim, finds
//   an obligation-binding trigger — never a kind assumed from the slot alone.
//   Two narrow, additive behaviours on top of that unchanged classification:
//     1. When a due_date claim DOES produce a hit, and record-facts.mjs's own
//        (separately computed) `date_precision` for the identical span is
//        FINER than what this module's own date grammar resolved, the finer
//        label is used — see finerDuePrecision(). Bounded to this module's
//        own {day,month,year} vocabulary (never 'quarter': this grammar has
//        no month/day to honestly attach to a quarter-precision date, so a
//        slot-supplied 'quarter' is never promoted onto an emitted event).
//     2. When a due_date claim produces NO hit at all (no rule's trigger
//        phrase matches its span, or a matched date fails the deontic/aim
//        check), a `slot_date_unclassified` skip is recorded IN ADDITION to
//        whatever generic skip reason (if any) the standard scan already
//        produced — surfacing, in metrics.by_skip_reason, how many of the
//        mint's own confirmed due dates this extractor still cannot type.
//
// GARBLED-OBLIGATION-TEXT FIX (lane FWD-TEXT, 2026-09-04):
//   [CONFIRMED, live customer surface https://carosledge.com/regulations "Upcoming obligations" strip,
//   2026-09-04 ~08:15 UTC] eight rendered events included: NZIA 25 Sep 2026 starting mid-word
//   ("re|venues generated from fines. By 25 September 2026..."); Euro 7 29 Nov 2026 (phase_step) reading
//   "7/oj/eng **Primary headline compliance deadline — FACT:** \"It shall apply from 29 November 2026...\"" —
//   a leaked source-URL tail plus a markdown bold label; Euro 7 29 Nov 2026 (compliance_deadline) reading
//   "hicles (M₂, M₃, N₂, N₃) | MONITORING **FACT — deadline:** \"By 29 November 2026...\"" — mid-word
//   ("Ve|hicles"), a markdown table pipe/cell, and a label; and Euro 7 carrying the SAME 29 Nov 2026 date
//   five/six times, at least two pairs being the identical underlying sentence once via a claim (clean)
//   and once via the section's rendered markdown (garbled, because record-facts.mjs's grounded claims are
//   quoted verbatim back into section content_md as `**FACT:** "..."` blocks — see mint-forward-participation
//   and record-facts.mjs's own header).
//   [CONFIRMED, live SQL read this lane] the NZIA "re|venues" case is NOT this module's own windowing bug —
//   `section_claim_provenance.source_span` for that claim (id 9e819545…) already starts "venues generated
//   from fines. By 25 September 2026...": the truncation happened UPSTREAM, in whatever grounding pass
//   produced that claim's span (`claim_text` carries a `[gate-a-backfill]` marker — a backfill script
//   outside this lane's write set, not `extract-forward-events.mjs`). This module's own `clauseAround` was
//   simply reproducing claim.span faithfully from index 0 (nowhere earlier to snap to). The Euro 7
//   "Ve|hicles" case IS this module's own bug: `clauseAround`'s old `from = max(0, start - maxBefore)` was a
//   FIXED byte offset into a much longer section `content_md`, landing mid-word with no clause-boundary
//   awareness at all — `sentenceStart` (below) already existed and was already used by the deontic-window
//   checks (search `requireDeonticWithin`/`requireDeonticOrAimWithin`) but `clauseAround` never called it.
//   THE FIX, in `clauseAround` below: the leading edge now snaps to the nearest sentence/clause boundary
//   (reusing the exact same terminator rule `sentenceStart` already uses), bounded by `maxBefore` as the
//   OUTER limit (never earlier); when no terminator is found within that bound, the edge backs up to the
//   nearest word boundary instead of the raw byte offset, so a window NEVER starts mid-word. Separately,
//   `normalizeObligationText` strips the markdown-rendering artifacts a clause boundary alone cannot remove
//   (a `**label:**` bold span, a leading table-pipe cell, a leaked source-URL tail token) from the DISPLAY
//   text only — `source_span` (the actual matched date fragment) is untouched, stays byte-exact, and
//   `assertVerbatim` still checks it against the ORIGINAL unmodified source text, never the normalized
//   obligation_text. Fixtures for both real cases live in this module's own test file, built from the
//   verbatim rows read live 2026-09-04 (see that file's header for the exact SQL).
//
// WITHIN-EXTRACTION DEDUPE (same lane, same date): Euro 7 alone carries five/six item_forward_events rows
// for 2026-11-29 today, at least two of them the identical sentence rendered twice (once via a claim,
// clean; once via the section's rendered markdown, garbled — see above). [CONFIRMED, live SQL corpus-wide
// measurement this lane, 2026-09-04] a *blind* `(event_date, event_kind)` collapse-to-one-claim rule would
// be WRONG in general: the SAME item (EU Net-Zero Industry Act) also carries a `(2030-01-01, other)` group
// with FOUR distinct section-sourced obligations (a 30 GW PV-manufacturing target, a 50 Mt/year CO2
// injection-capacity target, a storage-capacity-calibration clause, and a logistics-cargo-category note)
// alongside one unrelated claim sharing that same (date, kind) key — collapsing that group down to the one
// claim would silently delete four genuinely distinct obligations, exactly the "content loss, not a
// deduplication" migration 275's own header already warns against for too-coarse a key. `dedupeEvents`
// below therefore requires BOTH a shared (event_date, event_kind) AND a long shared normalized-text
// prefix/substring (comparison-only normalization: markdown-stripped, lowercased, unicode subscript digits
// folded to ASCII, a lone letter-space-digit token like "M 2" folded to "M2" to bridge claim-text vs
// rendered-markdown spacing differences) before two hits are ever treated as the same obligation — this is
// a strictly NARROWER signal than the literal "share (event_date, event_kind)" reading, chosen because the
// wider reading is measured, on this corpus's own data, to destroy real content. When a match IS found,
// claim-backed (`confidence:'high'`) wins over section-backed; among two hits of the same confidence, the
// one encountered first is kept. Every drop is recorded, never silent — see `counts.dedupe_dropped` /
// `counts.dedupe_dropped_detail` on this function's return.
//
// EXTRACTOR_VERSION bump this whenever a rule changes semantics (not for
// comment-only edits), so downstream consumers can tell events apart.
export const EXTRACTOR_VERSION = 'fe1-2026-09-04.1';

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

// Finds the leading edge of the window for `clauseAround`: the nearest sentence/clause boundary at or
// before `idx`, bounded by `maxBefore` as the OUTER limit (never earlier than idx - maxBefore). Same
// terminator rule as `sentenceStart` below (deliberately not a call to it — that function's own `maxBack`
// default of 200 is tuned for the deontic-window checks, not the display window here, and duplicating the
// ~6-line loop keeps each caller's bound explicit rather than threading a second parameter through). When
// no terminator is found in bounds, backs up to the nearest WORD boundary instead of the raw byte offset —
// this is the actual fix for the "Ve|hicles" / "re|venues" mid-word-start defect (lane FWD-TEXT,
// 2026-09-04 — see this file's header): a fixed byte offset has no idea where a word starts, a whitespace
// scan does.
function clauseStart(text, idx, maxBefore) {
  const hardFloor = idx - maxBefore; // may be negative -- NOT yet clamped
  const floor = Math.max(0, hardFloor);
  for (let i = idx - 1; i >= floor; i--) {
    const ch = text[i];
    if ((ch === '.' || ch === ';') && !(/\d/.test(text[i - 1] || '') && /\d/.test(text[i + 1] || ''))) {
      return i + 1;
    }
  }
  // hardFloor <= 0 means `floor` IS the true start of `text` — idx is within maxBefore chars of index 0,
  // so nothing was ever truncated and index 0 can never be "mid-word" (there is nothing before it). The
  // whitespace fallback below is only needed when hardFloor > 0 — a genuine truncation point that can
  // land inside a word.
  if (hardFloor <= 0) return floor;
  // No terminator within the bound — never start mid-word: advance to the nearest whitespace AT OR AFTER
  // `floor` (never earlier — floor stays the outer bound) so the window begins at a token boundary.
  for (let i = floor; i < idx; i++) {
    if (/\s/.test(text[i])) return i + 1;
  }
  // One unbroken token spans the whole bound (never observed in this corpus, but not impossible) — the
  // hard byte offset is the only option left.
  return floor;
}

// DISPLAY-ONLY normalization of a `clauseAround` window: strips markdown-rendering artifacts a clause
// boundary alone cannot remove, because they carry no sentence terminator of their own — a `**label:**`
// bold span (e.g. "**FACT:**", "**FACT — deadline:**", "**Primary headline compliance deadline — FACT:**"),
// a leading markdown-table pipe cell (e.g. "hicles (M₂, M₃, N₂, N₃) | MONITORING "), and a leaked
// source-URL tail token (a leading run of non-whitespace characters containing '/', e.g. "7/oj/eng" — the
// tail of a link `clauseStart` backed up into because the URL itself has no terminator nearby). Applied
// ONLY to the text this function returns (obligation_text); `source_span` — the actual matched date
// fragment — is never touched, stays byte-exact, and is checked by `assertVerbatim` against the ORIGINAL,
// unmodified source string, never against this normalized text. Pure. Exported for testing.
export function normalizeObligationText(raw) {
  let t = typeof raw === 'string' ? raw : '';

  // A stray TRAILING markdown-table fragment at the very end of the window (a short, mostly alphanumeric
  // cell/label after a stray '|', with no further '|' after it) is stripped FIRST, before any leading-junk
  // logic below — otherwise a genuine trailing "| NEXT STEPS" is indistinguishable from a LEADING table
  // cell to the pipe-position heuristic further down (both are "a pipe within the first 100 chars with no
  // '.'/';' before it" when the real sentence itself is short), and the leading logic would wrongly eat
  // the entire real sentence in front of it instead.
  t = t.replace(/\s*\|\s*[A-Za-z0-9][A-Za-z0-9 /_-]{0,40}$/, '');

  // A markdown bold "**label:**" span near the start of the window (e.g. "**FACT:**", "**FACT —
  // deadline:**", "**Primary headline compliance deadline — FACT:**") is the reliable anchor: whatever
  // junk precedes it — a leftover table-cell word once the pipe itself already fell outside the window
  // (e.g. "MONITORING "), a leaked URL tail, a stray '|' — has no fixed shape of its own, so strip
  // everything up to and including the label in ONE cut rather than trying to enumerate every possible
  // prefix shape. Bounded to the first 150 chars so a genuine "**" emphasis span deep in a long clause
  // is never mistaken for a leading label.
  const labelMatch = t.match(/^[\s\S]{0,150}?\*\*[^*]{1,120}\*\*\s*/);
  if (labelMatch) {
    t = t.slice(labelMatch[0].length);
  } else {
    // No bold label in this window — still strip a leading URL-tail token (a run of non-whitespace
    // characters containing '/', e.g. "7/oj/eng ") and/or a leading table-pipe cell on their own.
    for (let guard = 0; guard < 4; guard++) {
      let stripped = false;
      const urlTail = t.match(/^\S*\/\S*\s+/);
      if (urlTail) {
        t = t.slice(urlTail[0].length);
        stripped = true;
      }
      const pipeIdx = t.indexOf('|');
      if (pipeIdx !== -1 && pipeIdx < 100 && !/[.;]/.test(t.slice(0, pipeIdx))) {
        t = t.slice(pipeIdx + 1).replace(/^\s+/, '');
        stripped = true;
      }
      if (!stripped) break;
    }
  }
  return t.replace(/\s+/g, ' ').trim();
}

function clauseAround(text, start, end, maxBefore = 60, maxAfter = 160) {
  const from = clauseStart(text, start, maxBefore);
  // stop the trailing window at the next sentence terminator, or maxAfter,
  // whichever comes first, so obligation_text reads as one clause/sentence.
  let to = Math.min(text.length, end + maxAfter);
  const tail = text.slice(end, to);
  const stop = tail.search(/[.;](?!\d)/);
  if (stop !== -1) to = end + stop + 1;
  const windowed = text.slice(from, to).replace(/\s+/g, ' ').trim();
  return normalizeObligationText(windowed);
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
    // classifier could not turn it into a typed event -- never invent a kind (this file's
    // header); surface the gap instead of leaving it indistinguishable from an ordinary claim
    // that genuinely carries no forward-obligation language, IN ADDITION to any generic skip
    // reason `scanText` already logged above for this same span.
    if (isDueDateSlot && hits.length === 0) {
      skipped.push({
        source_kind: 'claim',
        source_claim_id: claim.claim_id,
        source_section_id: null,
        reason: 'slot_date_unclassified',
        text,
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
