// screen-rules.test.mjs — red/green coverage for the $0 relevance re-screen (screen-rules.mjs).
// Run standalone: node --test scripts/mint/screen-rules.test.mjs
// (scripts/mint/** is this lane's own write set, outside the wired .discipline/run-test-suite.sh glob list
// — the same precedent validate-mint-payload.test.mjs already set; see MINT-RUNBOOK.md "running the kit's
// own tests".)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRelevance,
  parseCelex,
  deriveSearchText,
  RULE_NAMES,
  ON_VERTICAL_RULES,
  OFF_VERTICAL_RULES,
  KNOWN_OFF_VERTICAL_CELEX_ROOTS,
} from "./screen-rules.mjs";
import { screenRows, buildSummary } from "./screen-worklist.mjs";

// ── The five required cases from the task brief ────────────────────────────────────────────────────────

test("REQUIRED: VAT invoicing directive -> off_vertical", () => {
  const r = classifyRelevance({
    title: "Council Directive amending Directive 2006/112/EC as regards VAT invoicing requirements for cross-border transactions",
    document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026L0044",
    surface_tags: ["regulations"],
  });
  assert.equal(r.verdict, "off_vertical");
  assert.equal(r.rule, "denylist_general_tax_administration");
  assert.ok(r.basis.length > 0, "basis must be non-empty and traceable");
});

test("REQUIRED: an ETS amendment -> on_vertical", () => {
  const r = classifyRelevance({
    title: "Directive amending Directive 2003/87/EC as regards the EU Emissions Trading System (maritime)",
    document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026L0088",
    surface_tags: [],
  });
  assert.equal(r.verdict, "on_vertical");
  assert.equal(r.rule, "adr020_edge_zone_cbam_ets");
});

test("REQUIRED: packaging-waste EPR -> on_vertical", () => {
  const r = classifyRelevance({
    title: "Regulation on packaging and packaging waste, amending extended producer responsibility obligations for Member States",
    document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026R0512",
  });
  assert.equal(r.verdict, "on_vertical");
  assert.equal(r.rule, "core_sustainability_packaging_waste");
});

test("REQUIRED: MiCA RTS -> off_vertical", () => {
  const r = classifyRelevance({
    title:
      "Commission Delegated Regulation supplementing Regulation (EU) 2023/1114 with regulatory technical standards on complaints handling by crypto-asset service providers",
    document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026R0099",
  });
  assert.equal(r.verdict, "off_vertical");
  assert.equal(r.rule, "denylist_crypto_mica");
});

test("REQUIRED: an undecodable title -> ambiguous", () => {
  const r = classifyRelevance({
    title: "XYZ-9928 Annex Correction Notice",
    document_url: "https://example-registry.gov/doc/9928",
  });
  assert.equal(r.verdict, "ambiguous");
  assert.equal(r.rule, "no_signal_ambiguous");
});

// ── Hard rule: ambiguous NEVER auto-declines ───────────────────────────────────────────────────────────

test("HARD RULE: completely empty row -> ambiguous, never off_vertical", () => {
  const r = classifyRelevance({});
  assert.equal(r.verdict, "ambiguous");
  assert.equal(r.rule, "no_signal_ambiguous");
});

test("HARD RULE: a spread of gibberish/no-signal titles never resolves to off_vertical", () => {
  const noise = [
    "Report 2026/44",
    "Miscellaneous provisions instrument",
    "",
    "   ",
    "Untitled document 771",
    "Committee minutes — item 6",
    "Annex III — technical corrections",
  ];
  for (const title of noise) {
    const r = classifyRelevance({ title, document_url: "https://example.gov/doc" });
    assert.notEqual(r.verdict, "off_vertical", `"${title}" must not auto-decline; got off_vertical via ${r.rule}`);
  }
});

test("HARD RULE: conflicting/unknown CELEX sector never resolves to off_vertical by construction (only a named rule can)", () => {
  // A title with zero keyword matches and no CELEX at all must be ambiguous, regardless of surface_tags
  // (surface_tags must never move the verdict — ADR-020 Amendment 1's C11 lesson).
  const r = classifyRelevance({
    title: "Some instrument with no recognizable domain vocabulary",
    document_url: "https://example.gov/doc/1",
    surface_tags: ["regulations", "operations", "market_intel", "research"],
  });
  assert.equal(r.verdict, "ambiguous");
});

test("HARD RULE: every rule name in RULE_NAMES is unique and non-empty (traceability to one line)", () => {
  assert.ok(RULE_NAMES.length > 0);
  const seen = new Set();
  for (const name of RULE_NAMES) {
    assert.ok(name && typeof name === "string" && name.length > 0);
    assert.ok(!seen.has(name), `duplicate rule name: ${name}`);
    seen.add(name);
  }
});

// ── ON_VERTICAL rules — one proof per rule ─────────────────────────────────────────────────────────────

test("ON: CBAM -> adr020_edge_zone_cbam_ets", () => {
  const r = classifyRelevance({ title: "Regulation establishing a Carbon Border Adjustment Mechanism for imported goods" });
  assert.equal(r.verdict, "on_vertical");
  assert.equal(r.rule, "adr020_edge_zone_cbam_ets");
});

test("ON: ESG supply-chain due diligence -> adr020_edge_zone_esg_due_diligence", () => {
  const r = classifyRelevance({ title: "Directive on Corporate Sustainability Due Diligence and amending Directive (EU) 2019/1937" });
  assert.equal(r.verdict, "on_vertical");
  assert.equal(r.rule, "adr020_edge_zone_esg_due_diligence");
});

