type RecordClaimKind = "FACT" | "GAP";

/** One claim's rating, resolved by the caller (server-side, one query — see this file's TIER-CHIP
 *  header) and attached here purely by exact-line lookup. `tier` is the SAME derivation
 *  `validate_item_provenance` criterion 3 uses as of migration 145: `COALESCE(sources.tier_override,
 *  sources.base_tier)` for the claim's `source_id` — never `effective_tier`. `null` is an honest,
 *  distinct state from "chip omitted": a caller MAY pass an entry with `tier: null` for a claim whose
 *  `source_id` resolved to a source carrying neither `base_tier` nor `tier_override` (migration 141
 *  criterion-1's own `source_tier_null` case) — rendered the same as "unmatched", never invented. */
export interface ClaimTierInfo {
  tier: number | null;
  sourceName: string | null;
  sourceUrl: string | null;
}

/** Keyed by the FULL trimmed claim line (this file's `rawLine` — byte-identical to
 *  `section_claim_provenance.claim_text` for the same claim; see the TIER-CHIP header's MATCH RULE). */
export type ClaimTierMap = Record<string, ClaimTierInfo>;

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
  /** The full trimmed line exactly as read from content_md, INCLUDING the `[slot_key]` prefix — the
   *  `claimTiers` lookup key (see this file's TIER-CHIP header). Not meant for display. */
  rawLine: string;
  /** This claim's rating (TIER-CHIP lane), or null when no `claimTiers` map was supplied, this row is a
   *  GAP (a GAP claim has no source to rate), or the line has no entry in the map (unmatched — honest
   *  "unrated", never a guess). */
  tier: number | null;
  sourceName: string | null;
  sourceUrl: string | null;
}

interface ParsedRecordSections {
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
 *  not carry a recognisable `[slot_key]` prefix (defensive — every real row does). `claimTiers`
 *  (optional) attaches this row's rating by exact-line lookup — see this file's TIER-CHIP header for the
 *  match rule; omitted entirely, every tier field is null (backward compatible with every pre-existing
 *  caller). A GAP row NEVER looks itself up (a GAP claim has no source to rate — attempting the lookup
 *  would risk a coincidental map entry rendering a rating on a claim that states the opposite). Pure. */
export function parseRecordClaimLine(line: string, claimTiers?: ClaimTierMap): RecordFactRow | null {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return null;
  const m = CLAIM_LINE_RE.exec(trimmed);
  if (!m) return null;
  const [, slotKey, rest] = m;
  const isGap = rest.includes(GAP_MARKER);
  const info = !isGap && claimTiers ? claimTiers[trimmed] ?? null : null;
  return {
    slotKey,
    label: humanizeSlotLabel(slotKey),
    kind: isGap ? "GAP" : "FACT",
    text: rest.trim(),
    span: isGap ? null : lastQuotedSpan(rest),
    rawLine: trimmed,
    tier: info?.tier ?? null,
    sourceName: info?.sourceName ?? null,
    sourceUrl: info?.sourceUrl ?? null,
  };
}

/** Parse `content_md` into its claim-line rows, skipping blank lines and tolerating an optional leading
 *  "- " (record_facts/identity content_md is bare `\n`-joined claim_text with no leading dash;
 *  full_brief's own "## Verbatim facts" bullet list does prefix "- " — tolerating either input shape
 *  costs nothing and means a caller can hand this either source without a second code path). NOTE: the
 *  "- " strip happens BEFORE the claimTiers lookup key is captured (`rawLine` is the stripped line), so a
 *  full_brief-sourced "- [slot] ..." line still matches the same `claim_text`-shaped key a
 *  content_md-sourced caller would produce — the one real call path (RecordGradeSummary et al. always
 *  hand this section rows, never full_brief) never exercises the "- " strip at all, but a hypothetical
 *  caller that did would still match correctly. Pure. */
function parseClaimLines(contentMd: string, claimTiers?: ClaimTierMap): RecordFactRow[] {
  const lines = String(contentMd ?? "").split(/\r?\n/);
  const rows: RecordFactRow[] = [];
  for (const raw of lines) {
    const stripped = raw.replace(/^-\s+/, "");
    const row = parseRecordClaimLine(stripped, claimTiers);
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
 *
 * `claimTiers` (optional, TIER-CHIP lane): the item's FACT claims' ratings, keyed by exact claim line —
 * see this file's TIER-CHIP header for how the caller builds this (one query joining
 * `section_claim_provenance` to `sources`) and the match rule / failure mode. Omitted entirely, every
 * `RecordFactRow.tier` is null — byte-identical to this function's pre-TIER-CHIP behaviour, so every
 * pre-existing caller (and this file's own pre-TIER-CHIP tests) is unaffected.
 */
export function parseRecordSections(
  rows: RecordSectionRowLike[] | null | undefined,
  claimTiers?: ClaimTierMap
): ParsedRecordSections | null {
  const list = Array.isArray(rows) ? rows : [];
  const identityRow = list.find((r) => r.section_key === "identity");
  const factsRow = list.find((r) => r.section_key === "record_facts");
  const sourcesRow = list.find((r) => r.section_key === "sources_and_citations");
  if (!identityRow && !factsRow) return null;

  const identityRows = identityRow ? parseClaimLines(identityRow.content_md, claimTiers) : [];
  const slotRows = factsRow ? parseClaimLines(factsRow.content_md, claimTiers) : [];

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
