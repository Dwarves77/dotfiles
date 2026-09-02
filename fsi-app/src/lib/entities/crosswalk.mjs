// crosswalk.mjs — the entity_identifiers scheme vocabulary and per-scheme value validators
// (docs/specs/08-flywheel-design.md §1.1: "Crosswalk to published identifier standards. ADOPT, never
// invent"). Mirrors the shape of src/lib/contracts/vocabularies.mjs (one frozen vocabulary, validators
// beside it, plain ESM, zero dependencies) but for identifier SCHEMES rather than the six shared value
// vocabularies — a deliberately separate module because a scheme validator is a FORMAT/CHECK-DIGIT rule
// (how the outside world already validates its own identifier), not a platform-invented enum.
//
// WHAT "VALIDATE" MEANS HERE, HONESTLY, PER SCHEME. Three named with a published check-digit algorithm
// (LEI: ISO 17442 mod-97-10, IMO_SHIP: the 7-digit weighted check digit, ORCID: ISO 7064 mod-11-2) get
// the REAL checksum, verified in crosswalk.test.mjs against real published identifiers (a Deutsche Bank
// LEI, IMO 9074729, ORCID 0000-0002-1825-0097) — a syntactically-shaped but wrong identifier is REJECTED,
// not merely a malformed one. ISO6346 (container check digit) gets the same treatment. Every other
// scheme gets a FORMAT regex only (documented per-scheme below) — either no public check-digit algorithm
// exists (UN/LOCODE, IATA, ICAO, NUTS, EORI, SCAC), or implementing one correctly without a live registry
// to verify against would be asserting more confidence than this lane can back (ROR: format-only,
// [UNCONFIRMED] whether this lane's regex matches the current ROR ID spec precisely — flagged rather than
// silently guessed). IMO_COMPANY reuses the IMO_SHIP check-digit algorithm on the stated understanding
// (IMO's own public documentation) that company/registered-owner numbers are generated the same way as
// ship numbers; this is [UNCONFIRMED] against a primary IMO source in this sandbox (no egress) and is
// named as such rather than asserted as verified.

import { assertEntityId } from "./entity-id.mjs";

// The closed scheme vocabulary (spec §1.1's comment list, HOST added — the organisation-by-website
// scheme this lane's backfill actually mints, since LEI/IMO Company Number are not populated anywhere in
// the live schema yet — see backfill-entities.mjs's header for what was checked and found absent).
export const SCHEMES = Object.freeze([
  "LEI", "IMO_SHIP", "IMO_COMPANY", "UNLOCODE", "IATA", "ICAO", "ISO3166_1", "ISO3166_2",
  "NUTS", "CELEX", "ELI", "ROR", "ORCID", "EORI", "SCAC", "ISO6346", "HOST",
]);
const SCHEME_SET = new Set(SCHEMES);

// ── Check-digit algorithms (the four schemes with a published, implementable checksum) ──────────────

// ISO 17442 / ISO 7064 MOD 97-10, the SAME family IBAN uses. Letters -> A=10..Z=35 across the WHOLE
// string (not just a prefix, unlike IBAN's rearrangement), then the resulting decimal integer mod 97
// must equal 1. Verified against two real, published LEIs in crosswalk.test.mjs.
function leiNumeric(str) {
  let out = "";
  for (const ch of str) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch >= "A" && ch <= "Z") out += String(ch.charCodeAt(0) - 55); // A=10 ... Z=35
    else return null;
  }
  return out;
}
function isValidLei(value) {
  const s = String(value || "").toUpperCase();
  if (!/^[A-Z0-9]{18}[0-9]{2}$/.test(s)) return false; // 18 alnum + 2 numeric check digits
  const numeric = leiNumeric(s);
  return numeric != null && BigInt(numeric) % 97n === 1n;
}

