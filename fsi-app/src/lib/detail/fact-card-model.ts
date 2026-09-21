// src/lib/detail/fact-card-model.ts
//
// Lane w10-factcard (2026-09-20). Converts an already-classified `FactParagraph`
// (src/lib/detail/fact-paragraphs.ts's `parseFactParagraphs`/`classifyParagraph`) into
// zero or more `FactCardModel` objects: the render-ready shape src/components/ui/FactCard.tsx
// v2 consumes. This module EXTENDS fact-paragraphs.ts (imports its parser and its FACT/
// ANALYSIS/LEGAL vocabulary) rather than re-parsing content_md from scratch - per
// docs/design/parts-brief-2026-09-18.md section 2.1's "Pipeline mapping" and the lane
// brief's "extend that parser, do not write a second one".
//
// Pure, render-time, no I/O. Never writes back to the database. Never invents a fact
// or a figure the source text does not carry (CLAUDE.md rule 2 / the skill's Integrity
// Rule) - a claim with no bold figure gets no invented figure lead.

import type { FactParagraph } from "./fact-paragraphs.ts";
import { parseFactParagraphs, parseSourceCitation } from "./fact-paragraphs.ts";
import { hostFromUrl } from "../entities/host-from-url.mjs";

// ── Fixed kind vocabulary (parts-brief-2026-09-18.md section 2.1) ──────────────────────

export const FACT_CARD_KINDS = [
  "ACTION REQUIRED",
  "LEGAL CONFIRMATION REQUIRED",
  "DEADLINE",
  "BASELINE TARGET",
  "NATIONAL TARGET",
  "SCOPE",
  "PENALTY",
  "DEFINITION",
  "ANALYTICAL INFERENCE",
] as const;

export type FactCardKind = (typeof FACT_CARD_KINDS)[number];

/** The 8 kind words that can appear as a bolded lead-in inside a FACT paragraph.
 *  ANALYTICAL INFERENCE and LEGAL CONFIRMATION REQUIRED are reached only through the
 *  paragraph's own classification (fact-paragraphs.ts's "inference"/"counsel" kinds) or
 *  through the embedded-sentence split below, never through this lead-in match - a bolded
 *  "**Legal Confirmation Required.**" dot-form lead-in is still routed here for completeness
 *  since the artboard shows it in the kind band the same way as the other seven. */
const LEAD_IN_KINDS: FactCardKind[] = [
  "ACTION REQUIRED",
  "LEGAL CONFIRMATION REQUIRED",
  "DEADLINE",
  "BASELINE TARGET",
  "NATIONAL TARGET",
  "SCOPE",
  "PENALTY",
  "DEFINITION",
];

const IMPERATIVE_LEADS = ["Register", "Confirm", "Ask", "Budget", "File", "Request", "Map"];

export interface ClaimNode {
  text: string;
  bold?: boolean;
  /** Present only on an inline link node (lane w10-factcard-c, 2026-09-21): a bare URL left
   *  embedded in a claim's body after `extractProvenance` below has already promoted the claim's
   *  OWN trailing/first citation URL to the provenance column. `text` for a link node is always
   *  `hostFromUrl(href)` - the same "host as visible text" treatment the provenance column's own
   *  anchor already uses (F30), never a second URL formatter (F45, rule against a duplicate
   *  formatting implementation). */
  href?: string | null;
}

export interface FactCardProvenance {
  tier?: number | null;
  source?: string | null;
  org?: string | null;
  href?: string | null;
  accessed?: string | null;
}

export interface FactCardModel {
  kind: FactCardKind;
  qualifier?: string | null;
  figureLead?: string | null;
  figureSubLabel?: string | null;
  claim: ClaimNode[];
  provenance?: FactCardProvenance | null;
}

// ── Step 1: bolded lead-in -> kind word (rule: unknown lead-in -> SCOPE) ───────────────

function buildLeadInRegex(): RegExp {
  // Longest-first so "LEGAL CONFIRMATION REQUIRED" matches before a hypothetical shorter
  // prefix would. Matches "**KIND WORD.**" or "**KIND WORD:**" at the very start of the
  // text, tolerant of a trailing period/colon inside or outside the closing asterisks.
  const words = [...LEAD_IN_KINDS].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // A leading quote character (straight or curly) is tolerated before the lead-in: a nested
  // quoted term later in the same claim can defeat fact-paragraphs.ts's own outer-quote
  // unwrap (its guard only strips the outer pair when no quote character appears inside),
  // leaving one stray leading quote on the text this module receives.
  return new RegExp(`^["'“]?\\s*\\*{1,2}\\s*(${words.join("|")})\\s*[.:]?\\s*\\*{0,2}\\s*`, "i");
}
const LEAD_IN_RE = buildLeadInRegex();

