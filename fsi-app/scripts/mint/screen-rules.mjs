// screen-rules.mjs — the $0, rule-based relevance re-screen ADR-020 requires (MINT-RUNBOOK.md §0/§7).
// Pure classifier: classifyRelevance({title, document_url, surface_tags}) -> {verdict, rule, basis}.
// No I/O, no DB, no network — a census row in, a verdict out.
//
// ── THE MECHANISM TEST (Wave M-screen-3, 2026-08-31 — the classification METHOD, read this before touching
// any rule below) ───────────────────────────────────────────────────────────────────────────────────────
//
//   An instrument is ON-VERTICAL if it PRICES, CAPS, STANDARDS, VERIFIES, or ENABLES the carbon/
//   environmental intensity of freight movement (any mode) or of freight fuels, vehicles, vessels,
//   infrastructure, or logistics supply chains. It is OFF-VERTICAL only if it fails ALL FIVE mechanism
//   prongs for freight.
//
// The diagnosed defect this test exists to fix: earlier rounds classified by INSTRUMENT FAMILY (surface
// form — "is this a customs form?" "is this an EU aviation-governance decision?") when the vertical is
// actually defined by MECHANISM (does the instrument itself price/cap/standard/verify/enable freight's
// carbon or environmental intensity?). A rule can look like it belongs to an administrative "family"
// (ATM bilaterals, ship-classification-society accreditation, corridor governance) while its actual
// operative content sets a binding environmental target, verifies environmental compliance, or caps an
// environmentally-conditioned freight activity — the mechanism test catches that; instrument-family
// pattern-matching does not.
//
// EVERY rule below is re-audited against this test, in both directions, and carries the result inline:
//   - Every rule in OFF_VERTICAL_RULES (and KNOWN_OFF_VERTICAL_CELEX_ROOTS) that still returns off_vertical
//     carries a `failsMechanism` field: one line stating WHY none of the five prongs applies to it — never
//     merely which document family it belongs to.
//   - Every rule that satisfies a prong carries a `verdict: "on_vertical"` override (physically left in its
//     original array position — match logic, test/exclude regex, and array order are UNCHANGED everywhere;
//     only the verdict a specific rule name returns has changed) plus a `mechanism` field naming which
//     prong(s) it satisfies and why. Some flips are the operator's 2026-08-31 reclassification ruling
//     (tagged `// FLIP (operator ruling 2026-08-31)`); others are additional catches from this re-audit
//     itself, beyond the operator's named list (tagged `// FLIP (mechanism re-audit 2026-08-31 ...)`).
//   - Every rule in ON_VERTICAL_RULES carries either `mechanism` (states the prong(s) satisfied) or, for a
//     rule this re-audit found satisfies NO prong on a strict freight-mechanism reading, `mechanismQuestion`
//     — such a rule is NEVER silently flipped off (see the HARD RULE below); it stays on_vertical and is
//     flagged for operator review instead. See docs/audits or the wave report for the full list and the
//     ADR-020-vs-mechanism-test tension it surfaces (most acutely in core_sustainability_climate_environment,
//     the largest ON_VERTICAL bucket).
// A meta-test in screen-rules.test.mjs enforces the failsMechanism/mechanism/mechanismQuestion coverage
// mechanically: no rule may ship without the annotation its bucket requires.
//
// PROVENANCE: encodes docs/decisions/ADR-020-sustainability-first-vertical-scope.md (edge-zones-IN list,
// "ruled OUT for now" list) plus the runbook's own denylist (MINT-RUNBOOK.md §0, and the M0 report's sampled
// off-vertical examples: TIR customs formalities, EU-EFTA trade-formalities accession, MiCA crypto-asset
// complaints RTS, EU-ICAO air-traffic-management position, Denmark ATM performance-plan decision,
// waterway-vessel-licence recognition). NOTE (2026-08-31): that sampled list predates the mechanism test —
// "Denmark ATM performance-plan decision" names exactly the ses_performance_plan_administration/
// denylist_atm_air_services_bilateral regulatory family, which the mechanism re-audit and the operator's
// ruling below have since flipped on_vertical. The list is kept as a historical record of round-1's
// instrument-family reasoning, not as a still-current off-vertical example set.
//
// HARD RULE (non-negotiable, tested in screen-rules.test.mjs): ambiguous NEVER auto-declines. When no rule
// fires, or signals conflict, or the item is a not-yet-enacted preparatory act with no title signal, the
// verdict is 'ambiguous' — routed to a human-review bucket, never silently treated as 'off_vertical'. This
// is the direct fix for ADR-020's own root cause (Correction C11): a fail-open floor that let 632
// off-vertical items mint themselves in under an "anything and everything" reading. This screen fails
// CLOSED to human review, never open to a guess in either direction. The SAME never-silently-decide
// discipline extends to the mechanism re-audit: an on_vertical rule the re-audit cannot confirm against the
// test is never silently flipped off — it is flagged via `mechanismQuestion` and left on, exactly as an
// off_vertical rule the re-audit newly confirms is never left unflipped — it gets `verdict: "on_vertical"`.
//
// surface_tags IS DELIBERATELY NOT A DECISION INPUT. ADR-020 Amendment 1 records that scenario-TAG presence
// alone previously let two off-vertical items (dangerous-goods vessel-notification derogations) read as
// in-scope because they carried live tags on truncated titles — "if tags exist with that then it's in
// scope" was the very failure mode being corrected. surface_tags is accepted (it is part of a census row)
// and carried into `basis` for traceability, but it never moves a verdict. Every verdict is decided by
// title/URL content alone.
//
// Every verdict carries the exact rule name that fired, so a wrong call is traceable to one line here.

// ── CELEX decoding ──────────────────────────────────────────────────────────────────────────────────────
// CELEX id shape: <sector digit><4-digit year><1-2 letter type><sequential number>, e.g. CELEX:32011L0037
// (sector 3 = secondary legislation, year 2011, type L = Directive, number 0037). Sector '0' = a consolidated
// text of an existing act, where the year+number pair is the ORIGINAL act's own year+number, not the
// consolidation date. Sector '5' = a preparatory act (COM/JOIN proposal) — not yet enacted law.
// Reference: sector 1 treaties, 2 international agreements, 3 secondary legislation, 4 complementary
// legislation, 5 preparatory acts, 6 case-law, 7 parliamentary questions, 0 consolidated texts.
const CELEX_RE = /CELEX:?\s*(\d)(\d{4})([A-Z]{1,2})(\d+)/i;

/**
 * Decode a CELEX identifier out of a document_url or title, if one is present.
 * @param {string} text
 * @returns {{raw:string, sector:string, year:number, type:string, number:number}|null}
 */
export function parseCelex(text) {
  if (!text) return null;
  let decoded = text;
  try { decoded = decodeURIComponent(text); } catch { /* not URL-encoded; use as-is */ }
  const m = CELEX_RE.exec(decoded);
  if (!m) return null;
  return {
    raw: m[0],
    sector: m[1],
    year: parseInt(m[2], 10),
    type: m[3].toUpperCase(),
    number: parseInt(m[4], 10),
  };
}

// ── URL-derived search text (ROUND 2) ───────────────────────────────────────────────────────────────────
// 765 of the 3,312 round-1 ambiguous rows carry no title at all (census_worklist.title is null/empty) —
// but many of those still carry a document_url whose own path or filename is human-readable: EUR-Lex bare
// CELEX links carry no text (correctly stay ambiguous below), but federalregister.gov and most agency PDF/
// HTML links encode a descriptive slug or filename ("…/2026-12912/response-to-petition-for-reconsideration-
// federal-motor-vehicle-safety-standards-seat-belt-assembly", "…?filename=policy_transport_shipping_gd3_
// accreditation_and_verification_en.pdf"). This is not a network fetch — it is reading more of the same
// document_url field the census export already carries and round 1's CELEX parser already reads — so it
// stays inside the $0/no-I-O contract. When a title is present it is used verbatim and this function is a
// no-op; only an EMPTY title falls through to a derived slug, and a slug that turns out equally uninformative
// (a bare id, a statute-section number) still correctly falls through every rule to `no_signal_ambiguous`.
function deriveUrlText(document_url) {
  const u = String(document_url || "");
  if (!u) return "";
  const filenameParam = /[?&]filename=([^&]+)/i.exec(u);
  let seg = filenameParam
    ? filenameParam[1]
    : u.split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop() || "";
  try {
    seg = decodeURIComponent(seg);
  } catch {
    /* not URL-encoded; use as-is */
  }
  seg = seg.replace(/\.(pdf|html?|aspx?|docx?)$/i, "");
  seg = seg.replace(/[_-]+/g, " ");
  seg = seg.replace(/\b(en|fr|de)\b$/i, "");
  return seg.trim();
}

/**
 * The text every rule below is matched against: the title verbatim when present, otherwise a document_url-
 * derived pseudo-title (see deriveUrlText). Exported so the worklist runner/tests can assert on it directly.
 * @param {string} title
 * @param {string} document_url
 * @returns {string}
 */
