// @ts-check
// URL-equivalence — the SINGLE JS home for both citation-URL transforms, so the drift guard tests the
// REAL functions (not copies). Two transforms with two jobs:
//   • stripUrlMarkers(prose)   — WRITE-site: strip markdown-emphasis `*`/backtick glued to URLs inside prose
//                                (canonical-pipeline section-insert 1a fix). Operates on a whole string.
//   • canonicalizeCitationUrl(u) — COMPARE-site JS MIRROR of migration 150's SQL canonicalize_citation_url:
//                                lower+btrim, strip trailing `*`/backtick, strip leading www., strip trailing
//                                slash, rtrim '.,;:'. Operates on a single URL.
//
// TWO-HOME CLASS (3rd instance): URL-equivalence now lives in JS (here) AND SQL (mig 150). url-canon.test.mjs
// is the established drift guard — it PARSES migration 150's function body and asserts THIS mirror matches its
// regex steps (the mig-141 authorityFloorFor pattern), plus equivalence-preservation over the real 281-row
// pollution forms: canonical(stripped(u)) == canonical(u), and every polluted form canonicalizes to the same
// value as its clean form. CI-red on divergence keeps the two homes in lockstep.

/** WRITE-site: strip trailing markdown-emphasis markers glued to the END of a URL inside a prose string.
 * @param {string | null | undefined} s
 * @returns {string | null | undefined} */
export const stripUrlMarkers = (s) => (s == null ? s : String(s).replace(/(https?:\/\/[^\s)\]}"'<>*`]+)[*`]+/g, "$1"));

/** COMPARE-site: JS mirror of migration 150's SQL `canonicalize_citation_url`. Steps MUST match the SQL,
 *  IN ORDER: lower(btrim) -> strip trailing `*`/backtick -> strip leading www. -> strip trailing slash ->
 *  rtrim '.,;:'. The drift guard asserts this against the parsed SQL body.
 * @param {string | null | undefined} u
 * @returns {string | null | undefined} */
export function canonicalizeCitationUrl(u) {
  if (u == null) return u;
  let s = String(u).trim().toLowerCase();      // lower(btrim(u))
  s = s.replace(/[*`]+$/, "");                  // regexp_replace(..., '[*`]+$', '')
  s = s.replace(/^(https?:\/\/)www\./, "$1");   // regexp_replace(..., '^(https?://)www\.', '\1')
  // ONE combined trailing-junk strip (slash + dots + punct), so the `/.*` markdown-glob form
  // (`…/path/.*` → after marker strip `…/path/.`) fully normalizes to `…/path`, not `…/path/`.
  s = s.replace(/[/.,;:]+$/, "");               // regexp_replace(..., '[/.,;:]+$', '')
  return s;
}

// Real pollution forms from the 281-row content_md census (2026-07-04), each paired with its clean form.
// Every polluted form MUST canonicalize to the same value as its clean form (the guard asserts it).
export const POLLUTION_FIXTURES = [
  { polluted: "https://eur-lex.europa.eu/eli/reg/2023/1804/oj/eng*", clean: "https://eur-lex.europa.eu/eli/reg/2023/1804/oj/eng" },
  { polluted: "https://icapcarbonaction.com/en/ets.*", clean: "https://icapcarbonaction.com/en/ets" },
  { polluted: "https://www.consilium.europa.eu/en/policies/fit-for-55/.*", clean: "https://consilium.europa.eu/en/policies/fit-for-55" },
  { polluted: "https://www.imo.org", clean: "https://imo.org" },
  { polluted: "https://www.imo.org/en/ourwork/environment/pages/air-pollution.aspx*", clean: "https://imo.org/en/ourwork/environment/pages/air-pollution.aspx" },
  { polluted: "https://icapcarbonaction.com/", clean: "https://icapcarbonaction.com" },
  { polluted: "https://english.mee.gov.cn/international_cooperation/CCICED/", clean: "https://english.mee.gov.cn/international_cooperation/CCICED" },
  { polluted: "https://www.epa.gov/greenvehicles/fast-facts-transportation-greenhouse-gas-emissions*", clean: "https://epa.gov/greenvehicles/fast-facts-transportation-greenhouse-gas-emissions" },
  { polluted: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32023R1805*", clean: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32023R1805" },
  { polluted: "https://calsta.ca.gov/about-us/contact-us*", clean: "https://calsta.ca.gov/about-us/contact-us" },
];
