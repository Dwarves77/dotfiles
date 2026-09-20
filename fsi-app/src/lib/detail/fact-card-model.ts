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
 *  node. Never returns an HTML string or a markdown string; always a node array. */
export function toClaimNodes(raw: string): ClaimNode[] {
  let text = raw
    .replace(/^\s*#{1,6}\s*/, "") // leading heading marker
    .replace(/`+/g, ""); // backticks

  // Markdown links: keep the visible text, drop the URL (provenance already claimed URLs
  // upstream; any link surviving to here is inline and its href is dropped rather than
  // silently left in running text).
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

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

  return nodes.filter((n) => n.text.length > 0);
}

function stripStrayAsterisks(s: string): string {
  return s.replace(/\*/g, "").trim();
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

/** Record-grade fact rows (src/lib/agent/parse-record-sections.ts's `RecordFactRow`, the
 *  verbatim-span facts on record-grade items) carry a free-form field label ("Effective
 *  date", "Penalty amount") rather than a bolded lead-in from the pipeline's fixed kind
 *  vocabulary - there is no rule in parts-brief-2026-09-18.md section 2.1 for mapping an
 *  arbitrary record-field label onto one of the nine kind words. UNRESOLVED, flagged in the
 *  lane report: this helper uses the same "unknown lead-in -> SCOPE" fallback the pipeline
 *  path uses for a bolded lead-in it cannot classify, and shows the record's own field label
 *  as the qualifier (the closest available "what is this card" signal) rather than inventing
 *  a kind-vocabulary mapping the brief never specified. */
export function deriveRecordFactCardModel(fact: {
  label: string;
  span: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  tier?: number | null;
}): FactCardModel | null {
  if (!fact.span) return null;
  return {
    kind: "SCOPE",
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