export function deriveSearchText(title, document_url) {
  const t = String(title || "").trim();
  return t || deriveUrlText(document_url);
}

// A NARROW, honestly-scoped table: base instruments whose CELEX (sector, year, type, number) is decodable
// as off-vertical WITHOUT reading the title at all — because that exact (year, type, number) tuple names one
// specific, well-known base act (its own CELEX, or the sector-0 consolidated-text CELEX of the same act,
// which reuses the original year+number). This is NOT a general "guess the subject from the number" table —
// CELEX numbers do not encode subject matter beyond this — it is a short, named list of recurring roots this
// lane has verified. Anything else needs the title-based rules below.
const CELEX_ROOT_FAILS_MECHANISM = {
  celex_root_customs_nomenclature:
    "Council Regulation (EEC) No 2658/87 (Combined Nomenclature / Common Customs Tariff) is the base customs-classification act — pure tariff/customs-nomenclature machinery, no carbon/environmental-intensity content.",
  celex_root_union_customs_code:
    "Regulation (EU) No 952/2013 (Union Customs Code) is the base customs-code act — pure customs procedure/administration, no carbon/environmental-intensity content.",
};

export const KNOWN_OFF_VERTICAL_CELEX_ROOTS = [
  { sector: "3", year: 1987, type: "R", number: 2658, rule: "celex_root_customs_nomenclature",
    label: "Council Regulation (EEC) No 2658/87 (Combined Nomenclature / Common Customs Tariff) — base act",
    failsMechanism: CELEX_ROOT_FAILS_MECHANISM.celex_root_customs_nomenclature },
  { sector: "0", year: 1987, type: "R", number: 2658, rule: "celex_root_customs_nomenclature",
    label: "Council Regulation (EEC) No 2658/87 (Combined Nomenclature / Common Customs Tariff) — consolidated text",
    failsMechanism: CELEX_ROOT_FAILS_MECHANISM.celex_root_customs_nomenclature },
  { sector: "3", year: 2013, type: "R", number: 952, rule: "celex_root_union_customs_code",
    label: "Regulation (EU) No 952/2013 (Union Customs Code) — base act",
    failsMechanism: CELEX_ROOT_FAILS_MECHANISM.celex_root_union_customs_code },
  { sector: "0", year: 2013, type: "R", number: 952, rule: "celex_root_union_customs_code",
    label: "Regulation (EU) No 952/2013 (Union Customs Code) — consolidated text",
    failsMechanism: CELEX_ROOT_FAILS_MECHANISM.celex_root_union_customs_code },
];

