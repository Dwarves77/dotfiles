// @ts-check
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
