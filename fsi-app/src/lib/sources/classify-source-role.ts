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

  // HOST OUTRANKS NAME KEYWORDS (added 2026-08-11). Rules 3 and 7 match generic words — "centre",
  // "center", "lab", "mit", "council" — anywhere in `name`, and `name` frequently carries a DOCUMENT
  // TITLE rather than the institution's own name. Observed misclassifications before this guard:
  // mpa.gov.sg ("Media Centre") -> academic_research; UNESCO World Heritage Centre -> academic_research;
  // musicweek.com ("...MIT Climate Machine...") -> academic_research; consilium.europa.eu ("Council of
  // the EU") -> industry_association. In every case the HOST already settled the entity's identity.
  // A government/EU/intergovernmental host is a stronger identity signal than a word in a page title,
  // so those hosts are barred from the two keyword-only rules below.
  const strongInstitutionalHost =
    /\.gov$/.test(host) || /(^|\.)gov\.[a-z]{2}(\.[a-z]{2})?$/.test(host) || /\.govt\.[a-z]{2}$/.test(host)
    || /\.gob\.[a-z]{2}$/.test(host) || /\.gc\.ca$/.test(host) || /\.go\.[a-z]{2}$/.test(host)
    || /\.gouv\./.test(host) || /(^|\.)parliament\./.test(host) || /\.int$/.test(host)
    || /(^|\.)europa\.eu$/.test(host) || /(^|\.)un\.org$/.test(host) || /(^|\.)unesco\.org$/.test(host);

  // 3. Academic / research institutes.
  if (!strongInstitutionalHost && (/\.(edu)$/.test(host) || /\.ac\.[a-z]{2}$/.test(host)
      || /\b(universit|institute|institut|\bcentre\b|\bcenter\b|laborator|\blab\b|fraunhofer|tyndall|chalmers|cranfield|erasmus|stockholm environment|world resources institute|carbon trust|project drawdown)\b/.test(n)))
    return "academic_research";

  // 4. Statistical / data agencies (before generic government — EIA is a data agency).
  if (/\b(energy information administration|\beia\b|statistics|statistical|data portal|open data|data api|nsrdb|pvwatts)\b/.test(n))
    return "statistical_data_agency";

  // 5. Government / legal authority.
  // Host forms. `(^|\.)gov\.` (not `\.gov\.`) is deliberate: Manitoba publishes at gov.mb.ca, where
  // "gov" is the FIRST label and has no dot before it — the old anchored form silently missed every
  // such host. Same for parliament.uk / *.parliament.* and Canadian provincial hosts, which carry no
  // gov marker in the TLD at all (novascotia.ca, ontario.ca, quebec.ca).
  if (/\.gov$/.test(host) || /(^|\.)gov\.[a-z]{2}(\.[a-z]{2})?$/.test(host) || /\.govt\.[a-z]{2}$/.test(host)
      || /\.gob\.[a-z]{2}$/.test(host) || /\.gc\.ca$/.test(host) || /\.go\.[a-z]{2}$/.test(host) || /\.gouv\./.test(host)
      || /(^|\.)parliament\./.test(host) || /(^|\.)(novascotia|ontario|quebec|alberta|saskatchewan|manitoba)\.ca$/.test(host)
      // europa.eu is the EU institutions' own domain (consilium, europarl, eesc, easa, emsa, eur-lex).
      // Without this every EU body fell to null once name-keyword rules were correctly barred above.
      || /(^|\.)europa\.eu$/.test(host)
      // "government of X" / "gouvernement" is how sub-national and national bodies name themselves when
      // their host carries no gov marker — the single most common miss in the 2026-08-11 audit.
      || /\b(government of|gouvernement|governo do|gobierno de)\b/.test(n)
      || /\b(ministry|ministerio|minist[èe]re|ministerstv|department of|parliament|legislature|congress|senate|national assembly|chamber of deputies|house of (representatives|councillors|commons|lords)|federal register|eur-lex|legislation|official journal|secretariat of|environmental protection agenc|\bepa\b|regulatory authority)\b/.test(n))
    return "primary_legal_authority";

  // 6. Trade press / news.
  if (/\b(freightwaves|loadstar|splash247|lloyd'?s list|journal of commerce|\bjoc\b|tradewinds|greenbiz|\bedie\b|environmental finance|supply chain digital|bloomberg|reuters|news|newsletter|magazine|\bpress\b|gazette of)\b/.test(n))
    return "trade_press";

  // 7. Industry associations.
  // `.asn.au` is Australia's reserved second-level domain for incorporated associations — a host-level
  // identity signal as strong as .edu, and it was missing entirely (ASBEC et al fell through to null).
  if (!strongInstitutionalHost
      && (/\.asn\.[a-z]{2}$/.test(host)
      || /\b(association|alliance|coalition|\bcouncil\b|federation|chamber of (commerce|shipping)|consortium|\bfiata\b|\bclecat\b|\biata\b|\bcsa\b|\bicct\b)\b/.test(n)))
    return "industry_association";

  // 8. Industry data providers / vendors / corporates (fallback for .com + corporate markers).
  if (/\b(\bdnv\b|bureau veritas|\babs\b|classnk|lloyd'?s register|thomson reuters|j\.?p\.? ?morgan|bloombergnef|wood mackenzie|s&p global|consult|advisory|\bltd\b|\binc\b|gmbh|corporation|\bplc\b)\b/.test(n))
    return /\bbloombergnef|wood mackenzie|s&p global|data\b/.test(n) ? "industry_data_provider" : "vendor_corporate";
  // `tld` is the LAST label, so a commercial host under a country code (sevenresiduos.com.br,
  // example.co.uk, example.com.au) yielded tld="br"/"uk"/"au" and fell through to null — every
  // non-US commercial source in the registry was unclassifiable. Match the commercial second level
  // too. `.law` is a professional-services gTLD (law firms publish client alerts, not regulation).
  if (tld === "com" || tld === "co" || tld === "io" || tld === "ai" || tld === "law") return "vendor_corporate";
  if (/\.(com|co)\.[a-z]{2}$/.test(host)) return "vendor_corporate";

  return null; // undeterminable -> flag, do not guess
}