/** Splits a FACT paragraph's text into { kind, rest }. When the text opens with a
 *  recognised bolded kind word, that word becomes the kind and is stripped. When it opens
 *  with an UNKNOWN bolded lead-in (some other all-caps bold phrase) or no bolded lead-in
 *  at all, the rule is "unknown lead-in -> SCOPE" and the text is left untouched (a bolded
 *  phrase that isn't the kind vocabulary is not a lead-in to strip, it is part of the
 *  claim). */
function kindFromLeadIn(text: string): { kind: FactCardKind; rest: string } {
  const m = LEAD_IN_RE.exec(text);
  if (m) {
    const matched = m[1].toUpperCase();
    const kind = LEAD_IN_KINDS.find((k) => k === matched);
    if (kind) return { kind, rest: text.slice(m[0].length).trim() };
  }
  return { kind: "SCOPE", rest: text };
}

// ── Step 2: embedded LEGAL/ANALYSIS sentence split ─────────────────────────────────────

const EMBEDDED_SPLIT_RE =
  /(?:\*{1,2}\s*)?(Legal Confirmation Required|Analytical inference|Industry interpretation|Operational implication)\s*:\s*(?:\*{0,2}\s*)?/gi;

const HUMANIZED: Record<string, string> = {
  "legal confirmation required": "Legal Confirmation Required",
  "analytical inference": "Analytical inference",
  "industry interpretation": "Industry interpretation",
  "operational implication": "Operational implication",
};

interface SplitPiece {
  kind: FactCardKind | null; // null = base/unsplit remainder, keeps the caller's kind
  qualifier?: string | null;
  text: string;
}

/** Finds every embedded "Legal Confirmation Required:"/"Analytical inference:"/etc.
 *  sentence INSIDE a body (not necessarily at position 0 - position 0 is already handled
 *  upstream by fact-paragraphs.ts's own counsel/inference paragraph classification) and
 *  splits it into its own piece. Text before the first match (if any) is the base piece. */
function splitEmbeddedSentences(text: string): SplitPiece[] {
  const matches = [...text.matchAll(EMBEDDED_SPLIT_RE)];
  if (matches.length === 0) return [{ kind: null, text }];

  const pieces: SplitPiece[] = [];
  const first = matches[0];
  const before = text.slice(0, first.index).trim();
  if (before) pieces.push({ kind: null, text: before });

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    const humanized = HUMANIZED[m[1].toLowerCase()];
    const kind: FactCardKind = humanized === "Legal Confirmation Required" ? "LEGAL CONFIRMATION REQUIRED" : "ANALYTICAL INFERENCE";
    pieces.push({ kind, qualifier: kind === "ANALYTICAL INFERENCE" ? humanized : null, text: text.slice(start, end).trim() });
  }
  return pieces;
}

// ── Step 3: provenance extraction (trailing *Source: ...* / bare Source: / raw URL) ────

const TRAILING_SOURCE_RE = /\*?\s*Source:\s*([\s\S]+?)\*?\s*$/i;
const URL_ANYWHERE_RE = /https?:\/\/[^\s)\]}"'<>]+/;
const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/;

/** Pulls a trailing "*Source: [Title], [Issuing Body], [Date]. [URL].*" citation (or a
 *  bare "Source: ..." trailer, or a bare raw URL, or a markdown link) off the END of a
 *  claim, per the rule: "a URL never appears in running text." Returns the claim text with
 *  the trailer removed and the provenance it found, or null provenance when nothing to
 *  extract. Never invents an org/date the text does not carry. */
function extractProvenance(text: string): { text: string; provenance: FactCardProvenance | null } {
  const sourceMatch = TRAILING_SOURCE_RE.exec(text);
  if (sourceMatch) {
    const before = text.slice(0, sourceMatch.index).trim();
    const parsed = parseSourceCitation(sourceMatch[1]);
    return {
      text: before,
      provenance: { source: parsed.title, org: parsed.issuer, accessed: parsed.date, href: parsed.url, tier: null },
    };
  }

  const linkMatch = MD_LINK_RE.exec(text);
  if (linkMatch) {
    const cleaned = (text.slice(0, linkMatch.index) + linkMatch[1] + text.slice(linkMatch.index! + linkMatch[0].length)).trim();
    return { text: cleaned, provenance: { href: linkMatch[2], source: hostFromUrl(linkMatch[2]), org: null, accessed: null, tier: null } };
  }

  const urlMatch = URL_ANYWHERE_RE.exec(text);
  if (urlMatch) {
    const cleaned = (text.slice(0, urlMatch.index) + text.slice(urlMatch.index + urlMatch[0].length)).trim();
    return { text: cleaned, provenance: { href: urlMatch[0], source: hostFromUrl(urlMatch[0]), org: null, accessed: null, tier: null } };
  }

  return { text, provenance: null };
}

