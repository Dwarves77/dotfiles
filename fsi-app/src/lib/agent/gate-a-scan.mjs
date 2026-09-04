// gate-a-scan.mjs — THE Gate-A scanner: the single implementation. Gate A finds figure/date tokens in
// full_brief prose that no FACT claim covers; validate_item_provenance criterion 7 reads the row this
// scanner writes (item_gate_a_state) and never re-scans. Consumers: write-item.ts (buildGateARow),
// canonical-pipeline.ts, record-facts.mjs, apply-mint-batch.mjs / run-mint-batch.mjs / heal-provenance.mjs
// through buildGateARow, and the mint kit's local pre-flight validate-mint-payload.mjs through
// scripts/mint/lib/gate-a-scan.mjs, which since 2026-09-04 is a re-export of this file, not a copy.
//
// SINGLE SOURCE (2026-09-04, coordinator, after lane GATE-A-TOKENS): until this date this file and
// scripts/mint/lib/gate-a-scan.mjs were two hand-mirrored copies ("keep in sync" by convention) and the
// lane's harvest fix landed in the kit copy only, leaving the live path unchanged. That is the duplication
// CLAUDE.md forbids; the kit file is now `export * from` this one, and F28 lists THIS file among the mint
// family's governing files so a change here moves the harness hash. The one difference the copy carried
// (a one-shot crypto.hash() spelling of md5 to stay clear of rule 015's textual raw-write scan of scripts/)
// is not needed here: src/ is outside that scan, and createHash is the form every Node the app runs on has.
//
import crypto from "node:crypto";
import { containsToken, norm } from "./gate-a-match.mjs";

// 2026-07-26.2: isBacked is now LITERAL-ONLY (shared gate-a-match.containsToken). The prior .1 used a
// digit-reduced fallback in isBacked that marked worded tokens ("August 2025") backed by any span carrying
// their digits ("2025") — the coverage-site twin of the mint runner's fallback (case-file instance 7). The
// version bump invalidates every prior scan honestly: the stale-scan guard re-quarantines on the semantics change.
// 2026-07-27.1: coverage gains a SECOND arm (Gate B, mig 227) — a fact token is also backed by a valid grounded
// DERIVED claim (derivedCovered set, precomputed by the caller via gate-a-derived.derivedCoveredTokens, a pure DB
// lookup). The version bump re-scans so derived-covered tokens are honestly re-evaluated (stale basis → orphan).
// 2026-09-04.1: token HARVEST narrowed to exclude five non-assertion syntactic contexts (metadata stamps,
// GAP-boilerplate templates, heading/list-item ordinal numerals, instrument-citation numbers, position-nested
// date/figure sub-spans) — see the file-header note above. Nothing about COVERAGE (isBacked) changed; this
// bump is a HARVEST-side semantics change, so the version bump re-scans honestly like every prior one.
export const GATE_A_VERSION = "2026-09-04.1"; // 2026-09-04.1: non-assertion syntactic-context harvest skips (lane GATE-A-TOKENS)
export function md5(s) { return crypto.createHash("md5").update(String(s ?? ""), "utf8").digest("hex"); }

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
// Citation-apparatus markers on a line => its years/numbers are provenance metadata, excluded from the fact gate.
const CITATION_LINE = /\bOJ\b|official journal|\bp{1,2}\.\s?\d|\bpp\.\s?\d|https?:\/\/|\beli\b|celex|\bno\.?\s?\d+\/\d+|\bL\s?\d{2,}|\bC\s?\d{2,}|source\s*[:=]|\bdoi\b|\baccessed\b|©/i;
// Obligation/deadline context near a year => it is a compliance deadline, gates.
const OBLIGATION_NEAR = /\b(?:by|from|until|after|before|effective|effective from|starting|as of|no later than|in force|applies|apply from|deadline|phase[- ]?in|phased|comes into force|entry into force|takes effect|by the end of|through|to)\b/i;

// ── non-assertion syntactic-context helpers (measured, lane GATE-A-TOKENS 2026-09-04) ─────────────────

