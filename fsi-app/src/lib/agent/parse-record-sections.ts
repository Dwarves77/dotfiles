/**
 * parse-record-sections.ts
 *
 * Pure parser for a record-grade item's `intelligence_item_sections` rows (section_key "identity" /
 * "record_facts" / "sources_and_citations" — src/lib/intake/record-facts.mjs's buildRecordPayload).
 * A record-grade item (`intelligence_items.item_grade = "record"`) carries no synthesized full_brief;
 * its Summary content IS these FACT/GAP claim lines, already grouped into sections at mint time. This
 * module turns the raw `content_md` text back into a small, render-ready shape — humanized slot labels,
 * the verbatim source span for each FACT, and an honest FACT/GAP count — WITHOUT re-parsing full_brief
 * (full_brief is the SAME claim text with markdown boilerplate wrapped around it; `sections` is the
 * smaller, already-split payload the detail pages already fetch via loadDetail, so parsing sections
 * keeps the record-detail render server-side and off the client's back — RECORD-SURFACE lane, 2026-09-04).
 *
 * WHY A SEPARATE PARSER FROM extract-sections.ts / extract-regulation-sections.ts (THE DEFECT THIS FIXES):
 * both of those parse a SYNTHESIZED full_brief's numbered/H1/H2 heading structure (`## 3. Issues
 * Requiring Immediate Action`, RegulationSections.tsx's KNOWN_KEYS = {"3","4","8","10","11","14","15"},
 * ResearchFindingDetailSurface.tsx's KNOWN_RESEARCH_KEYS = {"1".."6"}) — a record-grade full_brief has
 * NEITHER numbered sections nor any of those headings (buildRecordFullBrief's only headings are
 * "## Verbatim facts" / "## Not stated in the captured source"), and a record-grade item's
 * `intelligence_item_sections` rows carry section_key "identity" / "record_facts" /
 * "sources_and_citations" — none of which is in any existing KNOWN_KEYS set either. So for a record item,
 * extractOperationalBriefing(r.fullBrief) can never find content (RegulationDetailSurface's `mode ===
 * "full" && hasFull` gate can never open), and RegulationSections/ResearchSections silently return null
 * (section_key not recognised) — the record item's own sections were UNREACHABLE from any existing
 * renderer, not merely unstyled. This module reads the line format record-facts.mjs actually writes
 * instead of asking the brief-grade extractors to do a job their heading grammar cannot express.
 *
 * FORMAT THIS PARSES (see record-facts.mjs `extractSlotFact`/`extractIdentityFact`/
 * `extractBindingPositionFact`/`extractDueDateFact`/`extractCorridorFact` — one line per claim, `\n`-
 * joined into a section's `content_md`, verified against live rows 2026-09-04):
 *   FACT: `[slot_key] <prose ending in one or more «verbatim spans»>`
 *   GAP:  `[slot_key] No verbatim ... A full-brief regrounding will re-examine this gap when this item
 *          upgrades from record to brief.`
 * A GAP line is identified by the literal marker sentence above (present in EVERY GAP template
 * record-facts.mjs emits). The identity claim itself is never a GAP — record-facts.mjs's
 * extractIdentityFact emits NO claim at all when the title cannot be located, so an absent "identity"
 * section is the honest signal, not a GAP row. The verbatim span attribution shown per FACT is the LAST
 * guillemet-quoted (`«…»`) substring on the line — binding_position emits a vocabulary CODE first then
 * the quoted passage, corridor_identity emits the origin/dest LOCODEs first then the quoted passage; the
 * actual source passage is always the last pair in every record-facts.mjs template (verified by reading
 * that module and against live `intelligence_item_sections` rows, RECORD-SURFACE lane report).
 *
 * Deliberately independent of record-facts.mjs (no import): this module reads the STORED text a claim
 * became, not the extractor that produced it — a renderer, not a re-implementation of the mint pipeline.
 * Plain, dependency-free TS (types erased by Node's built-in stripping) so it runs under plain
 * `node --test`, same posture as load-detail-core.ts / regulation-obligations-core.ts.
 */

export type RecordClaimKind = "FACT" | "GAP";

export interface RecordFactRow {
  /** The slot_key from the claim's own `[slot_key]` prefix, e.g. "effective_date", "title". */
  slotKey: string;
  /** Humanized label for display, e.g. "Effective date". */
  label: string;
  kind: RecordClaimKind;
  /** The claim sentence with the `[slot_key]` prefix stripped. */
  text: string;
  /** The verbatim source span quoted in the claim (FACT rows only) — the LAST «…» pair on the line;
   *  null for a GAP row or a FACT row whose line carries no guillemet pair (should not occur in
   *  practice — record-facts.mjs's own assertVerbatim guard requires one — but never assumed). */
  span: string | null;
}

