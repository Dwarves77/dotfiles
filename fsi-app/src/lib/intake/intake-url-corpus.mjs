// COMMITTED GOLDEN URL CORPUS for the deterministic intake gates (line-read-is-not-verification, RD-14).
// The permanent class lesson: a deterministic gate ships with a table-driven behavioral corpus, so its
// contract is PROVEN red-then-green, not line-read. Pure data — no imports — consumed by
// intake-gates-golden.test.mjs (sourceRole/congruence, urlIsRoot, matchExistingSubject) and referenced by
// the mint idempotency npmtests. Add a row here when a gate's real behavior needs pinning; never delete a row
// without recording why (a removed case is lost coverage).

// ── (A) sourceRole + urlIsRoot cases. Each row is one URL with its EXPECTED verdict from BOTH gates, so the
//    table proves the two gates are DIFFERENT axes: a primary-host homepage is role=primary AND isRoot=true
//    (the entity-gate still refuses to mint the homepage; source != item). ──
export const URL_CASES = [
  // portal roots (entity-gate: do NOT mint) — incl. language-prefix + landing-file variants
  { url: "https://eur-lex.europa.eu/", role: "primary", isRoot: true, note: "eur-lex bare root: primary HOST but portal ROOT" },
  { url: "https://eur-lex.europa.eu", role: "primary", isRoot: true, note: "no trailing slash, still root" },
  { url: "https://ec.europa.eu/en", role: "other", isRoot: true, note: "language-prefix landing segment" },
  { url: "https://www.gov.uk/home", role: "other", isRoot: true, note: "home landing segment" },
  { url: "https://example.gov/index.html", role: "other", isRoot: true, note: "index landing file" },
  { url: "https://site.org/default.aspx", role: "other", isRoot: true, note: "default landing file" },
  { url: "https://site.org/portal", role: "other", isRoot: true, note: "portal landing segment" },
  // deep documents (entity-gate: MINT-eligible) — incl. a deep path UNDER a language prefix, and a
  // language-segment WITH a query (query defeats the root shortcut)
  { url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32020R1056", role: "primary", isRoot: false, note: "eur-lex deep legal-content doc" },
  { url: "https://www.federalregister.gov/documents/2024/01/02/foo", role: "primary", isRoot: false, note: "federal register deep doc" },
  { url: "https://ec.europa.eu/info/law/some/deep/path", role: "other", isRoot: false, note: "deep path under a portal host — NOT a root" },
  { url: "https://ec.europa.eu/en?section=x", role: "other", isRoot: false, note: "language segment WITH query → not a root" },
  { url: "https://example.gov/reg/1", role: "other", isRoot: false, note: "two-segment deep path" },
  // news / press (congruence 1a/1b input)
  { url: "https://www.prnewswire.com/news-releases/study-xyz-123.html", role: "news", isRoot: false, note: "wire-service press release" },
  { url: "https://site.com/press-releases/2024/announcement", role: "news", isRoot: false, note: "press-releases path" },
  { url: "https://site.com/newsroom/item", role: "news", isRoot: false, note: "newsroom path" },
  // primary artifact URLs (role=primary)
  { url: "https://www.legislation.gov.uk/ukpga/2020/1/contents", role: "primary", isRoot: false, note: "legislation.gov.uk deep" },
  { url: "https://site.gov/files/reg.pdf", role: "primary", isRoot: false, note: "pdf document" },
  // plain other
  { url: "https://example.com/about", role: "other", isRoot: false, note: "generic non-primary non-news deep page" },
  { url: "not a url", role: "other", isRoot: false, note: "unparseable → role other, not a root (defensive)" },
];

// ── (B) congruence cases (source↔claim-type). 1a = primary-artifact type on news → retype to market_signal;
//    1b = research_finding on news → keep type, incongruentSource=true (seek the study). ──
export const CONGRUENCE_CASES = [
  { itemType: "regulation", url: "https://www.prnewswire.com/news-releases/x", expectType: "market_signal", changed: true, incongruent: false, note: "1a: regulation on news → market_signal" },
  { itemType: "directive", url: "https://site.com/newsroom/item", expectType: "market_signal", changed: true, incongruent: false, note: "1a: directive on news → market_signal" },
  { itemType: "research_finding", url: "https://www.prnewswire.com/news-releases/study", expectType: "research_finding", changed: false, incongruent: true, note: "1b: research_finding on press → keep, seek study" },
  { itemType: "regulation", url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32020R1056", expectType: "regulation", changed: false, incongruent: false, note: "regulation on PRIMARY → unchanged" },
  { itemType: "market_signal", url: "https://site.com/press-releases/x", expectType: "market_signal", changed: false, incongruent: false, note: "market_signal on news → already congruent" },
  { itemType: "research_finding", url: "https://eur-lex.europa.eu/legal-content/EN/TXT/x", expectType: "research_finding", changed: false, incongruent: false, note: "research_finding on primary → congruent (not news)" },
];

// ── (C) subject-dedup cases (matchExistingSubject via canonicalizeUrl). The D1 fix pinned: distinct CELEX on
//    the same legal-content path do NOT dedup; noise variants DO; reg-number cross-match is exact. ──
export const DEDUP_CORPUS = [
  { id: "efti", title: "eFTI Regulation (EU) 2020/1056", instrument_identifier: "2020/1056", source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:32020R1056" },
  { id: "cbam", title: "EU CBAM Regulation (EU) 2023/956", instrument_identifier: "2023/956", source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:32023R0956" },
];
export const DEDUP_CASES = [
  { name: "distinct CELEX same path → NO dedup", item: { title: "waste shipments 2024/1157", source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:32024R1157" }, expectIds: [] },
  { name: "same CELEX (noise variant) → dedup on source_url", item: { title: "eFTI re-scan", source_url: "HTTPS://WWW.eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32020R1056#a" }, expectIds: ["efti"], expectHow: "source_url" },
  { name: "same instrument_identifier → dedup", item: { title: "anything", instrument_identifier: "2020/1056" }, expectIds: ["efti"], expectHow: "instrument_identifier" },
  { name: "shared reg-number in title → dedup", item: { title: "New take on Regulation (EU) 2023/956" }, expectIds: ["cbam"], expectHow: "reg_number" },
  { name: "title similarity alone → NO dedup", item: { title: "eFTI air-freight edition (no number, different url)", source_url: "https://example.org/efti" }, expectIds: [] },
];