// IMO 7-digit check digit: sum(d[i] * (7-i)) for i=0..5, mod 10, must equal d[6]. Verified against two
// real IMO ship numbers (9074729, 9319466) in crosswalk.test.mjs.
function imoCheckDigitValid(value) {
  const s = String(value || "").replace(/^IMO\s*/i, "").trim();
  if (!/^[0-9]{7}$/.test(s)) return false;
  const d = s.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 6; i++) sum += d[i] * (7 - i);
  return sum % 10 === d[6];
}

// ORCID: ISO 7064 MOD 11-2 over the first 15 digits; the 16th character may be the letter "X" (=10).
// Verified against two real, published ORCID iDs in crosswalk.test.mjs.
function isValidOrcid(value) {
  const s = String(value || "").toUpperCase().replace(/[^0-9X]/g, "");
  if (!/^[0-9]{15}[0-9X]$/.test(s)) return false;
  const digits = s.slice(0, 15).split("");
  let total = 0;
  for (const d of digits) total = (total + Number(d)) * 2;
  const remainder = total % 11;
  const result = (12 - remainder) % 11;
  const check = result === 10 ? "X" : String(result);
  return check === s[15];
}

// ISO 6346 (freight container) check digit. Letters -> the standard table that SKIPS multiples of 11
// (11, 22, 33 never appear), each of the 10 leading characters weighted by 2^position, summed, mod 11
// (a remainder of 10 maps to check digit 0). Verified against the canonical worked example (CSQU3054383,
// ISO 6346's own published illustration) in crosswalk.test.mjs.
const ISO6346_LETTER_VALUES = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20, K: 21, L: 23, M: 24, N: 25,
  O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31, U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
};
function isValidIso6346(value) {
  const s = String(value || "").toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-Z]{3}[UJZ][0-9]{7}$/.test(s)) return false; // 3 owner letters + category (U/J/Z) + 6 digits + 1 check digit
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = s[i];
    const val = /[0-9]/.test(ch) ? Number(ch) : ISO6346_LETTER_VALUES[ch];
    if (val === undefined) return false;
    sum += val * 2 ** i;
  }
  let remainder = sum % 11;
  if (remainder === 10) remainder = 0;
  return remainder === Number(s[10]);
}

// ── Format-only validators (no published/implementable check digit) ───────────────────────────────
// CELEX: bare celex token, optionally with the OJ-sequence suffix migration 255 preserves — the SAME
// shape canonical_instrument_key values already have (scripts/lib/canonical-key.mjs deriveKey output).
const RE_CELEX = /^[1-9]\d{4}[A-Z]\d{4}(\(\d{2}\))?$/;
// UN/LOCODE: 2-letter country + 3-character location. The location part officially excludes the digits
// 0 and 1 (reserved to avoid confusion with letters O/I) — see UN/LOCODE's own structure documentation.
const RE_UNLOCODE = /^[A-Z]{2}[A-Z2-9]{3}$/;
const RE_IATA = /^[A-Z0-9]{2,3}$/; // 2-letter/3-alnum airline designator OR 3-letter airport code
const RE_ICAO = /^[A-Z0-9]{3,4}$/; // 3-letter airline designator OR 4-letter airport/ICAO code
const RE_ISO3166_1 = /^[A-Z]{2}$/;
const RE_ISO3166_2 = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;
const RE_NUTS = /^[A-Z]{2}[A-Z0-9]{0,3}$/; // 2-5 chars total; pin scheme_version — NUTS codes are re-issued
const RE_ELI = /^(?:https?:\/\/[^\s]+\/eli\/|eli\/)(?:reg|dir|dec)(?:_impl|_del)?\/\d{4}\/\d+(?:\/oj)?$/i;
// ROR: "0" + 6 base32-Crockford-shaped chars (no I/L/O/U, to avoid 0/1/O/U confusion) + 2 digits.
// FORMAT ONLY — [UNCONFIRMED] against the live ROR spec in this sandbox (no egress); flagged, not guessed.
const RE_ROR = /^0[a-hj-km-np-tv-z0-9]{6}[0-9]{2}$/;
const RE_EORI = /^[A-Z]{2}[A-Z0-9]{1,15}$/;
const RE_SCAC = /^[A-Z]{2,4}$/;
const RE_HOST = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** scheme -> value validator. Every SCHEMES entry has one; absence would be a silent gap, so
 *  crosswalk.test.mjs asserts VALIDATORS covers SCHEMES exactly (no scheme without a validator, no
 *  validator for a retired scheme). */