test("ON: energy/fuel taxation relief -> adr020_edge_zone_energy_fuel_tax_relief", () => {
  const r = classifyRelevance({
    title: "Council Directive restructuring the Union framework for the taxation of energy products and providing a fuel duty relief for inland waterway transport",
  });
  assert.equal(r.verdict, "on_vertical");
  assert.equal(r.rule, "adr020_edge_zone_energy_fuel_tax_relief");
});

test("ON: core climate/environment topic -> core_sustainability_climate_environment", () => {
  const r = classifyRelevance({ title: "Regulation setting CO2 emission performance standards and greenhouse gas emissions reduction targets for heavy-duty vehicles" });
  assert.equal(r.verdict, "on_vertical");
  assert.equal(r.rule, "core_sustainability_climate_environment");
});

// ── OFF_VERTICAL rules — one proof per denylist item ───────────────────────────────────────────────────

test("OFF: customs/tariff/nomenclature forms -> denylist_customs_tariff_nomenclature", () => {
  const r = classifyRelevance({
    title:
      "Commission Implementing Regulation amending Annex I to Council Regulation (EEC) No 2658/87 on the tariff and statistical nomenclature and on the Common Customs Tariff",
  });
  assert.equal(r.verdict, "off_vertical");
  assert.equal(r.rule, "denylist_customs_tariff_nomenclature");
});

// NOTE (Wave M-screen-3, 2026-08-31): denylist_atm_air_services_bilateral was FLIPPED on_vertical by the
// mechanism re-audit — see the "Wave M-screen-3" test section below for the flip proof and rationale. This
// title (a Denmark ATM performance-plan approval) is exactly the historical example the old header comment
// cited as an off-vertical sample; it is now on_vertical, and that is the correct, intended outcome.
test("ON (flipped, Wave M-screen-3): a Denmark ATM performance-plan approval -> denylist_atm_air_services_bilateral, on_vertical", () => {
  const r = classifyRelevance({
    title: "Commission Implementing Decision approving the Denmark air navigation performance plan under the Single European Sky",
  });
  assert.equal(r.verdict, "on_vertical");
  assert.equal(r.rule, "denylist_atm_air_services_bilateral");
});

test("OFF: seafarer-certification recognition -> denylist_seafarer_certification_recognition", () => {
  const r = classifyRelevance({
    title: "Commission Implementing Decision on the recognition of the Republic of the Philippines' systems for training and certification of seafarers",
  });
  assert.equal(r.verdict, "off_vertical");
  assert.equal(r.rule, "denylist_seafarer_certification_recognition");
});

test("OFF: vehicle type-approval corrections -> denylist_vehicle_type_approval_correction", () => {
  const r = classifyRelevance({ title: "Corrigendum to Commission Regulation (EU) 2026/77 on EU type-approval of motor vehicles" });
  assert.equal(r.verdict, "off_vertical");
  assert.equal(r.rule, "denylist_vehicle_type_approval_correction");
});

test("OFF: language-correction decisions -> denylist_language_correction", () => {
  const r = classifyRelevance({ title: "Corrigendum to Council Regulation (EU) 2026/12 concerning the Bulgarian language version" });
  assert.equal(r.verdict, "off_vertical");
  assert.equal(r.rule, "denylist_language_correction");
});

test("ON_VERTICAL is checked before OFF_VERTICAL: a CBAM corrigendum stays on_vertical, not swept into language-correction", () => {
  const r = classifyRelevance({ title: "Corrigendum to the Regulation establishing a Carbon Border Adjustment Mechanism" });
  assert.equal(r.verdict, "on_vertical");
  assert.equal(r.rule, "adr020_edge_zone_cbam_ets");
});

// ── CELEX-number heuristics ─────────────────────────────────────────────────────────────────────────────

test("parseCelex decodes sector/year/type/number", () => {
  const c = parseCelex("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011L0037");
  assert.deepEqual(c, { raw: "CELEX:32011L0037", sector: "3", year: 2011, type: "L", number: 37 });
});

test("parseCelex handles URL-encoded colon (%3A)", () => {
  const c = parseCelex("https://eur-lex.europa.eu/?uri=CELEX%3A32021R1832");
  assert.ok(c);
  assert.equal(c.type, "R");
  assert.equal(c.year, 2021);
});

test("parseCelex returns null when nothing decodable", () => {
  assert.equal(parseCelex("https://example.gov/doc/1"), null);
  assert.equal(parseCelex(""), null);
});

test("CELEX root heuristic: consolidated Combined Nomenclature text -> off_vertical purely from the number, empty title", () => {
  const r = classifyRelevance({
    title: "",
    document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:01987R2658-20260101",
  });
  assert.equal(r.verdict, "off_vertical");
  assert.equal(r.rule, "celex_root_customs_nomenclature");
});

test("CELEX root heuristic: Union Customs Code base act -> off_vertical purely from the number", () => {
  const r = classifyRelevance({
    document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013R0952",
  });
  assert.equal(r.verdict, "off_vertical");
  assert.equal(r.rule, "celex_root_union_customs_code");
});

test("CELEX preparatory-act heuristic: sector 5 proposal, no title signal -> ambiguous (not a guess)", () => {
  const r = classifyRelevance({
    title: "Proposal for a Council Decision on the position to be taken",
    document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52026PC0100",
  });
  assert.equal(r.verdict, "ambiguous");
  assert.equal(r.rule, "celex_preparatory_act_no_title_signal");
});

test("CELEX preparatory-act heuristic does not override a real title match (a preparatory CBAM proposal is still on_vertical)", () => {
  const r = classifyRelevance({
    title: "Proposal for a Regulation establishing a Carbon Border Adjustment Mechanism",
    document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52026PC0200",
  });
  assert.equal(r.verdict, "on_vertical");
  assert.equal(r.rule, "adr020_edge_zone_cbam_ets");
});