// ── ON-VERTICAL rules (checked first — ADR-020's edge zones ruled IN take priority over any denylist
// overlap, e.g. a CBAM corrigendum must not fall into the language-correction denylist bucket below).
// Ordered; first match wins. Each `test` is a case-insensitive RegExp run against the title.
export const ON_VERTICAL_RULES = [
  {
    name: "adr020_edge_zone_cbam_ets",
    test: /carbon border adjustment|\bcbam\b|emissions? trading system|eu\s*ets\b|greenhouse gas emission allowance/i,
    label: "ADR-020 edge zone: CBAM/ETS-at-the-border",
    mechanism: "CAPS + PRICES: EU ETS caps GHG emissions from covered installations, aviation, and (via its maritime extension) shipping; CBAM prices the embedded carbon of imported goods at the border, directly pricing the carbon intensity of goods entering the logistics supply chain.",
  },
  {
    name: "adr020_edge_zone_esg_due_diligence",
    test: /corporate sustainability due diligence|supply[- ]chain due diligence|human rights and environmental due diligence|deforestation[- ]free|\beudr\b/i,
    label: "ADR-020 edge zone: ESG supply-chain due diligence",
    mechanism: "ENABLES + VERIFIES: corporate sustainability/human-rights-and-environmental due-diligence and deforestation-free supply-chain rules require verification and management of environmental impact through the logistics supply chain itself.",
  },
  {
    name: "adr020_edge_zone_energy_fuel_tax_relief",
    test: /energy taxation directive|taxation of energy products|excise duty relief.*energy|fuel duty relief|energy (?:tax|duty) exemption/i,
    label: "ADR-020 edge zone: energy/fuel taxation reliefs",
    mechanism: "PRICES: energy/fuel taxation and duty-relief rules directly price freight fuel.",
  },
  {
    name: "core_sustainability_packaging_waste",
    test: /packaging and packaging waste|extended producer responsibility|\bepr scheme\b|circular economy action plan/i,
    label: "Core sustainability corpus: packaging waste / EPR",
    mechanism: "STANDARDS + ENABLES: packaging-waste/EPR/circular-economy rules standard the environmental footprint of packaging as it moves through the logistics supply chain (how goods are packed, labelled, and recovered).",
  },
  {
    name: "core_sustainability_climate_environment",
    test: /climate change|greenhouse gas emissions? reduction|renewable energy directive|waste shipment regulation|batteries regulation|ecodesign|corporate sustainability reporting|\bcsrd\b|sustainable finance taxonomy/i,
    label: "Core sustainability corpus: climate/environment/circular-economy",
    mechanism: "MIXED — see mechanismQuestion in this same rule's companion note below the rule table; largely retained on the strength of its narrower sub-matches (greenhouse-gas-emissions reduction, renewable energy, waste shipment, batteries) which do satisfy STANDARDS for freight fuels/vehicles/logistics-supply-chain waste movement, while its broadest sub-matches (generic 'climate change', ecodesign, CSRD, sustainable-finance taxonomy) are flagged separately as a mechanism-re-audit question — see the report.",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31, MIXED rule — largest ON_VERTICAL bucket, 106 rows): this rule's five sub-phrases are not uniformly freight-mechanism-satisfying. 'greenhouse gas emissions reduction', 'renewable energy directive', and 'waste shipment regulation' plausibly satisfy STANDARDS for freight fuels/logistics-supply-chain waste movement. But 'climate change' (generic), 'ecodesign' (general product energy-efficiency labelling, e.g. appliances), 'corporate sustainability reporting/CSRD' (general corporate ESG-disclosure law applying to all large companies, not freight-specific), and 'sustainable finance taxonomy' (an investment-classification system) satisfy no prong on a strict freight-mechanism reading — this is the single largest instance of the instrument-family-not-mechanism defect this wave exists to fix. Kept on_vertical in full (never silently flipped, and the rule's match logic cannot be split without becoming five separate rules); flagged prominently for operator review — a follow-up wave should split this rule along its five sub-phrases so each can be independently mechanism-tested.",
  },

  // ── ROUND 2 (this wave): mined from the 3,312 round-1 ambiguous titles — see MINT-RUNBOOK.md / this
  // wave's screen report for the cluster table. Appended after every round-1 rule so no round-1 verdict
  // (193 on_vertical / 156 off_vertical) can change: those rows already matched an earlier rule in this
  // same array or in OFF_VERTICAL_RULES, which is checked only after this whole array is exhausted.
  {
    name: "reach_chemicals_regulation",
    test: /registration,\s*evaluation,\s*authorisation and restriction of chemicals|\(reach\)|regulation\s*\(ec\)\s*no\s*1907\/2006/i,
    label: "Core sustainability: REACH (chemicals registration/evaluation/authorisation/restriction)",
    mechanism: "STANDARDS + ENABLES: REACH registration/authorisation/restriction determines what chemical cargo may lawfully be manufactured, imported, and therefore shipped — a direct compliance gate on the logistics supply chain's cargo content.",
  },
  {
    name: "clp_classification_labelling_packaging",
    test: /classification, labelling and packaging of substances/i,
    label: "Core sustainability: CLP hazardous-substance classification/labelling/packaging",
    mechanism: "STANDARDS: CLP hazard classification/labelling/packaging rules directly govern how hazardous cargo must be labelled and packaged for shipment through the logistics supply chain.",
  },
  {
    name: "ship_recycling_regulation",
    test: /ship recycling|regulation\s*\(eu\)\s*no\s*1257\/2013/i,
    label: "Core sustainability: EU Ship Recycling Regulation",
    mechanism: "STANDARDS + VERIFIES: the EU Ship Recycling Regulation (and Hong Kong Convention) standards and verifies environmentally sound end-of-life handling of freight vessels, including Inventory of Hazardous Materials (IHM) verification.",
  },
  {
    name: "air_quality_standards",
    test: /\bair quality\b/i,
    label: "Core sustainability: ambient air quality standards/limit values",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): ambient air-quality limit-value standards regulate general AIR QUALITY outcomes, not specifically freight movement, fuels, vehicles, vessels, or infrastructure — no prong clearly satisfied on a strict freight-mechanism reading. Kept on_vertical (never silently flipped); flagged for operator review — this is core to the pre-existing ADR-020 'core sustainability corpus' framing and may reflect a scope choice the operator intends to keep broader than the literal freight-mechanism test.",
  },
  {
    name: "persistent_organic_pollutants",
    test: /persistent organic pollutant|stockholm convention/i,
    label: "Core sustainability: persistent organic pollutants (Stockholm Convention)",
    mechanism: "STANDARDS: the Stockholm Convention restricts production, use, and international trade of listed POP chemicals — a direct constraint on what may lawfully move through the logistics supply chain.",
  },
  {
    name: "fluorinated_greenhouse_gases",
    test: /fluorinated greenhouse gas/i,
    label: "Core sustainability: F-gas regulation",
    mechanism: "STANDARDS: F-gas rules directly cap/standard refrigerant emissions from mobile air-conditioning and refrigeration units, including reefer freight vehicles and vessels.",
  },
  {
    name: "sulphur_content_fuels",
    test: /sulphur content of|reduction in the sulphur content/i,
    label: "Core sustainability: sulphur content of fuels (marine/liquid fuel air-pollution limits)",
    mechanism: "STANDARDS: MARPOL Annex VI / EU sulphur-content limits directly standard the environmental intensity of marine and liquid freight fuel.",
  },
  {
    name: "industrial_emissions_directive",
    test: /industrial emissions|best available techniques \(bat\)|directive 2010\/75\/eu|(?:integrated )?pollution prevention and control|directive 2008\/1\/ec/i,
    label: "Core sustainability: Industrial Emissions Directive / IPPC / BAT conclusions",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): the Industrial Emissions Directive/BAT-conclusions regime governs STATIONARY industrial installations generally, not freight vehicles/vessels/infrastructure/fuels/logistics-supply-chains specifically — no prong clearly satisfied. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "end_of_life_vehicles",
    test: /end-of-life vehicles?|directive 2000\/53\/ec/i,
    label: "Core sustainability: End-of-Life Vehicles Directive (circular economy)",
    mechanism: "STANDARDS: the End-of-Life Vehicles Directive standards the environmentally sound recycling/recovery of vehicles (including light commercial/freight vehicles) at end of life.",
  },
  {
    name: "packaging_waste_producer_responsibility",
    test: /packaging waste|producer responsibility obligations|packaging and packaging waste regulation/i,
    label: "Core sustainability: packaging-waste producer-responsibility schemes (broader than the round-1 EPR phrase)",
    mechanism: "STANDARDS + ENABLES: packaging-waste producer-responsibility schemes standard the environmental footprint of packaging moving through the logistics supply chain.",
  },
  {
    name: "co2_emission_standards",
    test: /\bco\s?2\s*emissions?\b|emissions?\s+of\s+co\s?2\b|carbon dioxide emissions?|carbon dioxyde emissions?|\bco\s?2\s*injection\b/i,
    // Excludes the one known dual-nature round-1 row (a type-approval procedural document that also
    // mentions CO2 determination) so this rule cannot silently reverse a round-1 off_vertical disposition.
    exclude: /multi-stage type-approval/i,
    label: "Core sustainability: CO2/carbon-dioxide emission standards and monitoring",
    mechanism: "STANDARDS: direct CO2/carbon-dioxide emission standards and monitoring requirements for freight vehicles/engines.",
  },
  {
    name: "alternative_fuels_infrastructure",
    test: /alternative fuels infrastructure|renewable transport fuel obligation/i,
    label: "Core sustainability: alternative-fuels infrastructure / renewable transport fuel obligations",
    mechanism: "ENABLES + STANDARDS: alternative-fuels-infrastructure and renewable-transport-fuel-obligation rules directly enable and standard freight-fuel infrastructure.",
  },
  {
    name: "ets_trading_scheme",
    test: /emissions? trading scheme|\buk ets\b|crc energy efficiency scheme|emissions trading|\bets extension to maritime\b/i,
    label: "ADR-020 edge zone: ETS, broader phrasing than round-1's 'trading system' (UK/national 'trading scheme' wording, CRC scheme, maritime ETS extension)",
    mechanism: "CAPS: emissions-trading schemes (UK ETS, maritime ETS extension) cap the carbon intensity of covered freight-adjacent sectors (aviation, shipping); the CRC scheme's broader organizational-energy-use members ride along under this rule but the scheme's founding mechanism (a carbon cap) is unambiguous.",
  },
  {
    name: "ets_registry_administration",
    test: /union registry|transaction log|national allocation (?:table|plan)|central administrator/i,
    label: "ADR-020 edge zone: EU ETS Union Registry / national allocation table / transaction log administration",
    mechanism: "VERIFIES: EU ETS Union Registry / national allocation table / transaction log administration is the verification/accounting infrastructure underlying the freight-relevant (aviation, maritime) emissions cap.",
  },
  {
    name: "ets_aviation_scope_administration",
    test: /aircraft operators.*(?:aviation activity|directive 2003\/87)/i,
    label: "ADR-020 edge zone: EU ETS aviation-scope aircraft-operator list (Directive 2003/87/EC)",
    mechanism: "CAPS: EU ETS aviation-scope aircraft-operator lists directly administer which air-cargo operators fall under the emissions cap.",
  },
  {
    name: "environmental_impact_assessment",
    test: /environmental impact assessment|national environmental policy act|\bnepa\b/i,
    label: "Core sustainability: environmental impact assessment procedure (EU EIA Directive / US NEPA)",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): EIA/NEPA is a generic project-review PROCEDURE applicable to any project type (buildings, dams, ports, roads alike) — it is a procedural gate, not itself a price/cap/standard/verification/enablement of freight-specific carbon or environmental intensity. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "transboundary_air_pollution_convention",
    test: /transboundary air pollution/i,
    label: "Core sustainability: Convention on Long-Range Transboundary Air Pollution",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): the Convention on Long-Range Transboundary Air Pollution is a general regional air-pollution treaty, not a freight-specific mechanism — no prong clearly satisfied. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "pollution_from_ships",
    test: /pollution from ships|prevention of air pollution from ships/i,
    label: "Core sustainability: MARPOL-family pollution-from-ships rules",
    mechanism: "STANDARDS: the MARPOL-family pollution-from-ships rules directly standard freight-vessel environmental intensity (oil, garbage, air-emission discharge limits).",
  },
  {
    name: "renewable_energy_directive_biofuel_certification",
    test: /directive\s*\(eu\)\s*2018\/2001|voluntary scheme.*demonstrating compliance/i,
    label: "Core sustainability: Renewable Energy Directive (RED II) biofuel/biomass sustainability certification schemes",
    mechanism: "STANDARDS + VERIFIES: RED II biofuel/biomass sustainability-certification schemes standard and verify the environmental intensity of freight fuel (biofuel blending stock).",
  },
  {
    name: "weee_rohs_electrical_equipment",
    test: /electrical and electronic equipment|waste electrical/i,
    label: "Core sustainability: WEEE/RoHS waste-electrical-equipment and hazardous-substance restriction",
    mechanism: "STANDARDS: WEEE/RoHS rules restrict hazardous substances in and govern end-of-life handling of electrical/electronic goods moving through the logistics supply chain (a major freight-forwarder cargo category).",
  },
  {
    name: "marine_environment_protection_committee",
    test: /marine environment protection committee/i,
    label: "Core sustainability: IMO Marine Environment Protection Committee positions",
    mechanism: "STANDARDS + VERIFIES: IMO MEPC positions are the source of MARPOL/EEXI/CII/ballast-water standards directly governing freight-vessel environmental intensity.",
  },
  {
    name: "energy_taxation_relief_broad",
    test: /reduced rate of taxation|directive 2003\/96\/ec/i,
    label: "ADR-020 edge zone: energy/fuel taxation reliefs, broader phrasing than round-1's exact-phrase match",
    mechanism: "PRICES: energy/fuel taxation-relief rules directly price freight fuel.",
  },
  {
    name: "energy_efficiency_policy",
    test: /energy efficiency|energy conservation program|energy conservation standard/i,
    label: "Core sustainability: energy-efficiency policy/schemes",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): 'energy efficiency' / 'energy conservation program' / 'energy conservation standard' is a broad phrase that can match building, appliance, and general energy-efficiency policy with no freight tie at all — no prong clearly satisfied on the matched population as a whole. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "volatile_organic_compounds",
    test: /volatile organic compounds/i,
    label: "Core sustainability: volatile organic compound emission limits",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): general VOC emission limits can apply to industrial/product sources (paints, solvents) with no freight-vehicle/vessel/fuel/infrastructure tie — no prong clearly satisfied. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "waste_shipment_export_recovery",
    test: /export for recovery of.*waste|waste shipment|regulation\s*\(ec\)\s*no\s*1013\/2006/i,
    // Excludes the one known dual-nature round-1 row (a customs tariff/nomenclature correlation table that
    // happens to reference the waste-shipment regulation's annex codes) so this cannot reverse a round-1
    // off_vertical disposition — that row's primary subject is the customs code table, not waste policy.
    exclude: /combined nomenclature/i,
    label: "Core sustainability: waste shipment / export-for-recovery-abroad regulation",
    mechanism: "STANDARDS: waste-shipment/export-for-recovery rules directly standard the cross-border SHIPMENT of waste — a logistics-supply-chain-specific environmental mechanism.",
  },
  {
    name: "hazardous_waste_transboundary_movement",
    test: /transboundary movements? of hazardous wastes?|transfrontier movements? of hazardous wastes?|basel convention/i,
    label: "Core sustainability: Basel Convention on transboundary movement of hazardous waste",
    mechanism: "STANDARDS: the Basel Convention directly standards the transboundary MOVEMENT (freight/logistics) of hazardous waste.",
  },
  {
    name: "epa_clean_air_act_sip_approval",
    test: /\bair plan approval\b|\bair plan revisions?\b/i,
    label: "Core sustainability: US EPA Clean Air Act State Implementation Plan (SIP) approvals",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): Clean Air Act State Implementation Plan approvals cover all emission sources within a state, not freight specifically — no prong clearly satisfied. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "neshap_nsps_emission_standards",
    test: /national emission standards for hazardous air pollutants|\bneshap\b|new source performance standards/i,
    label: "Core sustainability: US EPA NESHAP / New Source Performance Standards",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): NESHAP/New Source Performance Standards apply broadly across industrial source categories, not freight-specifically — no prong clearly satisfied on the matched population as a whole. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "heavy_duty_engine_emission_standards",
    test: /heavy duty highway engines|nonconformance penalties for model year/i,
    label: "Core sustainability: US heavy-duty highway engine GHG/emission standards",
    mechanism: "STANDARDS: US heavy-duty highway engine GHG/emission standards directly standard freight-truck engine environmental intensity.",
  },
  {
    name: "epcra_hazardous_chemical_inventory",
    test: /epcra hazardous chemical inventory|hazardous chemical inventory reporting/i,
    label: "Core sustainability: EPCRA hazardous-chemical inventory reporting (US analogue of REACH/CLP business compliance)",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): EPCRA Tier II reporting is FACILITY-level chemical-inventory/community-right-to-know reporting (any facility storing chemicals), not a freight-movement or logistics-supply-chain mechanism specifically — no prong clearly satisfied. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "rcra_hazardous_waste_land_disposal",
    test: /land disposal restrictions|hazardous and solid waste management|coal combustion residuals/i,
    label: "Core sustainability: US RCRA hazardous-waste land-disposal restrictions",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): RCRA land-disposal restrictions govern DISPOSAL-facility practice, not the freight/logistics movement of the waste (that is waste_shipment_export_recovery / hazardous_waste_transboundary_movement, which stay on with no question) — no prong clearly satisfied for this specific rule. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "renewable_chemical_biobased_biofuel",
    test: /renewable chemical and biobased product|regenerative agricultural biofuel|biorefinery/i,
    label: "Core sustainability: renewable-chemical/biobased/biofuel programs",
    mechanism: "ENABLES + STANDARDS: renewable-chemical/biobased/biofuel programs directly enable and standard freight-fuel supply.",
  },
  {
    name: "clean_truck_incentive_and_vehicle_emissions",
    test: /clean truck and bus incentive|vehicle efficiency standard|zero.emission requirements for/i,
    label: "Core sustainability: clean-truck incentive / vehicle efficiency / zero-emission programs",
    mechanism: "STANDARDS + ENABLES: clean-truck/bus incentive, vehicle-efficiency-standard, and zero-emission-requirement programs directly standard and enable freight-vehicle environmental intensity.",
  },
  {
    name: "motor_fuel_composition_and_content",
    test: /motor fuel \(composition and content\)/i,
    label: "Core sustainability: motor fuel composition/content standards (fuel-quality regulation)",
    mechanism: "STANDARDS: motor-fuel composition/content standards directly standard freight-fuel environmental intensity.",
  },
  {
    name: "maritime_mrv_co2_monitoring",
    test: /\bmrv\b.*maritime|maritime.*monitoring.*reporting.*verification|maritime mrv regulation/i,
    label: "ADR-020 edge zone: EU maritime MRV (CO2 monitoring/reporting/verification for shipping)",
    mechanism: "VERIFIES: EU maritime MRV directly verifies (monitoring, reporting, verification) freight-vessel CO2 intensity.",
  },
  {
    name: "fuel_quality_petrol_diesel_specification",
    test: /quality of petrol and diesel|specification of petrol.*diesel/i,
    label: "Core sustainability: Fuel Quality Directive (petrol/diesel specification)",
    mechanism: "STANDARDS: the Fuel Quality Directive directly standards the environmental specification of petrol/diesel used by freight vehicles.",
  },
  {
    name: "packaging_essential_requirements",
    test: /packaging \(essential requirements\)/i,
    label: "Core sustainability: Packaging Essential Requirements Regulations (packaging waste family)",
    mechanism: "STANDARDS: packaging essential-requirements rules directly standard the environmental footprint of packaging in the logistics supply chain.",
  },
  {
    name: "eco_management_audit_scheme",
    test: /eco-management and audit scheme|\bemas\b/i,
    label: "Core sustainability: EU Eco-Management and Audit Scheme (EMAS)",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): EMAS is a general voluntary environmental-management/audit scheme open to any organization in any sector, not a freight-specific mechanism — no prong clearly satisfied. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "oil_pollution_damage_liability",
    test: /oil pollution damage/i,
    label: "Core sustainability: civil liability for oil pollution damage (Bunkers Convention / CLC family)",
    mechanism: "PRICES + STANDARDS: civil-liability-for-oil-pollution rules (Bunkers Convention/CLC family) price and standard the environmental risk of freight-vessel oil pollution.",
  },
  {
    name: "ets_mrv_and_free_allocation",
    test: /monitoring and reporting of greenhouse gas emissions|annual emission allocations?|free allocation of emission allowances|benchmarks? for free allocation/i,
    label: "ADR-020 edge zone: EU ETS monitoring/reporting (MRV) and free-allocation benchmark administration",
    mechanism: "VERIFIES: ETS monitoring/reporting (MRV) and free-allocation benchmark administration is the verification/accounting infrastructure for the freight-relevant emissions cap.",
  },
  {
    name: "carbon_capture_storage",
    test: /storage of carbon dioxide/i,
    label: "Core sustainability: carbon capture and storage (CCS) regulation",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): carbon capture and storage regulation addresses industrial decarbonization/storage siting generally, not freight movement/fuels/vehicles/vessels/infrastructure specifically (CO2 transport TO a storage site is not what this rule's matched text names) — no prong clearly satisfied. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "pollutant_release_transfer_register",
    test: /pollutant release and transfer register/i,
    label: "Core sustainability: European Pollutant Release and Transfer Register (E-PRTR)",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): E-PRTR is general industrial-facility pollutant-release reporting, not freight-specific — no prong clearly satisfied. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "environmental_permitting_regime",
    test: /environmental permitting \(england and wales\)/i,
    label: "Core sustainability: UK Environmental Permitting regime (emissions/waste/water permitting)",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): the UK Environmental Permitting regime covers emissions/waste/water permitting for any regulated activity, not freight-specifically — no prong clearly satisfied. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "carbon_price_support_and_renewables_obligation",
    test: /amendments for carbon price support|\brenewables obligation\b/i,
    label: "Core sustainability: UK Carbon Price Support / Renewables Obligation schemes",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): UK Carbon Price Support and the Renewables Obligation are POWER-SECTOR (electricity generation) carbon-pricing/renewables mechanisms, not freight-fuel or freight-vehicle mechanisms — no prong clearly satisfied. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "single_use_carrier_bags_charge",
    test: /single use carrier bags? charge/i,
    label: "Core sustainability: single-use plastic carrier bag charge (circular economy)",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): the single-use carrier-bag charge is a RETAIL point-of-sale measure (grocery bags), not freight/logistics packaging — a materially weaker logistics-supply-chain tie than the other packaging rules in this ruleset. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "reach_regulation_uk_si_family",
    test: /^the reach\b/i,
    label: "Core sustainability: UK 'The REACH ... Regulations' statutory-instrument family (REACH onshoring), broader than the round-2 parenthesised '(REACH)' match",
    mechanism: "STANDARDS + ENABLES: the UK REACH-onshoring statutory-instrument family carries the same chemical-cargo compliance-gate mechanism as reach_chemicals_regulation.",
  },
  {
    name: "waste_regulation_uk_si_family",
    test: /^the waste \(/i,
    label: "Core sustainability: UK 'The Waste (...) Regulations' statutory-instrument family",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): 'The Waste (...) Regulations' is a generic UK statutory-instrument family name that could cover landfill, waste-carrier licensing, or general waste management with no freight/logistics-shipment tie shown by the pattern alone — ambiguous population. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "environmental_protection_prescribed_processes",
    test: /environmental protection \(prescribed processes and substances/i,
    label: "Core sustainability: UK Environmental Protection (Prescribed Processes and Substances) regime",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): the UK Environmental Protection (Prescribed Processes and Substances) regime is a general FACILITY/industrial-process permitting regime, not freight-specific — no prong clearly satisfied. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "batteries_and_accumulators_directive",
    test: /batteries and accumulators|directive 2006\/66\/ec/i,
    label: "Core sustainability: Batteries and Accumulators Directive (predecessor to the EU Batteries Regulation), broader than round-1's exact 'batteries regulation' phrase",
    mechanism: "STANDARDS: battery/accumulator rules directly standard the environmental handling (hazardous-substance restriction, end-of-life recovery) of a cargo category with a growing freight-safety and freight-decarbonization footprint (EV/freight-vehicle batteries, lithium-battery shipment compliance).",
  },
  {
    name: "kyoto_protocol",
    test: /kyoto protocol/i,
    label: "Core sustainability: Kyoto Protocol emission-level allocation",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): the Kyoto Protocol sets NATIONAL-level GHG emission-allocation targets, not a freight-specific price/cap/standard/verification/enablement — no prong clearly satisfied. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "hazardous_waste_list_and_classification",
    test: /hazardous waste \(|list of hazardous waste|list of wastes\b/i,
    label: "Core sustainability: hazardous/general waste list and classification (European Waste Catalogue family)",
    mechanism: "STANDARDS: hazardous/general waste classification lists directly determine the shipment/handling classification of a cargo category moving through the logistics supply chain.",
  },
  {
    name: "carbon_emissions_reduction_target_scheme",
    test: /carbon emissions reduction\b/i,
    label: "Core sustainability: UK Carbon Emissions Reduction Target energy-supplier scheme",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): the UK Carbon Emissions Reduction Target is a HOUSEHOLD energy-efficiency scheme delivered via energy suppliers (home insulation, appliances) — no freight tie, no prong clearly satisfied. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "carbon_accounting_uk",
    test: /\bcarbon accounting\b/i,
    label: "Core sustainability: UK carbon budget/assigned-amount-unit carbon accounting regulations",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): UK carbon-budget/assigned-amount-unit accounting is NATIONAL-level carbon accounting, not a freight-specific mechanism — no prong clearly satisfied. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
  {
    name: "alternative_fuel_labelling_and_ghg",
    test: /alternative fuel labelling and greenhouse gas emissions/i,
    label: "Core sustainability: alternative-fuel labelling / vehicle GHG-emissions information regulations",
    mechanism: "STANDARDS + VERIFIES: alternative-fuel-labelling/vehicle-GHG-information rules directly standard and verify freight-vehicle fuel/GHG disclosure.",
  },
  {
    name: "landfill_incineration_waste_prohibition",
    test: /prohibition on the incineration.*landfill|deposit in landfill.*specified waste/i,
    label: "Core sustainability: prohibition on incineration/landfill of specified waste (Landfill Directive family)",
    mechanismQuestion: "QUESTION (mechanism re-audit 2026-08-31): landfill/incineration prohibition rules govern DISPOSAL METHOD (a facility-level choice), not the freight/logistics movement of the waste — no prong clearly satisfied. Kept on_vertical (never silently flipped); flagged for operator review.",
  },
];

