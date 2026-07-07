// SINGLE SOURCE for entity detection (phase-intake-gate). Two durable regex families (identifiers, never
// drift) + one LIVING dictionary of named standards/frameworks (drifts — pinned by a vocab-drift-guard test,
// the Step-3 pattern). Detection is WIDER than wiring: identifiers + dict-named + standard-SHAPED are all
// NOTICED; only identifier-exact and dict-named-exact are wire-eligible; a standard-shaped mention unknown to
// the dictionary is still noticed → surfaced, never dropped (fails safe). Topical words (batteries, emissions)
// are structurally NOT detected here, so they can never be wired.

// ── Identifier families (durable; no dictionary needed) ──
// EU instrument number "2023/1805", "2019/1242"; CELEX "32023R1805". Case-insensitive, word-bounded.
export const RE_REGNUM = /\b(?:19|20)\d{2}\/\d{1,4}\b/g;
export const RE_CELEX = /\b(?:CELEX[:\s]*)?[36]\d{4}[A-Z]\d{2,4}\b/gi;

// ── Standard-SHAPED net (wide; NOTICE even when not in the dictionary) ──
// ISO/IEC 14083, EN 16258, "Regulation (EU) 2023/1805", "Directive (EU) 2024/1799".
export const RE_STD_SHAPED = /\bISO(?:\/IEC)?\s?\d{3,5}(?:[:-]\d{4})?\b|\bEN\s?\d{3,5}\b|\b(?:Regulation|Directive)\s*\(EU\)\s*(?:19|20)\d{2}\/\d{1,4}\b/gi;

// ── LIVING dictionary of NAMED standards/frameworks/programmes (canonical → alias regexes) ──
// Each names ONE specific instrument. Additions are deliberate (a drift-guard test pins the count).
// A mention that LOOKS like a standard (RE_STD_SHAPED) but is NOT here is surfaced as a candidate.
export const NAMED_ENTITIES = [
  { canonical: "ISO 14083", re: /\biso[\s-]?14083\b/i },
  { canonical: "ISO 14064", re: /\biso[\s-]?14064\b/i },
  { canonical: "EN 16258", re: /\ben[\s-]?16258\b/i },
  { canonical: "GHG Protocol", re: /\bghg\s*protocol\b/i },
  { canonical: "GLEC Framework", re: /\bglec\b/i },
  { canonical: "CBAM", re: /\bcbam\b|carbon border adjustment mechanism/i },
  { canonical: "CORSIA", re: /\bcorsia\b/i },
  { canonical: "AFIR", re: /\bafir\b|alternative fuels infrastructure regulation/i },
  { canonical: "EUDR", re: /\beudr\b|eu deforestation regulation/i },
  { canonical: "CSRD", re: /\bcsrd\b|corporate sustainability reporting directive/i },
  { canonical: "ReFuelEU Aviation", re: /\brefuel\s?eu\b/i },
  { canonical: "FuelEU Maritime", re: /\bfuel\s?eu\s+maritime\b/i },
  { canonical: "EEXI", re: /\beexi\b/i },
  { canonical: "CII", re: /\bcarbon intensity indicator\b|\bcii\b/i },
  { canonical: "MARPOL", re: /\bmarpol\b/i },
  { canonical: "ISSB", re: /\bissb\b/i },
  { canonical: "IFRS S2", re: /\bifrs\s?s2\b/i },
  { canonical: "SBTi", re: /\bsbti\b|science[\s-]based targets/i },
  { canonical: "GRI Standards", re: /\bgri\s+standards\b/i },
  { canonical: "Fit for 55", re: /\bfit\s+for\s+55\b/i },
];

// The count the drift-guard pins — bump deliberately when NAMED_ENTITIES changes.
export const NAMED_ENTITIES_COUNT = 20;
