// @ts-check
// HOLDINGS-AUDIT PURE CORE (operator dispatch 2026-07-14, "SUPABASE HOLDINGS AUDIT", amended).
//
// Classifies a stored capture (a raw_fetches snapshot body, or a pool aggregate) against KNOWN DEFECT
// CLASSES. It NEVER proves completeness (operator amendment): completeness='NO-KNOWN-DEFECT' means "no
// defect THIS audit can detect", not "provably whole". The integrity guarantee is grounding-side (the
// floor-first truncation moat in source-credibility-model / source-blocks.mjs). This core is the
// deterministic, node-testable classifier; all DB + Storage I/O lives in scripts/holdings-audit.mjs.
//
// Completeness vocabulary (closed): NO-KNOWN-DEFECT | TRUNCATED | FURNITURE | STUB.
// Sufficiency vocabulary (closed):  covers_grounding | corroborators_only | insufficient.

import { authorityFloorFor } from "../agent/source-blocks.mjs";

/** A snapshot at/below this size is a stub/error shell (JS app skeleton, 40x/50x body). Mirrors holdings-gate. */
export const STUB_MAX_BYTES = 1000;
/** Furniture = a substantial HTML payload whose visible text is negligible (chrome/nav/script only). */
export const FURNITURE_MIN_BYTES = 4000;
export const FURNITURE_MAX_CLEAN = 1500;
export const FURNITURE_MAX_RATIO = 0.15;

/**
 * PURE. Registrable-domain → publisher shape, for the structural completeness rules. Only the four shapes
 * the operator named carry structural markers; everything else is 'other' (no structural assertion made).
 * @param {string|null|undefined} url
 * @returns {'eur-lex'|'legislation.gov.uk'|'federal-register'|'gazette'|'other'}
 */
export function detectPublisherShape(url) {
  const u = String(url || "").toLowerCase();
  if (!u) return "other";
  if (/eur-lex\.europa\.eu|\beurlex\b/.test(u)) return "eur-lex";
  if (/legislation\.gov\.uk/.test(u)) return "legislation.gov.uk";
  if (/federalregister\.gov|govinfo\.gov|ecfr\.gov/.test(u)) return "federal-register";
  if (/gazette|gazzetta|boe\.es|legifrance|bundesanzeiger|staatsblad|dziennik|gesetzblatt/.test(u)) return "gazette";
  return "other";
}

/**
 * PURE. Visible-text length after stripping script/style/tags + collapsing whitespace. A cheap furniture
 * proxy — NOT a full DOM render, deliberately (deterministic, node-only, $0). @param {string} body
 * @returns {number}
 */
export function cleanTextLength(body) {
  return extractCleanText(body).length;
}