function freshSkipCounts() {
  return { metadata_stamp: 0, boilerplate: 0, heading_or_list_ordinal: 0, instrument_citation: 0, citation_url: 0, nested_token: 0 };
}

// A citation URL, verbatim in the line, is provenance metadata about WHERE a fact lives (the same rationale
// CITATION_LINE already applies to whole-line date exclusion) — but URL-encoding can accidentally spell what
// LOOKS like a figure: found live, item aea2e314-...: the download URL
// ".../Appendix%202.6%20-%20Draft%20standard%20-%20ESRS%20E1..." contains the literal substring "202.6%"
// (the "%20" space-encoding glued to the digits either side of it), which the percent regex below matches as
// a false 202.6% quantity that no source will ever ground honestly, because it never was one. Position-
// anchored (only a match whose FULL span sits inside the URL's own character range is excluded), so a real
// figure in an adjacent table cell on the same line is never touched — verified against the ESRS row this
// was found on (the "2" citation-tier column and the real Scope-3 prose stay fully scanned).
const URL_RE = /https?:\/\/[^\s|)\]"'<>]+/g;
function urlSpans(line) {
  const spans = [];
  for (const m of line.matchAll(URL_RE)) spans.push([m.index, m.index + m[0].length]);
  return spans;
}

// A closed set of DOCUMENT-level metadata field labels — about the BRIEF ITSELF (when it was generated or
// revised, its own freshness/status) — never a REGULATION-content label. Deliberately narrow and enumerated,
// not a generic "bold + colon" rule: measurement showed bold-led lines are overwhelmingly genuine prose
// CALLOUTS ("FACT:", "Effective date:", "Timeline:", "Re-check window:", 73 bold-led orphans sampled, only a
// handful were true document metadata) — a generic rule would have wrongly exempted real facts including,
// per the operator's own supplied examples, "Effective date:" (a regulation's date, kept) vs "Effective date
// of this document:" (the brief's own stamp, skipped). Every label here was either named explicitly by the
// operator ("As of", "Status", "Last verified") or observed live in the 627-token corpus with a pure-value
// line ("Date of generation:", "Document date:", "Effective date of this document:").
const METADATA_STAMP_LABELS = new Set([
  "as of",
  "status",
  "last verified",
  "date of generation",
  "document date",
  "effective date of this document",
]);
// Document-type | generation-date header line ("**Technology Profile** | April 2026", "**Regulatory Fact
// Document** | Generated April 2025", "**Market Signal Brief** | MONITORING | Issued: 2026-05-29"): a bold
// span at the very start of the line immediately followed by a pipe. Structural (not enumerated) because it
// generalizes safely — every document-type header observed in the corpus has this shape, and no bold prose
// CALLOUT in the corpus does (a callout's bold span is followed by more prose or a colon, never a bare pipe).
const METADATA_PIPE_HEADER = /^\*\*[^*\n]{1,60}\*\*\s*\|/;
const METADATA_LABEL_LINE = /^\*\*([^*\n]{1,60}?):?\*\*/;

/** Is this trimmed line a document-metadata stamp (skip the WHOLE line — measured: nothing else lives on it)? */
function isMetadataStampLine(line) {
  if (METADATA_PIPE_HEADER.test(line)) return true;
  const m = line.match(METADATA_LABEL_LINE);
  if (!m) return false;
  const label = m[1].trim().toLowerCase().replace(/:$/, "");
  if (!METADATA_STAMP_LABELS.has(label)) return false;
  // Guard: never blanket on the label alone — require the rest of the line to be a short VALUE, not further
  // narrative prose (a real callout can coincidentally reuse a listed label word in a longer sentence).
  const rest = line.slice(m[0].length).trim();
  return rest.length <= 60;
}

