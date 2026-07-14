// @ts-check
// SMART-SEARCH IDENTIFIER VARIANTS + CANDIDATE DISCOVERY (operator CRITICAL DISPATCH + SMART-SEARCH
// AMENDMENT, 2026-07-14). The MISSING RUNG of the acquisition ladder: given an item's instrument
// identifier, mechanically derive (1) the identifier VARIANT SET (separator mutations + publisher-scheme
// encodings), (2) deterministic CANONICAL candidate URLs (for EU/UK/US the identifier YIELDS the primary
// URL — no search needed), and (3) the ENDPOINT-LADDER search URLs (the source's OWN search surface first,
// then general web). Pure, node-testable, $0 — the network fetch of these candidates is the caller's.
//
// Proof golden (operator-mandated): eu_clean_trucking's stored identifier `eli/reg/2024/1610/oj` (canonical
// key 32024R1610) → discovery yields CELEX 32024R1610 + the fetchable /legal-content/EN/TXT/HTML form,
// WITHOUT human help. That URL variant is exactly what the old title-only search never produced.
//
// REFERENCED-LAW-EXISTS (doctrine): an item holding an instrument identifier can NEVER be dispositioned
// absent — the only honest terminal is "not found under N variants × M endpoints, logged". This module
// produces the N×M set that record is measured against.
//
// Mirrors migration 200's CELEX format ([1-9][0-9]{4}[A-Z][0-9]{4}) but is LESS conservative on purpose:
// it GENERATES R/L/D candidates to fetch-and-verify (a candidate is proven by fetching, never stamped),
// where the key-deriver stays NULL. Candidate SCORING (SC-13) is a pure ranker that takes injected
// host-class + registry lookups, so the .ts host-authority module is not imported here.

/** PURE. Extract {year, number} from an identifier with any common separator (2024_1610, 2024/1610,
 *  2024-1610, "2024 1610", CELEX/ELI embedded). Returns null when no year/number pair is present.
 *  @param {string|null|undefined} s @returns {{year:number,number:number}|null} */
export function parseYearNumber(s) {
  const str = String(s || "");
  // ELI or CELEX embedded first (most specific).
  let m = str.match(/eli\/(?:reg|dir|dec)\/(\d{4})\/(\d+)/i) || str.match(/\b[1-9](\d{4})[A-Z](\d{4})\b/);
  if (m) return { year: Number(m[1]), number: Number(m[2].replace(/^0+/, "") || m[2]) };
  m = str.match(/\b(\d{4})[\/_\-\s](\d{1,5})\b/);
  if (m) return { year: Number(m[1]), number: Number(m[2]) };
  return null;
}

/** PURE. Separator mutations of a "YYYY<sep>N" identifier — the variant set the search rung tries.
 *  @param {number} year @param {number} number @returns {string[]} */
export function separatorVariants(year, number) {
  return [`${year}/${number}`, `${year}_${number}`, `${year}-${number}`, `${year} ${number}`];
}

/** PURE. CELEX number from parts: sector 3 (legislation) + year + type letter + number zero-padded to 4.
 *  @param {number} year @param {string} typeLetter @param {number} number @returns {string} */
export function toCelex(year, typeLetter, number) {
  return `3${year}${typeLetter}${String(number).padStart(4, "0")}`;
}

/** PURE. EU document-type letters to try. Known type → one letter; unknown → all three (R/L/D), each a
 *  candidate to fetch-and-verify (never a stamped guess).
 *  @param {string|null|undefined} itemType @param {string|null|undefined} [instrumentType] @returns {string[]} */
export function euTypeLetters(itemType, instrumentType) {
  const t = String(instrumentType || itemType || "").toLowerCase();
  if (/regulation/.test(t)) return ["R"];
  if (/directive/.test(t)) return ["L"];
  if (/decision/.test(t)) return ["D"];
  return ["R", "L", "D"];
}

const ELI_KIND = { R: "reg", L: "dir", D: "dec" };

/** PURE. EU candidate set from an identifier (or a pre-derived canonical CELEX key). Produces CELEX ids,
 *  ELI paths, the fetchable /legal-content/EN/TXT/HTML URLs (the enacted text), ELI URLs, and the EUR-Lex
 *  search URL.
 *  @param {{identifier?:string|null, canonicalKey?:string|null, itemType?:string|null, instrumentType?:string|null}} [a]
 *  @returns {{celex:string[], urls:string[], eliPaths:string[], searchUrls:string[]}} */
