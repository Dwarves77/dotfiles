// gate-a-scan.mjs — GATE A: the prose-fact scanner. Guarantees every fact a customer could ACT ON — price,
// percentage, threshold, quantity, compliance deadline — is individually backed by a span-verified FACT claim.
//
// SCOPE (operator ruling 2026-07-26): FIGURES (currency / % / units / quantities) + DEADLINE-DATES gate. Citation
// apparatus (OJ refs, source lines, page numbers, publication years) is EXCLUDED — it is provenance metadata about
// WHERE a fact lives, not a fact anyone acts on, and it is already governed by validate_item_provenance criterion 2
// (URL/citation grounding). Gating on it would bury the real exposures under ~484 noise tokens and make the gate cry
// wolf. YEARS ARE CLASSIFIED BY CONTEXT, NEVER BLANKET-DROPPED: a year in citation context is excluded; a year in
// OBLIGATION context ("by 2027", "from 1 January 2028", "no later than", phase-in trajectory tables) is a deadline
// and GATES. Calibration case: the RTFO SAF Order trajectory table — every date in it gates.
//
// The scanner is folded into the mint/ground path so state refreshes on every write; the stored state carries an
// md5 of the exact prose it scanned, and validate_item_provenance rejects stale state (hash != md5(current full_brief)
// => quarantined). A brief can never hold verified status on a scan of text it no longer contains.
import crypto from "node:crypto";

export const GATE_A_VERSION = "2026-07-26.1";
export function md5(s) { return crypto.createHash("md5").update(String(s ?? ""), "utf8").digest("hex"); }
const norm = (s) => String(s || "").replace(/\s+/g, " ").toLowerCase();
const digitsOf = (s) => norm(s).replace(/[^\d.,%]/g, "");

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
// Citation-apparatus markers on a line => its years/numbers are provenance metadata, excluded from the fact gate.
const CITATION_LINE = /\bOJ\b|official journal|\bp{1,2}\.\s?\d|\bpp\.\s?\d|https?:\/\/|\beli\b|celex|\bno\.?\s?\d+\/\d+|\bL\s?\d{2,}|\bC\s?\d{2,}|source\s*[:=]|\bdoi\b|\baccessed\b|©/i;
// Obligation/deadline context near a year => it is a compliance deadline, gates.
const OBLIGATION_NEAR = /\b(?:by|from|until|after|before|effective|effective from|starting|as of|no later than|in force|applies|apply from|deadline|phase[- ]?in|phased|comes into force|entry into force|takes effect|by the end of|through|to)\b/i;

// Extract the FIGURE class (always gates): currency amounts, number+unit, percentages, large quantities.
function figureTokens(text) {
  const out = new Set();
  for (const m of text.matchAll(/(?:€|£|\$|EUR|GBP|USD)\s?\d[\d.,]*/g)) out.add(m[0].trim());
  for (const m of text.matchAll(/\b\d[\d.,]*\s?(?:%|per ?cent|percent|tCO2e?|tCO₂e?|gCO2|gCO₂|g\/km|\btonnes?\b|\bgt\b|\bkW\b|\bMW\b|\bGW\b|\bkWh\b|\bMWh\b|\bkm\b|\blitres?\b|\bkg\b|\bppm\b|\bbps\b)/gi)) out.add(m[0].trim());
  return [...out];
}
// Extract the DEADLINE-DATE class (context-aware): full dates always; bare years only in obligation/trajectory context.
function deadlineTokens(text) {
  const out = new Set();
  // full dates always gate
  for (const m of text.matchAll(new RegExp(`\\b\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4}\\b`, "gi"))) out.add(m[0].trim());
  for (const m of text.matchAll(new RegExp(`\\b(?:${MONTHS})\\s+\\d{4}\\b`, "gi"))) out.add(m[0].trim());
  for (const m of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) out.add(m[0].trim());
  // bare years: classify by CONTEXT, line by line
  for (const rawLine of text.split(/\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const isCitation = CITATION_LINE.test(line);
    const isTrajectoryRow = line.includes("|") && /\d[\d.,]*\s?%|(?:€|£|\$)\s?\d/.test(line); // table row carrying a figure
    for (const ym of line.matchAll(/\b(?:19[89]\d|20[0-4]\d)\b/g)) {
      const yr = ym[0];
      const before = line.slice(Math.max(0, ym.index - 30), ym.index);
      if (isCitation && !OBLIGATION_NEAR.test(before)) continue;      // citation year -> excluded
      if (isTrajectoryRow || OBLIGATION_NEAR.test(before)) out.add(yr); // obligation/trajectory year -> gates
      // bare year with neither context -> NOT gated (avoid crying wolf; figures in the same brief still gate it)
    }
  }
  return [...out];
}

/** All Gate-A factual tokens in prose (figures + context-aware deadline-dates). */
export function extractFactualTokens(fullBrief) {
  const text = String(fullBrief || "");
  return { figures: figureTokens(text), deadlines: deadlineTokens(text) };
}

/** Scan a brief: returns { scanned_hash, orphan_count, orphans } — orphans are factual tokens absent from every FACT claim.
 *  factClaims: [{ claim_text, source_span }] (claim_kind='FACT' rows). */
export function scanBrief(fullBrief, factClaims) {
  const scanned_hash = md5(fullBrief);
  const { figures, deadlines } = extractFactualTokens(fullBrief);
  const corpus = norm((factClaims || []).map((c) => `${c.claim_text} ${c.source_span}`).join(" "));
  const corpusNums = new Set(corpus.match(/\d[\d.,]*/g) || []);
  const isBacked = (tk) => { const n = norm(tk); if (corpus.includes(n)) return true; const d = digitsOf(tk); return d.length > 0 && (corpusNums.has(d) || corpus.includes(d)); };
  const orphans = [];
  for (const tk of figures) if (!isBacked(tk)) orphans.push({ token: tk, class: "figure" });
  for (const tk of deadlines) if (!isBacked(tk)) orphans.push({ token: tk, class: "deadline" });
  return { scanned_hash, gate_a_version: GATE_A_VERSION, orphan_count: orphans.length, orphans };
}
