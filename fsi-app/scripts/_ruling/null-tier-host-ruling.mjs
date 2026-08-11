/** BATCHED NULL-TIER-HOST RULING (2026-08-11) — the 57 hosts SC-13 worklisted.
 *
 *  The doctrine reserves this to ONE batched ruling ("never an auto-judged tier"). The operator delegated
 *  the ruling itself back to this session on 2026-08-11 ("the product intent rulings are 100% yours").
 *  This file IS that ruling, written down: every host classified to a RULED CLASS from the SC-13 class
 *  table, never a per-host guess and never a reputation judgment.
 *
 *  class table (unchanged): legal->1  gov/intergov->2  verifier/academic/association->4  analysis->6
 *                           lawfirm/news/vendor/corporate->7   aggregator/platform-> PERMANENT WORKLIST
 *
 *  WHY REGISTERING A SUB-FLOOR HOST IS THE FIX, NOT A COMPROMISE. The audit's finding is that an
 *  UNREGISTERED host stamps its FACT spans NULL, and NULL escapes the authority floor entirely (the floor
 *  cannot compare null <= T2) — that is the sub-floor MASKING defect. Registering the host at its ruled
 *  class tier does NOT promote its facts; it makes the floor able to SEE them, so a T7 span is honestly
 *  walled instead of invisibly passing. The content-side consequence (route those facts to 4c relabel as
 *  grounded analysis) is a separate, frozen, content step — this ruling does not pre-empt it.
 *
 *  THE SEVEN PERMANENT-WORKLIST HOSTS ARE A RULING TOO, not an omission: an aggregator republishes someone
 *  else's text, so a span attributing to it is a RE-ATTRIBUTION instruction, and minting it any tier would
 *  credit the republisher for the publisher's authority. They stay unregistered, by rule, forever.
 *
 *  Emits SQL + a reversibility CSV. Read-only itself; applies nothing. */
