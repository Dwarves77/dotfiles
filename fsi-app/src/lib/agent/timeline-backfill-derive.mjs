// src/lib/agent/timeline-backfill-derive.mjs
//
// TASK 6.1c (W9 brief-chain build plan, 2026-09-11): the pure derivation half of the corpus timeline
// backfill, under ADR-030 ("Items need to be resolved not quarantined... No item should be without some
// date in the timeline"). This module implements derivation steps 2-6 of the task brief's ordered
// waterfall (step 1, the brief-body timeline-section harvest, stays exactly where it is:
// scripts/backfill-item-timelines.mjs's own extractRegulationSections + buildTimelineRows, this file
// never duplicates that parser):
//
//   2. Title date: "of DD Month YYYY" / "of DD.MM.YYYY" / bare "DD Month YYYY" (EU/UK/IMO title forms).
//      Verified against the item's own stored capture text before it is trusted (containsToken).
//   3. Federal Register URL date path: /documents/YYYY/MM/DD/.
//   4. legislation.gov.uk: a "Made DDth Month YYYY" line (statutory instrument), a bracketed
//      "[DDth Month YYYY]" Royal Assent line (an Act), or a year-only fallback from a UK-shaped
//      identifier ("UK ukpga 2023/52" -> 2023, precision "year").
//   5. Earliest item_forward_events row, labeled from its own obligation_text, prefixed by its kind.
//   6. A dateline in the capture text for non-legal hosts: a leading "Published DD Month YYYY", a bare
//      "DD Month YYYY" in the first 400 characters, or a <time datetime=...> ISO date the capture kept.
//
// PRECISION HONESTY is the SAME rule timeline-harvest.mjs already states and enforces for the brief's
// own timeline section harvest: a day-precise token maps to its exact date and the label stays clean;
// any other precision keeps the ORIGINAL token in the label (never fabricates a day/month the source did
// not state). This module reuses timeline-harvest.mjs's own `toIsoDate` for that parsing (a relative
// import to a zero-dependency sibling .mjs, portable, no npm package, no `@/` alias; see
// .discipline/glob-portability.test.mjs's transitive-import check) so the two modules can never disagree
// on what a date token means. It also reuses forward-event-format.mjs's `formatEventDateCompact` for
// step 5's human-readable token (reuse-before-construction, no second month-name table).
//
// NEGATIVES this module is built to refuse (task brief, "Tests" paragraph):
//   - a year inside a CELEX number is not a date (extractTitleDate requires an adjacent day+month+year
//     token; a bare "2019/1242" never matches any pattern here).
//   - a date in a citation of another instrument is not this instrument's date (extractTitleDate takes
//     the FIRST "of DATE" occurrence in the title, an EU/UK/IMO instrument's own promulgation date is
//     always stated first, immediately after the instrument number, before any "amending X of Y" clause
//     naming a DIFFERENT instrument's date).
//   - "twentieth day following publication" yields nothing (no day+month+year digits present anywhere;
//     every extractor here requires numeric date tokens and returns null on prose with none).
//
// PURE, no I/O, no DB, no network, no LLM. Every exported function takes plain data and returns plain
// data or null.

import { toIsoDate } from "./timeline-harvest.mjs";
import { formatEventDateCompact } from "../connections/forward-event-format.mjs";

// -------------------------------------------------------------------------------------------------------
// Shared label/row helpers
// -------------------------------------------------------------------------------------------------------

/**
 * The SAME precision-honesty convention buildTimelineRows (timeline-harvest.mjs) already applies: a
 * day-precise token renders the base label clean; any other precision keeps the original token IN the
 * label (sort order still derives from the normalized ISO date, never a fabricated day). Pure.
 * @param {string} token the original date-ish text this derivation matched
 * @param {string} precision "day" | "month" | "quarter" | "half" | "year" | "range" | "qualified" | "segment"
 * @param {string} baseLabel the human-readable label naming the derivation's source
 * @returns {string}
 */