// ── OFF-VERTICAL rules (the runbook's denylist, MINT-RUNBOOK.md §0 + the M0 report's sampled false
// positives). Checked after ON_VERTICAL_RULES. Ordered; first match wins.
export const OFF_VERTICAL_RULES = [
  {
    name: "denylist_customs_tariff_nomenclature",
    test: /combined nomenclature|tariff and statistical nomenclature|common customs tariff|union customs code|customs code\b|tariff quota|tariff suspension|binding tariff information|customs declaration|customs formalit|\btir\b.*customs|trade[- ]formalities accession/i,
    label: "Denylist: customs/tariff/nomenclature forms",
    failsMechanism: "Pure customs classification/tariff-nomenclature machinery (Combined Nomenclature, Union Customs Code, tariff quotas/suspensions, customs declarations/formalities) — prices, caps, standards, verifies, or enables nothing about carbon or environmental intensity; it prices duty, not carbon.",
  },
  {
    name: "denylist_atm_air_services_bilateral",
    test: /air services agreement|air traffic management|single european sky|traffic rights\b|performance plan.*(?:air navigation|\batm\b)|bilateral.*aviation|air[- ]carrier ban list/i,
    label: "Denylist: ATM/air-services bilaterals",
    verdict: "on_vertical", // FLIP (mechanism re-audit 2026-08-31 (beyond the operator's 8 — confirmed by his own worked example))
    mechanism: "STANDARDS + CAPS + ENABLES: this rule's dominant matched content is the Single European Sky framework Regulation (EC) No 549/2004, its performance-and-charging scheme (Implementing Regulation (EU) 2019/317), the SESAR ATM Master Plan, and union-wide network performance targets (Implementing Decision (EU) 2021/891) — the same environmental-KPA fuel-burn-efficiency apparatus the operator ruled on-vertical under the sibling ses_performance_plan_administration / ses_route_charging_zone_administration rules. One matched row (Implementing Decision (EU) 2022/2358) explicitly CAPS a Member State's traffic rights \"due to serious environmental problems.\" Confirmed necessary by the operator's own worked example: CELEX 32004R0549 (the SES framework Regulation) matches only this rule and must land on_vertical. NOTE (residual precision, mechanism re-audit 2026-08-31): a genuinely non-mechanism minority also rides this regex — US-EU Bilateral Oversight Board air-safety-cooperation records and one EU-ICAO ATM-annex-adoption position carry no environmental content; a future rule split would isolate them. Flagged, not fixed, this pass.",
  },
  {
    name: "denylist_seafarer_certification_recognition",
    test: /recognition of.*(?:seafarer|certificates of competency)|training and certification of seafarers|\bstcw\b|waterway[- ]vessel[- ]licen[cs]e recognition/i,
    label: "Denylist: seafarer-certification recognition",
    failsMechanism: "Recognition of seafarer certificates of competency (STCW) is a human-qualification recognition regime, not a technical or environmental standard on vessels, fuels, or cargo movement.",
  },
  {
    name: "denylist_vehicle_type_approval_correction",
    test: /type[- ]approval/i,
    label: "Denylist: vehicle type-approval corrections",
    failsMechanism: "Individual EC type-approval administrative corrections, exemption requests, and amendment regulations govern the type-approval PROCESS itself (procedural/administrative), not an emissions or environmental standard's content — the substantive CO2/emission standards these vehicles are tested against live in the co2_emission_standards rule, which this one is deliberately kept distinct from (see that rule's exclude clause).",
  },
  {
    name: "denylist_crypto_mica",
    test: /markets in crypto-assets|\bmica\b|crypto-asset/i,
    label: "Denylist: crypto/MiCA",
    failsMechanism: "Crypto-asset/MiCA regulation has no freight, fuel, vehicle, vessel, infrastructure, or logistics-supply-chain content of any kind.",
  },
  {
    name: "denylist_language_correction",
    test: /corrigendum|linguistic correction|correction to the .*language version|correction of certain language versions/i,
    label: "Denylist: language-correction decisions",
    failsMechanism: "A corrigendum or language-version correction changes no substantive content — it cannot itself price, cap, standard, verify, or enable anything.",
  },
  {
    name: "denylist_general_tax_administration",
    test: /vat invoicing|value added tax.*invoicing|invoicing requirements? directive|vat rates? administration|tax administration procedure/i,
    label: "Denylist: general tax-administration procedure (distinct from the energy/fuel taxation-relief edge zone, which stays IN)",
    failsMechanism: "General VAT-invoicing and tax-administration procedure is fiscal-compliance machinery with no carbon/environmental-intensity content — distinct from the energy/fuel taxation-RELIEF edge zone, which prices freight fuel and stays in scope.",
  },

  // ── ROUND 2 (this wave): mined from the 3,312 round-1 ambiguous titles. ADR-020's own framing —
  // "pure customs-procedure and transport-administration law is out of scope" plus the explicit
  // "dangerous goods" ruled-out item — covers most of these; the rest are US federal-agency content
  // (this census pulls federalregister.gov and other agency sources, not EUR-Lex alone) with no
  // sustainability/freight nexus at all. Appended after every round-1 rule for the same non-reversal
  // reason documented in ON_VERTICAL_RULES above.
  {
    name: "dangerous_goods_carriage",
    test: /carriage of dangerous goods|transport of dangerous goods|inland transport of dangerous goods|drivers of vehicles carrying dangerous goods/i,
    label: "ADR-020 ruled OUT: dangerous goods (carriage/transport, ADR/RID/ADN family)",
    failsMechanism: "The ADR/RID/ADN dangerous-goods carriage regime classifies and manages HAZARD (explosion, toxicity, corrosivity) during transport for safety purposes — it does not price, cap, standard, verify, or enable the carbon or environmental intensity of the movement, fuel, vehicle, vessel, or infrastructure; ADR-020 rules it out by name.",
  },
  {
    name: "vehicle_construction_and_use",
    test: /\(construction and use\)/i,
    label: "Denylist: vehicle construction-and-use technical/roadworthiness standards (transport-administration, distinct phrasing from round-1's 'type-approval')",
    failsMechanism: "UK Construction and Use amendment regulations are a broad, generic vehicle technical/roadworthiness administrative family (dimensions, lighting, brakes, mirrors, etc.) — the matched population carries no emission/environmental standard content in title; sampled rows are bare 'Amendment Regulations <year>' with no substantive text at all.",
  },
  {
    name: "air_transport_bilateral_agreements",
    test: /euro-mediterranean aviation agreement|common aviation area agreement|\bair transport committee\b|agreement.*\bon air transport\b|international civil aviation organi[sz]ation|\bicao\b/i,
    label: "Denylist: aviation bilateral agreements/committees (transport-administration)",
    failsMechanism: "Aviation bilateral agreements, joint committees, and ICAO cooperation positions are market-access/regulatory-cooperation governance — traffic rights and civil-aviation-safety cooperation, not a carbon/environmental-intensity mechanism.",
  },
  {
    name: "air_carrier_operating_ban_list",
    test: /community list of air carriers|banned from operating|subject to operational restrictions|subject to an operating ban/i,
    label: "Denylist: EU banned-air-carrier list maintenance (aviation-safety administration)",
    failsMechanism: "The EU banned-air-carrier list is a flight-SAFETY administration instrument (grounding unsafe operators) — it verifies airworthiness/safety oversight, not environmental performance.",
  },
  {
    name: "inland_transport_committee_bilateral",
    test: /inland transport committee|carriage of goods and passengers by rail and road|carriage of freight by (?:road|rail)\b/i,
    label: "Denylist: bilateral inland-transport committee positions (transport-administration)",
    failsMechanism: "Bilateral inland-transport committee positions and carriage-of-freight agreements are market-access/administrative cooperation instruments (who may carry, under what quota/permit terms) — they do not price, cap, standard, verify, or enable carbon/environmental intensity.",
  },
  {
    name: "tachograph_driver_recording",
    test: /\btachograph/i,
    label: "Denylist: tachograph driver-recording-device administration (road-transport administration)",
    failsMechanism: "Tachograph driver-recording-device rules are a labour/working-time and road-safety administration mechanism (fraud prevention on driving-time records) with no carbon/environmental content.",
  },
  {
    name: "tir_convention_customs",
    test: /\btir\b.*carnet|carnet.*\btir\b|tir convention/i,
    label: "Denylist: TIR Convention / TIR carnets (customs transit)",
    failsMechanism: "The TIR Convention is a customs-transit facilitation instrument (guarantee/carnet system for goods crossing borders under customs seal) — pure customs procedure, no environmental mechanism.",
  },
  {
    name: "otif_rail_interoperability_bilateral",
    test: /intergovernmental organisation for international carriage by rail|\botif\b/i,
    label: "Denylist: OTIF rail-interoperability positions (transport-administration)",
    failsMechanism: "Every matched row is an EU 'position to be taken' at an OTIF committee/assembly session — diplomatic representation/governance procedure, not a technical standard itself; distinct from rail_freight_corridor_governance's freight-corridor decarbonization-capacity framing (no freight-specific or environmental content shown in any matched title).",
  },
  {
    name: "rail_technical_specification_interoperability",
    test: /technical specification(?:s)? for interoperability|technical specification relating to/i,
    label: "Denylist: rail technical-specification-for-interoperability standards (transport-administration)",
    failsMechanism: "A broad, generic catch-all for ANY rail Technical Specification for Interoperability (rolling stock, telematics, safety-in-railway-tunnels, infrastructure, operation-and-traffic-management, language corrections to same) — most matched TSI subjects carry no environmental content. NOTE (mechanism re-audit 2026-08-31, not flipped): the Noise and Energy-subsystem TSIs specifically (2 of 23 sampled rows) plausibly satisfy STANDARDS for freight-rail infrastructure/vehicle environmental intensity, but the rule as matched cannot isolate them from the non-environmental majority without changing match logic — flagged for a future rule split, not flipped this pass.",
  },
  {
    name: "ses_performance_plan_administration",
    test: /consistency of the performance targets|draft performance plan|regulation\s*\(ec\)\s*no\s*549\/2004|functional airspace block/i,
    label: "Denylist: Single European Sky air-navigation performance-plan administration, broader phrasing than round-1's exact match",
    verdict: "on_vertical", // FLIP (operator ruling 2026-08-31)
    mechanism: "STANDARDS: Single European Sky performance-plan decisions set binding fuel-burn/ATM efficiency targets (the environment Key Performance Area) that apply per flight, including air-cargo flights — a standard on the carbon intensity of freight-vessel(aircraft) movement, not just ATM bureaucracy.",
  },
  {
    name: "social_legislation_road_transport",
    test: /social legislation.*road transport|harmonization of certain social legislation/i,
    label: "Denylist: road-transport social legislation (driver rest/working-time administration)",
    failsMechanism: "Road-transport 'social legislation' implementing measures govern driver rest/working-time administration (labour law), not carbon/environmental intensity.",
  },
  {
    name: "rhine_navigation_administration",
    test: /central commission for the navigation of the rhine|\bcesni\b/i,
    label: "Denylist: Rhine inland-navigation administration (CCNR/CESNI, transport-administration)",
    failsMechanism: "Every matched row is an EU 'position to be taken' within the CCNR/CESNI committee structure — administrative representation at an international navigation body, not the substantive technical standard itself; CESNI's own vessel-emission standards are not what these titles carry.",
  },
  {
    name: "customs_trade_formalities_simplification",
    test: /simplification of formalities in trade in goods|simplification and harmonization of customs|common transit procedure|community transit\b|de minimis exemption/i,
    label: "Denylist: customs trade-formalities simplification / transit procedure",
    failsMechanism: "Customs-formalities-simplification conventions, common-transit-procedure agreements, and de-minimis exemptions are pure customs/trade-facilitation procedure with no carbon/environmental content.",
  },
  {
    name: "port_state_control_administration",
    test: /port state control/i,
    label: "Denylist: port State control enforcement administration (maritime-safety, not itself a sustainability rule)",
    verdict: "on_vertical", // FLIP (mechanism re-audit 2026-08-31 (beyond the operator's 8))
    mechanism: "VERIFIES: port State control inspections (Directive 2009/16/EC and successors) verify vessel and operator compliance with MARPOL and other pollution-prevention conventions as a standing inspection category, directly analogous to the operator's ship_classification_society_accreditation ruling — one matched row is titled exactly on \"Prevention of Pollution from Noxious Liquid Substances in Bulk.\"",
  },
  {
    name: "unece_vehicle_technical_regulation",
    test: /economic commission for europe.*uniform provisions|un\/ece.*uniform provisions|regulation no \d+ of the economic commission for europe|permissible sound level and the exhaust system/i,
    label: "Denylist: UN/ECE vehicle uniform-provisions technical regulations (type-approval-adjacent; the pollutant-emission-titled ones are still a certification PROCEDURE, not an emissions policy instrument)",
    failsMechanism: "A broad UN/ECE 'uniform provisions' catch-all spanning mudguards, rear markings, mechanical couplings, tyres, brakes, front-underrun protection, etc. — overwhelmingly general vehicle-equipment type-approval, not environmental. NOTE (mechanism re-audit 2026-08-31, not flipped): roughly a fifth of the sampled population (the Directive 70/157/EEC 'permissible sound level and the exhaust system' family) plausibly satisfies STANDARDS for freight-vehicle noise/exhaust, but the rule as matched cannot isolate that subset from the equipment-standards majority — flagged for a future rule split, not flipped this pass.",
  },
  {
    name: "ship_classification_society_accreditation",
    test: /ship inspection and survey organisations|regulation\s*\(ec\)\s*no\s*391\/2009/i,
    label: "Denylist: ship classification-society accreditation administration",
    verdict: "on_vertical", // FLIP (operator ruling 2026-08-31)
    mechanism: "VERIFIES: accredited ship classification/survey societies verify vessel compliance with EEXI, CII, and ballast-water-management requirements as part of their statutory survey function — this is the verification layer for freight-vessel environmental intensity, not mere accreditation paperwork.",
  },
  {
    name: "rail_freight_corridor_governance",
    test: /rail freight corridor/i,
    label: "Denylist: rail freight corridor governance/administration (infrastructure administration, not itself a sustainability rule)",
    verdict: "on_vertical", // FLIP (operator ruling 2026-08-31)
    mechanism: "ENABLES: rail freight corridor governance (compliance decisions on Member States' joint corridor proposals under Regulation (EU) No 913/2010) enables intermodal decarbonization capacity — the infrastructure capacity for freight to shift from road to lower-carbon rail.",
  },
  {
    name: "road_transport_driver_work_administration",
    test: /\baetr\b|work of crews of vehicles engaged in international road transport/i,
    label: "Denylist: AETR road-transport-crew work administration",
    failsMechanism: "AETR road-transport-crew work-time administration is labour law (driving/rest time), not a carbon/environmental mechanism.",
  },
  {
    name: "road_transport_market_access_administration",
    test: /road transport undertakings|national electronic registers of road transport/i,
    label: "Denylist: road-transport-operator market-access administration",
    failsMechanism: "Road-transport-operator market-access administration (hired-vehicle data requirements, national electronic registers, member-state aid decisions to road hauliers) governs WHO may operate, not the environmental intensity of the operation.",
  },
  {
    name: "denylist_language_correction_broad",
    test: /correcting (?:the |certain )?.*language version/i,
    label: "Denylist: language-correction decisions, broader phrasing than round-1's exact match",
    failsMechanism: "A language-version correction changes no substantive content — it cannot itself price, cap, standard, verify, or enable anything.",
  },
  {
    name: "inland_waterway_transport_administration",
    test: /inland waterway (?:goods transport|vessels?|charter)|reciprocal recognition of navigability licences|river information services/i,
    label: "Denylist: inland-waterway transport administration (licensing/chartering/information services)",
    failsMechanism: "Inland-waterway vessel-licensing, chartering, and river-information-service administration governs WHO may operate and how traffic is coordinated, not the environmental intensity of the vessel or its fuel.",
  },
  {
    name: "uscg_safety_security_zone",
    test: /\bsafety zones?\b|\bsecurity zone\b|special local regulations?/i,
    label: "Denylist: US Coast Guard safety/security-zone and special-local-regulation event notices",
    failsMechanism: "USCG safety/security zones and special local regulations are event-based navigational-safety/security exclusion notices (marine events, security perimeters) — no environmental content.",
  },
  {
    name: "faa_airworthiness_directive",
    test: /airworthiness directives?/i,
    label: "Denylist: FAA airworthiness directives (aircraft-model maintenance/safety)",
    failsMechanism: "FAA airworthiness directives address aircraft-model mechanical safety defects (structural, engine-reliability) — an airworthiness/safety mechanism, not an environmental-performance one.",
  },
  {
    name: "faa_airspace_administration",
    test: /\bclass [de] airspace\b|domestic very high frequency omnidirectional range|standard instrument approach procedures|restricted areas? r ?\d|jet route|area navigation route/i,
    label: "Denylist: FAA airspace administration (class D/E airspace, routes, restricted areas)",
    failsMechanism: "FAA airspace-class/route/restricted-area administration governs where aircraft may fly for safety/deconfliction purposes, not the environmental intensity of the flight.",
  },
  {
    name: "fda_medical_device_classification",
    test: /medical devices?\b.*classification of the/i,
    label: "Denylist: FDA medical-device classification (no sustainability/freight nexus)",
    failsMechanism: "FDA medical-device classification has no freight, fuel, vehicle, vessel, infrastructure, or logistics-supply-chain content whatsoever.",
  },
  {
    name: "pesticide_tolerances",
    test: /pesticide tolerances|exemption from the requirement for a tolerance/i,
    label: "Denylist: EPA pesticide residue tolerances (food/agriculture, not freight-sustainability)",
    failsMechanism: "EPA pesticide-residue tolerances are a food/agriculture-safety mechanism (permissible residue levels on food crops), not a freight/logistics carbon or environmental-intensity mechanism.",
  },
  {
    name: "fisheries_management",
    test: /\bfisheries\b|fishery management plan|magnuson.?stevens/i,
    label: "Denylist: fisheries/catch management (marine-resource conservation, not the freight-sustainability vertical ADR-020 scopes)",
    failsMechanism: "Fisheries catch-quota/management-plan administration is marine-RESOURCE conservation (stock sustainability), not freight, freight-vessel, or logistics-supply-chain carbon/environmental intensity.",
  },
  {
    name: "federal_acquisition_regulation",
    test: /federal acquisition regulation/i,
    label: "Denylist: US federal procurement regulation (no sustainability/freight nexus)",
    failsMechanism: "Federal procurement regulation governs how the US government buys goods/services — an administrative-contracting mechanism with no carbon/environmental content.",
  },
  {
    name: "immigration_administration",
    test: /naturalization application|alien registration|nonimmigrant|unaccompanied children program|eb.?5 reform/i,
    label: "Denylist: US immigration administration (no sustainability/freight nexus)",
    failsMechanism: "US immigration administration (naturalization, alien registration, visa programs) has no freight or environmental-intensity content of any kind.",
  },
  {
    name: "civil_rights_nondiscrimination_program",
    test: /nondiscrimination in federally assisted programs|title vi regulations|nondiscrimination on the basis of sex/i,
    label: "Denylist: US civil-rights/nondiscrimination program administration (no sustainability/freight nexus)",
    failsMechanism: "US civil-rights/nondiscrimination program administration (Title VI compliance) has no freight or environmental-intensity content.",
  },
  {
    name: "controlled_substances_scheduling",
    test: /schedules of controlled substances/i,
    label: "Denylist: DEA controlled-substance scheduling (no sustainability/freight nexus)",
    failsMechanism: "DEA controlled-substance scheduling is a public-health/law-enforcement classification regime, not a freight or environmental-intensity mechanism.",
  },
  {
    name: "coal_mine_safety_administration",
    test: /underground coal mines/i,
    label: "Denylist: MSHA underground coal-mine worker-safety administration (occupational safety, not environmental/climate policy)",
    failsMechanism: "MSHA underground coal-mine regulation is OCCUPATIONAL safety administration (worker protection in mines) — distinct from environmental/climate policy and from freight movement entirely.",
  },
  {
    name: "nuclear_regulatory_administration",
    test: /spent fuel storage casks|reactor licensing|radioactive waste disposal|materials licensing|radiation protection framework/i,
    label: "Denylist: NRC nuclear-regulatory administration (a distinct regulatory silo from this corpus's waste/circular-economy theme)",
    failsMechanism: "NRC nuclear-regulatory administration (spent-fuel storage casks, reactor licensing, radiation protection, materials licensing) is a wholly separate regulatory silo from freight/logistics carbon-and-environmental-intensity, even though radioactive material occasionally moves by freight — these instruments govern the FACILITY/reactor regime, not the movement.",
  },
  {
    name: "wildlife_species_listing",
    test: /endangered and threatened wildlife and plants|migratory bird|migratory game bird/i,
    label: "Denylist: wildlife/species conservation listings (no freight-forwarder business-compliance nexus)",
    failsMechanism: "Endangered/threatened-species and migratory-bird-hunting administration is wildlife/species conservation — no freight-vehicle, freight-vessel, freight-fuel, freight-infrastructure, or logistics-supply-chain nexus.",
  },
  {
    name: "vehicle_safety_standard_us",
    test: /federal motor vehicle safety standards|ads equipped vehicle safety|electronic logging device|bus testing program/i,
    label: "Denylist: US federal motor vehicle safety/technical standards (vehicle-administration, not a sustainability rule)",
    failsMechanism: "US FMVSS vehicle-safety standards (crashworthiness, electronic logging devices, ADS safety-transparency programs) address occupant/operational safety, not carbon or environmental intensity.",
  },
  {
    name: "financial_services_administration_us",
    test: /swap dealers|uncleared swaps|stablecoin|anti money laundering|resolution submissions|depository institutions|form x.?17a.?5|margin requirements/i,
    label: "Denylist: US financial-services administration (banking/derivatives/AML — no sustainability/freight nexus)",
    failsMechanism: "US financial-services administration (swap dealer margin rules, stablecoin issuer requirements, AML, depository-institution resolution planning) has no freight or environmental-intensity content.",
  },
  {
    name: "ses_route_charging_zone_administration",
    test: /unit rates? for charging zones?|compliance of.*charging zone|implementing regulation \(eu\) no 391\/2013/i,
    label: "Denylist: Single European Sky air-navigation route-charging (unit-rate) administration",
    verdict: "on_vertical", // FLIP (operator ruling 2026-08-31)
    mechanism: "PRICES + STANDARDS: SES route-charging unit-rate compliance decisions administer the pricing side of the same environmental-KPA performance-target apparatus as ses_performance_plan_administration — airspace-use pricing tied to the environmental performance scheme, applicable to air-cargo tonne-km.",
  },
  {
    name: "road_transport_occupation_access_administration",
    test: /admission to the occupations? of road|access to the occupation of carrier/i,
    label: "Denylist: admission-to-the-occupation road/waterway-transport-operator market-access administration",
    failsMechanism: "Admission-to-the-occupation rules for road/waterway carriers are professional/market-access licensing administration (financial standing, good repute, professional competence) — not an environmental standard on the vehicle, vessel, or movement.",
  },
  {
    name: "goods_vehicle_operator_licensing",
    test: /goods vehicles? \(licensing of operators\)/i,
    label: "Denylist: goods-vehicle operator licensing administration",
    failsMechanism: "UK goods-vehicle operator-licensing amendment/exemption regulations are administrative licensing-scheme procedure — the sampled population carries no environmental-fitness content, only procedural amendment/exemption/temporary-use text.",
  },
  {
    name: "vehicle_roadworthiness_testing",
    test: /motor vehicles? \(tests\)|goods vehicles? \(tests\)/i,
    label: "Denylist: vehicle roadworthiness testing (MOT-style) administration",
    failsMechanism: "UK MOT-style roadworthiness-testing amendment regulations govern the TEST SCHEME procedurally (what tests exist, how administered) — the sampled titles are bare 'Amendment Regulations' with no emission-limit content; the substantive emission standards vehicles are tested against live elsewhere in this ruleset (co2_emission_standards, unece_vehicle_technical_regulation's noise/exhaust subset).",
  },
  {
    name: "transport_statistical_returns_administration",
    test: /statistical returns in respect of (?:the )?carriage/i,
    label: "Denylist: transport statistical-returns reporting administration (Eurostat data collection, not a sustainability rule)",
    failsMechanism: "Statistical-returns reporting on carriage of goods/passengers (Eurostat data collection) describes traffic volumes after the fact — it does not itself price, cap, standard, verify, or enable environmental intensity; it is background statistics collection, not a decarbonization-enabling mechanism.",
  },
  {
    name: "heavy_goods_vehicle_charging_administration",
    test: /charging of heavy goods vehicles for the use of certain infrastructure/i,
    label: "Denylist: heavy-goods-vehicle infrastructure-charging/vehicle-tax administration",
    verdict: "on_vertical", // FLIP (operator ruling 2026-08-31)
    mechanism: "PRICES: the Eurovignette Directive (1999/62/EC and successors) modulates HGV infrastructure-charging tariffs and vehicle tax by the vehicle's CO2 emission class and Euro emission standard — a direct price signal on freight-vehicle environmental intensity, not a flat administrative toll.",
  },
  {
    name: "single_electronic_reporting_format_taxonomy",
    test: /taxonomy.*single electronic reporting format|single electronic reporting format/i,
    label: "Denylist: ESEF single electronic reporting format (general corporate financial-reporting taxonomy, not sustainability-specific)",
    failsMechanism: "ESEF is a general corporate financial-reporting XBRL taxonomy applicable to all large issuers — a financial-disclosure-format standard, not a carbon/environmental-intensity mechanism, and not freight-specific.",
  },
  {
    name: "transit_ecopoints_bilateral_agreement",
    test: /system of ecopoints/i,
    label: "Denylist: Austria transit-ecopoints bilateral trade agreements (transport-administration)",
    verdict: "on_vertical", // FLIP (operator ruling 2026-08-31)
    mechanism: "CAPS: Austria/Switzerland Alpine transit-ecopoint systems cap the volume of heavy-goods-vehicle transit crossings by the vehicle's engine emission standard on environmentally sensitive corridors — a direct cap on freight-vehicle environmental intensity, not merely a bilateral trade formality.",
  },
  {
    name: "road_vehicle_weight_dimensions_administration",
    test: /road vehicles \(authorised weight\)/i,
    label: "Denylist: road-vehicle authorised-weight technical/administrative standards",
    failsMechanism: "UK 'Authorised Weight' regulations set load limits for road-safety/infrastructure-protection purposes — an administrative weight ceiling, not an environmental standard, though weight/dimension limits are increasingly used elsewhere as a fuel-efficiency lever; the matched instruments here (bare 'Amendment Regulations') show no such content.",
  },
  {
    name: "vehicle_type_approval_market_surveillance",
    test: /approval and market surveillance of motor vehicles/i,
    label: "Denylist: vehicle type-approval and market-surveillance administration, broader than round-1's hyphenated 'type-approval' match",
    failsMechanism: "Regulation (EU) 2018/858 is the umbrella type-approval/market-surveillance FRAMEWORK regulation — the administrative machinery through which many OTHER substantive standards (including but not limited to emissions) are enforced; the framework regulation itself is procedural, kept off for the same reason as denylist_vehicle_type_approval_correction (the substantive emission standard lives in co2_emission_standards).",
  },
];