export const RULING = [
  // ── GOV / INTERGOVERNMENTAL → T2 ────────────────────────────────────────────────────────────────────
  ["japaneselawtranslation.go.jp", 2, "gov", "Japanese Government official law-translation portal (.go.jp)"],
  ["ato.gov.au", 2, "gov", "Australian Taxation Office (.gov.au)"],
  ["catalog.data.gov", 2, "gov", "US Federal open-data catalogue (.gov)"],
  ["pollution-waste.canada.ca", 2, "gov", "Government of Canada official domain — canada.ca is the GoC single web presence"],
  ["moefcc-gcp.in", 2, "gov", "India Ministry of Environment, Forest and Climate Change — Green Credit Programme (ministry programme site)"],
  ["whc.unesco.org", 2, "intergov", "UNESCO World Heritage Centre — UN specialised agency"],

  // ── ASSOCIATION / STANDARDS BODY → T4 ───────────────────────────────────────────────────────────────
  ["ieta.org", 4, "association", "International Emissions Trading Association — industry body (cer.be precedent)"],
  ["goldstandard.org", 4, "association", "Gold Standard — carbon-credit standard setter / certification body"],

  // ── ANALYSIS / THINK-TANK / NGO / PROGRAMME → T6 (sub-floor) ────────────────────────────────────────
  ["ccarbon.info", 6, "analysis", "carbon-market analysis publication"],
  ["now-gmbh.de", 6, "analysis", "NOW GmbH — German federal programme company (programme communications, not regulator guidance)"],
  ["japan.influencemap.org", 6, "analysis", "InfluenceMap — think tank"],
  ["circularactionhub.org", 6, "analysis", "NGO platform (circular economy)"],
  ["1point5.caneurope.org", 6, "analysis", "Climate Action Network Europe — NGO"],
  ["climatecooperation.cn", 6, "analysis", "Sino-German climate cooperation programme site"],
  ["clientearth.asia", 6, "analysis", "ClientEarth — environmental-law NGO"],
  ["platformelectromobility.eu", 6, "analysis", "Platform for Electromobility — industry alliance advocacy"],
  ["energyadvicehub.org", 6, "analysis", "energy advisory content publisher"],
  ["igsd.org", 6, "analysis", "Institute for Governance & Sustainable Development — think tank"],
  ["nautilusint.org", 6, "analysis", "Nautilus International — maritime trade union (advocacy, not a standards body)"],
  ["international-climate-initiative.com", 6, "analysis", "IKI — German federal funding programme communications"],
  ["oneplanetnetwork.org", 6, "analysis", "One Planet Network — UN programme network communications"],
  ["inderscience.com", 6, "analysis", "commercial academic publisher — not a .edu/.ac institution; peer-reviewed content still sub-floor by class"],

  // ── LAW FIRM / NEWS / VENDOR / CORPORATE → T7 (sub-floor commentary) ────────────────────────────────
  ["aoshearman.com", 7, "lawfirm", "A&O Shearman — international law firm; client-alert commentary, not the enacting authority"],
  ["trenchrossi.com", 7, "lawfirm", "Trench Rossi Watanabe — Brazilian law firm; client-alert commentary"],
  ["cms.law", 7, "lawfirm", "CMS — international law-firm network; client-alert commentary (cms-lawnow precedent)"],
  ["blakes.com", 7, "lawfirm", "Blake, Cassels & Graydon — Canadian law firm; client-alert commentary"],
  ["garrigues.com", 7, "lawfirm", "Garrigues — Spanish/Iberian law firm; client-alert commentary"],
  ["knowledge.dlapiper.com", 7, "lawfirm", "DLA Piper knowledge portal — law-firm commentary published under the firm's own name"],
  ["sustainablefutures.linklaters.com", 7, "lawfirm", "Linklaters Sustainable Futures — law-firm ESG commentary blog"],
  ["morihamada.com", 7, "lawfirm", "Mori Hamada & Matsumoto — Japanese law firm; client-alert commentary"],
  ["allbrightlaw.com", 7, "lawfirm", "AllBright Law Offices — Chinese law firm; client-alert commentary"],
  ["balkangreenenergynews.com", 7, "news", "Balkan Green Energy News — regional energy trade press"],
  ["ceenergynews.com", 7, "news", "CEENERGYNEWS — Central-European energy trade press"],
  ["china-briefing.com", 7, "news", "China Briefing (Dezan Shira & Associates) — advisory-firm trade publication"],
  ["cyprusshippingnews.com", 7, "news", "Cyprus Shipping News — maritime trade press"],
  ["sundancetimes.com", 7, "news", "general news outlet — reporting on law, never the law"],
  ["sustainable-bus.com", 7, "news", "Sustainable Bus — public-transport trade press"],
  ["ishkaglobal.com", 7, "news", "Ishka — aviation-finance news and analysis publication"],
  ["infineuminsight.com", 7, "corporate", "Infineum corporate publication"],
  ["searoutes.com", 7, "vendor", "routing/emissions SaaS vendor"],
  ["shipzero.com", 7, "vendor", "carbon-accounting SaaS vendor"],
  ["senken.io", 7, "vendor", "carbon-credit marketplace vendor"],
  ["envigilance.com", 7, "vendor", "regulatory-intelligence vendor"],
  ["en.reach24h.com", 7, "vendor", "REACH24H regulatory consultancy"],
  ["freightcourse.com", 7, "vendor", "commercial trade-education content"],
  ["newyorktruckingonline.com", 7, "vendor", "commercial trucking-compliance content"],
  ["onewaybit.com", 7, "vendor", "commercial compliance content"],
  ["nyk.com", 7, "corporate", "NYK Line — carrier corporate site"],
  ["atoshipping.com", 7, "corporate", "shipping company corporate site"],
  ["dromon.com", 7, "corporate", "Dromon Bureau of Shipping — NOT on the accredited-CAB allowlist; T7 under-credits deliberately rather than mint T4 on an unverified accreditation signal"],

  // ── PERMANENT WORKLIST (never registered — a span here is a re-attribution instruction) ─────────────
  ["legalclarity.org", null, "aggregator", "legal-content aggregator (already matched by LEGAL_AGGREGATOR)"],
  ["law.cornell.edu", null, "aggregator", "Cornell LII — legal aggregator, republisher not publisher (already matched)"],
  ["npcobserver.com", null, "aggregator", "NPC Observer — republishes Chinese legislative text (already matched)"],
  ["practiceguides.chambers.com", null, "aggregator", "Chambers Practice Guides — aggregator (already matched)"],
  ["mondaq.com", null, "aggregator", "Mondaq — republishes law-firm commentary; the firm is the publisher"],
  ["up.codes", null, "aggregator", "UpCodes — republishes building codes; the code body is the publisher"],
  ["energygovuk.citizenspace.com", null, "platform", "Citizen Space — third-party consultation-hosting SaaS; the UK department is the publisher"],
];

export const BY_HOST = new Map(RULING.map(([h, t, c, why]) => [h, { tier: t, cls: c, why }]));