export function formatPrecisionLabel(token, precision, baseLabel) {
  return precision === "day" ? baseLabel : `${token} - ${baseLabel}`;
}

/**
 * Case-insensitive substring check: is `token` present in `capturedText`? Pure. False for any
 * empty/missing input: "no capture to check against" and "not found in the capture" are both an
 * honest miss (never a fabricated verification).
 * @param {string|null|undefined} capturedText
 * @param {string|null|undefined} token
 * @returns {boolean}
 */
export function containsToken(capturedText, token) {
  if (!capturedText || !token) return false;
  return String(capturedText).toLowerCase().includes(String(token).toLowerCase());
}

/**
 * The item_timelines row shape (id, item_id, milestone_date, label, is_completed, sort_order,
 * created_at; item_id and created_at are the caller's/DB's own job). Pure.
 * @param {{token:string, iso:string, precision:string, baseLabel:string}|null} derived
 * @param {string} todayIso "YYYY-MM-DD"
 * @param {number} [sortOrder]
 * @returns {{milestone_date:string, label:string, is_completed:boolean, sort_order:number}|null}
 */
export function finalizeTimelineRow(derived, todayIso, sortOrder = 0) {
  if (!derived || !derived.iso) return null;
  const label = formatPrecisionLabel(derived.token, derived.precision, derived.baseLabel).slice(0, 500);
  return {
    milestone_date: derived.iso,
    label,
    is_completed: derived.iso < todayIso,
    sort_order: sortOrder,
  };
}

/**
 * ADR-016's own usability floor (>200 trimmed chars), the SAME contract
 * scripts/mint/heal-provenance.mjs's own `bestCaptureText` applies (re-implemented here, rather than
 * imported, so this module stays free of that 4000+-line script's own dependency surface); the CONTRACT
 * is identical: the longest usable `result_content` among the item's captures, or null when none clears
 * the floor. Pure given the array of `{result_content}`-shaped rows a caller already read.
 * @param {Array<{result_content?: string|null}>} captures
 * @returns {string|null}
 */
export function pickBestCaptureText(captures) {
  const usable = (captures ?? []).filter((c) => String(c?.result_content ?? "").trim().length > 200);
  if (!usable.length) return null;
  return usable.reduce((best, c) => (c.result_content.length > best.result_content.length ? c : best)).result_content;
}

// -------------------------------------------------------------------------------------------------------
// Step 2: title date
// -------------------------------------------------------------------------------------------------------

const TITLE_DOT_DATE_RE = /\bof\s+(\d{1,2})\.(\d{1,2})\.(\d{4})\b/i;
const TITLE_OF_WORD_DATE_RE = /\bof\s+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\.?\s+\d{4})\b/i;
const TITLE_BARE_WORD_DATE_RE = /\b(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\.?\s+\d{4})\b/i;

/**
 * Step 2: the instrument's OWN date stated in its title: "of DD Month YYYY" (EU acts), "of DD.MM.YYYY",
 * or a bare "DD Month YYYY" (the form UK/IMO titles sometimes use without a leading "of"). Takes the
 * FIRST match only, so an amending title's own date wins over a later "amending Regulation ... of
 * <cited instrument's date>" clause (the citation-date negative). Pure; caller (the orchestrator, or
 * mint-item.ts's own hook) is responsible for verifying `token` against the item's stored capture text
 * before trusting this as a written date.
 * @param {string|null|undefined} title
 * @returns {{token:string, iso:string, precision:string}|null}
 */
