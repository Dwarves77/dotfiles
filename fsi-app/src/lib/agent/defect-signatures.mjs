// defect-signatures.mjs — the ONE implementation of the two accuracy-defect signature matchers.
// Extracted (hardening Phase A, H3) from scripts/verify/defect-signature-scan.mjs so BOTH callers share it:
//   1. the read-only post-hoc scan (scripts/verify/defect-signature-scan.mjs) — triage/hold of existing facts.
//   2. the mint-time accuracy gate (canonical-pipeline grounding) — HOLD a suspect FACT at mint, never as a
//      clean FACT (hold-not-reject; a hit is never a fabrication verdict, never a certification input).
// One implementation, two callers — a divergence between scan and mint would let a signature the scan flags
// slip past the mint gate. Pure (no DB, no I/O) so the golden exercises it directly.
//
// S-CONFLATE (instrument-identity conflation): one span reused across >= REUSE_MIN FACT claims whose text
//   names >= 2 DISTINCT instrument identifiers, at least one absent from the span (the ISO 14083 shape:
//   a 2023/1805 title-span reused across claims naming 2023/1805, ISO 14083, CountEmissions).
// S-NUMERIC (span-unsupported numeric): a FACT claim carries a significant numeric figure (currency,
//   percentage, thresholded unit, obligation year) whose digits do not appear in its supporting span.

export const REUSE_MIN = 3; // span reused by at least this many FACT claims to consider S-CONFLATE
export const NAMED_ACTS = ['CountEmissions', 'FuelEU', 'ReFuelEU', 'CBAM', 'EUDR', 'AFIR', 'CSRD', 'ESRS', 'EPBD', 'MEES', 'PPWR'];

// Extract instrument identifiers named in a claim. Returns a Set of canonical id strings.
export function extractIdentifiers(claim) {
  const ids = new Set();
  const c = String(claim || '');
  for (const m of c.matchAll(/\b(\d{4}\/\d{1,4})\b/g)) ids.add('EU:' + m[1]);          // 2023/1805
  for (const m of c.matchAll(/\bISO\s?(\d{3,5})\b/gi)) ids.add('ISO:' + m[1]);          // ISO 14083
  for (const name of NAMED_ACTS) if (new RegExp('\\b' + name, 'i').test(c)) ids.add('NAME:' + name.toLowerCase());
  return ids;
}

// Does the span corroborate a given identifier (beyond title-only, best-effort)?
export function spanHasIdentifier(span, id) {
  const s = String(span || '').toLowerCase();
  if (id.startsWith('EU:')) return s.includes(id.slice(3).toLowerCase());
  if (id.startsWith('ISO:')) { const n = id.slice(4); return s.includes('iso ' + n) || s.includes('iso' + n) || s.includes(n); }
  if (id.startsWith('NAME:')) return s.includes(id.slice(5));
  return false;
}

// S-CONFLATE over one item's FACT rows [{idx, id, claim_text, source_span}]. Returns hit rows.
export function detectConflate(facts) {
  const groups = new Map(); // span -> facts[]
  for (const f of facts) {
    const key = String(f.source_span || '').trim();
    if (!key) continue;
    (groups.get(key) || groups.set(key, []).get(key)).push(f);
  }
  const hits = [];
  for (const [span, group] of groups) {
    if (group.length < REUSE_MIN) continue;
    const ids = new Set();
    for (const f of group) for (const id of extractIdentifiers(f.claim_text)) ids.add(id);
    if (ids.size < 2) continue; // needs >= 2 distinct named instruments
    const absent = [...ids].filter((id) => !spanHasIdentifier(span, id));
    if (!absent.length) continue;
    const rationale = `span reused by ${group.length} FACT claims naming {${[...ids].join(', ')}}; absent from span: {${absent.join(', ')}}`;
    for (const f of group) hits.push({ idx: f.idx, id: f.id, signature: 'S-CONFLATE', rationale });
  }
  return hits;
}

// Extract significant numeric tokens from a claim. Returns [{token, digits}].
export function extractNumbers(claim) {
  const c = String(claim || '');
  const out = [];
  const push = (token) => {
    const digits = token.replace(/[^\d]/g, '');
    if (digits.length >= 2) out.push({ token: token.trim(), digits });
  };
  for (const m of c.matchAll(/(?:€|£|\$|EUR|USD|GBP)\s?[\d][\d.,\s]*\d/gi)) push(m[0]);                 // currency
  for (const m of c.matchAll(/\b\d[\d.,\s]*\d?\s?%/g)) push(m[0]);                                       // percent
  for (const m of c.matchAll(/\b\d[\d.,\s]*\d?\s?(?:GW|GWh|MW|MWh|tonnes?|tCO2|GT|km|billion|million|bn)\b/gi)) push(m[0]); // unit
  for (const m of c.matchAll(/\b(?:from|by|before|until|effective|deadline|starting)\s+(?:\d{1,2}\s+\w+\s+)?(20\d{2})\b/gi)) push(m[1]); // obligation year
  return out;
}

// S-NUMERIC over one FACT row. Returns a hit or null.
export function detectNumeric(fact) {
  const spanDigits = String(fact.source_span || '').toLowerCase().replace(/[\s,]/g, '');
  for (const { token, digits } of extractNumbers(fact.claim_text)) {
    if (!spanDigits.includes(digits)) {
      return { idx: fact.idx, id: fact.id, signature: 'S-NUMERIC', rationale: `figure "${token}" (digits ${digits}) not found in span` };
    }
  }
  return null;
}

// Scan one item's FACT rows for both signatures. Returns hit rows (empty = clean).
export function scanItem(facts) {
  const hits = [...detectConflate(facts)];
  for (const f of facts) { const h = detectNumeric(f); if (h) hits.push(h); }
  return hits;
}
