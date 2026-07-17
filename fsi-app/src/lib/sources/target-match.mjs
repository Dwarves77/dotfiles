// src/lib/sources/target-match.mjs
//
// TARGET-MATCH VERIFY (drain-loop finding, 2026-07-16): a captured primary document must actually be the
// ITEM's instrument before it is ground. officialnessOf path 'a' confirms a capture is AN official
// instrument; it does NOT confirm it is the CORRECT one. eu_clean_trucking captured the CSRD directive
// (Directive (EU) 2022/2464) for an item that is the HDV CO2 regulation (Regulation (EU) 2024/1610) and it
// scored "official" — the wrong-instrument defect that this gate closes.
//
// EXECUTOR-AGNOSTIC: this is a PURE predicate over (item, captureText) with NO I/O, so BOTH drivers (the CC
// executor and the metered pipeline) call the identical gate — a wrong-instrument capture is HELD, never
// ground, whoever captured it. It never SETS status: it PROPOSES a verdict that the caller uses to hold.
//
// PRECISION OVER RECALL (conservative — a false MISMATCH would wrongly hold a good capture): a MISMATCH fires
// only on a HARD signal (the capture bears a DIFFERENT instrument identifier in a clear instrument context AND
// the item's own identifier is absent). Absent any identifier signal, it falls back to title/subject overlap
// at a RAISED threshold (the 0.4 that let eu_clean_trucking slip is gone). Reuses identifier-variants.mjs
// (parseYearNumber / euCandidates / detectScheme) — no reinvented identifier derivation (reuse-before-construction).

import { parseYearNumber, euCandidates, detectScheme } from "./identifier-variants.mjs";

const YEAR_LO = 1950, YEAR_HI = 2099;
const isYear = (n) => n >= YEAR_LO && n <= YEAR_HI;

/** PURE. Normalize an instrument number PAIR (year+number in either EU order) to {year, number}. Post-2015
 *  "(EU) 2024/1610" is year/number; pre-2015 "No 1610/2024" is number/year; a directive "2014/95/EU" is
 *  year/number. The token in the year range IS the year, the other the number — order-independent. */
function normPair(a, b) {
  const na = Number(a), nb = Number(b);
  if (isYear(na) && !isYear(nb)) return { year: na, number: nb };
  if (isYear(nb) && !isYear(na)) return { year: nb, number: na };
  return null; // neither looks like a year → not an instrument pair
}

const pairKey = (p) => `${p.year}/${p.number}`;

/** PURE. Scan capture text for instrument identifiers in a CLEAR instrument context, returned as normalized
 *  {year, number} pair-keys. Conservative: a bare "2024/1610" with no instrument word nearby is NOT counted
 *  (that is how article/date noise is excluded). Two forms:
 *   - CELEX token: 3<year><R|L|D><4-digit number>  (e.g. 32024R1610, 32022L2464)
 *   - prose form:  Regulation|Directive|Decision (EU|EC) [No] <n>/<n>  and  <n>/<n>/(EU|EC)
 */
export function scanInstrumentIds(text) {
  const s = String(text || "");
  const found = new Set();
  // CELEX (sector 3 = legislation): 3 YYYY [RLD] NNNN
  for (const m of s.matchAll(/\b3(\d{4})[RLD](\d{4})\b/g)) {
    const p = normPair(m[1], m[2]);
    if (p) found.add(pairKey(p));
  }
  // Prose: an instrument word within a short window before an (EU)/(EC) year/number pair, either order.
  const re = /\b(regulation|directive|decision|reg\.?|dir\.?)\b[^\n.;]{0,40}?\(?\b(?:eu|ec)\b\)?\s*(?:no\.?\s*)?(\d{1,4})\s*\/\s*(\d{1,4})/gi;
  for (const m of s.matchAll(re)) {
    const p = normPair(m[2], m[3]);
    if (p) found.add(pairKey(p));
  }
  // Trailing-suffix directive form: "2014/95/EU"
  for (const m of s.matchAll(/\b(\d{4})\s*\/\s*(\d{1,4})\s*\/\s*(?:eu|ec)\b/gi)) {
    const p = normPair(m[1], m[2]);
    if (p) found.add(pairKey(p));
  }
  return found;
}

/** PURE. The item's OWN expected instrument pair-keys, derived (not guessed) from its identifier fields. */
export function expectedInstrumentIds(item = {}) {
  const keys = new Set();
  const yn = parseYearNumber(item.canonicalKey || item.canonical_instrument_key) ||
             parseYearNumber(item.identifier || item.instrument_identifier);
  if (yn) keys.add(`${yn.year}/${yn.number}`);
  // euCandidates yields CELEX ids like "32024R1610" — normalize each to its pair-key.
  const eu = euCandidates({
    identifier: item.identifier || item.instrument_identifier,
    canonicalKey: item.canonicalKey || item.canonical_instrument_key,
    itemType: item.itemType || item.item_type,
    instrumentType: item.instrumentType || item.instrument_type,
  });
  for (const c of eu.celex) {
    const m = String(c).match(/^3(\d{4})[RLD](\d{4})$/);
    if (m) { const p = normPair(m[1], m[2]); if (p) keys.add(pairKey(p)); }
  }
  return keys;
}