// GAP-boilerplate template families: the brief's own honest "we don't have this" clause, not an assertion
// about the world. Literal-prefix, evidenced by REPEAT COUNT across the 627-token/87-item corpus (never a
// single occurrence promoted to a rule): "No content for this section as of" (7 occurrences, the operator's
// own named example) and "not available from primary sources as of" (24 occurrences, the dominant GAP
// template in this corpus, found by measurement). A third candidate ("has been identified in the source
// corpus as of") occurred once — not a template, not added. Each pattern's capture group is the trailing
// "as of <date>" clause; ONLY a token whose match falls inside that captured span is skipped — nothing else
// sharing the line (a real fact can precede the same boilerplate clause, e.g. "That connection remains
// speculative and is not sourced. *Specific regulatory connection not available from primary sources as of
// June 2026.*") is touched.
const BOILERPLATE_TEMPLATES = [
  /no content for this section as of\s+([^\n*:.]{1,40})/gi,
  /not available from primary sources as of\s+([^\n*:.]{1,40})/gi,
];

/** [start,end) spans (within `line`) of every boilerplate template's trailing "as of <date>" clause. */
function boilerplateSpans(line) {
  const spans = [];
  for (const re of BOILERPLATE_TEMPLATES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) {
      const clauseStart = m.index + m[0].lastIndexOf(m[1]);
      spans.push([clauseStart, clauseStart + m[1].length]);
    }
  }
  return spans;
}

function insideAnySpan(start, end, spans) {
  return spans.some(([s, e]) => start >= s && end <= e);
}