/** PURE. Strip script/style/tags, decode a few common entities, collapse whitespace. @param {string} body */
export function extractCleanText(body) {
  return String(body || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * PURE. Publisher-shape structural-truncation check: does the body have the publisher's OPENING structure
 * but lack its MANDATORY CLOSING formula? Fires ONLY on strong evidence (opening present, closing absent),
 * so a genuinely whole doc is never falsely flagged. Shapes without reliable markers ('gazette'/'other')
 * never fire (returns {truncated:false, checked:false}). Operates on clean text so markup can't hide a marker.
 * @param {string} cleanText
 * @param {'eur-lex'|'legislation.gov.uk'|'federal-register'|'gazette'|'other'} shape
 * @returns {{ truncated: boolean, checked: boolean, evidence: string|null }}
 */
export function structuralTruncation(cleanText, shape) {
  const t = String(cleanText || "");
  if (shape === "eur-lex") {
    const hasOpening = /\bArticle\s+1\b/.test(t);
    const hasClosing = /(shall be binding in its entirety|shall enter into force|Done at\s+[A-Z]|For the European Parliament|For the Council)/i.test(t);
    if (hasOpening && !hasClosing) return { truncated: true, checked: true, evidence: "eur-lex: Article 1 present but no binding/enter-into-force/Done-at closing formula" };
    return { truncated: false, checked: true, evidence: null };
  }
  if (shape === "legislation.gov.uk") {
    const hasOpening = /(Citation and commencement|\bSCHEDULE\b|^\s*1\s|PART\s+1\b)/i.test(t);
    const hasClosing = /(came into force|Explanatory Note|Crown copyright|SCHEDULE\s+\d|Changes to legislation)/i.test(t);
    if (hasOpening && !hasClosing) return { truncated: true, checked: true, evidence: "legislation.gov.uk: opening structure present but no closing/footer (Explanatory Note / came into force / Crown copyright)" };
    return { truncated: false, checked: true, evidence: null };
  }
  if (shape === "federal-register") {
    const hasOpening = /(SUPPLEMENTARY INFORMATION|\bSUMMARY:|\bAGENCY:|\bACTION:)/i.test(t);
    const hasClosing = /(List of Subjects|Dated:\s|BILLING CODE|Signing Authority|PART\s+\d+\s+is amended)/i.test(t);
    if (hasOpening && !hasClosing) return { truncated: true, checked: true, evidence: "federal-register: SUMMARY/AGENCY/ACTION opening present but no closing (List of Subjects / Dated: / BILLING CODE)" };
    return { truncated: false, checked: true, evidence: null };
  }
  return { truncated: false, checked: false, evidence: null };
}

/**
 * PURE. Classify a capture's completeness against known defect classes. Pass a body to run the furniture +
 * structural checks; omit it (metadata-only) and only STUB (by bytes) is decidable — recorded honestly.
 * @param {{ bytes?: number, body?: string|null, shape?: string, usablePoolRows?: number, capture_kind?: string }} cap
 * @returns {{ completeness: 'NO-KNOWN-DEFECT'|'TRUNCATED'|'FURNITURE'|'STUB', checksFired: string[], cleanChars: number|null, evidence: object }}
 */
export function classifyCompleteness(cap = {}) {
  const bytes = Number(cap.bytes || 0);
  // Explicit capture_kind wins; else a capture carrying bytes (even with body deliberately unread) is a
  // snapshot, and only a genuinely byte-less capture defaults to a pool aggregate.
  const kind = cap.capture_kind || (cap.bytes != null || cap.body != null ? "snapshot" : "pool");
  const checksFired = [];
  const evidence = { bytes };

  // Pool aggregate: STUB when it carries no usable rows; else no defect this audit detects at the pool level.
  if (kind === "pool") {
    const rows = Number(cap.usablePoolRows || 0);
    evidence.usablePoolRows = rows;
    checksFired.push("pool-row-count");
    if (rows <= 0) return { completeness: "STUB", checksFired, cleanChars: null, evidence };
    return { completeness: "NO-KNOWN-DEFECT", checksFired, cleanChars: null, evidence };
  }

  // Snapshot. STUB by byte size is decidable from metadata alone.
  checksFired.push("byte-size");
  if (bytes <= STUB_MAX_BYTES) {
    evidence.stub = `<= ${STUB_MAX_BYTES} bytes (JS/error shell)`;
    return { completeness: "STUB", checksFired, cleanChars: null, evidence };
  }

  // No body available → only the byte-size check ran; do not assert a body-level defect we didn't test.
  if (cap.body == null) {
    evidence.note = "body not read; only byte-size check ran (no furniture/structural proof attempted)";
    return { completeness: "NO-KNOWN-DEFECT", checksFired, cleanChars: null, evidence };
  }

  const clean = extractCleanText(cap.body);
  const cleanChars = clean.length;
  const ratio = bytes > 0 ? cleanChars / bytes : 0;
  evidence.cleanChars = cleanChars;
  evidence.ratio = Number(ratio.toFixed(4));

  // FURNITURE: substantial markup, negligible visible text.
  checksFired.push("furniture-ratio");
  if (bytes >= FURNITURE_MIN_BYTES && cleanChars < FURNITURE_MAX_CLEAN && ratio < FURNITURE_MAX_RATIO) {
    evidence.furniture = `bytes ${bytes}, cleanChars ${cleanChars}, ratio ${evidence.ratio} — chrome/nav dominates`;
    return { completeness: "FURNITURE", checksFired, cleanChars, evidence };
  }

  // TRUNCATED: publisher-shape structural cutoff (opening present, mandatory closing absent).
  const shape = cap.shape || "other";
  const st = structuralTruncation(clean, shape);
  if (st.checked) checksFired.push("structural-shape");
  if (st.truncated) {
    evidence.structural = st.evidence;
    return { completeness: "TRUNCATED", checksFired, cleanChars, evidence };
  }

  return { completeness: "NO-KNOWN-DEFECT", checksFired, cleanChars, evidence };
}

/**
 * PURE. Capture-level sufficiency for grounding THIS item. A capture whose source is at/above the item's
 * authority floor and carries real content COVERS grounding; content below the floor is CORROBORATORS_ONLY;
 * a defect-thin capture is INSUFFICIENT. Floor-exempt item types (market_signal/initiative/regional_data)
 * have no tier floor — any real content covers (corroboration-based strength). Mirrors authorityFloorFor.
 * @param {{ itemType?: string|null, sourceTier?: number|null, completeness: string, usablePoolRows?: number, snapshotBytes?: number }} q
 * @returns {'covers_grounding'|'corroborators_only'|'insufficient'}
 */
export function classifySufficiency(q = {}) {
  const hasContent = q.completeness !== "STUB" &&
    (Number(q.snapshotBytes || 0) > STUB_MAX_BYTES || Number(q.usablePoolRows || 0) >= 2);
  if (!hasContent) return "insufficient";

  const floor = authorityFloorFor(q.itemType); // number (≤N) or null (exempt)
  if (floor == null) return "covers_grounding"; // exempt type: corroboration-based, any real content covers

  const tier = q.sourceTier == null ? null : Number(q.sourceTier);
  if (tier == null) return "corroborators_only"; // unregistered/unknown tier can't ground a floored fact
  return tier <= floor ? "covers_grounding" : "corroborators_only";
}