export interface ParsedRecordSections {
  /** Every FACT-kind row across the identity + record_facts sections, in document order (identity's
   *  "title" row, when present, listed first). */
  facts: RecordFactRow[];
  /** Every GAP-kind row from the record_facts section (identity never emits a GAP — see this file's
   *  header), in document order. */
  gaps: RecordFactRow[];
  /** Count of slot claims (FACT + GAP) in the record_facts section alone — the denominator for the
   *  honesty line ("N of M record fields not stated by the source"); deliberately excludes the
   *  identity/title claim, which is not one of an item_type's required record-field slots. */
  slotFieldCount: number;
  /** Source URL parsed from the "sources_and_citations" section's "Source: <url>" line, or null. */
  sourceUrl: string | null;
}

const GAP_MARKER =
  "A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.";
const CLAIM_LINE_RE = /^\[([a-z0-9_]+)\]\s*(.*)$/i;
const SPAN_RE = /«([^»]*)»/g;

/** Humanize a slot_key for display: underscores to spaces, first letter capitalized. Pure. */
export function humanizeSlotLabel(slotKey: string): string {
  const spaced = String(slotKey ?? "").replace(/_/g, " ").trim();
  if (!spaced) return "";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Extract the LAST «…» quoted substring on a line, or null when none. Pure. */
export function lastQuotedSpan(text: string): string | null {
  let last: string | null = null;
  for (const m of String(text ?? "").matchAll(SPAN_RE)) {
    last = m[1];
  }
  return last;
}

/** Parse one claim line (as record-facts.mjs wrote it) into a RecordFactRow, or null when the line does
 *  not carry a recognisable `[slot_key]` prefix (defensive — every real row does). Pure. */
export function parseRecordClaimLine(line: string): RecordFactRow | null {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return null;
  const m = CLAIM_LINE_RE.exec(trimmed);
  if (!m) return null;
  const [, slotKey, rest] = m;
  const isGap = rest.includes(GAP_MARKER);
  return {
    slotKey,
    label: humanizeSlotLabel(slotKey),
    kind: isGap ? "GAP" : "FACT",
    text: rest.trim(),
    span: isGap ? null : lastQuotedSpan(rest),
  };
}

/** Parse `content_md` into its claim-line rows, skipping blank lines and tolerating an optional leading
 *  "- " (record_facts/identity content_md is bare `\n`-joined claim_text with no leading dash;
 *  full_brief's own "## Verbatim facts" bullet list does prefix "- " — tolerating either input shape
 *  costs nothing and means a caller can hand this either source without a second code path). Pure. */
function parseClaimLines(contentMd: string): RecordFactRow[] {
  const lines = String(contentMd ?? "").split(/\r?\n/);
  const rows: RecordFactRow[] = [];
  for (const raw of lines) {
    const stripped = raw.replace(/^-\s+/, "");
    const row = parseRecordClaimLine(stripped);
    if (row) rows.push(row);
  }
  return rows;
}

/** Extract the source URL from a "sources_and_citations" section's "Source: <url>" line. Pure. */
export function parseSourceUrl(contentMd: string): string | null {
  const m = /^Source:\s*(\S+)\s*$/m.exec(String(contentMd ?? ""));
  return m ? m[1] : null;
}

export interface RecordSectionRowLike {
  section_key: string;
  content_md: string;
}

/**
 * Parse a record-grade item's `intelligence_item_sections` rows into a render-ready shape. Returns null
 * when neither an "identity" nor a "record_facts" row is present — the honest fallback signal for the
 * caller (a record-grade item with no extracted-facts sections written yet); callers must render an
 * honest empty state rather than inventing content on a null result.
 */
export function parseRecordSections(
  rows: RecordSectionRowLike[] | null | undefined
): ParsedRecordSections | null {
  const list = Array.isArray(rows) ? rows : [];
  const identityRow = list.find((r) => r.section_key === "identity");
  const factsRow = list.find((r) => r.section_key === "record_facts");
  const sourcesRow = list.find((r) => r.section_key === "sources_and_citations");
  if (!identityRow && !factsRow) return null;

  const identityRows = identityRow ? parseClaimLines(identityRow.content_md) : [];
  const slotRows = factsRow ? parseClaimLines(factsRow.content_md) : [];

  const facts = [...identityRows, ...slotRows].filter((r) => r.kind === "FACT");
  const gaps = slotRows.filter((r) => r.kind === "GAP");

  return {
    facts,
    gaps,
    slotFieldCount: slotRows.length,
    sourceUrl: sourcesRow ? parseSourceUrl(sourcesRow.content_md) : null,
  };
}

/** Slot keys whose FACT, when present, states a date or force-status — the "Key dates" grouping the
 *  record Summary highlights separately from the general fact list. */
export const KEY_DATE_SLOTS = new Set(["effective_date", "due_date", "primary_deadline"]);

/** Split a parsed FACT list into {dateFacts, otherFacts} by KEY_DATE_SLOTS membership, each preserving
 *  original order. Pure — a plain array partition, not a re-parse. */
export function splitKeyDateFacts(facts: RecordFactRow[]): {
  dateFacts: RecordFactRow[];
  otherFacts: RecordFactRow[];
} {
  const dateFacts: RecordFactRow[] = [];
  const otherFacts: RecordFactRow[] = [];
  for (const f of facts) {
    (KEY_DATE_SLOTS.has(f.slotKey) ? dateFacts : otherFacts).push(f);
  }
  return { dateFacts, otherFacts };
}