// ── surface_tags is never a decision input ─────────────────────────────────────────────────────────────

test("surface_tags never changes the verdict, only the basis text", () => {
  const title = "XYZ-9928 Annex Correction Notice";
  const withTags = classifyRelevance({ title, surface_tags: ["regulations", "operations"] });
  const withoutTags = classifyRelevance({ title, surface_tags: [] });
  assert.equal(withTags.verdict, withoutTags.verdict);
  assert.equal(withTags.rule, withoutTags.rule);
  assert.equal(withTags.verdict, "ambiguous");
});

// ── screen-worklist.mjs — the runner's pure functions (screenRows / buildSummary), read-only, no I/O ─────

test("screenRows classifies a mixed batch and tallies counts per verdict/rule", () => {
  const rows = [
    { id: "a1", document_url: "https://example.gov/ets", title: "Directive amending the EU Emissions Trading System" },
    { id: "a2", document_url: "https://example.gov/vat", title: "VAT invoicing requirements directive" },
    { id: "a3", document_url: "https://example.gov/mystery", title: "Untitled instrument 42" },
  ];
  const { results, malformed, counts } = screenRows(rows);
  assert.equal(results.length, 3);
  assert.equal(malformed.length, 0);
  assert.equal(counts.byVerdict.on_vertical, 1);
  assert.equal(counts.byVerdict.off_vertical, 1);
  assert.equal(counts.byVerdict.ambiguous, 1);
  assert.equal(counts.byRule.adr020_edge_zone_cbam_ets, 1);
  assert.equal(counts.byRule.denylist_general_tax_administration, 1);
  assert.equal(counts.byRule.no_signal_ambiguous, 1);
});

test("screenRows flags rows missing id or document_url as malformed, never fabricates a verdict for them", () => {
  const rows = [
    { document_url: "https://example.gov/no-id" }, // missing id
    { id: "b2" }, // missing document_url
    { id: "b3", document_url: "https://example.gov/ok", title: "VAT invoicing requirements directive" },
  ];
  const { results, malformed } = screenRows(rows);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "b3");
  assert.equal(malformed.length, 2);
  assert.ok(malformed.some((m) => m.reason === "missing id"));
  assert.ok(malformed.some((m) => m.reason === "missing document_url"));
});

test("screenRows carries title=null and empty surface_tags through unchanged (title:null still classifies, no throw)", () => {
  const { results } = screenRows([{ id: "c1", document_url: "https://example.gov/x", title: null }]);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, null);
  assert.equal(results[0].verdict, "ambiguous"); // no title, no CELEX -> no signal
});

