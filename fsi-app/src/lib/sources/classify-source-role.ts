// src/lib/sources/classify-source-role.ts
//
// Deterministic source_role classifier — "what kind of entity is this source?". This is the
// SSOT input for the label: source_role (what it IS) -> category (what we pull) -> intelligence_
// types, derived in the migration-123 trigger. Called at onboarding (promote/decide) and in the
// backfill so a source is never created with a NULL role + placeholder content-type.
//
// Signals are name + URL host only (no content fetch, no LLM) — the entity's identity is usually
// unambiguous from those (a .gov is a government; a university is academic; a company is a vendor).
// Returns null only when genuinely undeterminable (-> flagged, not guessed).
//
// Order matters: intergovernmental + standards are checked before government/academic because IMO
// is not a national government and SBTi is not a university.

export type SourceRole =
  | "primary_legal_authority"
  | "government_press"
  | "intergovernmental_body"
  | "standards_body"
  | "academic_research"
  | "trade_press"
  | "statistical_data_agency"
  | "vendor_corporate"
  | "industry_association"
  | "industry_data_provider";

export function classifySourceRole(name: string | null | undefined, url: string | null | undefined): SourceRole | null {
  const n = (name || "").toLowerCase();
  let host = "";
  try { host = new URL(url || "").hostname.toLowerCase().replace(/^www\./, ""); } catch { /* non-URL */ }
  const tld = host.split(".").slice(-1)[0] || "";

  // 1. Intergovernmental bodies (before government — supranational, not a national gov).
  if (/\b(imo|icao|unctad|unfccc|\bunep\b|\bun\b|united nations|oecd|\biea\b|irena|world bank|\bwto\b|ipcc|itf-oecd|international transport forum|international energy agency|international maritime|international civil aviation)\b/.test(n)
      || /(^|\.)(imo|icao|unctad|oecd|irena|iea|wto|ipcc|unfccc|un)\.org$/.test(host) || host.endsWith(".int"))
    return "intergovernmental_body";

  // 2. Standards / target-setting bodies (before academic — SBTi/ISO are not universities).
  if (/\b(\biso\b|ghg protocol|greenhouse gas protocol|\bglec\b|smart freight|science based targets|sbti|sbtn|\bcdp\b|ifrs|issb|breeam|\bgri\b|global reporting initiative|ecovadis|sustainable packaging coalition)\b/.test(n))
    return "standards_body";

  // 3. Academic / research institutes.
  if (/\.(edu)$/.test(host) || /\.ac\.[a-z]{2}$/.test(host)
      || /\b(universit|institute|institut|\bcentre\b|\bcenter\b|laborator|\blab\b|fraunhofer|tyndall|chalmers|cranfield|erasmus|\bmit\b|stockholm environment|world resources institute|carbon trust|project drawdown)\b/.test(n))
    return "academic_research";

  // 4. Statistical / data agencies (before generic government — EIA is a data agency).
  if (/\b(energy information administration|\beia\b|statistics|statistical|data portal|open data|data api|nsrdb|pvwatts)\b/.test(n))
    return "statistical_data_agency";

  // 5. Government / legal authority.
  if (/\.gov$/.test(host) || /\.gov\.[a-z]{2}$/.test(host) || /\.govt\.[a-z]{2}$/.test(host)
      || /\.gob\.[a-z]{2}$/.test(host) || /\.gc\.ca$/.test(host) || /\.go\.[a-z]{2}$/.test(host) || /\.gouv\./.test(host)
      || /\b(ministry|ministerio|minist[èe]re|ministerstv|department of|parliament|legislature|congress|senate|national assembly|chamber of deputies|house of (representatives|councillors)|federal register|eur-lex|legislation|official journal|secretariat of|environmental protection agenc|\bepa\b|regulatory authority)\b/.test(n))
    return "primary_legal_authority";

  // 6. Trade press / news.
  if (/\b(freightwaves|loadstar|splash247|lloyd'?s list|journal of commerce|\bjoc\b|tradewinds|greenbiz|\bedie\b|environmental finance|supply chain digital|bloomberg|reuters|news|newsletter|magazine|\bpress\b|gazette of)\b/.test(n))
    return "trade_press";

  // 7. Industry associations.
  if (/\b(association|alliance|coalition|\bcouncil\b|federation|chamber of (commerce|shipping)|consortium|\bfiata\b|\bclecat\b|\biata\b|\bcsa\b)\b/.test(n))
    return "industry_association";

  // 8. Industry data providers / vendors / corporates (fallback for .com + corporate markers).
  if (/\b(\bdnv\b|bureau veritas|\babs\b|classnk|lloyd'?s register|thomson reuters|j\.?p\.? ?morgan|bloombergnef|wood mackenzie|s&p global|consult|advisory|\bltd\b|\binc\b|gmbh|corporation|\bplc\b)\b/.test(n))
    return /\bbloombergnef|wood mackenzie|s&p global|data\b/.test(n) ? "industry_data_provider" : "vendor_corporate";
  if (tld === "com" || tld === "co" || tld === "io" || tld === "ai") return "vendor_corporate";

  return null; // undeterminable -> flag, do not guess
}