/** PURE. Loose literal presence of a raw non-EU identifier (SB-261, HB 123, uksi 2024/1234, a docket no.):
 *  normalize away separators/case and test substring. Returns the matched raw token or null. */
function rawIdentifierPresent(item, text) {
  const raw = String(item.identifier || item.instrument_identifier || item.canonicalKey || item.canonical_instrument_key || "").trim();
  if (!raw || raw.length < 3) return null;
  const norm = (x) => x.toLowerCase().replace(/[\s._-]+/g, "");
  const t = norm(text);
  const r = norm(raw);
  // Require a reasonably specific token (letters+digits or >=4 chars) to avoid matching a bare short number.
  if (r.length < 3 || /^\d{1,2}$/.test(r)) return null;
  return t.includes(r) ? raw : null;
}

const STOP = new Set(["the","and","for","with","from","that","this","of","to","in","on","by","or","as","at","is","its","climate","greenhouse","gas","gases","regulation","directive","act","law"]);

/** PURE. Fraction of the item title's SIGNIFICANT tokens present in the capture (raised-threshold fallback
 *  when there is no identifier signal). Stopwords + generic domain words removed so overlap reflects the
 *  SPECIFIC subject, not shared boilerplate. */
export function subjectOverlap(item, text) {
  const title = String(item.title || item.subject || "").toLowerCase();
  const toks = [...new Set((title.match(/[a-z][a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w)))];
  if (!toks.length) return 0;
  const t = String(text || "").toLowerCase();
  const hit = toks.filter((w) => t.includes(w)).length;
  return hit / toks.length;
}

/** Raised subject-overlap bar for the no-identifier fallback (the 0.4 that let eu_clean_trucking slip is gone). */
export const SUBJECT_MATCH_THRESHOLD = 0.6;

/**
 * PURE target-match verdict. Never sets status — proposes {verdict} the caller uses to hold/ground.
 * @param {object} item  the intelligence item (title, item_type, instrument_type, identifier / instrument_identifier, canonicalKey / canonical_instrument_key, jurisdiction)
 * @param {string} captureText  the fetched/staged primary text
 * @returns {{ verdict:'match'|'mismatch'|'unverified', via:string, score:number, expected:string[], foundOwn:string[], conflicting:string[], reason:string }}
 */
export function verifyTargetMatch(item = {}, captureText = "") {
  const text = String(captureText || "");
  const expected = expectedInstrumentIds(item);
  const inText = scanInstrumentIds(text);

  const foundOwn = [...expected].filter((k) => inText.has(k));
  const rawHit = rawIdentifierPresent(item, text);

  // MATCH: the item's own instrument identifier (EU pair-key or a raw non-EU token) is present in the capture.
  if (foundOwn.length || rawHit) {
    return { verdict: "match", via: foundOwn.length ? "instrument-id" : "raw-id", score: 1,
      expected: [...expected], foundOwn: foundOwn.length ? foundOwn : (rawHit ? [rawHit] : []), conflicting: [],
      reason: `capture bears the item's own identifier (${foundOwn[0] || rawHit})` };
  }

  const conflicting = [...inText].filter((k) => !expected.has(k));
  const hasExpectedId = expected.size > 0 || Boolean(String(item.identifier || item.instrument_identifier || item.canonicalKey || item.canonical_instrument_key || "").trim());

  // MISMATCH (hard hold): the item HAS an identifier, it is ABSENT from the capture, and the capture bears a
  // DIFFERENT instrument identifier in a clear instrument context → the capture is a different instrument.
  if (hasExpectedId && expected.size > 0 && conflicting.length) {
    return { verdict: "mismatch", via: "conflicting-instrument-id", score: 0,
      expected: [...expected], foundOwn: [], conflicting,
      reason: `capture bears a different instrument identifier (${conflicting.join(", ")}); the item's own identifier (${[...expected].join(", ")}) is absent` };
  }

  // No decisive identifier signal → raised-threshold subject overlap.
  const score = subjectOverlap(item, text);
  if (score >= SUBJECT_MATCH_THRESHOLD) {
    return { verdict: "match", via: "subject-overlap", score: round2(score),
      expected: [...expected], foundOwn: [], conflicting,
      reason: `no identifier signal; subject overlap ${round2(score)} >= ${SUBJECT_MATCH_THRESHOLD}` };
  }
  return { verdict: "unverified", via: "subject-overlap-below-threshold", score: round2(score),
    expected: [...expected], foundOwn: [], conflicting,
    reason: `no identifier match and subject overlap ${round2(score)} < ${SUBJECT_MATCH_THRESHOLD} — capture not confirmed to be this instrument` };
}

function round2(n) { return Math.round(n * 100) / 100; }

/** Convenience: should the caller HOLD (not ground) this capture? Both 'mismatch' and 'unverified' hold. */
export function targetMatchHolds(verdict) { return verdict !== "match"; }

/** PURE. IMO resolution tokens in text, normalized to a canonical `body.num(sub)` form so spacing/word variants
 *  collapse to one identity: "MEPC.400(83)", "MEPC 400(83)", "MEPC Resolution 400(83)", "resolution MEPC.400(83)"
 *  all -> "mepc.400(83)". Complements scanInstrumentIds (EU/CELEX) so an IMO-family instrument name is a detectable
 *  identifier for both the item's own tokens (from its title) and a claim's foreign-instrument signal. */
export function scanImoTokens(text) {
  const out = new Set();
  for (const m of String(text || "").matchAll(/\b(MEPC|MSC|A)\b[.\s]*(?:res(?:olution)?\.?\s*)?(\d{1,4})\s*\(\s*(\d{1,3})\s*\)/gi)) {
    out.add(`${m[1].toLowerCase()}.${m[2]}(${m[3]})`);
  }
  return out;
}

/** PURE. The item's OWN instrument tokens (EU pair-keys + IMO tokens), derived from its identifier fields AND
 *  its title (an IMO item often carries its resolution number only in the title). */
export function ownInstrumentTokens(item = {}) {
  const own = new Set([...expectedInstrumentIds(item)]);
  for (const t of scanImoTokens([item.title, item.identifier, item.instrument_identifier, item.canonicalKey, item.canonical_instrument_key].filter(Boolean).join(" "))) own.add(t);
  return own;
}

/**
 * PURE. CROSS-INSTRUMENT SIGNAL (the ruling's condition b): does the claim text bear an instrument IDENTIFIER
 * that is DIFFERENT from the item's own? This is a POSITIVE evidence test, not an inference from span-absence:
 * a claim that names MEPC.400(83) / Regulation (EU) 2022/2464 while the item is MEPC.338(76) / 2024/1610 is
 * cross-instrument; a claim about the item's own subject that names NO foreign identifier is NOT (it relabels
 * or goes to manual review, never auto-erased). Returns the foreign tokens found (empty = not cross-instrument).
 * @returns {string[]}
 */
export function foreignInstrumentTokens(claimText, item = {}) {
  const own = ownInstrumentTokens(item);
  const inClaim = new Set([...scanInstrumentIds(claimText), ...scanImoTokens(claimText)]);
  return [...inClaim].filter((t) => !own.has(t));
}

/**
 * PURE. Aggregate target-match over the WHOLE fetched pool (the grounding input), so a wrong-instrument
 * PRIMARY does not hard-hold when the RIGHT instrument is also present as a corroborator. Precedence:
 *   - MATCH   if ANY block matches the item (the target instrument is in the pool — ground it).
 *   - MISMATCH if no block matches AND at least one bears a conflicting instrument id (the pool holds a
 *              DIFFERENT instrument and not this one → hard hold; the eu_clean_trucking class).
 *   - UNVERIFIED otherwise (no decisive id signal anywhere → soft flag; ground under the downstream gates).
 * @param {object} item
 * @param {Array<{url:string,text:string}>} blocks  the fetched pool blocks groundBrief will ground against
 * @returns {{ verdict:'match'|'mismatch'|'unverified', best:{ url?:string, verdict:string, via:string, score:number, expected:string[], foundOwn:string[], conflicting:string[], reason:string }, mismatches:object[] }}
 */
export function verifyPoolTargetMatch(item = {}, blocks = []) {
  const verdicts = (blocks || []).filter((b) => b && b.text).map((b) => ({ url: b.url, ...verifyTargetMatch(item, b.text) }));
  const matched = verdicts.find((v) => v.verdict === "match");
  if (matched) return { verdict: "match", best: matched, mismatches: [] };
  const mismatches = verdicts.filter((v) => v.verdict === "mismatch");
  if (mismatches.length) return { verdict: "mismatch", best: mismatches[0], mismatches };
  // no match, no mismatch → all unverified (or empty pool)
  const best = verdicts.sort((a, b) => (b.score || 0) - (a.score || 0))[0] || { verdict: "unverified", score: 0, conflicting: [], expected: [], reason: "empty pool" };
  return { verdict: "unverified", best, mismatches: [] };
}

export { detectScheme };