export const VALIDATORS = Object.freeze({
  LEI: isValidLei,
  IMO_SHIP: imoCheckDigitValid,
  // [UNCONFIRMED, no primary-source access in this sandbox]: IMO company/registered-owner numbers are
  // documented (IMO's own public guidance) as using the SAME check-digit algorithm as ship numbers.
  // Reusing it here rather than a bare format regex is the honest best-effort; flagged per the file header.
  IMO_COMPANY: imoCheckDigitValid,
  UNLOCODE: (v) => RE_UNLOCODE.test(String(v || "").toUpperCase()),
  IATA: (v) => RE_IATA.test(String(v || "").toUpperCase()),
  ICAO: (v) => RE_ICAO.test(String(v || "").toUpperCase()),
  ISO3166_1: (v) => RE_ISO3166_1.test(String(v || "").toUpperCase()),
  ISO3166_2: (v) => RE_ISO3166_2.test(String(v || "").toUpperCase()),
  NUTS: (v) => RE_NUTS.test(String(v || "").toUpperCase()),
  CELEX: (v) => RE_CELEX.test(String(v || "").toUpperCase()),
  ELI: (v) => RE_ELI.test(String(v || "")),
  ROR: (v) => RE_ROR.test(String(v || "").toLowerCase()),
  ORCID: isValidOrcid,
  EORI: (v) => RE_EORI.test(String(v || "").toUpperCase()),
  SCAC: (v) => RE_SCAC.test(String(v || "").toUpperCase()),
  ISO6346: isValidIso6346,
  HOST: (v) => RE_HOST.test(String(v || "").toLowerCase()),
});

/**
 * Build one entity_identifiers row (migration 282's column set exactly), validating as it goes:
 *  - entityId must be a well-formed `cl:*` id (assertEntityId)
 *  - scheme must be in SCHEMES
 *  - value must pass VALIDATORS[scheme] (format/check-digit)
 *  - assertedBy must be a non-empty provenance string (who/what asserted this alias — spec §1.3 rule 2:
 *    "alias table with provenance, never overwritten names")
 * Throws with a descriptive message on any failure rather than returning a row a caller might insert
 * unchecked — the same fail-loud posture as db.mjs's requireCite().
 */
export function identifierRow(entityId, scheme, value, assertedBy, { schemeVersion = null } = {}) {
  assertEntityId(entityId);
  if (!SCHEME_SET.has(scheme)) {
    throw new Error(`crosswalk: unknown identifier scheme "${scheme}" — must be one of ${SCHEMES.join(", ")}`);
  }
  const raw = String(value ?? "");
  if (!raw.trim()) {
    throw new Error(`crosswalk: empty identifier value for scheme "${scheme}" (entity ${entityId})`);
  }
  const validate = VALIDATORS[scheme];
  if (validate && !validate(raw)) {
    throw new Error(`crosswalk: "${raw}" does not validate against scheme "${scheme}"'s format/check-digit rule`);
  }
  if (!assertedBy || !String(assertedBy).trim()) {
    throw new Error(`crosswalk: identifierRow requires a non-empty assertedBy (provenance on the alias, not just the entity — spec §1.3 rule 2)`);
  }
  return {
    entity_id: entityId,
    scheme,
    value: raw,
    scheme_version: schemeVersion,
    asserted_by: String(assertedBy),
    asserted_at: new Date().toISOString(),
  };
}