// ── Step 4: markdown-strip claim text into structured inline nodes ─────────────────────

/** Strips every markdown control character the rule forbids (`*`, `#`, backtick,
 *  `[text](url)`) and returns an ordered list of { text, bold } nodes. `**bold**` spans
 *  become bold nodes; everything else (including a lone `*italic*` marker, which the rule
 *  gives no separate node type for) is stripped to plain text - no `*` survives into any
 *  node. Never returns an HTML string or a markdown string; always a node array.
 *
 *  Lane w10-factcard-c (2026-09-21) defect 1: a claim carrying an embedded markdown list line
 *  ("sentence. \n- **Name**, title ...") reached the card's <p> with the raw "\n- " surviving -
 *  measured live, market detail, `[data-part="fact-card"] <p>` text beginning "May 6, 2026. \n-
 *  **". `ClaimNode[]` has no list-item node type (fact-card-model.ts carries no block-level
 *  structure at all - see the header note above), so the fix this structure already supports is
 *  INLINE: fold the list marker into flowing prose rather than rendering a real list, per the
 *  lane brief's "or the model splits it into the claim plus a list block, whichever the model's
 *  existing structure already supports" - the existing structure supports inline only. */
export function toClaimNodes(raw: string): ClaimNode[] {
  let text = raw
    .replace(/^\s*#{1,6}\s*/, "") // leading heading marker
    .replace(/`+/g, ""); // backticks

  // Markdown links: keep the visible text, drop the URL (provenance already claimed URLs
  // upstream; any link surviving to here is inline and its href is dropped rather than
  // silently left in running text).
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Embedded list marker -> inline prose (defect 1, see header note above). A marker at the very
  // start of the text, or after a newline, becomes a single space; any remaining newline (a list
  // continuation with no marker, or a stray line break) collapses the same way, then runs of
  // spaces/tabs left behind by the collapse are squeezed to one.
  text = text
    .replace(/^[ \t]*[-*]\s+/, "")
    .replace(/\n[ \t]*[-*]\s+/g, " ")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  const nodes: ClaimNode[] = [];
  const boldRe = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = boldRe.exec(text))) {
    if (m.index > last) nodes.push({ text: stripStrayAsterisks(text.slice(last, m.index)) });
    nodes.push({ text: stripStrayAsterisks(m[1]), bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push({ text: stripStrayAsterisks(text.slice(last)) });

  return nodes.filter((n) => n.text.length > 0).flatMap(splitEmbeddedLinks);
}

function stripStrayAsterisks(s: string): string {
  return s.replace(/\*/g, "").trim();
}

const CLAIM_URL_RE = /https?:\/\/[^\s)\]}"'<>]+/g;

/** Lane w10-factcard-c (2026-09-21) defect 2. `extractProvenance` (below) promotes ONE url out of
 *  a claim - the claim's own trailing citation, or the first bare url anywhere in it - to the
 *  provenance column. A claim carrying a SECOND, independent url (measured live, market detail: a
 *  citation line, publisher and date, then a bare url) still had that second url sitting in the
 *  claim body, reaching `renderClaim`'s plain (non-bold) branch, which wraps it in a `<span>` with
 *  no `<a>` - the exact "bare url in a `<span>`" shape amendment 1 named. This splits every
 *  REMAINING url in a node's text into its own link node, `text` set to `hostFromUrl(href)` - the
 *  same "host as visible text" anchor the provenance column already renders (F30), never a second
 *  url formatter (F45). Never called on a node produced by the bold-span loop above until after
 *  that loop, so a bold url (rare, unseen in the corpus) is still caught. */
function splitEmbeddedLinks(node: ClaimNode): ClaimNode[] {
  const re = new RegExp(CLAIM_URL_RE);
  const parts: ClaimNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(node.text))) {
    if (m.index > last) parts.push({ text: node.text.slice(last, m.index), bold: node.bold });
    parts.push({ text: hostFromUrl(m[0]), href: m[0] });
    last = m.index + m[0].length;
  }
  if (parts.length === 0) return [node];
  if (last < node.text.length) parts.push({ text: node.text.slice(last), bold: node.bold });
  return parts.filter((n) => n.text.length > 0);
}

// ── Step 5: figure lead extraction ─────────────────────────────────────────────────────

const DIGIT_RE = /\d/;

function figureLeadFor(kind: FactCardKind, claim: ClaimNode[]): string | null {
  if (kind === "ANALYTICAL INFERENCE") return null; // rule: no lead for inference

  const boldFigure = claim.find((n) => n.bold && DIGIT_RE.test(n.text));
  if (boldFigure) return boldFigure.text;

  if (kind === "ACTION REQUIRED" || kind === "LEGAL CONFIRMATION REQUIRED") {
    const firstWord = claim
      .map((n) => n.text)
      .join(" ")
      .trim()
      .split(/\s+/)[0]
      ?.replace(/[.,:;]$/, "");
    const canonical = IMPERATIVE_LEADS.find((v) => v.toLowerCase() === (firstWord || "").toLowerCase());
    return canonical ?? null;
  }

  return null; // rule: every other case with no bold figure ends with no lead
}

// ── Assembly ────────────────────────────────────────────────────────────────────────────

function paragraphToPieces(paragraph: FactParagraph): { kind: FactCardKind; qualifier: string | null; text: string }[] {
  if (paragraph.kind === "counsel") {
    return splitEmbeddedSentences(paragraph.text).map((p) => ({
      kind: p.kind ?? "LEGAL CONFIRMATION REQUIRED",
      qualifier: p.qualifier ?? null,
      text: p.text,
    }));
  }
  if (paragraph.kind === "inference") {
    return splitEmbeddedSentences(paragraph.text).map((p) => ({
      kind: p.kind ?? "ANALYTICAL INFERENCE",
      qualifier: p.qualifier ?? paragraph.label ?? null,
      text: p.text,
    }));
  }
  if (paragraph.kind === "fact") {
    const { kind, rest } = kindFromLeadIn(paragraph.text);
    return splitEmbeddedSentences(rest).map((p) => ({
      kind: p.kind ?? kind,
      qualifier: p.qualifier ?? null,
      text: p.text,
    }));
  }
  return []; // "prose" is not a fact card (FactBlocks renders it via GfmSection instead)
}

/** The one entry point: FactParagraph -> zero or more render-ready FactCardModel objects.
 *  A "fact" paragraph carrying an embedded Legal/Analysis sentence yields more than one
 *  card; every other paragraph yields exactly one (or zero, for "prose"). */
export function deriveFactCardModels(paragraph: FactParagraph): FactCardModel[] {
  const pieces = paragraphToPieces(paragraph);
  const models: FactCardModel[] = [];

  for (const piece of pieces) {
    if (!piece.text) continue;
    const { text: withoutProvenance, provenance } = extractProvenance(piece.text);
    // "fact" paragraphs already carry structured source data from fact-paragraphs.ts's own
    // SOURCE_RE match (paragraph.source); prefer that over a re-derived one when the piece
    // is the paragraph's own base text (not a split-off Legal/Analysis sentence), since it
    // is already correctly parsed and re-scanning could miss a citation fact-paragraphs.ts
    // already isolated outside `text`.
    const structuredSource =
      paragraph.kind === "fact" && paragraph.source && pieces.length === 1
        ? { source: paragraph.source.title, org: paragraph.source.issuer, accessed: paragraph.source.date, href: paragraph.source.url, tier: null }
        : null;
    const finalProvenance = structuredSource ?? provenance;

    const claim = toClaimNodes(withoutProvenance);
    if (claim.length === 0) continue;

    models.push({
      kind: piece.kind,
      qualifier: piece.qualifier,
      figureLead: figureLeadFor(piece.kind, claim),
      figureSubLabel: null, // no structured field reaches this pure text parser; see report
      claim,
      provenance: finalProvenance,
    });
  }

  return models;
}

/** Convenience wrapper: content_md -> FactCardModel[] in one call, for callers that don't
 *  need the intermediate FactParagraph[] (mirrors parseFactParagraphs's own signature). */
export function parseFactCardModels(markdown: string | null | undefined): FactCardModel[] {
  return parseFactParagraphs(markdown).flatMap(deriveFactCardModels);
}

/** Amendment 1 ruling B.3 (coordinator, 2026-09-20): "a deterministic field-to-kind table in
 *  the model module. A record field maps to DEADLINE, PENALTY, DEFINITION, SCOPE, BASELINE
 *  TARGET or NATIONAL TARGET only where the field's own key makes the meaning unambiguous
 *  (name the keys in a table with a test); everything else is SCOPE."
 *
 *  Every `slot_key` this table matches against is read from `src/lib/intake/record-facts.mjs`
 *  (the mint-time extractor that writes the `[slot_key]` prefix `parse-record-sections.ts`
 *  reads back) - the full slot vocabulary observed there, 2026-09-20: `title`,
 *  `effective_date`, `primary_deadline`, `jurisdictional_scope`, `penalty_summary`,
 *  `evidence_agreement_signal`, `source_authority_signal`, `operative_provision`, `addressee`,
 *  `binding_position`, `due_date`, `corridor_identity`, `in_force_status`. No slot key in this
 *  vocabulary names a BASELINE TARGET or NATIONAL TARGET row today - the two kinds are in the
 *  fixed vocabulary for pipeline-authored fact paragraphs (fact-paragraphs.ts's bolded
 *  lead-ins), not for record-grade rows, so this table has no entries for them; a slot key
 *  that is genuinely a target figure in the future is a new, named addition here, never a
 *  guess.
 *
 *  Only three keys are unambiguous DEADLINE-kind dates (a date the workspace must act by or
 *  that the instrument itself takes effect on): `effective_date`, `primary_deadline`,
 *  `due_date`. Only one is unambiguous PENALTY: `penalty_summary`. `jurisdictional_scope` is
 *  already the SCOPE word itself, named here so the mapping is complete and testable rather
 *  than implicit in the fallback. Every other slot key (`title`, `operative_provision`,
 *  `addressee`, `binding_position`, `corridor_identity`, `in_force_status`,
 *  `evidence_agreement_signal`, `source_authority_signal`) is NOT unambiguous under this rule
 *  - `operative_provision` sounds like it could be DEFINITION but a record row's provenance
 *  extraction gives no reliable signal that the row states a defined TERM rather than a
 *  requirement or a scope statement - and falls to SCOPE, the same "unknown -> SCOPE" rule the
 *  pipeline path already uses for a bolded lead-in it cannot classify. */
const RECORD_SLOT_KIND: Record<string, FactCardKind> = {
  effective_date: "DEADLINE",
  primary_deadline: "DEADLINE",
  due_date: "DEADLINE",
  penalty_summary: "PENALTY",
  jurisdictional_scope: "SCOPE",
};

/** Record-grade fact rows (src/lib/agent/parse-record-sections.ts's `RecordFactRow`, the
 *  verbatim-span facts on record-grade items) carry a `slotKey` and a humanized `label`
 *  ("Effective date", "Penalty amount") rather than a bolded lead-in from the pipeline's fixed
 *  kind vocabulary. `RECORD_SLOT_KIND` above (ruling B.3) maps the unambiguous slot keys onto
 *  the fixed vocabulary; every other slot key falls to SCOPE, per the same "unknown lead-in ->
 *  SCOPE" rule the pipeline path uses. The record's own field label is always shown as the
 *  qualifier regardless of kind - it is the closest available "what specific fact is this"
 *  signal and the brief does not ask for it to be dropped once a kind is assigned. */
export function deriveRecordFactCardModel(fact: {
  slotKey?: string | null;
  label: string;
  span: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  tier?: number | null;
}): FactCardModel | null {
  if (!fact.span) return null;
  const kind = (fact.slotKey && RECORD_SLOT_KIND[fact.slotKey]) || "SCOPE";
  return {
    kind,
    qualifier: fact.label,
    figureLead: null,
    figureSubLabel: null,
    claim: toClaimNodes(fact.span),
    provenance: {
      source: fact.sourceName ?? null,
      org: null,
      href: fact.sourceUrl ?? null,
      accessed: null,
      tier: fact.tier ?? null,
    },
  };
}

/** Reporting helper (lane brief item 1's "count every card that ends with no lead"). Groups
 *  the non-inference, no-lead-figure cards by kind and returns up to `sampleSize` example
 *  claims per kind. This is a pure aggregate over whatever models the caller passes in - it
 *  does not read the database itself; a caller with corpus access runs this over the real
 *  corpus's parsed models. */
export function countNoLeadCards(
  models: FactCardModel[],
  sampleSize = 3
): { kind: FactCardKind; count: number; examples: string[] }[] {
  const byKind = new Map<FactCardKind, { count: number; examples: string[] }>();
  for (const m of models) {
    if (m.kind === "ANALYTICAL INFERENCE") continue;
    if (m.figureLead) continue;
    const entry = byKind.get(m.kind) ?? { count: 0, examples: [] };
    entry.count += 1;
    if (entry.examples.length < sampleSize) {
      entry.examples.push(m.claim.map((n) => n.text).join(" ").slice(0, 120));
    }
    byKind.set(m.kind, entry);
  }
  return [...byKind.entries()].map(([kind, v]) => ({ kind, ...v }));
}