export function euCandidates({ identifier, canonicalKey, itemType, instrumentType } = {}) {
  const celex = new Set();
  // A pre-derived canonical key (migration 200) is the strongest signal.
  const keyM = String(canonicalKey || "").match(/\b([1-9]\d{4}[A-Z]\d{4})\b/);
  if (keyM) celex.add(keyM[1]);
  const idKeyM = String(identifier || "").match(/\b([1-9]\d{4}[A-Z]\d{4})\b/);
  if (idKeyM) celex.add(idKeyM[1]);
  const yn = parseYearNumber(canonicalKey) || parseYearNumber(identifier);
  if (yn) for (const L of euTypeLetters(itemType, instrumentType)) celex.add(toCelex(yn.year, L, yn.number));

  const urls = [], eliPaths = [];
  for (const c of celex) {
    urls.push(`https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${c}`);
    urls.push(`https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${c}`);
    const letter = /** @type {keyof typeof ELI_KIND} */ (c.charAt(5));
    const kind = ELI_KIND[letter];
    if (kind) {
      const year = c.slice(1, 5), num = Number(c.slice(6));
      eliPaths.push(`${kind}/${year}/${num}/oj`);
      urls.push(`https://eur-lex.europa.eu/eli/${kind}/${year}/${num}/oj/eng`);
    }
  }
  const searchUrls = [...celex].map((c) => `https://eur-lex.europa.eu/search.html?scope=EURLEX&lang=en&text=${c}`);
  return { celex: [...celex], urls: [...new Set(urls)], eliPaths, searchUrls };
}

/** PURE. UK candidate set. legislation.gov.uk paths are identifier-derivable (uksi/2024/1234 → /uksi/2024/
 *  1234[/made|/contents]); a bare year/number tries the common instrument types; plus the site search.
 *  @param {{identifier?:string|null, title?:string|null}} [a] @returns {{urls:string[], searchUrls:string[]}} */
export function ukCandidates({ identifier, title } = {}) {
  const urls = [], searchUrls = [];
  const idm = String(identifier || "").match(/\b(uksi|ukpga|ukssi|ssi|wsi|nisr)\/(\d{4})\/(\d+)/i);
  if (idm) {
    const path = `${idm[1].toLowerCase()}/${idm[2]}/${idm[3]}`;
    urls.push(`https://www.legislation.gov.uk/${path}`, `https://www.legislation.gov.uk/${path}/made`, `https://www.legislation.gov.uk/${path}/contents`);
  } else {
    const yn = parseYearNumber(identifier);
    if (yn) for (const t of ["uksi", "ukpga"]) urls.push(`https://www.legislation.gov.uk/${t}/${yn.year}/${yn.number}`);
  }
  if (title) searchUrls.push(`https://www.legislation.gov.uk/all?title=${encodeURIComponent(title)}`);
  return { urls: [...new Set(urls)], searchUrls };
}

/** PURE. US candidate set. Federal Register API (JSON) by document number or term; eCFR/ regulations.gov
 *  search. A codified-code host (amlegal/municode) that returned a JS shell is handled by the generic
 *  title+jurisdiction search — its content is not identifier-derivable.
 *  @param {{identifier?:string|null, title?:string|null}} [a] @returns {{urls:string[], searchUrls:string[]}} */
export function usCandidates({ identifier, title } = {}) {
  const urls = [], searchUrls = [];
  const docm = String(identifier || "").match(/\b(\d{4}-\d{4,6})\b/); // FR doc number e.g. 2024-12345
  if (docm) urls.push(`https://www.federalregister.gov/documents/search?conditions%5Bterm%5D=${docm[1]}`,
    `https://www.federalregister.gov/api/v1/documents.json?conditions%5Bterm%5D=${docm[1]}`);
  if (title) searchUrls.push(`https://www.federalregister.gov/api/v1/documents.json?conditions%5Bterm%5D=${encodeURIComponent(title)}`,
    `https://www.ecfr.gov/search?search%5Bquery%5D=${encodeURIComponent(title)}`);
  return { urls: [...new Set(urls)], searchUrls };
}

/** PURE. Generic web-search queries — the general-web endpoint AFTER the source's own surface. Aims at the
 *  OFFICIAL primary (gazette/official journal), never a summary. Includes identifier variants + the
 *  jurisdiction + "official gazette/journal" phrasing.
 *  @param {{title?:string|null, jurisdiction?:(string[]|string|null), instrumentType?:string|null, identifier?:string|null}} [a]
 *  @returns {string[]} */
export function genericSearchQueries({ title, jurisdiction, instrumentType, identifier } = {}) {
  const juris = Array.isArray(jurisdiction) ? jurisdiction[0] : jurisdiction;
  const yn = parseYearNumber(identifier);
  const vars = yn ? separatorVariants(yn.year, yn.number) : [];
  const queries = [];
  const base = [title, juris, instrumentType].filter(Boolean).join(" ");
  if (base) {
    queries.push(`${base} official text`);
    queries.push(`${base} official gazette OR "official journal"`);
  }
  for (const v of vars) if (title || juris) queries.push(`${[title, juris].filter(Boolean).join(" ")} ${v}`);
  return [...new Set(queries)].filter(Boolean);
}