test("buildSummary lists every off_vertical and every ambiguous row by id, and reports malformed rows separately", () => {
  const rows = [
    { id: "d1", document_url: "https://example.gov/vat", title: "VAT invoicing requirements directive" },
    { id: "d2", document_url: "https://example.gov/mystery", title: "Untitled instrument 42" },
    { document_url: "https://example.gov/bad" }, // malformed: missing id
  ];
  const screened = screenRows(rows);
  const summary = buildSummary(screened, { inputPath: "test.json", generatedAt: "2026-08-31T00:00:00.000Z" });
  assert.ok(summary.includes("off_vertical: 1"));
  assert.ok(summary.includes("ambiguous: 1"));
  assert.ok(summary.includes("d1"), "off_vertical row id must be listed");
  assert.ok(summary.includes("d2"), "ambiguous row id must be listed");
  assert.ok(summary.includes("Malformed input rows (1)"));
  assert.ok(summary.includes("missing id"));
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// ROUND 2 — mined from the 3,312 round-1 ambiguous titles (Wave M-screen-2). One proof per new rule below,
// plus the URL-derived-text mechanism and the two non-reversal guards. Every round-1 test above still runs
// unmodified and green: round-2 rules are appended after every round-1 rule in their array, so a row that
// already matched a round-1 rule keeps that verdict (see the "non-reversal" comment in screen-rules.mjs).
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

// ── ON_VERTICAL round-2 rules — one proof per rule ─────────────────────────────────────────────────────
const ON_ROUND2_CASES = [
  ["reach_chemicals_regulation", "Commission Regulation amending Annex XIV to Regulation (EC) No 1907/2006 concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals (REACH)"],
  ["clp_classification_labelling_packaging", "Regulation on classification, labelling and packaging of substances and mixtures, amending Directive 67/548/EEC"],
  ["ship_recycling_regulation", "Commission Implementing Decision on the format of the report of planned start of ship recycling required under Regulation (EU) No 1257/2013"],
  ["air_quality_standards", "The Air Quality Standards (Amendment) Regulations 2019"],
  ["persistent_organic_pollutants", "Council Decision concerning the conclusion of the Stockholm Convention on Persistent Organic Pollutants"],
  ["fluorinated_greenhouse_gases", "Regulation on fluorinated greenhouse gases, amending Directive 2006/40/EC"],
  ["sulphur_content_fuels", "Directive relating to a reduction in the sulphur content of certain liquid fuels"],
  ["industrial_emissions_directive", "Directive amending Directive 2010/75/EU on industrial emissions (integrated pollution prevention and control)"],
  ["end_of_life_vehicles", "Commission Directive amending Annex II to Directive 2000/53/EC on end-of-life vehicles"],
  ["packaging_waste_producer_responsibility", "The Producer Responsibility Obligations (Packaging Waste) (Amendment) Regulations 2020"],
  ["co2_emission_standards", "Commission Implementing Decision confirming the average specific emissions of CO2 for manufacturers of passenger cars"],
  ["alternative_fuels_infrastructure", "Regulation on the deployment of alternative fuels infrastructure"],
  ["ets_trading_scheme", "The Greenhouse Gas Emissions Trading Scheme (Amendment) Regulations 2021"],
  ["ets_registry_administration", "Commission Decision instructing the Central Administrator of the Union Registry to enter changes to the national allocation table"],
  ["ets_aviation_scope_administration", "Commission Regulation amending the list of aircraft operators that performed an aviation activity listed in Annex I to Directive 2003/87/EC"],
  ["environmental_impact_assessment", "The Infrastructure Planning (Environmental Impact Assessment) Regulations 2017"],
  ["transboundary_air_pollution_convention", "Council Decision on the position to be taken at the Executive Body of the Convention on Long-Range Transboundary Air Pollution"],
  ["pollution_from_ships", "The Merchant Shipping (Prevention of Air Pollution from Ships) (Amendment) Regulations 2010"],
  ["renewable_energy_directive_biofuel_certification", "Commission Implementing Decision on the recognition of a voluntary scheme for demonstrating compliance with the requirements set in Directive (EU) 2018/2001 for biofuels"],
  ["weee_rohs_electrical_equipment", "The Restriction of the Use of Certain Hazardous Substances in Electrical and Electronic Equipment Regulations 2012"],
  ["marine_environment_protection_committee", "Council Decision on the position within the International Maritime Organization's Marine Environment Protection Committee"],
  ["energy_taxation_relief_broad", "Council Implementing Decision authorising Spain to apply a reduced rate of taxation to electricity supplied to vessels at berth"],
  ["energy_efficiency_policy", "Council Resolution of 7 December 1998 on energy efficiency in the European Community"],
  ["volatile_organic_compounds", "The Volatile Organic Compounds in Paints, Varnishes and Vehicle Refinishing Products Regulations 2012"],
  ["waste_shipment_export_recovery", "Commission Regulation amending Regulation (EC) No 1418/2007 concerning the export for recovery of certain waste to non-OECD countries"],
  ["hazardous_waste_transboundary_movement", "Council Decision on the position at the Conference of the Parties to the Basel Convention on the Control of Transboundary Movements of Hazardous Wastes"],
  ["epa_clean_air_act_sip_approval", "Air Plan Approval; Ohio; Redesignation of the Cleveland Area to Attainment of the 2015 Ozone Standard"],
  ["neshap_nsps_emission_standards", "National Emission Standards for Hazardous Air Pollutants: Review of Standards"],
  ["heavy_duty_engine_emission_standards", "Control of Air Pollution From New Motor Vehicles: Amendments and Nonconformance Penalties for Model Year 2027 Heavy Duty Highway Engines"],
  ["epcra_hazardous_chemical_inventory", "EPCRA Hazardous Chemical Inventory Reporting: Conformity With the 2024 OSHA Hazard Communication Standard"],
  ["rcra_hazardous_waste_land_disposal", "Hazardous and Solid Waste Management System: Disposal of Coal Combustion Residuals"],
  ["renewable_chemical_biobased_biofuel", "Revisions to the Biorefinery, Renewable Chemical, and Biobased Product Manufacturing Assistance Loan Guarantee Program"],
  ["clean_truck_incentive_and_vehicle_emissions", "California's Clean Truck and Bus Incentive Program Surpasses $1 Billion Milestone"],
  ["motor_fuel_composition_and_content", "The Motor Fuel (Composition and Content) (Amendment) Regulations 2015"],
  ["maritime_mrv_co2_monitoring", "Review of the EU maritime MRV Regulation on the possible inclusion of smaller ships"],
  ["fuel_quality_petrol_diesel_specification", "Directive relating to the quality of petrol and diesel fuels and amending Council Directive 93/12/EEC"],
  ["packaging_essential_requirements", "The Packaging (Essential Requirements) (Amendment) Regulations 2009"],
  ["eco_management_audit_scheme", "Regulation on the voluntary participation by organisations in a Community eco-management and audit scheme (EMAS)"],
  ["oil_pollution_damage_liability", "International Convention on Civil Liability for Bunker Oil Pollution Damage, 2001"],
  ["ets_mrv_and_free_allocation", "Commission Implementing Regulation on the monitoring and reporting of greenhouse gas emissions pursuant to Directive 2003/87/EC"],
  ["carbon_capture_storage", "The Storage of Carbon Dioxide (Access to Infrastructure) Regulations 2011"],
  ["pollutant_release_transfer_register", "Regulation concerning the establishment of a European Pollutant Release and Transfer Register"],
  ["environmental_permitting_regime", "The Environmental Permitting (England and Wales) (Amendment) Regulations 2018"],
  ["carbon_price_support_and_renewables_obligation", "The Renewables Obligation (Amendment) (EU Exit) Regulations 2019"],
  ["single_use_carrier_bags_charge", "The Single Use Carrier Bags Charge (Wales) (Amendment) Regulations 2020"],
  ["reach_regulation_uk_si_family", "The REACH etc. (Amendment etc.) (EU Exit) Regulations 2019"],
  ["waste_regulation_uk_si_family", "The Waste (Miscellaneous Amendments) (EU Exit) (No. 2) Regulations 2019"],
  ["environmental_protection_prescribed_processes", "The Environmental Protection (Prescribed Processes and Substances Etc.) (Amendment) (Petrol Vapour Recovery) Regulations 1996"],
  ["batteries_and_accumulators_directive", "Commission Decision establishing, pursuant to Directive 2006/66/EC, a common methodology for the calculation of annual sales of portable batteries and accumulators"],
  ["kyoto_protocol", "Commission Decision determining the respective emission levels allocated to the Community and each of its Member States under the Kyoto Protocol"],
  ["hazardous_waste_list_and_classification", "Commission Decision establishing a list of hazardous waste pursuant to Article 1(4) of Council Directive 91/689/EEC"],
  ["carbon_emissions_reduction_target_scheme", "The Electricity and Gas (Carbon Emissions Reduction) (Amendment) Order 2009"],
  ["carbon_accounting_uk", "The Carbon Accounting (Determination of Excess UK Assigned Amount Units) Regulations 2023"],
  ["alternative_fuel_labelling_and_ghg", "The Alternative Fuel Labelling and Greenhouse Gas Emissions (Miscellaneous Amendments) Regulations 2019"],
  ["landfill_incineration_waste_prohibition", "The Prohibition on the Incineration, or the Deposit in Landfill, of Specified Waste (Wales) Regulations 2023"],
];

for (const [ruleName, title] of ON_ROUND2_CASES) {
  test(`ROUND2 ON: "${title.slice(0, 60)}…" -> ${ruleName}`, () => {
    const r = classifyRelevance({ title });
    assert.equal(r.verdict, "on_vertical", `expected on_vertical, got ${r.verdict} via ${r.rule} for: ${title}`);
    assert.equal(r.rule, ruleName);
  });
}

// ── OFF_VERTICAL round-2 rules — one proof per rule ────────────────────────────────────────────────────
// NOTE (Wave M-screen-3, 2026-08-31): seven round-2 OFF rules were FLIPPED on_vertical by the operator's
// reclassification ruling / the mechanism re-audit (ses_performance_plan_administration,
// port_state_control_administration, ship_classification_society_accreditation,
// rail_freight_corridor_governance, ses_route_charging_zone_administration,
// heavy_goods_vehicle_charging_administration, transit_ecopoints_bilateral_agreement) and are removed from
// this OFF table — their proofs now live in the "Wave M-screen-3" section below, asserting on_vertical.
const OFF_ROUND2_CASES = [
  ["dangerous_goods_carriage", "The Carriage of Dangerous Goods (Amendment) Regulations 2019"],
  ["vehicle_construction_and_use", "The Road Vehicles (Construction and Use) (Amendment) Regulations 2005"],
  ["air_transport_bilateral_agreements", "Council Decision on the conclusion of the Common Aviation Area Agreement between the European Union and the Republic of Moldova"],
  ["air_carrier_operating_ban_list", "Commission Implementing Regulation amending Regulation (EC) No 474/2006 as regards the list of air carriers banned from operating within the Union"],
  ["inland_transport_committee_bilateral", "Decision of the Community/Switzerland Inland Transport Committee amending Annex 1 to the Agreement on the carriage of goods and passengers by rail and road"],
  ["tachograph_driver_recording", "Commission Directive on countermeasures to prevent and detect manipulation of records of tachographs"],
  ["tir_convention_customs", "Amendment to the Customs Convention on the International Transport of Goods under Cover of TIR Carnets (TIR Convention)"],
  ["otif_rail_interoperability_bilateral", "Council Decision on the position at the Committee of Technical Experts of the Intergovernmental Organisation for International Carriage by Rail"],
  ["rail_technical_specification_interoperability", "Commission Regulation on the technical specification for interoperability relating to the rolling stock subsystem of the rail system"],
  ["social_legislation_road_transport", "Commission Opinion on the implementing measures for Council Regulation (EEC) No 543/69 on the harmonization of certain social legislation relating to road transport"],
  ["customs_trade_formalities_simplification", "Decision of the EU-CTC Joint Committee amending the Convention on a common transit procedure"],
  ["unece_vehicle_technical_regulation", "Regulation No 13 of the Economic Commission for Europe of the United Nations (UN/ECE) — Uniform provisions concerning the approval of vehicles with regard to braking"],
  ["road_transport_driver_work_administration", "Council Decision on the position within the Group of Experts on the European Agreement concerning the Work of Crews of Vehicles Engaged in International Road Transport (AETR)"],
  ["road_transport_market_access_administration", "Commission Implementing Decision on minimum requirements for national electronic registers of road transport undertakings"],
  ["denylist_language_correction_broad", "Commission Implementing Regulation correcting the Dutch language version of Implementing Regulation (EU) 2023/2866"],
  ["inland_waterway_transport_administration", "Directive on reciprocal recognition of navigability licences for inland waterway vessels"],
  ["uscg_safety_security_zone", "Safety Zone; Ohio River, Louisville, KY"],
  ["faa_airworthiness_directive", "Airworthiness Directives; The Boeing Company Airplanes"],
  ["faa_airspace_administration", "Establishment of Class E Airspace; Peoria, IL"],
  ["fda_medical_device_classification", "Medical Devices; Neurological Devices; Classification of the Computerized Behavioral Therapy Device"],
  ["pesticide_tolerances", "Chlormequat Chloride; Pesticide Tolerances"],
  ["fisheries_management", "Fisheries of the Northeastern United States; Summer Flounder Fishery Quota Transfer"],
  ["federal_acquisition_regulation", "Defense Federal Acquisition Regulation Supplement: Modifications to Printed Circuit Board Acquisition"],
  ["immigration_administration", "Naturalization Application Fee Adjustments"],
  ["civil_rights_nondiscrimination_program", "Rescinding Regulations Related to Nondiscrimination in Federally Assisted Programs"],
  ["controlled_substances_scheduling", "Schedules of Controlled Substances: Placement of Tianeptine in Schedule I"],
  ["coal_mine_safety_administration", "Improving and Eliminating Regulations: Diesel Particulate Matter Emission Limits in Underground Coal Mines"],
  ["nuclear_regulatory_administration", "List of Approved Spent Fuel Storage Casks: NAC International, Inc., MAGNASTOR Storage System"],
  ["wildlife_species_listing", "Endangered and Threatened Wildlife and Plants; 90-Day Findings for 10 Species"],
  ["vehicle_safety_standard_us", "Federal Motor Vehicle Safety Standards; Modernization of FMVSS No. 135 to Accommodate ADS-Equipped Vehicles"],
  ["financial_services_administration_us", "Resolution Submissions Required for Covered Insured Depository Institutions"],
  ["road_transport_occupation_access_administration", "Council Directive on admission to the occupations of road haulage operator and road passenger transport operator"],
  ["goods_vehicle_operator_licensing", "The Goods Vehicles (Licensing of Operators) (Exemptions and Modifications) (Amendment) Regulations 2023"],
  ["vehicle_roadworthiness_testing", "The Motor Vehicles (Tests) (Amendment) (No. 4) Regulations 1991"],
  ["transport_statistical_returns_administration", "Directive on statistical returns in respect of carriage of goods and passengers by sea (Recast)"],
  ["single_electronic_reporting_format_taxonomy", "Commission Delegated Regulation amending Delegated Regulation (EU) 2019/815 with regard to updates of the taxonomy to be used for the single electronic reporting format"],
  ["vehicle_type_approval_market_surveillance", "Regulation on the approval and market surveillance of motor vehicles and their trailers, and of systems, components and separate technical units intended for such vehicles"],
];

for (const [ruleName, title] of OFF_ROUND2_CASES) {
  test(`ROUND2 OFF: "${title.slice(0, 60)}…" -> ${ruleName}`, () => {
    const r = classifyRelevance({ title });
    assert.equal(r.verdict, "off_vertical", `expected off_vertical, got ${r.verdict} via ${r.rule} for: ${title}`);
    assert.equal(r.rule, ruleName);
  });
}

// ── deriveSearchText / URL-derived pseudo-title (ROUND 2) ─────────────────────────────────────────────

test("deriveSearchText returns the title verbatim when present, ignoring document_url", () => {
  assert.equal(deriveSearchText("Real Title Here", "https://example.gov/documents/2026/01/01/1234/some-other-slug"), "Real Title Here");
});

test("deriveSearchText derives a pseudo-title from a federalregister.gov slug when title is empty", () => {
  const text = deriveSearchText(
    "",
    "https://www.federalregister.gov/documents/2026/06/26/2026-12912/response-to-petition-for-reconsideration-federal-motor-vehicle-safety-standards-seat-belt-assembly",
  );
  assert.equal(text, "response to petition for reconsideration federal motor vehicle safety standards seat belt assembly");
});

test("deriveSearchText derives a pseudo-title from a filename= query parameter when title is empty", () => {
  const text = deriveSearchText(
    "",
    "https://climate.ec.europa.eu/document/download/abc123_en?filename=policy_transport_shipping_gd3_accreditation_and_verification_en.pdf",
  );
  assert.equal(text, "policy transport shipping gd3 accreditation and verification");
});

test("deriveSearchText's fallback for a bare EUR-Lex CELEX link is the uninformative literal 'TXT' path segment (honestly no subject signal, not a crash or a fabrication)", () => {
  const text = deriveSearchText("", "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32017R2185");
  assert.equal(text, "TXT");
});

test("ROUND2: an empty-title row is classified from its federalregister.gov URL slug, not left ambiguous", () => {
  const r = classifyRelevance({
    title: "",
    document_url: "https://www.federalregister.gov/documents/2024/01/01/2024-00001/airworthiness-directives-the-boeing-company-airplanes",
  });
  assert.equal(r.verdict, "off_vertical");
  assert.equal(r.rule, "faa_airworthiness_directive");
  assert.ok(r.basis.includes("no title present"), `basis must disclose that the match came from url-derived text, not a title: ${r.basis}`);
});

test("ROUND2: a bare CELEX URL with no title and no known root still correctly stays ambiguous (title-insufficient residue is honest, not a bug)", () => {
  const r = classifyRelevance({
    title: "",
    document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32017R2185",
  });
  assert.equal(r.verdict, "ambiguous");
  assert.equal(r.rule, "no_signal_ambiguous");
});

// ── Non-reversal guards: a round-2 rule must never flip an already-decided round-1 disposition ──────────

test("GUARD: CO2-determination-during-type-approval stays off_vertical via the round-1 type-approval rule, not the new co2_emission_standards rule", () => {
  const r = classifyRelevance({
    title: "Commission Regulation amending Directive 2007/46/EC as regards the determination of CO2 emissions from vehicles submitted to multi-stage type-approval",
  });
  assert.equal(r.verdict, "off_vertical");
  assert.equal(r.rule, "denylist_vehicle_type_approval_correction");
});

test("GUARD: a customs Combined-Nomenclature/waste-code correlation table stays off_vertical via the round-1 customs rule, not the new waste_shipment_export_recovery rule", () => {
  const r = classifyRelevance({
    title:
      "Commission Implementing Regulation setting out a preliminary correlation table between codes of the Combined Nomenclature and entries of waste listed in Annexes III, IV and V to Regulation (EC) No 1013/2006",
  });
  assert.equal(r.verdict, "off_vertical");
  assert.equal(r.rule, "denylist_customs_tariff_nomenclature");
});

test("ROUND2: round-1's five REQUIRED cases are still decided by their round-1 rule, unshadowed by any round-2 addition", () => {
  const cases = [
    ["denylist_general_tax_administration", "Council Directive amending Directive 2006/112/EC as regards VAT invoicing requirements for cross-border transactions"],
    ["adr020_edge_zone_cbam_ets", "Directive amending Directive 2003/87/EC as regards the EU Emissions Trading System (maritime)"],
    ["core_sustainability_packaging_waste", "Regulation on packaging and packaging waste, amending extended producer responsibility obligations for Member States"],
    ["denylist_crypto_mica", "Commission Delegated Regulation supplementing Regulation (EU) 2023/1114 with regulatory technical standards on complaints handling by crypto-asset service providers"],
  ];
  for (const [expectedRule, title] of cases) {
    const r = classifyRelevance({ title });
    assert.equal(r.rule, expectedRule, `expected ${expectedRule} for: ${title}, got ${r.rule}`);
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// WAVE M-SCREEN-3 (2026-08-31) — the mechanism test (Job 1) + the operator's reclassification ruling
// (Job 2). Every OFF rule below carries `verdict: "on_vertical"` in screen-rules.mjs; match logic
// (test/exclude regex, array position, ordering) is UNCHANGED — only the returned verdict for these eight
// specific rule names has changed. Six are the operator's 2026-08-31 ruling; two (denylist_atm_air_services_
// bilateral, port_state_control_administration) are additional catches from the mechanism re-audit itself,
// beyond his named list.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

// ── operator ruling 2026-08-31 — one proof per named category ─────────────────────────────────────────
const OPERATOR_RULING_CASES = [
  [
    "transit_ecopoints_bilateral_agreement",
    "Agreement in the form of an Exchange of Letters between the European Community and the Republic of Croatia concerning the system of ecopoints to be applied to transit traffic through Austria",
  ],
  [
    "rail_freight_corridor_governance",
    "Commission Implementing Decision on the compliance of the joint proposal submitted by the Member States concerned for the extension of the North Sea-Mediterranean rail freight corridor",
  ],
  [
    "heavy_goods_vehicle_charging_administration",
    "Directive 2011/76/EU of the European Parliament and of the Council amending Directive 1999/62/EC on the charging of heavy goods vehicles for the use of certain infrastructures",
  ],
  [
    "ship_classification_society_accreditation",
    "Regulation (EC) No 391/2009 of the European Parliament and of the Council on common rules and standards for ship inspection and survey organisations",
  ],
  [
    "ses_performance_plan_administration",
    "Commission Decision on the consistency of the performance targets contained in the draft performance plan submitted by Germany pursuant to Regulation (EC) No 549/2004",
  ],
  [
    "ses_route_charging_zone_administration",
    "Commission Implementing Decision on the compliance of 2014 unit rates for charging zones under Article 17 of Implementing Regulation (EU) No 391/2013",
  ],
];

for (const [ruleName, title] of OPERATOR_RULING_CASES) {
  test(`operator-ruling-2026-08-31: "${title.slice(0, 70)}…" -> ${ruleName}, on_vertical`, () => {
    const r = classifyRelevance({ title });
    assert.equal(r.verdict, "on_vertical", `expected on_vertical, got ${r.verdict} via ${r.rule} for: ${title}`);
    assert.equal(r.rule, ruleName);
  });
}

// The operator named two more categories (sulphur_content_fuels, ship_recycling_regulation) that turned out
// to already BE on_vertical (round-2 rules, unrelated to this wave) — his ruling is satisfied with no code
// change for these two. Proven here so the reconciliation is a running fact, not a claim in a report only.
test("operator-ruling-2026-08-31: sulphur_content_fuels was ALREADY on_vertical (no flip needed, reconciliation note)", () => {
  const r = classifyRelevance({ title: "Directive relating to a reduction in the sulphur content of certain liquid fuels" });
  assert.equal(r.verdict, "on_vertical");
  assert.equal(r.rule, "sulphur_content_fuels");
});

test("operator-ruling-2026-08-31: ship_recycling_regulation was ALREADY on_vertical (no flip needed, reconciliation note)", () => {
  const r = classifyRelevance({ title: "Commission Implementing Decision on the format of the report of planned start of ship recycling required under Regulation (EU) No 1257/2013" });
  assert.equal(r.verdict, "on_vertical");
  assert.equal(r.rule, "ship_recycling_regulation");
});

// ── mechanism re-audit 2026-08-31 — additional flips beyond the operator's 8 ──────────────────────────
test("mechanism-re-audit-2026-08-31: SES framework Regulation (EC) No 549/2004 -> denylist_atm_air_services_bilateral, on_vertical", () => {
  const r = classifyRelevance({
    title: "Regulation (EC) No 549/2004 of the European Parliament and of the Council of 10 March 2004 laying down the framework for the creation of the single European sky (the framework Regulation)",
  });
  assert.equal(r.verdict, "on_vertical");
  assert.equal(r.rule, "denylist_atm_air_services_bilateral");
});

test("mechanism-re-audit-2026-08-31: port State control (MARPOL/pollution-prevention verification) -> port_state_control_administration, on_vertical", () => {
  const r = classifyRelevance({
    title: "Directive 2009/16/EC of the European Parliament and of the Council of 23 April 2009 on port State control (recast)",
  });
  assert.equal(r.verdict, "on_vertical");
  assert.equal(r.rule, "port_state_control_administration");
});

// ── the operator's three worked examples must land on_vertical after every flip above ─────────────────
test("operator's worked example 1: 0278fa64 (HGV infrastructure-charging amendment regs) -> on_vertical (via reviewed-verdicts.json, not this file — see screen-worklist.test.mjs)", () => {
  // 0278fa64-a0b7-4529-a1ea-5c448efab8af is a REVIEWED row (rule engine alone leaves it ambiguous — no
  // rule matches "The Heavy Goods Vehicles (Charging for the Use of Certain Infrastructure...) (Amendment)
  // Regulations 2014" title text). Its flip lives in reviewed-verdicts.json (M-SCREEN-3-mechanism-test),
  // proven against the real file in screen-worklist.test.mjs. Documented here for the reader's benefit.
  const r = classifyRelevance({
    title: "The Heavy Goods Vehicles (Charging for the Use of Certain Infrastructure on the Trans-European Road Network) (Amendment) Regulations 2014",
  });
  assert.equal(r.verdict, "ambiguous", "rule engine alone is expected to leave this ambiguous; the flip is a reviewed-verdicts.json entry");
});

test("operator's worked example 2: 00f6cea2 (ship inspection/survey fines regulation) -> on_vertical via ship_classification_society_accreditation", () => {
  const r = classifyRelevance({
    title: "Commission Regulation (EU) No 788/2014 of 18 July 2014 laying down detailed rules for the imposition of fines and periodic penalty payments and the withdrawal of recognition of ship inspection and survey organisations pursuant to Articles 6 and 7 of Regulation (EC) No 391/2009",
  });
  assert.equal(r.verdict, "on_vertical");
  assert.equal(r.rule, "ship_classification_society_accreditation");
});

test("operator's worked example 3: 046fb297 (SES framework Regulation) -> on_vertical via denylist_atm_air_services_bilateral", () => {
  const r = classifyRelevance({
    title: "Regulation (EC) No 549/2004 of the European Parliament and of the Council of 10 March 2004 laying down the framework for the creation of the single European sky (the framework Regulation)",
  });
  assert.equal(r.verdict, "on_vertical");
  assert.equal(r.rule, "denylist_atm_air_services_bilateral");
});

// ── META-TEST: every rule carries the annotation its bucket requires (Job 1's binding requirement) ────
test("META: every OFF_VERTICAL_RULES entry with no verdict override carries a non-empty failsMechanism, and every one with a verdict override carries a non-empty mechanism", () => {
  for (const rule of OFF_VERTICAL_RULES) {
    if (rule.verdict === "on_vertical") {
      assert.ok(
        typeof rule.mechanism === "string" && rule.mechanism.length > 0,
        `flipped OFF rule "${rule.name}" must carry a non-empty mechanism annotation`,
      );
    } else {
      assert.ok(
        typeof rule.failsMechanism === "string" && rule.failsMechanism.length > 0,
        `off_vertical rule "${rule.name}" must carry a non-empty failsMechanism annotation`,
      );
    }
  }
});

test("META: every KNOWN_OFF_VERTICAL_CELEX_ROOTS entry carries a non-empty failsMechanism", () => {
  for (const root of KNOWN_OFF_VERTICAL_CELEX_ROOTS) {
    assert.ok(
      typeof root.failsMechanism === "string" && root.failsMechanism.length > 0,
      `CELEX root "${root.rule}" must carry a non-empty failsMechanism annotation`,
    );
  }
});

test("META: every ON_VERTICAL_RULES entry carries a non-empty mechanism or mechanismQuestion (never neither)", () => {
  for (const rule of ON_VERTICAL_RULES) {
    const hasMechanism = typeof rule.mechanism === "string" && rule.mechanism.length > 0;
    const hasQuestion = typeof rule.mechanismQuestion === "string" && rule.mechanismQuestion.length > 0;
    assert.ok(
      hasMechanism || hasQuestion,
      `on_vertical rule "${rule.name}" must carry either mechanism or mechanismQuestion`,
    );
  }
});

// Operator ruling 2026-09-02 ("these are 100% in vert"): two more round-2 OFF rules flipped on_vertical
// after population runs #9–#11 surfaced them on live items — CCNR/CESNI positions (inland-waterway
// emission standards sit with the CCNR) and UK authorised-weight amendments (weights and dimensions
// carry the zero-emission-truck allowance). Match logic untouched; verdict + mechanism annotation only.
const FLIPPED_2026_09_02 = [
  ["rhine_navigation_administration", "Council Decision on the position within the Central Commission for the Navigation of the Rhine"],
  ["road_vehicle_weight_dimensions_administration", "The Road Vehicles (Authorised Weight) (Amendment) Regulations 2000"],
];
for (const [ruleName, title] of FLIPPED_2026_09_02) {
  test(`FLIP 2026-09-02 ON: "${title.slice(0, 60)}…" -> ${ruleName}`, () => {
    const r = classifyRelevance({ title });
    assert.equal(r.verdict, "on_vertical", `expected on_vertical, got ${r.verdict} via ${r.rule}`);
    assert.equal(r.rule, ruleName);
  });
}

test("META: exactly 10 OFF_VERTICAL_RULES entries are flipped (verdict: on_vertical) — 8 from the 2026-08-31 wave + 2 from the 2026-09-02 ruling", () => {
  const flipped = OFF_VERTICAL_RULES.filter((r) => r.verdict === "on_vertical").map((r) => r.name);
  assert.equal(flipped.length, 10, `expected 10 flips, got ${flipped.length}: ${flipped.join(", ")}`);
  const expected = [
    "denylist_atm_air_services_bilateral",
    "ses_performance_plan_administration",
    "port_state_control_administration",
    "ship_classification_society_accreditation",
    "rail_freight_corridor_governance",
    "ses_route_charging_zone_administration",
    "heavy_goods_vehicle_charging_administration",
    "transit_ecopoints_bilateral_agreement",
    "rhine_navigation_administration",
    "road_vehicle_weight_dimensions_administration",
  ].sort();
  assert.deepEqual(flipped.sort(), expected);
});

test("META: RULE_NAMES is unaffected by the flips (still 117 unique names — the mechanism re-audit changes verdicts/annotations, never match logic or the rule roster)", () => {
  assert.equal(RULE_NAMES.length, 117);
  assert.equal(new Set(RULE_NAMES).size, 117);
});