// Markdown heading numeral / list-item ordinal at the very start of a line ("## 2. Tonne-Kilometre Activity
// Data Capture" -> the false figure token "2. Tonne", found live in item aea2e314-...; "1. **National
// Development Plan (Law 1753 of 2015)**..." real list content). The ordinal itself ("2.", "1.") is structure,
// never a fact — but everything AFTER it (the heading's real title, the list item's real content) is scanned
// completely normally: measurement showed real facts routinely open a numbered heading ("### 6.1 New
// qualification call for management entities (March 2026)") or list item, so this strips ONLY the leading
// ordinal token, never the line.
const ORDINAL_PREFIX = /^(#{1,6}\s+)?\d+\.(?=\s|$)\s*/;

function stripOrdinalPrefix(line) {
  const m = line.match(ORDINAL_PREFIX);
  return m ? { rest: line.slice(m[0].length), offset: m[0].length, stripped: true } : { rest: line, offset: 0, stripped: false };
}

// Instrument-citation number: a bare year immediately adjacent to "/" plus another (optionally
// comma-grouped) number, in EITHER order — "(EU) 2024/1735", "2019/1242" (year-first, the operator's own
// examples) and "Federal Law No. 12,305/2010" (year-last, found live in item 8de055dc-...: Brazil's PNRS
// law-numbering convention, which the existing CITATION_LINE `\bno\.?\s?\d+\/\d+\b` regex misses because the
// comma-grouped digits break its `\d+` run). The slash-adjacency to another multi-digit number is itself the
// signal, independent of nearby keywords: prose never writes a real calendar date as "N/YYYY" or "YYYY/N".
function isInstrumentCitationYear(line, start, end) {
  const before = line.slice(Math.max(0, start - 4), start);
  const after = line.slice(end, end + 1);
  if (after === "/") return true; // YYYY/nnn (year-first, e.g. "2024/1735")
  if (/[\d,]\/$/.test(before)) return true; // nnn/YYYY (year-last, e.g. "12,305/2010")
  return false;
}

/** Drop a match whose [start,end) span is a strict subset of another match's span in the SAME list.
 *  Position-anchored (never a bare string .includes()): a genuinely distinct figure that happens to share
 *  digits with a longer one at a DIFFERENT position (measured live case: "1 GW" and "1.1 GW" both stated
 *  as separate real figures in "...is 1.1 GW, from a range of 1 GW to 2.4 GW") is never collapsed, because
 *  its span does not nest inside the other's. A genuinely nested date ("1 January 2028" containing, at the
 *  SAME position, both "January 2028" and "2028") always is — and the shorter token would auto-clear the
 *  instant the longer one is grounded anyway, via containsToken's own substring semantics, so dropping it
 *  from the orphan list reports the SAME missing fact once, not two or three times over. */
function dedupNested(matches, counts, key) {
  const kept = [];
  for (const m of matches) {
    const nestedInAnother = matches.some(
      (o) => o !== m && !(o.start === m.start && o.end === m.end) && o.start <= m.start && o.end >= m.end,
    );
    if (nestedInAnother) {
      if (counts) counts[key] += 1;
      continue;
    }
    kept.push(m);
  }
  return kept;
}

// ── token extraction ─────────────────────────────────────────────────────────────────────────────────

// Extract the FIGURE class (always gates): currency amounts, number+unit, percentages, large quantities.
function figureTokens(text, counts = freshSkipCounts()) {
  const out = new Set();
  for (const rawLine of text.split(/\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isMetadataStampLine(line)) {
      counts.metadata_stamp += 1;
      continue;
    }
    const { rest, offset, stripped } = stripOrdinalPrefix(line);
    if (stripped) counts.heading_or_list_ordinal += 1;
    const bSpans = boilerplateSpans(rest);
    const uSpans = urlSpans(rest);
    const matches = [];
    for (const re of [
      /(?:€|£|\$|EUR|GBP|USD)\s?\d[\d.,]*/g,
      /\b\d[\d.,]*\s?(?:%|per ?cent|percent|tCO2e?|tCO₂e?|gCO2|gCO₂|g\/km|\btonnes?\b|\bgt\b|\bkW\b|\bMW\b|\bGW\b|\bkWh\b|\bMWh\b|\bkm\b|\blitres?\b|\bkg\b|\bppm\b|\bbps\b)/gi,
    ]) {
      for (const m of rest.matchAll(re)) {
        const tok = m[0].trim();
        const start = m.index;
        const end = m.index + m[0].length;
        if (insideAnySpan(start, end, uSpans)) {
          counts.citation_url += 1;
          continue;
        }
        if (insideAnySpan(start, end, bSpans)) {
          counts.boilerplate += 1;
          continue;
        }
        matches.push({ token: tok, start: start + offset, end: end + offset });
      }
    }
    for (const m of dedupNested(matches, counts, "nested_token")) out.add(m.token);
  }
  return [...out];
}
// Extract the DEADLINE-DATE class — EVERY date class is context-classified: a date (full / month-year / ISO /
// bare year) in citation apparatus is excluded; in obligation or trajectory context it gates.
function deadlineTokens(text, counts = freshSkipCounts()) {
  const out = new Set();
  // EVERY date class is classified by CONTEXT, line by line — full dates, month-years and ISO dates included.
  // Previously the three explicit-date branches scanned the WHOLE text unconditionally ("full dates always
  // gate") while only bare years got the citation test: context-aware for years, context-blind for dates. That
  // gated a brief's own inline citations — `*Source: CLECAT Newsletter, 30 April 2026, https://…` — as if the
  // newsletter's publication date were a compliance deadline (CELEX 32026R1030, 5 of 11 orphans). The operator's
  // 2026-07-26 scope ruling already excluded citation apparatus as "provenance metadata about WHERE a fact
  // lives"; this applies that ruling to the date classes it was always meant to cover. OBLIGATION_NEAR still
  // overrides the exclusion, so a real deadline sharing a line with a URL is never blanket-dropped.
  const FULL_DATE = new RegExp(`\\b\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4}\\b`, "gi");
  const MONTH_YEAR = new RegExp(`\\b(?:${MONTHS})\\s+\\d{4}\\b`, "gi");
  const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
  for (const rawLine of text.split(/\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isMetadataStampLine(line)) {
      counts.metadata_stamp += 1;
      continue;
    }
    const { rest, offset, stripped } = stripOrdinalPrefix(line);
    if (stripped) counts.heading_or_list_ordinal += 1;
    const bSpans = boilerplateSpans(rest);
    const isCitation = CITATION_LINE.test(rest);
    const matches = [];
    for (const re of [FULL_DATE, MONTH_YEAR, ISO_DATE]) {
      for (const m of rest.matchAll(re)) {
        const start = m.index;
        const end = m.index + m[0].length;
        const before = rest.slice(Math.max(0, start - 30), start);
        if (isCitation && !OBLIGATION_NEAR.test(before)) continue; // citation-apparatus date -> excluded
        if (insideAnySpan(start, end, bSpans)) {
          counts.boilerplate += 1;
          continue;
        }
        matches.push({ token: m[0].trim(), start: start + offset, end: end + offset });
      }
    }
    // bare years: classify by CONTEXT, line by line
    const isTrajectoryRow = rest.includes("|") && /\d[\d.,]*\s?%|(?:€|£|\$)\s?\d/.test(rest); // table row carrying a figure
    for (const ym of rest.matchAll(/\b(?:19[89]\d|20[0-4]\d)\b/g)) {
      const yr = ym[0];
      const start = ym.index;
      const end = ym.index + yr.length;
      const before = rest.slice(Math.max(0, start - 30), start);
      if (isInstrumentCitationYear(rest, start, end)) {
        counts.instrument_citation += 1;
        continue; // a year inside a "No. nnn/YYYY" or "(EU) YYYY/nnn" instrument number -> not a date
      }
      if (isCitation && !OBLIGATION_NEAR.test(before)) continue;      // citation year -> excluded
      if (insideAnySpan(start, end, bSpans)) {
        counts.boilerplate += 1;
        continue;
      }
      if (isTrajectoryRow || OBLIGATION_NEAR.test(before)) matches.push({ token: yr, start: start + offset, end: end + offset }); // obligation/trajectory year -> gates
      // bare year with neither context -> NOT gated (avoid crying wolf; figures in the same brief still gate it)
    }
    for (const m of dedupNested(matches, counts, "nested_token")) out.add(m.token);
  }
  return [...out];
}

/** All Gate-A factual tokens in prose (figures + context-aware deadline-dates). `counts`, if passed, is
 *  mutated with a tally of every non-assertion syntactic-context skip (never silent — see scanBrief). */
export function extractFactualTokens(fullBrief, counts) {
  const text = String(fullBrief || "");
  const c = counts || freshSkipCounts();
  return { figures: figureTokens(text, c), deadlines: deadlineTokens(text, c) };
}

/** Scan a brief: returns { scanned_hash, orphan_count, orphans, counts } — orphans are factual tokens absent
 *  from every FACT claim. `counts` tallies every non-assertion syntactic-context skip applied during harvest
 *  (metadata_stamp, boilerplate, heading_or_list_ordinal, instrument_citation, nested_token) — additive to the
 *  existing five-field shape (scanned_hash/gate_a_version/orphan_count/orphans + this), never silent, and
 *  never consumed by buildGateARow (write-item.ts), which picks its six named fields explicitly and ignores
 *  extras — compatible by construction, not by convention.
 *  factClaims: [{ claim_text, source_span }] (claim_kind='FACT' rows). */
export function scanBrief(fullBrief, factClaims, derivedCovered = new Set()) {
  const scanned_hash = md5(fullBrief);
  const counts = freshSkipCounts();
  const { figures, deadlines } = extractFactualTokens(fullBrief, counts);
  const corpus = (factClaims || []).map((c) => `${c.claim_text} ${c.source_span}`).join(" ");
  // Coverage, two arms: (1) LITERAL — a FACT claim's text/span literally contains the token (shared matcher,
  // untouched); (2) DERIVED (Gate B) — the exact token has a valid grounded DERIVED claim (membership in the
  // precomputed derivedCovered set; the DB lookup that validated basis-grounding + non-staleness lives in the
  // caller, gate-a-derived.mjs, so scanBrief stays purely mechanical). No prose-pattern exemption anywhere here.
  const isBacked = (tk) => containsToken(corpus, tk) || derivedCovered.has(norm(tk));
  const orphans = [];
  for (const tk of figures) if (!isBacked(tk)) orphans.push({ token: tk, class: "figure" });
  for (const tk of deadlines) if (!isBacked(tk)) orphans.push({ token: tk, class: "deadline" });
  return { scanned_hash, gate_a_version: GATE_A_VERSION, orphan_count: orphans.length, orphans, counts };
}