/**
 * PURE. The discovery rung's full candidate set for an item. Ordered: deterministic canonical URLs first
 * (identifier YIELDS the primary), then source-own-surface search URLs, then generic web queries. This is
 * the N (variants) × M (endpoints) the REFERENCED-LAW-EXISTS record is measured against.
 * @param {{ identifier?:string|null, canonicalKey?:string|null, itemType?:string|null,
 *           instrumentType?:string|null, title?:string|null, jurisdiction?:(string[]|string|null),
 *           sourceUrl?:string|null }} item
 * @returns {{ candidates:Array<{url:string,kind:'canonical'|'search',scheme:string}>,
 *             searchQueries:string[], identifiers:string[], scheme:string }}
 */
export function discoverCandidateUrls(item = {}) {
  const juris = Array.isArray(item.jurisdiction) ? item.jurisdiction[0] : item.jurisdiction;
  const scheme = detectScheme(item);
  /** @type {Array<{url:string,kind:'canonical'|'search',scheme:string}>} */ const candidates = [];
  /** @type {string[]} */ const identifiers = [];
  /** @param {string[]} urls @param {'canonical'|'search'} kind @param {string} sch */
  const push = (urls, kind, sch) => { for (const u of urls || []) candidates.push({ url: u, kind, scheme: sch }); };

  if (scheme === "eu") {
    const eu = euCandidates(item);
    identifiers.push(...eu.celex, ...eu.eliPaths);
    push(eu.urls, "canonical", "eu");
    push(eu.searchUrls, "search", "eu");
  } else if (scheme === "uk") {
    const uk = ukCandidates(item);
    push(uk.urls, "canonical", "uk");
    push(uk.searchUrls, "search", "uk");
  } else if (scheme === "us") {
    const us = usCandidates(item);
    push(us.urls, "canonical", "us");
    push(us.searchUrls, "search", "us");
  }
  const yn = parseYearNumber(item.canonicalKey) || parseYearNumber(item.identifier);
  if (yn) identifiers.push(...separatorVariants(yn.year, yn.number));

  const queries = genericSearchQueries({ title: item.title, jurisdiction: juris, instrumentType: item.instrumentType || item.itemType, identifier: item.identifier || item.canonicalKey });
  // de-dup candidate URLs, preserve order (canonical before search)
  const seen = new Set();
  const deduped = candidates.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
  return { candidates: deduped, searchQueries: queries, identifiers: [...new Set(identifiers)], scheme };
}

/** PURE. Which publisher scheme applies, from jurisdiction + identifier + source host.
 *  @param {{identifier?:string|null, canonicalKey?:string|null, jurisdiction?:(string[]|string|null), sourceUrl?:string|null}} [a]
 *  @returns {'eu'|'uk'|'us'|'generic'} */
export function detectScheme({ identifier, canonicalKey, jurisdiction, sourceUrl } = {}) {
  const juris = Array.isArray(jurisdiction) ? jurisdiction[0] : jurisdiction;
  const host = (() => { try { return new URL(String(sourceUrl || "")).host.toLowerCase(); } catch { return ""; } })();
  if (juris === "EU" || /eur-lex|europa\.eu/.test(host) || /\b[1-9]\d{4}[A-Z]\d{4}\b|eli\/(?:reg|dir|dec)/i.test(`${identifier} ${canonicalKey}`)) return "eu";
  if (juris === "UK" || juris === "GB" || /legislation\.gov\.uk/.test(host) || /\b(uksi|ukpga)\//i.test(String(identifier))) return "uk";
  if (juris === "US" || /federalregister|ecfr|\.gov$/.test(host)) return "us";
  return "generic";
}

/**
 * PURE (injected lookups). SC-13 candidate ranking: registered host > codified host-class > new host. The
 * caller injects `isRegistered(host)` (registry membership) and `hostClassTier(host)` (classTierForHost —
 * a number or null). No model tier guesses. Lower rank = tried first.
 * @param {Array<{url:string}>} candidates
 * @param {{ isRegistered:(host:string)=>boolean, hostClassTier:(host:string)=>(number|null) }} deps
 */
export function rankCandidates(candidates, deps) {
  /** @param {string} u */
  const hostOf = (u) => { try { return new URL(u).host.toLowerCase(); } catch { return ""; } };
  /** @param {{url:string}} c */
  const score = (c) => {
    const h = hostOf(c.url);
    if (deps.isRegistered?.(h)) return 0;                 // registered source — best
    const t = deps.hostClassTier?.(h);
    if (t != null) return 1 + t;                          // codified host-class (lower tier number = better)
    return 100;                                           // new host → registration worklist
  };
  return candidates
    .map((c, i) => ({ ...c, host: hostOf(c.url), rank: score(c), _i: i }))
    .sort((a, b) => a.rank - b.rank || a._i - b._i);
}