export function extractTitleDate(title) {
  if (!title || typeof title !== "string") return null;

  const dot = TITLE_DOT_DATE_RE.exec(title);
  if (dot) {
    const [, dd, mm, yyyy] = dot;
    const norm = toIsoDate(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`);
    if (norm) return { token: `${dd}.${mm}.${yyyy}`, iso: norm.iso, precision: norm.precision };
  }

  const ofWord = TITLE_OF_WORD_DATE_RE.exec(title);
  if (ofWord) {
    const norm = toIsoDate(ofWord[1]);
    if (norm) return { token: ofWord[1], iso: norm.iso, precision: norm.precision };
  }

  const bareWord = TITLE_BARE_WORD_DATE_RE.exec(title);
  if (bareWord) {
    const norm = toIsoDate(bareWord[1]);
    if (norm) return { token: bareWord[1], iso: norm.iso, precision: norm.precision };
  }

  return null;
}

export const TITLE_DATE_BASE_LABEL = "Adopted (from the instrument title)";

// -------------------------------------------------------------------------------------------------------
// Step 3: Federal Register URL date path
// -------------------------------------------------------------------------------------------------------

const FEDERAL_REGISTER_URL_RE = /federalregister\.gov\/documents\/(\d{4})\/(\d{2})\/(\d{2})\//i;

/**
 * Step 3: a Federal Register document URL's own /documents/YYYY/MM/DD/ path segment. Pure.
 * @param {string|null|undefined} sourceUrl
 * @returns {{token:string, iso:string, precision:string}|null}
 */
export function extractFederalRegisterDate(sourceUrl) {
  if (!sourceUrl || typeof sourceUrl !== "string") return null;
  const m = FEDERAL_REGISTER_URL_RE.exec(sourceUrl);
  if (!m) return null;
  const [, yyyy, mm, dd] = m;
  const token = `${yyyy}-${mm}-${dd}`;
  const norm = toIsoDate(token);
  if (!norm) return null;
  return { token, iso: norm.iso, precision: norm.precision };
}

export const FEDERAL_REGISTER_BASE_LABEL = "Published in the Federal Register";

// -------------------------------------------------------------------------------------------------------
// Step 4: legislation.gov.uk: Made / Royal Assent / year-only identifier fallback
// -------------------------------------------------------------------------------------------------------

const UK_MADE_LINE_RE = /\bMade\b[^\n]{0,40}?(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})\b/i;
const UK_ROYAL_ASSENT_BRACKET_RE = /\[(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})\]/;
// Requires a UK legislation-type token (ukpga, uksi, asp, wsi, ssi, nia, mnia, or a bare "uk..." prefix)
// ahead of a "YYYY/N" identifier shape, so a CELEX key like "32019R1242" (a year immediately followed by
// a sector letter, never a UK type token) can never match this fallback: the CELEX-year negative.
const UK_IDENTIFIER_YEAR_RE = /\b(?:uk\w*|asp|wsi|ssi|nia|mnia)\b.*?(\d{4})\/\d+/i;

/**
 * Step 4: legislation.gov.uk's own dated lines. Order: the "Made" line of a statutory instrument, then
 * the bracketed Royal Assent line of an Act, then a year-only fallback derived from a UK-shaped
 * identifier (precision "year", the label keeps the bare year token, per timeline-harvest.mjs's own
 * precision rule, reused here via formatPrecisionLabel). Pure.
 * @param {{capturedText?: string|null, identifier?: string|null}} input
 * @returns {{token:string, iso:string, precision:string, baseLabel:string, form:string}|null}
 */
export function extractLegislationGovUkDate({ capturedText, identifier } = {}) {
  const text = typeof capturedText === "string" ? capturedText : "";

  const made = UK_MADE_LINE_RE.exec(text);
  if (made) {
    const norm = toIsoDate(made[1]);
    if (norm) return { token: made[1], iso: norm.iso, precision: norm.precision, baseLabel: "Made (legislation.gov.uk)", form: "made" };
  }

  const assent = UK_ROYAL_ASSENT_BRACKET_RE.exec(text);
  if (assent) {
    const norm = toIsoDate(assent[1]);
    if (norm) return { token: assent[1], iso: norm.iso, precision: norm.precision, baseLabel: "Royal Assent (legislation.gov.uk)", form: "royal_assent" };
  }

  const idText = typeof identifier === "string" ? identifier : "";
  const idMatch = UK_IDENTIFIER_YEAR_RE.exec(idText);
  if (idMatch) {
    const norm = toIsoDate(idMatch[1]);
    if (norm) {
      return {
        token: idMatch[1],
        iso: norm.iso,
        precision: norm.precision,
        baseLabel: "Enacted (legislation.gov.uk identifier year)",
        form: "identifier_year",
      };
    }
  }

  return null;
}

// -------------------------------------------------------------------------------------------------------
// Step 5: earliest forward event
// -------------------------------------------------------------------------------------------------------

/**
 * Step 5: the earliest item_forward_events row (any kind), labeled from its own obligation_text,
 * prefixed by its kind: "the label from the event's obligation_text, prefixed by its kind." Date
 * precision comes straight from the row's own date_precision (already 'day'|'month'|'year', the
 * extractor that wrote it never fabricates a day/month either, see forward-event-format.mjs's header).
 * Pure.
 * @param {Array<{event_date:string, date_precision?:string, event_kind?:string, obligation_text?:string}>|null|undefined} events
 * @returns {{token:string, iso:string, precision:string, baseLabel:string}|null}
 */
export function extractForwardEventDate(events) {
  const list = (events ?? []).filter((e) => e && typeof e.event_date === "string" && e.event_date);
  if (!list.length) return null;
  const earliest = [...list].sort((a, b) => (a.event_date < b.event_date ? -1 : a.event_date > b.event_date ? 1 : 0))[0];
  const precision = earliest.date_precision === "month" || earliest.date_precision === "year" ? earliest.date_precision : "day";
  const kindLabel = String(earliest.event_kind ?? "event").replace(/_/g, " ");
  const obligation = String(earliest.obligation_text ?? "").trim();
  const baseLabel = obligation ? `${kindLabel}: ${obligation}` : kindLabel;
  const token = formatEventDateCompact(earliest.event_date, precision);
  return { token, iso: earliest.event_date, precision, baseLabel };
}

// -------------------------------------------------------------------------------------------------------
// Step 6: dateline in capture text (non-legal hosts)
// -------------------------------------------------------------------------------------------------------

const DATELINE_WINDOW_CHARS = 400;
const DATELINE_PUBLISHED_RE = /\bPublished\s+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})\b/i;
const DATELINE_BARE_RE = /\b(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})\b/i;
const DATELINE_TIME_TAG_RE = /<time\b[^>]*\bdatetime=["']([^"']+)["'][^>]*>/i;
const ISO_DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})/;

/**
 * Step 6: a dateline in the capture text for non-legal hosts (agency/research/port/news pages). Order:
 * a leading "Published DD Month YYYY", a bare "DD Month YYYY" in the first 400 characters, or a
 * `<time datetime=...>` tag's ISO date wherever the capture kept it. Pure.
 * @param {string|null|undefined} capturedText
 * @returns {{token:string, iso:string, precision:string}|null}
 */
export function extractDatelineDate(capturedText) {
  if (!capturedText || typeof capturedText !== "string") return null;
  const window = capturedText.slice(0, DATELINE_WINDOW_CHARS);

  const published = DATELINE_PUBLISHED_RE.exec(window);
  if (published) {
    const norm = toIsoDate(published[1]);
    if (norm) return { token: published[1], iso: norm.iso, precision: norm.precision };
  }

  const bare = DATELINE_BARE_RE.exec(window);
  if (bare) {
    const norm = toIsoDate(bare[1]);
    if (norm) return { token: bare[1], iso: norm.iso, precision: norm.precision };
  }

  const timeTag = DATELINE_TIME_TAG_RE.exec(capturedText);
  if (timeTag) {
    const isoPrefix = ISO_DATE_PREFIX_RE.exec(timeTag[1]);
    if (isoPrefix) {
      const norm = toIsoDate(isoPrefix[1]);
      if (norm) return { token: isoPrefix[1], iso: norm.iso, precision: norm.precision };
    }
  }

  return null;
}

export const DATELINE_BASE_LABEL = "Published (from the source page)";

// -------------------------------------------------------------------------------------------------------
// Orchestrator: steps 2 through 6, first hit wins, every attempt named for the audit trail.
// -------------------------------------------------------------------------------------------------------

/**
 * The steps-2-through-6 waterfall, first hit wins. Step 1 (the brief-body timeline-section harvest) is
 * NOT here, it stays scripts/backfill-item-timelines.mjs's own path (extractRegulationSections +
 * buildTimelineRows), reused exactly as-is by the maintenance wrapper; this function only runs for an
 * item step 1 did not (or could not) date. Pure, every input is plain data the caller already read.
 *
 * Step 2 (title) is applied to ANY item carrying a title-shaped date, not gated to the reg-family item
 * types: [HYPOTHESIS, not yet corpus-verified] broadening beyond reg-family is safe because the label
 * only ever asserts what the instrument's own title states, regardless of how the item is classified on
 * a customer surface; ADR-030's own measurement (927 of 1,411 undated items carry a title date) was not
 * itself scoped to reg-family, so gating here would leave many of those 927 undated for no stated reason.
 *
 * @param {{
 *   title?: string|null,
 *   sourceUrl?: string|null,
 *   capturedText?: string|null,
 *   identifier?: string|null,
 *   forwardEvents?: Array<object>|null,
 * }} input
 * @returns {{
 *   result: ({token:string, iso:string, precision:string, baseLabel:string, source:string, form?:string})|null,
 *   attempts: Array<{step:string, outcome:string, [key:string]: unknown}>,
 * }}
 */
export function deriveTimelineFromMetadata({ title, sourceUrl, capturedText, identifier, forwardEvents } = {}) {
  const attempts = [];

  // Step 2: title date, verified against the item's own captured text.
  const titleDate = extractTitleDate(title);
  if (titleDate) {
    const verified = containsToken(capturedText, titleDate.token);
    if (verified) {
      attempts.push({ step: "title", outcome: "hit-verified", token: titleDate.token });
      return { result: { ...titleDate, baseLabel: TITLE_DATE_BASE_LABEL, source: "title" }, attempts };
    }
    attempts.push({ step: "title", outcome: "miss-not-in-capture", token: titleDate.token });
  } else {
    attempts.push({ step: "title", outcome: "no-token-in-title" });
  }

  // Step 3: Federal Register URL date path.
  const fr = extractFederalRegisterDate(sourceUrl);
  if (fr) {
    attempts.push({ step: "federal_register", outcome: "hit", token: fr.token });
    return { result: { ...fr, baseLabel: FEDERAL_REGISTER_BASE_LABEL, source: "federal_register" }, attempts };
  }
  attempts.push({ step: "federal_register", outcome: "no-match" });

  // Step 4: legislation.gov.uk (Made / Royal Assent / year-only identifier fallback).
  const leg = extractLegislationGovUkDate({ capturedText, identifier });
  if (leg) {
    attempts.push({ step: "legislation_gov_uk", outcome: "hit", form: leg.form, token: leg.token });
    return { result: { ...leg, source: "legislation_gov_uk" }, attempts };
  }
  attempts.push({ step: "legislation_gov_uk", outcome: "no-match" });

  // Step 5: earliest forward event.
  const fe = extractForwardEventDate(forwardEvents);
  if (fe) {
    attempts.push({ step: "forward_event", outcome: "hit", token: fe.token });
    return { result: { ...fe, source: "forward_event" }, attempts };
  }
  attempts.push({ step: "forward_event", outcome: "no-events" });

  // Step 6: dateline in the capture text (non-legal hosts).
  const dl = extractDatelineDate(capturedText);
  if (dl) {
    attempts.push({ step: "dateline", outcome: "hit", token: dl.token });
    return { result: { ...dl, baseLabel: DATELINE_BASE_LABEL, source: "dateline" }, attempts };
  }
  attempts.push({ step: "dateline", outcome: "no-match" });

  return { result: null, attempts };
}