function verdict(v, rule, basis) {
  return { verdict: v, rule, basis };
}

/**
 * Classify one census row for freight-sustainability relevance under ADR-020.
 * @param {{title?: string, document_url?: string, surface_tags?: string[]}} row
 * @returns {{verdict: 'on_vertical'|'off_vertical'|'ambiguous', rule: string, basis: string}}
 */
export function classifyRelevance({ title = "", document_url = "", surface_tags = [] } = {}) {
  const t = String(title || "").trim();
  const u = String(document_url || "").trim();
  const tagsNote = Array.isArray(surface_tags) && surface_tags.length
    ? ` surface_tags=[${surface_tags.join(", ")}] (carried for traceability only — never a decision input, per ADR-020 Amendment 1's C11 lesson).`
    : "";

  // ROUND 2: when title is empty, every title-matching rule below is instead matched against a
  // document_url-derived pseudo-title (see deriveSearchText) — still $0/no-I-O, still traceable, and a
  // no-op for the 2,932 rows that already carry a real title (searchText === t there). The basis string
  // makes clear which source produced the match.
  const searchText = deriveSearchText(t, u);
  const usedUrlDerivedText = !t && searchText.length > 0;
  const sourceNote = usedUrlDerivedText
    ? `no title present, matched against document_url-derived text "${searchText}"`
    : `title "${t}"`;

  const celex = parseCelex(u) || parseCelex(t);

  // 1. CELEX-number-only heuristic: a known off-vertical base-instrument root, decodable from the number
  // alone (no title needed at all).
  if (celex) {
    const rootHit = KNOWN_OFF_VERTICAL_CELEX_ROOTS.find(
      (r) => r.sector === celex.sector && r.year === celex.year && r.type === celex.type && r.number === celex.number,
    );
    if (rootHit) {
      return verdict(
        "off_vertical",
        rootHit.rule,
        `CELEX ${celex.raw} decodes to ${rootHit.label} — off-vertical by the number alone, independent of title "${t}".${tagsNote}`,
      );
    }
  }

  // 2. ON_VERTICAL rules — searchText match. Every rule here carries either `mechanism` (states the prong(s)
  // it satisfies) or `mechanismQuestion` (the 2026-08-31 mechanism re-audit found no prong clearly satisfied,
  // but the hard rule against silently flipping on->off keeps it on_vertical — flagged for operator review,
  // never silently dropped).
  for (const rule of ON_VERTICAL_RULES) {
    if (rule.test.test(searchText) && !(rule.exclude && rule.exclude.test(searchText))) {
      const mechNote = rule.mechanism ? ` Mechanism: ${rule.mechanism}` : ` Mechanism question: ${rule.mechanismQuestion}`;
      return verdict("on_vertical", rule.name, `Match basis (${sourceNote}): ${rule.name} (${rule.label}).${mechNote}${tagsNote}`);
    }
  }

  // 3. OFF_VERTICAL rules — searchText match (runbook denylist). A rule carrying `verdict: "on_vertical"`
  // has been FLIPPED by the mechanism-test re-audit or the operator's 2026-08-31 reclassification ruling
  // (see its `mechanism` field): match logic (test/exclude, array position, ordering relative to every other
  // rule) is completely unchanged — only the verdict this specific rule name returns has changed. A rule with
  // no override still returns off_vertical, carrying its `failsMechanism` annotation in the basis string.
  for (const rule of OFF_VERTICAL_RULES) {
    if (rule.test.test(searchText) && !(rule.exclude && rule.exclude.test(searchText))) {
      const v = rule.verdict ?? "off_vertical";
      const mechNote = v === "on_vertical" ? ` Mechanism: ${rule.mechanism}` : ` Fails mechanism: ${rule.failsMechanism}`;
      return verdict(v, rule.name, `Match basis (${sourceNote}): ${rule.name} (${rule.label}).${mechNote}${tagsNote}`);
    }
  }

  // 4. CELEX structural heuristic: a not-yet-enacted preparatory act (sector 5 — a COM/JOIN proposal) with
  // no title signal either way. The content can still change before adoption; guessing a verdict from a
  // proposal that hasn't settled is exactly the kind of guess this screen exists to refuse.
  if (celex && celex.sector === "5") {
    return verdict(
      "ambiguous",
      "celex_preparatory_act_no_title_signal",
      `CELEX ${celex.raw} is sector 5 (a preparatory act, not yet enacted law) and no ON/OFF rule matched (${sourceNote}) — routed to human review rather than dispositioned against a proposal that may still change.${tagsNote}`,
    );
  }

  // 5. HARD RULE: no signal at all -> ambiguous. Never off_vertical, never on_vertical, by default.
  return verdict(
    "ambiguous",
    "no_signal_ambiguous",
    `No ON_VERTICAL or OFF_VERTICAL rule matched title "${t || "(empty)"}" or document_url "${u || "(empty)"}"${
      usedUrlDerivedText ? ` (url-derived text "${searchText}" also matched nothing)` : ""
    } — routed to human review per the hard rule that ambiguous never auto-declines.${tagsNote}`,
  );
}

export const RULE_NAMES = Object.freeze([
  ...KNOWN_OFF_VERTICAL_CELEX_ROOTS.map((r) => r.rule),
  ...ON_VERTICAL_RULES.map((r) => r.name),
  ...OFF_VERTICAL_RULES.map((r) => r.name),
  "celex_preparatory_act_no_title_signal",
  "no_signal_ambiguous",
].filter((v, i, a) => a.indexOf(v) === i));
